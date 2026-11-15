using System;
using System.Collections.Generic;
using System.Drawing;
using Rhino;
using Rhino.Display;
using Rhino.Geometry;
using static System.FormattableString;

namespace VisionVoiceVibe
{
  /// <summary>
  /// The observer layer drawn over the model: zone rings, floating window tags, the attention heat map
  /// and a crosshair. Subject mode hides everything but a faint crosshair.
  /// </summary>
  public sealed class WalkConduit : DisplayConduit
  {
    static readonly Color Signal = Color.FromArgb(54, 81, 201), Ink = Color.FromArgb(29, 30, 28), Paper = Color.FromArgb(247, 246, 243);

    static bool IsWalkView(DrawEventArgs e)
    {
      var doc = RhinoDoc.ActiveDoc;
      var view = doc?.Views.ActiveView;
      return view != null && e.Viewport.Id == view.ActiveViewportID && e.Viewport.IsPerspectiveProjection;
    }

    protected override void CalculateBoundingBox(CalculateBoundingBoxEventArgs e)
    {
      foreach (var w in Walk.Reg.Windows)
      {
        if (w.ZoneCenter is not Point3d c) continue;
        double r = w.ZoneRadius;
        e.IncludeBoundingBox(new BoundingBox(c.X - r, c.Y - r, c.Z, c.X + r, c.Y + r, c.Z + 0.01));
      }
    }

    protected override void PostDrawObjects(DrawEventArgs e)
    {
      if (Walk.Subject || Walk.Reg.Order.Count == 0) return;
      var tr = Walk.Live;
      foreach (var w in Walk.Reg.Windows)
      {
        if (w.ZoneCenter is not Point3d c) continue;
        bool inside = tr.Stats(w.Id).InZone;
        e.Display.DrawCircle(new Circle(new Plane(c, Vector3d.ZAxis), w.ZoneRadius), Signal, inside ? 4 : 2);
      }
      if (Walk.HeatOn) DrawHeat(e, tr);
    }

    // The heat map: the fine mesh of each looked-at object, cut along contour lines into thin see-through
    // colour bands. Values are interpolated across each face, so the bands curve smoothly and fade out at the edges.
    const int Bands = 16;
    const double Lo = 0.04;   // below this, nothing is drawn (as in the web prototype)
    static Mesh[] heatMeshes;
    static long heatVersion = -1;
    static Tracker heatTracker;
    static DateTime heatBuilt;

    static double Edge(int band) => Lo + (1 - Lo) * band / Bands;
    static int Band(double t) => Math.Max(0, Math.Min(Bands - 1, (int)((t - Lo) / (1 - Lo) * Bands)));

    static void DrawHeat(DrawEventArgs e, Tracker tr)
    {
      if (tr.MaxVertexHeat <= 0) return;
      bool stale = heatMeshes == null || heatTracker != tr || (heatVersion != tr.HeatVersion && (DateTime.Now - heatBuilt).TotalSeconds > 0.25);
      if (stale)
      {
        heatMeshes = BuildHeat(tr);
        heatVersion = tr.HeatVersion;
        heatTracker = tr;
        heatBuilt = DateTime.Now;
      }
      for (int i = 0; i < heatMeshes.Length; i++)
      {
        if (heatMeshes[i] == null) continue;
        double t = (i + 0.5) / Bands;
        double x = Math.Max(0, Math.Min(1, (Lo + (1 - Lo) * t - Lo) / 0.46)), smooth = x * x * (3 - 2 * x);
        double alpha = 0.15 + 0.65 * smooth;   // faint at the edge of the attention, strong at its centre
        e.Display.DrawMeshShaded(heatMeshes[i], new DisplayMaterial(Ramp(Lo + (1 - Lo) * t), 1 - alpha));
      }
    }

    static Mesh[] BuildHeat(Tracker tr)
    {
      var meshes = new Mesh[Bands];
      double norm = Math.Max(2.5, tr.MaxVertexHeat);   // as the web prototype: a couple of seconds of looking reads as hot
      foreach (var kv in tr.VertexHeat)
      {
        var ov = Walk.Reg.TargetById(kv.Key)?.Overlay;
        var h = kv.Value;
        if (ov == null || h.Length != ov.Count) continue;
        var faces = ov.Mesh.Faces;
        for (int f = 0; f < faces.Count; f++)
        {
          var fc = faces[f];
          AddTriangle(meshes, ov.Lifted[fc.A], ov.Lifted[fc.B], ov.Lifted[fc.C], h[fc.A] / norm, h[fc.B] / norm, h[fc.C] / norm);
          if (fc.IsQuad) AddTriangle(meshes, ov.Lifted[fc.A], ov.Lifted[fc.C], ov.Lifted[fc.D], h[fc.A] / norm, h[fc.C] / norm, h[fc.D] / norm);
        }
      }
      foreach (var m in meshes) m?.Normals.ComputeNormals();
      return meshes;
    }

    // Splits one triangle into the pieces that fall in each colour band, interpolating along its edges.
    static void AddTriangle(Mesh[] meshes, Point3d pa, Point3d pb, Point3d pc, double ta, double tb, double tc)
    {
      double tmax = Math.Max(ta, Math.Max(tb, tc));
      if (tmax < Lo) return;
      double tmin = Math.Min(ta, Math.Min(tb, tc));
      var tri = new List<(Point3d P, double T)> { (pa, ta), (pb, tb), (pc, tc) };
      for (int band = Band(Math.Max(tmin, Lo)); band <= Band(tmax); band++)
      {
        var piece = Clip(tri, Edge(band), true);
        if (band < Bands - 1) piece = Clip(piece, Edge(band + 1), false);
        if (piece.Count < 3) continue;
        var m = meshes[band] ??= new Mesh();
        int i0 = m.Vertices.Count;
        foreach (var v in piece) m.Vertices.Add(v.P);
        for (int k = 1; k < piece.Count - 1; k++) m.Faces.AddFace(i0, i0 + k, i0 + k + 1);
      }
    }

    // Keeps the part of a polygon at or above (keepAbove) or at or below a level of the scalar field.
    static List<(Point3d P, double T)> Clip(List<(Point3d P, double T)> poly, double level, bool keepAbove)
    {
      var res = new List<(Point3d P, double T)>(poly.Count + 2);
      for (int i = 0; i < poly.Count; i++)
      {
        var cur = poly[i];
        var nxt = poly[(i + 1) % poly.Count];
        bool cIn = keepAbove ? cur.T >= level : cur.T <= level;
        bool nIn = keepAbove ? nxt.T >= level : nxt.T <= level;
        if (cIn) res.Add(cur);
        if (cIn != nIn)
        {
          double f = (level - cur.T) / (nxt.T - cur.T);
          res.Add((cur.P + (nxt.P - cur.P) * f, level));
        }
      }
      return res;
    }

    // Same colour ramp as the web prototype's heat shader: blue, cyan, yellow, red.
    static Color Ramp(double t)
    {
      (double r, double g, double b) a = (0.21, 0.32, 0.79), b2 = (0.15, 0.75, 0.85), c = (0.98, 0.85, 0.25), d = (0.92, 0.25, 0.15);
      (double r, double g, double b) Mix((double r, double g, double b) x, (double r, double g, double b) y, double u) => (x.r + (y.r - x.r) * u, x.g + (y.g - x.g) * u, x.b + (y.b - x.b) * u);
      var m = t < 0.33 ? Mix(a, b2, t / 0.33) : t < 0.66 ? Mix(b2, c, (t - 0.33) / 0.33) : Mix(c, d, (t - 0.66) / 0.34);
      return Color.FromArgb((int)(m.r * 255), (int)(m.g * 255), (int)(m.b * 255));
    }

    protected override void DrawForeground(DrawEventArgs e)
    {
      if (Walk.Reg.Order.Count == 0 || !IsWalkView(e)) return;
      var tr = Walk.Live;
      if (!Walk.Subject)
      {
        foreach (var w in Walk.Reg.Windows)
        {
          if (w.Anchor is not Point3d p) continue;
          bool looking = tr.GazeTag == w.Id;
          e.Display.DrawDot(p, Invariant($"{w.Id} {w.Name} · {tr.Stats(w.Id).Gaze:0.0} s"), looking ? Signal : Paper, looking ? Color.White : Ink);
        }
      }
      var size = e.Viewport.Size;
      int cx = size.Width / 2, cy = size.Height / 2;
      var col = Walk.Subject ? Color.FromArgb(110, Ink) : tr.Locked ? Signal : Color.FromArgb(170, Ink);
      e.Display.Draw2dLine(new System.Drawing.Point(cx - 9, cy), new System.Drawing.Point(cx + 9, cy), col, 1.5f);
      e.Display.Draw2dLine(new System.Drawing.Point(cx, cy - 9), new System.Drawing.Point(cx, cy + 9), col, 1.5f);
    }
  }
}
