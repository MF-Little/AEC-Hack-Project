using System;
using System.Collections.Generic;
using System.Linq;
using Rhino.Geometry;
using static System.FormattableString;

namespace VisionVoiceVibe
{
  /// <summary>
  /// The capture loop from the web prototype. Each step takes the camera position and view direction,
  /// casts the centre ray and three rings of attention rays, and updates gaze, zones, captures and heat.
  /// </summary>
  public sealed class Tracker
  {
    public readonly TagRegistry Reg;
    public Session S { get; private set; }
    public string GlassNow = "clear";

    public string GazeTag { get; private set; }
    public double GazeT { get; private set; }
    public double GazeDist { get; private set; }   // metres
    bool gazeCaptured;
    public bool Locked { get; private set; }        // a capture-worthy look is in progress
    public bool Idle => stillFor >= Rules.IdleAfter;

    double pathTimer, stillFor;
    Point3d? lastLoc;
    Vector3d lastDir;
    readonly Dictionary<(int, int, int), HeatCell> heat = new Dictionary<(int, int, int), HeatCell>();
    readonly Dictionary<Guid, double[]> vertexHeat = new Dictionary<Guid, double[]>();
    public IReadOnlyDictionary<Guid, double[]> VertexHeat => vertexHeat;
    public double MaxVertexHeat { get; private set; }
    public long HeatVersion { get; private set; }

    public event Action<LogEvent> Logged;
    public event Action<string> Toasted;

    // Rings of attention rays at about 3, 7 and 12 degrees from the centre, as in the web prototype.
    static readonly (double Deg, int Count, double Weight)[] Rings = { (3, 8, 0.7), (7, 12, 0.35), (12, 16, 0.12) };
    static readonly double WeightSum = 1 + Rings.Sum(r => r.Count * r.Weight);

    public Tracker(TagRegistry reg) { Reg = reg; NewSession(); }

    public void NewSession()
    {
      S = new Session();
      foreach (var g in Catalog.Glass) S.Glass[g.Id] = new GlassStats();
      GazeTag = null; GazeT = 0; GazeDist = 0; gazeCaptured = false; Locked = false;
      pathTimer = 0; stillFor = 0; lastLoc = null;
      heat.Clear();
      vertexHeat.Clear();
      MaxVertexHeat = 0;
      HeatVersion++;
    }

    public TagStats Stats(string tag)
    {
      if (!S.Stats.TryGetValue(tag, out var st)) S.Stats[tag] = st = new TagStats();
      return st;
    }

    public string CurrentZone()
    {
      foreach (var w in Reg.Windows) if (Stats(w.Id).InZone) return w.Id;
      return null;
    }

    public void Log(string type, string tag, string text)
    {
      var ev = new LogEvent { T = Fmt.R1(S.Elapsed), Type = type, Tag = tag, Text = text };
      S.Events.Add(ev);
      Logged?.Invoke(ev);
    }

    void Toast(string msg) => Toasted?.Invoke(msg);

    /// <summary>Ends the current look, as the web prototype does before decoding.</summary>
    public void Interrupt()
    {
      EndFixation();
      GazeTag = null; GazeT = 0; gazeCaptured = false; Locked = false;
    }

    void EndFixation()
    {
      if (GazeTag == null) return;
      var info = Reg.Get(GazeTag);
      var st = Stats(GazeTag);
      if (GazeT >= Rules.CaptureAfter)
      {
        st.Fixations.Add(Fmt.R2(GazeT));
        if (gazeCaptured) Log("fix", GazeTag, Invariant($"Held {GazeT:0.0} s on {info?.Name ?? GazeTag}"));
      }
      else if (GazeT >= Rules.GlanceMin && info != null && info.IsWindow) st.Glances++;
    }

    public void Step(double dt, Point3d loc, Vector3d dir, Vector3d camX, Vector3d camY)
    {
      double k = Reg.UnitsPerMeter;
      bool moved = lastLoc == null || loc.DistanceTo(lastLoc.Value) > 1e-4 * k || Vector3d.VectorAngle(dir, lastDir) > 1e-4;
      stillFor = moved ? 0 : stillFor + dt;
      double stepM = lastLoc == null ? 0 : Math.Sqrt(Math.Pow(loc.X - lastLoc.Value.X, 2) + Math.Pow(loc.Y - lastLoc.Value.Y, 2)) / k;
      lastLoc = loc; lastDir = dir;
      S.LastView = new[] { loc.X / k, loc.Y / k, dir.X, dir.Y };
      if (Idle) { Locked = false; return; }   // nobody has moved or spoken for a while: don't count it as looking

      S.Elapsed += dt;
      if (stepM < Rules.Teleport) S.Walked += stepM;
      pathTimer += dt;
      if (pathTimer > Rules.PathEvery)
      {
        pathTimer = 0;
        S.Path.Add(new[] { Fmt.R2(loc.X / k), Fmt.R2(loc.Y / k) });
        if (S.Path.Count > Rules.PathMax) S.Path.RemoveAt(0);
      }

      // zones on the floor in front of each window
      foreach (var w in Reg.Windows)
      {
        if (w.ZoneCenter == null) continue;
        var st = Stats(w.Id);
        var c = w.ZoneCenter.Value;
        bool inside = Math.Sqrt(Math.Pow(loc.X - c.X, 2) + Math.Pow(loc.Y - c.Y, 2)) < w.ZoneRadius;
        if (inside && !st.InZone) { st.Visits++; Log("enter", w.Id, $"Entered {w.Name} zone"); }
        if (!inside && st.InZone) Log("exit", w.Id, $"Left {w.Name} zone after {Fmt.Secs(st.DwellRun)}");
        st.DwellRun = inside ? (st.InZone ? st.DwellRun + dt : 0) : 0;
        st.InZone = inside;
        if (inside) st.Dwell += dt;
      }

      // how long each glass option was on show
      var gs = S.Glass[GlassNow];
      gs.Time += dt;

      // centre-weighted attention: the centre ray counts fully, the rings less
      var centre = Reg.Cast(loc, dir);
      Deposit(centre, 1.0, dt, gs);
      for (int r = 0; r < Rings.Length; r++)
      {
        var ring = Rings[r];
        double spread = Math.Tan(ring.Deg * Math.PI / 180);
        for (int i = 0; i < ring.Count; i++)
        {
          double a = (i + r * 0.5) * Math.PI * 2 / ring.Count;
          var d2 = dir + spread * (Math.Cos(a) * camX + Math.Sin(a) * camY);
          d2.Unitize();
          Deposit(Reg.Cast(loc, d2), ring.Weight, dt, gs);
        }
      }

      string tag = centre.Tag;
      var info = Reg.Get(tag);
      if (info != null && info.IsWindow) gs.WinGaze += dt;
      if (tag != GazeTag) { EndFixation(); GazeTag = tag; GazeT = 0; gazeCaptured = false; GazeDist = 0; }
      if (info != null)
      {
        var st = Stats(tag);
        double distM = centre.Distance / k;
        GazeT += dt; GazeDist = distM; st.Gaze += dt;
        if (info.IsWindow) { st.MinDist = Math.Min(st.MinDist, distM); if (st.InZone) st.Engaged += dt; }
        var zone = CurrentZone();
        if (!gazeCaptured && GazeT >= Rules.CaptureAfter && zone != null)
        {
          gazeCaptured = true;
          st.Captures++;
          if (info.IsWindow) gs.Captures++;
          S.Captures.Add(new CapturePoint { X = Fmt.R2(loc.X / k), Y = Fmt.R2(loc.Y / k), Tag = tag, Zone = zone, T = Fmt.R1(S.Elapsed) });
          var msg = Invariant($"Captured {tag} · {info.Name} · {distM:0.0} m · from {zone} zone");
          Log("capture", tag, msg);
          Toast("● " + msg);
        }
      }
      Locked = info != null && GazeT >= Rules.CaptureAfter && CurrentZone() != null;
    }

    void Deposit(Hit h, double w, double dt, GlassStats gs)
    {
      if (!h.Ok) return;
      var info = Reg.Get(h.Tag);
      Stats(h.Tag).Attention += w * dt / WeightSum;
      if (info != null && info.IsWindow) gs.WinAttention += w * dt / WeightSum;
      double cell = Rules.HeatCell * Reg.UnitsPerMeter;
      var key = ((int)Math.Round(h.Point.X / cell), (int)Math.Round(h.Point.Y / cell), (int)Math.Round(h.Point.Z / cell));
      double add = w * dt;
      if (!heat.TryGetValue(key, out var c)) { c = new HeatCell { X = h.Point.X, Y = h.Point.Y, Z = h.Point.Z, W = 0, Tag = h.Tag }; heat[key] = c; }
      double nw = c.W + add;
      c.X = (c.X * c.W + h.Point.X * add) / nw;
      c.Y = (c.Y * c.W + h.Point.Y * add) / nw;
      c.Z = (c.Z * c.W + h.Point.Z * add) / nw;
      c.W = nw;
      Paint(h.Target, h.Point, add);
    }

    /// <summary>Adds a Gaussian of attention to the heat-map mesh points around a hit.</summary>
    void Paint(RayTarget target, Point3d p, double weight)
    {
      var ov = Reg.OverlayOf(target);
      if (ov == null) return;
      if (!vertexHeat.TryGetValue(target.Id, out var h) || h.Length != ov.Count) { h = new double[ov.Count]; vertexHeat[target.Id] = h; }
      double sigma = HeatOverlay.Sigma * Reg.UnitsPerMeter, s2 = 2 * sigma * sigma, r2 = 9 * sigma * sigma;
      var (kx, ky, kz) = ov.Key(p);
      for (int dx = -1; dx <= 1; dx++)
        for (int dy = -1; dy <= 1; dy++)
          for (int dz = -1; dz <= 1; dz++)
          {
            if (!ov.Grid.TryGetValue((kx + dx, ky + dy, kz + dz), out var list)) continue;
            foreach (var i in list)
            {
              var v = ov.Pos[i];
              double ex = v.X - p.X, ey = v.Y - p.Y, ez = v.Z - p.Z, d2 = ex * ex + ey * ey + ez * ez;
              if (d2 > r2) continue;
              h[i] += weight * Math.Exp(-d2 / s2);
              if (h[i] > MaxVertexHeat) MaxVertexHeat = h[i];
            }
          }
      HeatVersion++;
    }

    /// <summary>Heat cells in model units, strongest first.</summary>
    public List<HeatCell> TopHeat(int n) => heat.Values.OrderByDescending(c => c.W).Take(n).ToList();

    string NearestWindow()
    {
      var z = CurrentZone();
      if (z != null) return z;
      if (lastLoc == null) return null;
      var p = lastLoc.Value;
      string best = null;
      double bestD = Rules.NoteReach * Reg.UnitsPerMeter;
      foreach (var w in Reg.Windows)
      {
        if (w.ZoneCenter == null) continue;
        var c = w.ZoneCenter.Value;
        double d = Math.Sqrt(Math.Pow(p.X - c.X, 2) + Math.Pow(p.Y - c.Y, 2));
        if (d < bestD) { bestD = d; best = w.Id; }
      }
      return best;
    }

    /// <summary>What the viewer is looking at and where they stand now. A note keeps the context from when it began.</summary>
    public NoteContext Context()
    {
      var gi = Reg.Get(GazeTag);
      string target = gi != null && gi.IsWindow ? GazeTag : (NearestWindow() ?? GazeTag);
      return new NoteContext { T = Fmt.R1(S.Elapsed), Target = target, LookingAt = GazeTag, Zone = CurrentZone(), Glass = GlassNow };
    }

    public Note AddNote(string text, string source, NoteContext ctx)
    {
      text = text?.Trim();
      if (string.IsNullOrEmpty(text)) return null;
      var c = ctx ?? Context();
      var (sentiment, cues) = NoteAnalysis.Analyse(text);
      var note = new Note
      {
        T = c.T, Text = text, Source = source, Target = c.Target, LookingAt = c.LookingAt, Zone = c.Zone,
        Glass = c.Glass ?? GlassNow, Sentiment = sentiment, Cues = cues,
      };
      S.Notes.Add(note);
      if (c.Target != null)
      {
        var st = Stats(c.Target);
        note.FirstAtTarget = st.Notes.Count == 0;
        st.Notes.Add(note);
      }
      if (S.Glass.TryGetValue(note.Glass, out var gs)) { gs.Notes++; gs.Sentiment += sentiment; }
      var where = c.Target != null ? $"{c.Target} {Reg.Get(c.Target)?.Name}" : "the room";
      Log("note", c.Target, $"“{text}” → {where}");
      Toast($"Note linked to {where}");
      stillFor = 0;   // talking counts as activity
      return note;
    }

    /// <summary>Someone is talking: don't treat the walk as idle.</summary>
    public void Touch() => stillFor = 0;

    public void SetGlass(string id)
    {
      if (id == GlassNow) return;
      GlassNow = id;
      var g = Catalog.GlassById(id);
      Log("glass", null, $"Glass switched to {g.Name} (VLT {g.Vlt}%)");
      Toast($"Glass: {g.Name} · {g.Vlt}% light");
    }
  }
}
