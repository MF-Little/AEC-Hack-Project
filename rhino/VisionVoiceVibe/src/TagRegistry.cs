using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Rhino;
using Rhino.DocObjects;
using Rhino.Geometry;
using Rhino.Geometry.Intersect;

namespace VisionVoiceVibe
{
  public sealed class RayTarget
  {
    public Guid Id;
    public string Tag;
    public Mesh Mesh;
    public BoundingBox Box;
    public bool IsGlass;
    public GeometryBase Geometry;   // kept to build the fine heat-map mesh when it's first needed
    public HeatOverlay Overlay;
  }

  public struct Hit
  {
    public string Tag;
    public Point3d Point;
    public double Distance;   // model units
    public RayTarget Target;
    public bool Ok => Tag != null;
  }

  /// <summary>
  /// Finds every object carrying a vvv.tag user string and keeps a mesh of each for ray casting.
  /// Metadata lives in Attribute User Text, so it works on the test room and on real models alike.
  /// </summary>
  public sealed class TagRegistry
  {
    public const string KeyTag = "vvv.tag", KeyName = "vvv.name", KeyKind = "vvv.kind", KeyZone = "vvv.zone",
      KeyAnchor = "vvv.anchor", KeyFeatures = "vvv.features", KeyGlass = "vvv.glass", KeyMeta = "vvv.meta.";

    public readonly Dictionary<string, TagInfo> Tags = new Dictionary<string, TagInfo>(StringComparer.OrdinalIgnoreCase);
    public readonly List<string> Order = new List<string>();
    public readonly List<RayTarget> Targets = new List<RayTarget>();
    public double UnitsPerMeter = 1.0;
    public BoundingBox WalkBounds = BoundingBox.Empty;   // surfaces (walls, floor): the camera stays inside
    public uint DocSerial;
    public bool Dirty = true;

    public IEnumerable<TagInfo> All => Order.Select(id => Tags[id]);
    public IEnumerable<TagInfo> Windows => All.Where(t => t.IsWindow);
    public TagInfo Get(string tag) => tag != null && Tags.TryGetValue(tag, out var t) ? t : null;

    public void Scan(RhinoDoc doc)
    {
      Tags.Clear(); Order.Clear(); Targets.Clear();
      WalkBounds = BoundingBox.Empty;
      Dirty = false;
      if (doc == null) return;
      DocSerial = doc.RuntimeSerialNumber;
      UnitsPerMeter = RhinoMath.UnitScale(UnitSystem.Meters, doc.ModelUnitSystem);
      var settings = new ObjectEnumeratorSettings
      {
        NormalObjects = true, LockedObjects = true, HiddenObjects = false, DeletedObjects = false,
        IncludeLights = false, IncludeGrips = false, ReferenceObjects = true,
      };
      foreach (var obj in doc.Objects.GetObjectList(settings))
      {
        var tag = obj.Attributes.GetUserString(KeyTag);
        if (string.IsNullOrWhiteSpace(tag)) continue;
        tag = tag.Trim();
        if (!Tags.TryGetValue(tag, out var info)) { info = new TagInfo { Id = tag }; Tags[tag] = info; Order.Add(tag); }
        Read(obj.Attributes, info);
        var box = obj.Geometry.GetBoundingBox(true);
        info.Box = info.Box.IsValid ? BoundingBox.Union(info.Box, box) : box;
        bool glass = obj.Attributes.GetUserString(KeyGlass) == "1";
        if (glass) info.HasSwappableGlass = true;
        var mesh = MeshOf(obj.Geometry);
        if (mesh != null && mesh.Faces.Count > 0)
        {
          var mb = mesh.GetBoundingBox(true);
          mb.Inflate(1e-6 * UnitsPerMeter + 1e-9);
          Targets.Add(new RayTarget { Id = obj.Id, Tag = tag, Mesh = mesh, Box = mb, IsGlass = glass, Geometry = obj.Geometry.Duplicate() });
        }
      }
      FillDefaults();
      int Rank(TagInfo t) => t.IsWindow ? 0 : t.Kind == "surface" ? 1 : t.Kind == "furniture" ? 2 : 3;
      var sorted = All.OrderBy(Rank).ThenBy(t => t.Id, StringComparer.OrdinalIgnoreCase).Select(t => t.Id).ToList();
      Order.Clear(); Order.AddRange(sorted);
      foreach (var t in All) if (t.Kind == "surface" && t.Box.IsValid) WalkBounds = WalkBounds.IsValid ? BoundingBox.Union(WalkBounds, t.Box) : t.Box;
    }

    static void Read(ObjectAttributes attrs, TagInfo info)
    {
      var us = attrs.GetUserStrings();
      foreach (string key in us.AllKeys)
      {
        if (key == null) continue;
        var val = us[key];
        if (val == null) continue;
        var k = key.Trim();
        if (k.Equals(KeyName, StringComparison.OrdinalIgnoreCase)) { if (string.IsNullOrWhiteSpace(info.Name)) info.Name = val.Trim(); }
        else if (k.Equals(KeyKind, StringComparison.OrdinalIgnoreCase)) { if (string.IsNullOrWhiteSpace(info.Kind)) info.Kind = val.Trim().ToLowerInvariant(); }
        else if (k.Equals(KeyZone, StringComparison.OrdinalIgnoreCase))
        {
          var p = Nums(val);
          if (p.Length >= 3 && info.ZoneCenter == null) { info.ZoneCenter = new Point3d(p[0], p[1], p.Length >= 4 ? p[3] : 0); info.ZoneRadius = p[2]; }
        }
        else if (k.Equals(KeyAnchor, StringComparison.OrdinalIgnoreCase))
        {
          var p = Nums(val);
          if (p.Length >= 3 && info.Anchor == null) info.Anchor = new Point3d(p[0], p[1], p[2]);
        }
        else if (k.Equals(KeyFeatures, StringComparison.OrdinalIgnoreCase))
        {
          foreach (var part in val.Split(';'))
          {
            var kv = part.Split('=');
            if (kv.Length == 2 && double.TryParse(kv[1], NumberStyles.Float, CultureInfo.InvariantCulture, out var f)) info.Features[kv[0].Trim()] = f;
          }
        }
        else if (k.StartsWith(KeyMeta, StringComparison.OrdinalIgnoreCase))
        {
          var mk = k.Substring(KeyMeta.Length);
          if (mk.Length > 0 && info.MetaValue(mk) == null) info.Meta.Add(new KeyValuePair<string, string>(mk, val));
        }
      }
    }

    static double[] Nums(string s)
    {
      var list = new List<double>();
      foreach (var part in s.Split(','))
        if (double.TryParse(part.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var v)) list.Add(v);
      return list.ToArray();
    }

    void FillDefaults()
    {
      var all = BoundingBox.Empty;
      foreach (var t in All) if (t.Box.IsValid) all = all.IsValid ? BoundingBox.Union(all, t.Box) : t.Box;
      foreach (var t in All)
      {
        if (string.IsNullOrWhiteSpace(t.Name)) t.Name = t.Id;
        if (string.IsNullOrWhiteSpace(t.Kind))
          t.Kind = t.Id.StartsWith("W-", StringComparison.OrdinalIgnoreCase) ? "window"
                 : t.Id.StartsWith("S-", StringComparison.OrdinalIgnoreCase) ? "surface"
                 : t.Id.StartsWith("F-", StringComparison.OrdinalIgnoreCase) ? "furniture" : "other";
        if (t.IsWindow && t.ZoneCenter == null && t.Box.IsValid)
        {
          // No zone given: put one on the floor, 1.2 m in from the window toward the middle of the tagged model.
          var c = t.Box.Center;
          var toward = all.IsValid ? all.Center - c : Vector3d.Zero;
          toward.Z = 0;
          if (toward.Length > 1e-9) toward.Unitize();
          var p = c + toward * (1.2 * UnitsPerMeter);
          t.ZoneCenter = new Point3d(p.X, p.Y, all.IsValid ? all.Min.Z : 0);
          t.ZoneRadius = Rules.ZoneRadius * UnitsPerMeter;
        }
        if (t.Anchor == null && t.Box.IsValid) t.Anchor = new Point3d(t.Box.Center.X, t.Box.Center.Y, t.Box.Max.Z + 0.15 * UnitsPerMeter);
      }
    }

    static Mesh MeshOf(GeometryBase g)
    {
      try
      {
        switch (g)
        {
          case Mesh m: return m.DuplicateMesh();
          case Brep b: return Join(Mesh.CreateFromBrep(b, MeshingParameters.FastRenderMesh));
          case Extrusion e: { var b2 = e.ToBrep(); return b2 == null ? null : Join(Mesh.CreateFromBrep(b2, MeshingParameters.FastRenderMesh)); }
          case SubD sd: return Mesh.CreateFromSubD(sd, 2);
          case Surface s: { var b3 = s.ToBrep(); return b3 == null ? null : Join(Mesh.CreateFromBrep(b3, MeshingParameters.FastRenderMesh)); }
          default: return null;
        }
      }
      catch { return null; }
    }

    internal static Mesh Join(Mesh[] parts)
    {
      if (parts == null || parts.Length == 0) return null;
      var m = new Mesh();
      m.Append(parts);
      return m;
    }

    /// <summary>The heat-map mesh for a target, built on first use.</summary>
    public HeatOverlay OverlayOf(RayTarget t)
    {
      if (t == null) return null;
      if (t.Overlay == null) t.Overlay = HeatOverlay.Build(t, UnitsPerMeter);
      return t.Overlay;
    }

    public RayTarget TargetById(Guid id)
    {
      foreach (var t in Targets) if (t.Id == id) return t;
      return null;
    }

    /// <summary>Nearest tagged surface along a ray, or no hit.</summary>
    public Hit Cast(Point3d origin, Vector3d dir)
    {
      var best = new Hit();
      double bestT = double.MaxValue;
      var ray = new Ray3d(origin, dir);
      foreach (var t in Targets)
      {
        if (!Slab(origin, dir, t.Box, bestT)) continue;
        double p = Intersection.MeshRay(t.Mesh, ray);
        if (p > 1e-6 && p < bestT)
        {
          bestT = p;
          best.Tag = t.Tag;
          best.Point = ray.PointAt(p);
          best.Distance = p * dir.Length;
          best.Target = t;
        }
      }
      return best;
    }

    static bool Slab(Point3d o, Vector3d d, BoundingBox b, double maxT)
    {
      double tmin = 0, tmax = maxT;
      for (int i = 0; i < 3; i++)
      {
        double oi = o[i], di = d[i], lo = b.Min[i], hi = b.Max[i];
        if (Math.Abs(di) < 1e-12) { if (oi < lo || oi > hi) return false; continue; }
        double t1 = (lo - oi) / di, t2 = (hi - oi) / di;
        if (t1 > t2) { var tmp = t1; t1 = t2; t2 = tmp; }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return false;
      }
      return true;
    }
  }
}
