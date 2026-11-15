using System;
using System.IO;
using System.Linq;
using System.Text;
using Rhino;
using Rhino.Geometry;
using static System.FormattableString;

namespace VisionVoiceVibe
{
  /// <summary>
  /// A scripted walk through the test room: the same ray casts and rules as a live walk, with simulated
  /// time, so the whole pipeline can be checked in a second. It uses its own tracker and leaves the live walk alone.
  /// </summary>
  public static class SelfTest
  {
    public static bool Run(RhinoDoc doc)
    {
      Walk.Reg.Scan(doc);
      if (Walk.Reg.Get("W-01") == null || Walk.Reg.Get("W-02") == null)
      {
        RhinoApp.WriteLine("Vision, Voice, Vibe: the self test needs the test room. Run VVVBuildRoom first.");
        return false;
      }
      double k = Walk.Reg.UnitsPerMeter;
      var tr = new Tracker(Walk.Reg);
      Point3d P(double x, double y, double z = 1.6) => new Point3d(x * k, y * k, z * k);
      var w1 = P(-1.4, 5.11, 1.9);       // centre of the arched window's glass
      var w2 = P(4.14, -1.0, 1.575);     // centre of the ribbon window's glass
      var here = P(0.6, -3.6);

      void Step(Point3d at, Point3d target)
      {
        var dir = target - at; dir.Unitize();
        var x = Vector3d.CrossProduct(dir, Vector3d.ZAxis); x.Unitize();
        var y = Vector3d.CrossProduct(x, dir); y.Unitize();
        tr.Step(0.1, at, dir, x, y);
      }
      void Look(Point3d target, double seconds) { for (double t = 0; t < seconds; t += 0.1) Step(here, target); }
      void WalkTo(Point3d to, Point3d target, double seconds)
      {
        var from = here; int n = (int)(seconds / 0.1);
        for (int i = 1; i <= n; i++) { here = from + (to - from) * (i / (double)n); Step(here, target); }
      }
      void Say(string text, string source = "voice") => tr.AddNote(text, source, tr.Context());

      Look(w1, 3);                                        // from the door, the arched window catches the eye
      WalkTo(P(-1.4, 3.0), w1, 4);                        // into its zone
      Look(w1, 3); Say("I love how soft and bright this arched window feels"); Look(w1, 3);
      tr.SetGlass("bronze"); Look(w1, 5); Say("it feels too dark and heavy now"); Look(w1, 5);
      tr.SetGlass("frit");
      WalkTo(P(2.3, -1.0), w2, 4);                        // across to the ribbon window
      Look(w2, 2); Say("the frame is a bit heavy but I like the view", "typed"); Look(w2, 3);
      Look(P(1.0, -0.5, 0), 2);                           // a glance at the floor
      tr.SetGlass("clear");
      WalkTo(P(-1.2, 3.2), w1, 4);                        // back to the arched window: a second visit
      Look(w1, 4); Say("this is my favourite spot"); Look(w1, 2);
      tr.Interrupt();

      var d = Decoder.Decode(tr);
      var sb = new StringBuilder();
      foreach (var id in new[] { "W-01", "W-02" })
      {
        var st = tr.Stats(id);
        sb.AppendLine(Invariant($"{id}: gaze {st.Gaze:0.0} s, attention {st.Attention:0.0}, dwell {st.Dwell:0.0} s, captures {st.Captures}, visits {st.Visits}, closest {st.MinDist:0.00} m, notes {st.Notes.Count}"));
      }
      sb.AppendLine("Notes linked to: " + string.Join(", ", tr.S.Notes.Select(n => (n.Target ?? "room") + (n.FirstAtTarget ? " (first)" : "") + $" [{n.Sentiment:+0;-0;0}]")));
      sb.AppendLine("Leading window: " + (d.Lead?.Info.Id ?? "none") + Invariant($" (score {d.Lead?.Score ?? 0:0.0} vs {d.Other?.Score ?? 0:0.0})"));
      sb.AppendLine("Glass preferred: " + (d.Glass.Winner != null ? Catalog.GlassById(d.Glass.Winner).Name : "none") + " · " + d.Glass.Spec);
      sb.AppendLine("Axes: " + string.Join(", ", d.Axes.Select(a => Invariant($"{a.Def.Key} {a.V:+0.00;-0.00;0.00}"))));
      sb.AppendLine("Confidence: " + d.Confidence + Invariant($" · walked {tr.S.Walked:0.0} m in {tr.S.Elapsed:0.0} s · {tr.S.Captures.Count} captures"));
      var summary = sb.ToString();
      foreach (var line in summary.Split('\n')) if (line.Trim().Length > 0) RhinoApp.WriteLine("Self test · " + line.TrimEnd());

      var htmlPath = Walk.ShowReport(tr, "self test");
      File.WriteAllText(Path.Combine(Path.GetDirectoryName(htmlPath), "self test summary.txt"), summary);
      return true;
    }
  }
}
