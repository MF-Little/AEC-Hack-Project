using System;
using System.Collections.Generic;
using System.Linq;
using static System.FormattableString;

namespace VisionVoiceVibe
{
  public sealed class Why { public string Text, Src; public bool Note; }
  public sealed class AxisValue { public AxisDef Def; public double V; }
  public sealed class WindowScore { public TagInfo Info; public TagStats S; public double Score; }
  public sealed class GlassRow { public GlassOption G; public GlassStats S; public double? Rate, Score; }
  public sealed class GlassResult { public string Winner, Spec, Vlt, Why; }

  public sealed class DecodeResult
  {
    public readonly List<Why> Why = new List<Why>(), NoteWhy = new List<Why>();
    public List<AxisValue> Axes;
    public readonly List<string> Elements = new List<string>(), Materials = new List<string>(), Concepts = new List<string>();
    public GlassResult Glass;
    public List<GlassRow> Test;
    public string Confidence;
    public List<WindowScore> Windows;
    public WindowScore Lead, Other;
    public double TotalGaze, AllGaze;
  }

  /// <summary>The web prototype's decoding rules, unchanged: interest scores, preference axes, glass test, recommendations.</summary>
  public static class Decoder
  {
    public static double ScoreOf(TagStats s)
    {
      double sent = s.Notes.Sum(n => n.Sentiment);
      double sc = s.Gaze + 0.35 * s.Dwell + 0.8 * s.Engaged + 1.2 * s.Captures + 0.6 * Math.Max(0, s.Visits - 1)
                + 2.5 * sent + 0.3 * s.Longest + (s.MinDist < Rules.CloseApproach ? 1.5 : 0);
      return Math.Max(0.05, sc);
    }

    static double Clamp(double v) => Math.Max(-1, Math.Min(1, v));

    public static string GlassSpec(TagInfo o, string glassId) =>
      o != null && o.IsWindow && o.HasSwappableGlass ? Catalog.GlassById(glassId).Spec : o?.MetaValue("Glass");

    public static DecodeResult Decode(Tracker tr)
    {
      var reg = tr.Reg; var s = tr.S; var d = new DecodeResult();
      var ws = reg.Windows.Select(w => new WindowScore { Info = w, S = tr.Stats(w.Id), Score = ScoreOf(tr.Stats(w.Id)) }).ToList();
      d.Windows = ws;
      d.TotalGaze = ws.Sum(w => w.S.Gaze);
      d.AllGaze = reg.Order.Sum(id => tr.Stats(id).Gaze);
      int totalCaps = ws.Sum(w => w.S.Captures);
      double evidence = d.TotalGaze + 2 * totalCaps + 3 * s.Notes.Count;
      d.Confidence = evidence < 8 ? "low" : evidence < 25 ? "med" : "high";
      double sumScore = ws.Sum(w => w.Score);
      d.Axes = Catalog.Axes.Select(a => new AxisValue { Def = a, V = sumScore > 0 ? Clamp(ws.Sum(w => w.Score * w.Info.Feature(a.Key)) / sumScore) : 0 }).ToList();
      var sorted = ws.OrderByDescending(w => w.Score).ToList();
      d.Lead = sorted.FirstOrDefault();
      d.Other = sorted.Skip(1).FirstOrDefault();
      var lead = d.Lead; var other = d.Other;

      if (ws.Count == 0)
      {
        d.Why.Add(new Why { Text = "No windows are tagged in this model, so there is no window preference to read. Tag windows with VVVTag (kind: window), or build the test room with VVVBuildRoom.", Src = "0 tagged windows" });
      }
      else if (d.TotalGaze < 3)
      {
        d.Why.Add(new Why { Text = "There is not enough looking yet to read a preference. Walk into each ring on the floor and look at each window for a few seconds.", Src = Invariant($"{d.TotalGaze:0.0} s on windows so far") });
      }
      else
      {
        string ln = lead.Info.Name.ToLowerInvariant();
        string Caps(int n) => n == 1 ? "" : "s";
        if (other != null)
        {
          double share = lead.Score / sumScore;
          d.Why.Add(new Why
          {
            Text = share > 0.58
              ? $"Your attention leaned toward the {ln}: {Fmt.Secs(lead.S.Gaze)} of looking against {Fmt.Secs(other.S.Gaze)}, with {lead.S.Captures} sustained capture{Caps(lead.S.Captures)} against {other.S.Captures}."
              : $"Your attention was split fairly evenly between {(ws.Count == 2 ? "the two windows" : "the top two windows")} ({Fmt.Secs(lead.S.Gaze)} and {Fmt.Secs(other.S.Gaze)}). The reading below is tentative; the preference is not strong yet.",
            Src = Invariant($"interest score {lead.Score:0.0} vs {other.Score:0.0}"),
          });
        }
        else
        {
          d.Why.Add(new Why { Text = $"Only one window is tagged, so this reads how strongly you engaged with the {ln}: {Fmt.Secs(lead.S.Gaze)} of looking and {lead.S.Captures} sustained capture{Caps(lead.S.Captures)}.", Src = Invariant($"interest score {lead.Score:0.0}") });
        }
        if (!double.IsInfinity(lead.S.MinDist))
        {
          d.Why.Add(lead.S.MinDist < Rules.CloseApproach
            ? new Why { Text = Invariant($"You walked to {lead.S.MinDist:0.0} m from the {ln}. A close approach usually means interest in the detail (the reveal, the frame edge, the glass) more than the view."), Src = Invariant($"closest approach {lead.S.MinDist:0.00} m") }
            : new Why { Text = Invariant($"You studied the {ln} from a distance (closest {lead.S.MinDist:0.0} m). That points to the composition and the light it gives the room, more than its detail."), Src = Invariant($"closest approach {lead.S.MinDist:0.00} m") });
        }
        double longest = lead.S.Longest;
        if (longest >= 4)
          d.Why.Add(new Why { Text = Invariant($"Your longest single look was {longest:0.0} s at the {ln}. Looks past about 4 seconds tend to be evaluation rather than orientation."), Src = Invariant($"{lead.S.Fixations.Count} fixation{Caps(lead.S.Fixations.Count)} ≥ {Rules.CaptureAfter} s") });
        foreach (var w in ws)
          if (w.S.Visits >= 2)
            d.Why.Add(new Why { Text = $"You came back into the {w.Info.Name.ToLowerInvariant()} zone {w.S.Visits} times. Returning is a stronger signal than a single long stay.", Src = $"{w.S.Visits} entries · {Fmt.Secs(w.S.Dwell)} total dwell" });

        double curv = d.Axes[0].V;
        if (Math.Abs(curv) > 0.2)
        {
          var fav = curv > 0 ? ws.OrderByDescending(w => w.Info.Feature("curvature")).First() : ws.OrderBy(w => w.Info.Feature("curvature")).First();
          string text;
          if (fav.Info.Id == "W-01" && curv > 0)
            text = "What you didn't see: the window you favoured has a semicircular head, a slim 40 mm frame and a low 350 mm sill. Those traits travel together as soft, grounded and open to the sky.";
          else if (fav.Info.Id == "W-02" && curv < 0)
            text = "What you didn't see: the window you favoured is a sharp rectangle with an 80 mm black frame and a 1000 mm sill. Those traits travel together as framed, controlled and horizon-focused.";
          else
          {
            var bits = new[] { "Geometry", "Frame", "Sill" }.Select(k => fav.Info.MetaValue(k)).Where(v => !string.IsNullOrWhiteSpace(v)).ToList();
            text = $"What you didn't see: the {fav.Info.Name.ToLowerInvariant()} you favoured is described as {(bits.Count > 0 ? string.Join("; ", bits) : "having no metadata yet")}. Those traits travel together, so the next round should vary them one at a time.";
          }
          d.Why.Add(new Why { Text = text, Src = $"{fav.Info.Name} · hidden metadata" });
        }
      }

      var floor = reg.Get("S-FLOOR"); var wall = reg.Get("S-WALL");
      double floorG = floor != null ? tr.Stats(floor.Id).Gaze : 0, wallG = wall != null ? tr.Stats(wall.Id).Gaze : 0;
      if (floorG > 4)
        d.Why.Add(new Why { Text = $"You looked at the floor for {Fmt.Secs(floorG)}. In this room that is mostly the sun patches each window throws, so light quality may matter to you as much as the opening itself.", Src = "S-FLOOR · " + (floor.MetaValue("Material") ?? "floor") });
      if (wallG > 8 && d.AllGaze > 0 && wallG / d.AllGaze > 0.35)
        d.Why.Add(new Why { Text = Invariant($"Walls held {Math.Round(wallG / d.AllGaze * 100)}% of your looking time. The app knows they are {(wall.MetaValue("Material") ?? "plain").ToLowerInvariant()}; a strong surface reading suggests texture and finish deserve attention in the next round."), Src = "S-WALL · " + (wall.MetaValue("Material") ?? "walls") });

      // notes: link each remark to the hidden metadata it most likely reacted to
      foreach (var n in s.Notes)
      {
        var o = reg.Get(n.Target);
        var tone = n.Sentiment > 0 ? "positive" : n.Sentiment < 0 ? "negative" : "neutral";
        var first = n.FirstAtTarget ? " · first remark here" : "";
        if (o == null)
        {
          d.NoteWhy.Add(new Why { Text = $"You said “{n.Text}” away from any tagged object.", Src = $"{tone} · {Fmt.Clock(n.T)}", Note = true });
          continue;
        }
        string Val(string k) => k == "Glass" ? GlassSpec(o, n.Glass) : o.MetaValue(k);
        var facts = n.Cues.Select(c => c.Attr).Distinct().Where(k => !string.IsNullOrWhiteSpace(Val(k))).Select(k => $"{k.ToLowerInvariant()}: {Val(k)}").ToList();
        var hidden = facts.Count > 0 ? $" The app knows its {string.Join("; ", facts)}. That is the likely trigger." : "";
        d.NoteWhy.Add(new Why { Text = $"You said “{n.Text}” at the {o.Name.ToLowerInvariant()}.{hidden}", Src = $"{tone} remark · {n.Source} · {Fmt.Clock(n.T)}{first}", Note = true });
      }

      // recommendations from the strongest axes
      foreach (var a in d.Axes.OrderByDescending(a => Math.Abs(a.V)))
      {
        if (Math.Abs(a.V) < 0.15) continue;
        var side = Catalog.Rec[a.Def.Key][a.V > 0 ? 0 : 1];
        foreach (var x in side.Elements) if (!d.Elements.Contains(x)) d.Elements.Add(x);
        foreach (var x in side.Materials) if (!d.Materials.Contains(x)) d.Materials.Add(x);
        foreach (var x in side.Concepts) if (!d.Concepts.Contains(x)) d.Concepts.Add(x);
      }
      double Ax(string key) => d.Axes.First(a => a.Def.Key == key).V;
      bool curved = Ax("curvature") > 0.15;
      string frame = Ax("frame") < -0.15 ? "in a slimline steel or frameless system" : Ax("frame") > 0.15 ? "in an expressed dark aluminium frame" : "in a thermally broken standard frame";

      // glass taste test: window looking per minute each glass was on show, plus remarks made under it
      d.Test = Catalog.Glass.Select(g =>
      {
        var gs = s.Glass[g.Id];
        double mins = gs.Time / 60;
        double? rate = gs.Time >= 8 ? (gs.WinGaze + 1.2 * gs.Captures) / mins : (double?)null;
        double? score = rate.HasValue ? rate.Value + 6 * gs.Sentiment : (double?)null;
        return new GlassRow { G = g, S = gs, Rate = rate, Score = score };
      }).ToList();
      var tested = d.Test.Where(t => t.Score.HasValue).OrderByDescending(t => t.Score.Value).ToList();
      if (tested.Count >= 2)
      {
        var w = tested[0]; var r = tested[1];
        if (w.S.Sentiment > 0 || w.Score.Value > r.Score.Value * 1.15)
        {
          bool close = Math.Abs(w.Rate.Value - r.Rate.Value) < 0.15 * Math.Max(w.Rate.Value, r.Rate.Value);
          string spec = curved ? "Hot-bent " + char.ToLowerInvariant(w.G.Spec[0]) + w.G.Spec.Substring(1) : w.G.Spec;
          string remarks = w.S.Sentiment != 0 ? $", with {(w.S.Sentiment > 0 ? "positive" : "negative")} remarks while it was in place" : "";
          string decided = close && w.S.Sentiment > 0 ? " Looking time was close, so your remarks decided it." : "";
          string advice = w.G.Vlt >= 80 ? "Keep colour true and daylight high; an anti-reflective coat lets the glass read as an absence."
            : w.G.Vlt >= 50 ? "Filtered, softened light seems to suit this viewer; a frit keeps views while cutting glare."
            : "Warm, dim, shaded light seems to read as comfort; check daylight factor targets before committing.";
          d.Glass = new GlassResult
          {
            Winner = w.G.Id, Spec = $"{spec}, {frame}", Vlt = w.G.Vlt + "%",
            Why = Invariant($"{w.G.Name} came out ahead: {w.Rate.Value:0} s of window looking per minute on show, against {r.Rate.Value:0} s for {r.G.Name.ToLowerInvariant()}{remarks}.{decided} {advice}"),
          };
        }
        else
        {
          d.Glass = new GlassResult { Winner = null, Spec = "No clear winner between the glasses tested", Vlt = "–", Why = $"{w.G.Name} and {r.G.Name.ToLowerInvariant()} scored within 15% of each other. Walk longer with each, or add a spoken reaction to each one." };
        }
      }
      else
      {
        d.Glass = new GlassResult { Winner = null, Spec = "Run the glass test first", Vlt = "–", Why = "Switch the glass (observer window or VVVGlass) to show at least two glasses for 8 seconds or more each while you look around. The app compares how much you look at the windows under each glass." };
      }
      return d;
    }
  }
}
