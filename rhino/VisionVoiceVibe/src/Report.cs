using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using Eto.Drawing;
using Eto.Forms;
using Rhino;
using Rhino.Geometry;
using static System.FormattableString;

namespace VisionVoiceVibe
{
  /// <summary>Builds the decoded-walk sheet (same layout and styles as the web prototype) and the session JSON.</summary>
  public static class Report
  {
    static string E(string s) => WebUtility.HtmlEncode(s ?? "");

    static string Css()
    {
      using var st = typeof(Report).Assembly.GetManifestResourceStream("VisionVoiceVibe.report.css");
      if (st == null) return "";
      using var rd = new StreamReader(st);
      return rd.ReadToEnd();
    }

    public static string Html(Tracker tr, DecodeResult d)
    {
      var s = tr.S; var reg = tr.Reg;
      double maxA = Math.Max(0.1, reg.Order.Select(id => tr.Stats(id).Attention).DefaultIfEmpty(0).Max());
      string conf = d.Confidence == "low" ? "Low confidence" : d.Confidence == "med" ? "Medium confidence" : "High confidence";

      var rows = new StringBuilder();
      foreach (var id in reg.Order.OrderByDescending(i => tr.Stats(i).Attention))
      {
        var o = reg.Tags[id]; var st = tr.Stats(id); bool win = o.IsWindow;
        rows.Append(Invariant($"<tr><td><i>{E(id)}</i>{E(o.Name)}</td><td>{st.Attention:0.0}</td><td>{st.Gaze:0.0}</td><td>{(win ? Fmt.N(st.Dwell) : "–")}</td><td>{st.Captures}</td><td>{(st.Fixations.Count > 0 ? Fmt.N(st.Longest) : "–")}</td><td>{(win && !double.IsInfinity(st.MinDist) ? Fmt.N(st.MinDist) : "–")}</td><td style=\"width:20%\"><div class=\"bar{(win ? " sig" : "")}\"><span style=\"width:{st.Attention / maxA * 100:0}%\"></span></div></td></tr>"));
      }

      double maxRate = Math.Max(1, d.Test.Select(t => t.Rate ?? 0).DefaultIfEmpty(0).Max());
      var glassRows = new StringBuilder();
      foreach (var t in d.Test)
      {
        bool win = d.Glass.Winner == t.G.Id;
        string remarks = t.S.Notes > 0 ? (t.S.Sentiment > 0 ? "+" : "") + t.S.Sentiment + " (" + t.S.Notes + ")" : "–";
        glassRows.Append(Invariant($"<tr{(win ? " style=\"background:var(--signal-soft)\"" : "")}><td>{E(t.G.Name)}{(win ? " <span class=\"chip high\">preferred</span>" : "")}</td><td>{t.G.Vlt}%</td><td>{t.S.Time:0}</td><td>{t.S.WinGaze:0.0}</td><td>{t.S.Captures}</td><td>{remarks}</td><td>{(t.Rate.HasValue ? Fmt.N(t.Rate.Value, "0") : "not enough")}</td><td style=\"width:18%\"><div class=\"bar sig\"><span style=\"width:{(t.Rate ?? 0) / maxRate * 100:0}%\"></span></div></td></tr>"));
      }

      var noteRows = new StringBuilder();
      foreach (var n in s.Notes)
        noteRows.Append($"<tr><td style=\"font-weight:400;font-style:italic\">“{E(n.Text)}”</td><td>{Fmt.Clock(n.T)}</td><td>{(n.Target != null ? E(n.Target) : "room")}</td><td>{E(Catalog.GlassById(n.Glass).Name)}</td><td>{(n.Sentiment > 0 ? "+" + n.Sentiment : n.Sentiment.ToString())}</td><td>{E(n.Source)}</td><td>{(n.FirstAtTarget ? "first" : "")}</td></tr>");

      var cards = new StringBuilder();
      foreach (var w in reg.Windows)
      {
        var meta = string.Join("", w.Meta.Select(kv => $"<dt>{E(kv.Key)}</dt><dd>{E(kv.Key == "Glass" && w.HasSwappableGlass ? Catalog.GlassById(tr.GlassNow).Spec : kv.Value)}</dd>"));
        cards.Append(Invariant($"<div class=\"card\"><h3>{E(w.Name)}<span class=\"mono\">{E(w.Id)} · score {Decoder.ScoreOf(tr.Stats(w.Id)):0.0}</span></h3><dl class=\"meta\">{meta}</dl></div>"));
      }

      var whyItems = string.Join("", d.Why.Concat(d.NoteWhy).Select(w => $"<li class=\"{(w.Note ? "note" : "")}\">{E(w.Text)}<span class=\"src\">{E(w.Src)}</span></li>"));

      var axes = new StringBuilder();
      foreach (var a in d.Axes)
      {
        double pct = (a.V + 1) / 2 * 100;
        string fill = a.V >= 0 ? Invariant($"left:50%;width:{pct - 50:0.0}%") : Invariant($"left:{pct:0.0}%;width:{50 - pct:0.0}%");
        axes.Append(Invariant($"<div class=\"axis\"><span class=\"lab{(a.V < -0.15 ? " on" : "")}\">{E(a.Def.Neg)}</span><div class=\"track\" role=\"img\" aria-label=\"{E(a.Def.Neg)} to {E(a.Def.Pos)}: {a.V:0.00}\"><span class=\"fill\" style=\"{fill}\"></span><span class=\"dot\" style=\"left:{pct:0.0}%\"></span></div><span class=\"lab{(a.V > 0.15 ? " on" : "")}\">{E(a.Def.Pos)}</span></div>"));
      }

      string List(string title, List<string> items) =>
        $"<div class=\"reclist\"><h3>{title}</h3>{(items.Count > 0 ? "<ul>" + string.Join("", items.Take(5).Select(x => $"<li>{E(x)}</li>")) + "</ul>" : "<p class=\"empty\">No clear signal yet.</p>")}</div>";

      var sb = new StringBuilder();
      sb.Append("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Vision, Voice, Vibe · decoded walk</title>");
      sb.Append("<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,300..800&family=IBM+Plex+Mono:wght@400;500&display=swap\">");
      sb.Append("<style>").Append(Css()).Append("</style></head><body><section id=\"report\"><div class=\"sheet\">");
      sb.Append(Invariant($"<div class=\"rhead\"><div><h1>Decoded walk</h1><p class=\"mono\">{Fmt.Secs(s.Elapsed)} walked · {s.Walked:0.0} m covered · {s.Captures.Count} captures · {s.Notes.Count} notes &nbsp;<span class=\"chip {d.Confidence}\">{conf}</span></p></div><div class=\"controls\"><span class=\"mono\" style=\"color:var(--mute);font-size:12px\">Vision, Voice, Vibe · Rhino {E(RhinoApp.Version.ToString())} · {s.Started:yyyy-MM-dd HH:mm}</span></div></div>"));
      sb.Append("<div class=\"grid2\"><div class=\"rsec\"><h2>Plan <small>path, zones, capture points</small></h2>");
      sb.Append("<div class=\"planbox\">").Append(PlanSvg(tr)).Append("<div class=\"legend\"><span><i></i>path</span><span><i class=\"z\"></i>hit zone</span><span><i class=\"c\"></i>capture</span></div></div></div>");
      sb.Append("<div class=\"rsec\"><h2>Attention <small>attention = centre-weighted seconds; gaze = crosshair only</small></h2>");
      sb.Append("<div class=\"tablewrap\"><table><thead><tr><th>Object</th><th>Attention</th><th>Gaze s</th><th>Dwell s</th><th>Capt.</th><th>Longest s</th><th>Closest m</th><th></th></tr></thead><tbody>").Append(rows).Append("</tbody></table></div>");
      if (d.TotalGaze < 3) sb.Append("<p class=\"notice\">Very little window data so far. Walk into the floor rings and look at each window for a few seconds, then decode again.</p>");
      sb.Append("</div></div>");
      sb.Append("<div class=\"rsec\"><h2>Glass taste test <small>window looking per minute each glass was on show</small></h2><div class=\"tablewrap\"><table><thead><tr><th>Glass</th><th>VLT</th><th>Shown s</th><th>Window gaze s</th><th>Capt.</th><th>Remarks</th><th>s / min</th><th></th></tr></thead><tbody>").Append(glassRows).Append("</tbody></table></div></div>");
      sb.Append("<div class=\"rsec\"><h2>What the room knew <small>metadata the viewer never saw</small></h2><div class=\"cards\">").Append(cards).Append("</div></div>");
      sb.Append($"<div class=\"rsec\"><h2>Your notes <small>{s.Notes.Count} recorded, typed or spoken</small></h2>");
      sb.Append(s.Notes.Count > 0
        ? "<div class=\"tablewrap\"><table><thead><tr><th>What you said</th><th>Time</th><th>Linked to</th><th>Glass</th><th>Tone</th><th>Source</th><th>First here</th></tr></thead><tbody>" + noteRows + "</tbody></table></div>"
        : "<p class=\"notice\">No notes this walk. Type or dictate in the observer window while looking at something.</p>");
      sb.Append("</div>");
      sb.Append("<div class=\"rsec\"><h2>The reading <small>why you looked where you did</small></h2><ul class=\"why\">").Append(whyItems).Append("</ul></div>");
      sb.Append("<div class=\"rsec\"><h2>Preference axes <small>weighted by interest score</small></h2><div class=\"axes\">").Append(axes).Append("</div></div>");
      sb.Append("<div class=\"rsec\"><h2>Suggested direction</h2>");
      sb.Append($"<div class=\"glass\"><span class=\"k\">Glass to try next</span><span class=\"k\" style=\"text-align:right\">Target VLT</span><span class=\"spec\">{E(d.Glass.Spec)}</span><span class=\"vlt\">{E(d.Glass.Vlt)}</span><p>{E(d.Glass.Why)}</p></div>");
      sb.Append("<div class=\"grid3\">").Append(List("Design elements", d.Elements)).Append(List("Concepts", d.Concepts)).Append(List("Materials", d.Materials)).Append("</div></div>");
      sb.Append("</div></section></body></html>");
      return sb.ToString();
    }

    static string PlanSvg(Tracker tr)
    {
      var reg = tr.Reg; var s = tr.S; double k = reg.UnitsPerMeter;
      var rects = new List<(double X0, double Y0, double X1, double Y1, string Cls)>();
      foreach (var t in reg.Targets)
      {
        var info = reg.Get(t.Tag); var b = t.Box;
        double w = (b.Max.X - b.Min.X) / k, dp = (b.Max.Y - b.Min.Y) / k, h = (b.Max.Z - b.Min.Z) / k;
        if (h < 0.2 && w > 3 && dp > 3) continue;   // floors and ceilings
        string cls = info != null && info.IsWindow ? "win" : info != null && info.Kind == "surface" ? "wall" : "furn";
        rects.Add((b.Min.X / k, b.Min.Y / k, b.Max.X / k, b.Max.Y / k, cls));
      }
      double minX = double.MaxValue, minY = double.MaxValue, maxX = double.MinValue, maxY = double.MinValue;
      void Inc(double x, double y) { minX = Math.Min(minX, x); minY = Math.Min(minY, y); maxX = Math.Max(maxX, x); maxY = Math.Max(maxY, y); }
      foreach (var r in rects) { Inc(r.X0, r.Y0); Inc(r.X1, r.Y1); }
      foreach (var w in reg.Windows)
        if (w.ZoneCenter is Point3d c) { double rr = w.ZoneRadius / k; Inc(c.X / k - rr, c.Y / k - rr); Inc(c.X / k + rr, c.Y / k + rr); }
      foreach (var p in s.Path) Inc(p[0], p[1]);
      if (minX > maxX) return "<p class=\"notice\">Nothing to draw yet.</p>";
      double pad = 0.6; minX -= pad; minY -= pad; maxX += pad; maxY += pad;
      double W = maxX - minX, H = maxY - minY;
      string X(double x) => Fmt.N(x - minX, "0.###");
      string Y(double y) => Fmt.N(maxY - y, "0.###");
      string L(double v) => Fmt.N(v, "0.###");

      var sb = new StringBuilder();
      sb.Append($"<svg viewBox=\"0 0 {L(W)} {L(H)}\" xmlns=\"http://www.w3.org/2000/svg\" style=\"width:100%;height:auto;display:block;max-height:620px\" role=\"img\" aria-label=\"Plan of the walk\">");
      foreach (var r in rects.OrderBy(r => r.Cls == "furn" ? 0 : r.Cls == "wall" ? 1 : 2))
      {
        string style = r.Cls == "wall" ? "fill:#1D1E1C" : r.Cls == "win" ? "fill:#3651C9" : "fill:none;stroke:#8E8B83;stroke-width:1";
        sb.Append($"<rect x=\"{X(r.X0)}\" y=\"{Y(r.Y1)}\" width=\"{L(r.X1 - r.X0)}\" height=\"{L(r.Y1 - r.Y0)}\" style=\"{style}\" vector-effect=\"non-scaling-stroke\"/>");
      }
      foreach (var w in reg.Windows)
      {
        if (w.ZoneCenter is Point3d c)
          sb.Append($"<circle cx=\"{X(c.X / k)}\" cy=\"{Y(c.Y / k)}\" r=\"{L(w.ZoneRadius / k)}\" style=\"fill:none;stroke:#3651C9;stroke-width:1;stroke-dasharray:4 4\" vector-effect=\"non-scaling-stroke\"/>");
        if (w.Box.IsValid)
          sb.Append($"<text x=\"{X(w.Box.Center.X / k)}\" y=\"{Y(w.Box.Center.Y / k)}\" dy=\"-0.35\" text-anchor=\"middle\" style=\"font:500 0.32px 'IBM Plex Mono',monospace;fill:#6E6D67\">{E(w.Id)}</text>");
      }
      if (s.Path.Count > 1)
        sb.Append($"<polyline points=\"{string.Join(" ", s.Path.Select(p => X(p[0]) + "," + Y(p[1])))}\" style=\"fill:none;stroke:#1D1E1C;stroke-opacity:.55;stroke-width:1.6;stroke-linejoin:round\" vector-effect=\"non-scaling-stroke\"/>");
      foreach (var cp in s.Captures)
        sb.Append($"<circle cx=\"{X(cp.X)}\" cy=\"{Y(cp.Y)}\" r=\"0.13\" style=\"fill:#3651C9\"/>");
      if (s.LastView != null)
      {
        double px = s.LastView[0], py = s.LastView[1], a = Math.Atan2(s.LastView[3], s.LastView[2]), R = 1.8;
        string P(double ang) => X(px + R * Math.Cos(ang)) + "," + Y(py + R * Math.Sin(ang));
        sb.Append($"<polygon points=\"{X(px)},{Y(py)} {P(a - 0.55)} {P(a + 0.55)}\" style=\"fill:#3651C9;fill-opacity:.18\"/>");
        sb.Append($"<circle cx=\"{X(px)}\" cy=\"{Y(py)}\" r=\"0.11\" style=\"fill:#1D1E1C\"/>");
      }
      sb.Append($"<text x=\"0.25\" y=\"0.45\" style=\"font:500 0.3px 'IBM Plex Mono',monospace;fill:#6E6D67\">N ↑</text>");
      sb.Append("</svg>");
      return sb.ToString();
    }

    public static string Json(Tracker tr, DecodeResult d)
    {
      var s = tr.S; var reg = tr.Reg; double k = reg.UnitsPerMeter;
      var objects = new Dictionary<string, object>();
      foreach (var t in reg.All)
      {
        var st = tr.Stats(t.Id);
        objects[t.Id] = new
        {
          name = t.Name,
          kind = t.Kind,
          hidden_metadata = t.Meta.ToDictionary(kv => kv.Key, kv => kv.Key == "Glass" && t.HasSwappableGlass ? Catalog.GlassById(tr.GlassNow).Spec : kv.Value),
          stats = new
          {
            attention = Fmt.R1(st.Attention), gaze_s = Fmt.R1(st.Gaze), dwell_s = Fmt.R1(st.Dwell), engaged_s = Fmt.R1(st.Engaged),
            captures = st.Captures, glances = st.Glances, zone_visits = st.Visits, fixations_s = st.Fixations,
            closest_m = double.IsInfinity(st.MinDist) ? (double?)null : Fmt.R2(st.MinDist),
          },
        };
      }
      var data = new
      {
        app = new { name = "Vision, Voice, Vibe for Rhino", version = typeof(Report).Assembly.GetName().Version?.ToString(), rhino = RhinoApp.Version.ToString() },
        walk = new { started = s.Started.ToString("o"), duration_s = Fmt.R1(s.Elapsed), walked_m = Fmt.R1(s.Walked), capture_rule = $"{Rules.CaptureAfter}s sustained look while inside a zone", units = "m" },
        objects,
        notes = s.Notes.Select(n => new { t = n.T, text = n.Text, source = n.Source, target = n.Target, looking_at = n.LookingAt, zone = n.Zone, glass = Catalog.GlassById(n.Glass).Name, sentiment = n.Sentiment, cues = n.Cues.Select(c => c.Attr).Distinct().ToArray(), first_at_target = n.FirstAtTarget }),
        glass_test = d.Test.Select(t => new { glass = t.G.Name, vlt_pct = t.G.Vlt, shown_s = Fmt.R1(t.S.Time), window_gaze_s = Fmt.R1(t.S.WinGaze), window_captures = t.S.Captures, remarks = t.S.Notes, sentiment = t.S.Sentiment, window_looking_s_per_min = t.Rate.HasValue ? Fmt.R1(t.Rate.Value) : (double?)null }),
        glass_preferred = d.Glass.Winner != null ? Catalog.GlassById(d.Glass.Winner).Name : null,
        attention_hotspots = tr.TopHeat(12).Select(c => new { @object = c.Tag, x = Fmt.R2(c.X / k), y = Fmt.R2(c.Y / k), z = Fmt.R2(c.Z / k), weight = Fmt.R2(c.W) }),
        inferred_axes = d.Axes.ToDictionary(a => a.Def.Key, a => Fmt.R2(a.V)),
        captures = s.Captures.Select(c => new { t = c.T, tag = c.Tag, zone = c.Zone, x = c.X, y = c.Y }),
        path = s.Path,
        events = s.Events.Select(e => new { t = e.T, type = e.Type, tag = e.Tag, text = e.Text }),
      };
      return JsonSerializer.Serialize(data, new JsonSerializerOptions { WriteIndented = true, Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping });
    }

    public static (string HtmlPath, string JsonPath) Save(string dir, string html, string json, string label)
    {
      var stamp = DateTime.Now.ToString("yyyy-MM-dd HHmmss");
      var name = string.IsNullOrEmpty(label) ? $"walk {stamp}" : $"{label} {stamp}";
      var htmlPath = Path.Combine(dir, name + ".html");
      var jsonPath = Path.Combine(dir, name + ".json");
      File.WriteAllText(htmlPath, html, Encoding.UTF8);
      File.WriteAllText(jsonPath, json, Encoding.UTF8);
      return (htmlPath, jsonPath);
    }

    public static void OpenFile(string path)
    {
      try { Process.Start(new ProcessStartInfo { FileName = path, UseShellExecute = true }); }
      catch (Exception ex) { RhinoApp.WriteLine("Vision, Voice, Vibe: couldn't open " + path + ": " + ex.Message); }
    }
  }

  /// <summary>Shows the decoded walk inside Rhino.</summary>
  public sealed class ReportWindow : Form
  {
    public ReportWindow(string html, string htmlPath, string json, bool live)
    {
      Title = "Vision, Voice, Vibe · decoded walk";
      ClientSize = new Size(1120, 840);
      Resizable = true;
      var web = new WebView();
      web.Url = new Uri(htmlPath);
      var open = new Button { Text = "Open in browser" };
      open.Click += (s, e) => Report.OpenFile(htmlPath);
      var copy = new Button { Text = "Copy data" };
      copy.Click += (s, e) => { new Clipboard().Text = json; copy.Text = "Copied"; };
      var folder = new Label { Text = htmlPath, TextColor = Color.FromArgb(110, 109, 103) };
      var back = new Button { Text = live ? "Keep walking" : "Close" };
      back.Click += (s, e) => { Close(); if (live) Walk.Start(); };
      var bar = new StackLayout { Orientation = Orientation.Horizontal, Spacing = 8, Padding = new Padding(10, 8), VerticalContentAlignment = VerticalAlignment.Center };
      bar.Items.Add(open); bar.Items.Add(copy); bar.Items.Add(new StackLayoutItem(folder, true)); bar.Items.Add(back);
      Content = new TableLayout(new TableRow(web) { ScaleHeight = true }, new TableRow(bar));
    }
  }
}
