using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using Rhino.Geometry;

namespace VisionVoiceVibe
{
  /// <summary>Rules carried over from the web prototype. Distances in metres, times in seconds.</summary>
  public static class Rules
  {
    public const double CaptureAfter = 2.0;    // a look this long while standing in a zone is a capture
    public const double GlanceMin = 0.25;      // shortest look counted as a glance
    public const double PathEvery = 0.35;      // path sample interval
    public const int PathMax = 4000;           // about 23 minutes of path
    public const double IdleAfter = 20.0;      // no camera movement and no notes for this long pauses tracking
    public const double HeatCell = 0.2;        // heat map cell size
    public const double MaxStep = 0.25;        // largest time step counted per tick
    public const double Teleport = 2.0;        // a jump bigger than this in one tick isn't walking
    public const double CloseApproach = 1.6;   // closer than this reads as interest in detail
    public const double NoteReach = 4.0;       // a note can link to a window zone this far away
    public const double ZoneRadius = 1.8;      // default zone radius for tagged windows
  }

  public sealed class GlassOption
  {
    public readonly string Id, Letter, Name, Spec;
    public readonly int Vlt;
    public readonly Color Color;
    public readonly double Transparency;
    public GlassOption(string id, string letter, string name, int vlt, string spec, Color color, double transparency)
    { Id = id; Letter = letter; Name = name; Vlt = vlt; Spec = spec; Color = color; Transparency = transparency; }
  }

  public sealed class AxisDef
  {
    public readonly string Key, Neg, Pos;
    public AxisDef(string key, string neg, string pos) { Key = key; Neg = neg; Pos = pos; }
  }

  public sealed class RecSide
  {
    public readonly string[] Elements, Materials, Concepts;
    public RecSide(string[] el, string[] mat, string[] con) { Elements = el; Materials = mat; Concepts = con; }
  }

  public static class Catalog
  {
    public static readonly GlassOption[] Glass =
    {
      new GlassOption("clear", "A", "Low-iron clear", 91, "Low-iron laminated 10.76 mm, VLT 91%", Color.FromArgb(214, 228, 233), 0.85),
      new GlassOption("frit", "B", "Fritted dot", 58, "Low-iron with 50% white ceramic dot frit, VLT 58%", Color.FromArgb(246, 246, 242), 0.45),
      new GlassOption("bronze", "C", "Bronze tint", 35, "Bronze-tint solar-control double glazing, VLT 35%", Color.FromArgb(122, 102, 80), 0.62),
    };

    public static GlassOption GlassById(string id)
    {
      foreach (var g in Glass) if (g.Id == id) return g;
      return Glass[0];
    }

    public static readonly AxisDef[] Axes =
    {
      new AxisDef("curvature", "Sharp, orthogonal", "Curved, soft"),
      new AxisDef("verticality", "Horizontal, panoramic", "Vertical, sky-facing"),
      new AxisDef("frame", "Minimal frame", "Expressed frame"),
      new AxisDef("sill", "Raised sill", "Low, grounded sill"),
    };

    static readonly string[] None = new string[0];

    /// <summary>Recommendations per axis: [0] for the positive end, [1] for the negative end.</summary>
    public static readonly Dictionary<string, RecSide[]> Rec = new Dictionary<string, RecSide[]>
    {
      ["curvature"] = new[]
      {
        new RecSide(new[] { "Arched or radiused openings, head radius ≥ 600 mm", "Coved junction between wall and ceiling", "Curved reveals returned in plaster", "Rounded joinery edges, R 20–40 mm" },
                    new[] { "Lime plaster or tadelakt on the reveals", "Steam-bent or CNC-curved oak", "Hot-bent low-iron glass" },
                    new[] { "Soft enclosure", "Biomorphic geometry", "Light that grades instead of cuts" }),
        new RecSide(new[] { "Rectilinear openings with crisp 90° arrises", "10 mm shadow-gap reveals", "Frameless glass corner" },
                    new[] { "Honed limestone or terrazzo sills", "Blackened steel trims", "Flat structural-glazed units" },
                    new[] { "Precise minimalism", "Grid and proportion", "Views framed like pictures" }),
      },
      ["verticality"] = new[]
      {
        new RecSide(new[] { "Tall slot windows rising past door head", "Clerestory or roof light for a sky view", "A double-height moment at the entry" }, None, new[] { "Vertical lift and sky connection" }),
        new RecSide(new[] { "Ribbon window at seated eye level, 900–1000 mm sill", "Long window seat or ledge under the band", "Panoramic corner opening" }, None, new[] { "Horizon and landscape panorama" }),
      },
      ["frame"] = new[]
      {
        new RecSide(new[] { "Expressed mullions as a graphic grid", "Deep frames with integrated shelves" }, new[] { "Black anodised aluminium or bronze frames, 60–90 mm sightline" }, new[] { "Framing as ornament" }),
        new RecSide(new[] { "Concealed or slimline frames, 40 mm or less", "Glass set straight into plaster reveals" }, new[] { "Slim steel sections or structural silicone glazing" }, new[] { "A boundary that almost disappears" }),
      },
      ["sill"] = new[]
      {
        new RecSide(new[] { "Low or floor-level sills", "Window seat at 450 mm", "Glazing that runs down to the floor finish" }, None, new[] { "Grounded connection to outside" }),
        new RecSide(new[] { "Raised sills, 1000 mm or more, for privacy and wall space", "High clerestory bands" }, None, new[] { "Protected interior, selective view" }),
      },
    };
  }

  /// <summary>What the model says about one tag (W-01, S-WALL, ...), read from object user text.</summary>
  public sealed class TagInfo
  {
    public string Id, Name, Kind;
    public readonly List<KeyValuePair<string, string>> Meta = new List<KeyValuePair<string, string>>();
    public readonly Dictionary<string, double> Features = new Dictionary<string, double>();
    public Point3d? ZoneCenter;        // model units, on the floor
    public double ZoneRadius;          // model units
    public Point3d? Anchor;            // where the floating label sits
    public BoundingBox Box = BoundingBox.Empty;
    public bool HasSwappableGlass;
    public bool IsWindow => Kind == "window";

    public string MetaValue(string key)
    {
      foreach (var kv in Meta) if (string.Equals(kv.Key, key, StringComparison.OrdinalIgnoreCase)) return kv.Value;
      return null;
    }

    public double Feature(string key) => Features.TryGetValue(key, out var v) ? v : 0.0;
  }

  public sealed class TagStats
  {
    public double Gaze, Attention, Dwell, Engaged, DwellRun;
    public int Captures, Glances, Visits;
    public readonly List<double> Fixations = new List<double>();
    public double MinDist = double.PositiveInfinity;   // metres
    public readonly List<Note> Notes = new List<Note>();
    public bool InZone;

    public double Longest
    {
      get { double m = 0; foreach (var f in Fixations) if (f > m) m = f; return m; }
    }
  }

  public sealed class Cue { public string Attr, What; }

  public sealed class NoteContext
  {
    public double T;
    public string Target, LookingAt, Zone, Glass;
  }

  public sealed class Note
  {
    public double T;
    public string Text, Source, Target, LookingAt, Zone, Glass;
    public int Sentiment;
    public List<Cue> Cues = new List<Cue>();
    public bool FirstAtTarget;   // the first remark linked to this object during the walk
  }

  public sealed class GlassStats
  {
    public double Time, WinGaze, WinAttention;
    public int Captures, Sentiment, Notes;
  }

  public sealed class LogEvent { public double T; public string Type, Tag, Text; }

  public sealed class CapturePoint { public double X, Y, T; public string Tag, Zone; }

  public sealed class HeatCell { public double X, Y, Z, W; public string Tag; }

  public sealed class Session
  {
    public DateTime Started = DateTime.Now;
    public double Elapsed, Walked;                                           // seconds, metres
    public readonly List<double[]> Path = new List<double[]>();              // [x, y] in metres
    public readonly List<LogEvent> Events = new List<LogEvent>();
    public readonly List<Note> Notes = new List<Note>();
    public readonly List<CapturePoint> Captures = new List<CapturePoint>();
    public readonly Dictionary<string, TagStats> Stats = new Dictionary<string, TagStats>(StringComparer.OrdinalIgnoreCase);
    public readonly Dictionary<string, GlassStats> Glass = new Dictionary<string, GlassStats>();
    public double[] LastView;                                                // [x, y, dirX, dirY], metres
  }

  public static class Fmt
  {
    public static readonly CultureInfo CI = CultureInfo.InvariantCulture;
    public static string Secs(double s) => s < 60 ? s.ToString("0.0", CI) + " s" : ((int)(s / 60)).ToString(CI) + "m " + ((int)Math.Round(s % 60)).ToString("00", CI) + "s";
    public static string Clock(double s) => ((int)(s / 60)).ToString(CI) + ":" + ((int)(s % 60)).ToString("00", CI);
    public static double R1(double v) => Math.Round(v, 1);
    public static double R2(double v) => Math.Round(v, 2);
    public static string N(double v, string format = "0.0") => v.ToString(format, CI);
  }
}
