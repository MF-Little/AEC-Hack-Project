using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using Rhino;
using Rhino.Display;
using Rhino.DocObjects;
using Rhino.Geometry;
using static System.FormattableString;

namespace VisionVoiceVibe
{
  /// <summary>
  /// Rebuilds the web prototype's test room in Rhino (8 x 10 x 3.2 m, two windows, furniture) and writes
  /// the same tags and hidden metadata onto each object as Attribute User Text.
  /// Coordinates: x east, y north, z up, in metres (scaled to the document's units).
  /// </summary>
  public static class TestRoom
  {
    public const string RootLayer = "VVV test room";
    const double RW = 8, RD = 10, RH = 3.2, T = 0.25;

    sealed class Spec
    {
      public string Name, Kind, Zone, Anchor, Features;
      public (string Key, string Value)[] Meta;
    }

    static readonly Dictionary<string, Spec> Specs = new Dictionary<string, Spec>
    {
      ["W-01"] = new Spec { Name = "Arched window", Kind = "window", Zone = "-1.4,3.35,1.8", Anchor = "-1.4,5.0,3.08", Features = "curvature=1;verticality=0.85;frame=-0.7;sill=0.8",
        Meta = new[] { ("Geometry", "Arch, semicircular head R 800, radiused base R 250"), ("Size", "1600 × 2550 mm"), ("Sill", "350 mm above floor"), ("Glass", "Switchable"), ("Frame", "Slim bronze-finish steel, 40 mm sightline"), ("Facing", "North · sky and upper landscape") } },
      ["W-02"] = new Spec { Name = "Ribbon window", Kind = "window", Zone = "2.3,-1.0,1.8", Anchor = "4.0,-1.0,2.4", Features = "curvature=-1;verticality=-0.85;frame=0.8;sill=-0.5",
        Meta = new[] { ("Geometry", "Rectangle, sharp 90° corners, 2 mullions"), ("Size", "3400 × 1150 mm"), ("Sill", "1000 mm above floor"), ("Glass", "Switchable"), ("Frame", "Black anodised aluminium, 80 mm sightline"), ("Facing", "East · horizon band") } },
      ["S-WALL"] = new Spec { Name = "Walls", Kind = "surface", Meta = new[] { ("Material", "Lime plaster, smooth trowel"), ("Colour", "Off-white, LRV 82"), ("Thickness", "250 mm") } },
      ["S-FLOOR"] = new Spec { Name = "Floor", Kind = "surface", Meta = new[] { ("Material", "Polished concrete, pale grey"), ("Finish", "Honed, low sheen"), ("Note", "Receives the sun patches from both windows") } },
      ["S-CEIL"] = new Spec { Name = "Ceiling", Kind = "surface", Meta = new[] { ("Material", "Fair-faced concrete soffit"), ("Height", "3200 mm") } },
      ["F-SOFA"] = new Spec { Name = "Lounge sofa", Kind = "furniture", Meta = new[] { ("Form", "Low-slung, rounded arms"), ("Material", "Bouclé wool, oatmeal"), ("Base", "Recessed oak plinth"), ("Size", "2100 × 900 × 720 mm") } },
      ["F-RUG"] = new Spec { Name = "Rug", Kind = "furniture", Meta = new[] { ("Material", "Hand-knotted undyed wool"), ("Size", "2800 × 2000 mm") } },
      ["F-LAMP"] = new Spec { Name = "Floor lamp", Kind = "furniture", Meta = new[] { ("Material", "Linen shade, blackened steel stem"), ("Light", "2700 K warm white") } },
      ["F-TABLE"] = new Spec { Name = "Dining table", Kind = "furniture", Meta = new[] { ("Material", "Solid white oak, oiled"), ("Size", "2200 × 950 mm"), ("Edge", "Square, 2 mm arris") } },
      ["F-CHAIR"] = new Spec { Name = "Chairs", Kind = "furniture", Meta = new[] { ("Model", "Bentwood side chair"), ("Material", "Ash, black stain"), ("Seat", "450 mm high") } },
      ["F-BENCH"] = new Spec { Name = "Window bench", Kind = "furniture", Meta = new[] { ("Material", "Terrazzo, white aggregate"), ("Size", "3000 × 550 × 450 mm"), ("Role", "Window seat under W-02") } },
      ["F-PLANT"] = new Spec { Name = "Olive tree", Kind = "furniture", Meta = new[] { ("Species", "Olive, potted"), ("Material", "Glazed stoneware pot, 560 mm"), ("Role", "Biophilic element") } },
    };

    static readonly Dictionary<string, Color> Palette = new Dictionary<string, Color>
    {
      ["wall"] = Color.FromArgb(238, 236, 231), ["floor"] = Color.FromArgb(217, 214, 207), ["ceiling"] = Color.FromArgb(244, 243, 239),
      ["frame slim"] = Color.FromArgb(103, 97, 90), ["frame dark"] = Color.FromArgb(44, 44, 42), ["fabric"] = Color.FromArgb(214, 210, 202),
      ["oak"] = Color.FromArgb(201, 192, 178), ["dark"] = Color.FromArgb(61, 59, 55), ["terrazzo"] = Color.FromArgb(231, 228, 221),
      ["rug"] = Color.FromArgb(227, 222, 211), ["shade"] = Color.FromArgb(243, 239, 230), ["leaf"] = Color.FromArgb(169, 176, 156),
      ["pot"] = Color.FromArgb(191, 184, 172), ["outside"] = Color.FromArgb(248, 247, 243), ["ground"] = Color.FromArgb(227, 225, 219),
    };

    sealed class Ctx
    {
      public RhinoDoc Doc;
      public double K, Tol;
      public readonly Dictionary<string, int> Layers = new Dictionary<string, int>();
      public readonly Dictionary<string, int> Mats = new Dictionary<string, int>();
      public int Count;
    }

    public static bool Exists(RhinoDoc doc) => doc.Layers.FindByFullPath(RootLayer, -1) >= 0;

    /// <summary>Builds (or rebuilds) the room. Returns the number of objects added.</summary>
    public static int Build(RhinoDoc doc)
    {
      Remove(doc);
      if (doc.Objects.Count == 0 && doc.ModelUnitSystem != UnitSystem.Meters)
      {
        doc.AdjustModelUnitSystem(UnitSystem.Meters, false);
        doc.ModelAbsoluteTolerance = 0.001;
        RhinoApp.WriteLine("Vision, Voice, Vibe: set this empty document to metres for the test room.");
      }
      var c = new Ctx { Doc = doc, K = RhinoMath.UnitScale(UnitSystem.Meters, doc.ModelUnitSystem), Tol = doc.ModelAbsoluteTolerance };
      uint undo = doc.BeginUndoRecord("Build Vision, Voice, Vibe test room");
      try
      {
        foreach (var (name, col) in new[] { ("Walls", Color.FromArgb(150, 147, 140)), ("Windows", Color.FromArgb(54, 81, 201)), ("Furniture", Color.FromArgb(154, 91, 46)), ("Outside", Color.FromArgb(190, 188, 182)) })
          c.Layers[name] = EnsureLayer(doc, RootLayer + "::" + name, col);
        foreach (var kv in Palette) c.Mats[kv.Key] = Mat(doc, "VVV " + kv.Key, kv.Value, 0);
        foreach (var g in Catalog.Glass) c.Mats["glass " + g.Id] = Mat(doc, "VVV glass " + g.Id, g.Color, g.Transparency);

        BuildShell(c);
        BuildFurniture(c);
        BuildOutside(c);
      }
      finally { doc.EndUndoRecord(undo); }
      ApplyGlass(doc, "clear");
      return c.Count;
    }

    public static void Remove(RhinoDoc doc)
    {
      var ids = new List<Guid>();
      foreach (var layer in doc.Layers)
      {
        if (layer.IsDeleted) continue;
        if (layer.FullPath == RootLayer || layer.FullPath.StartsWith(RootLayer + "::", StringComparison.Ordinal))
          foreach (var o in doc.Objects.FindByLayer(layer) ?? new RhinoObject[0]) ids.Add(o.Id);
      }
      foreach (var id in ids) doc.Objects.Delete(id, true);
    }

    static int EnsureLayer(RhinoDoc doc, string path, Color color)
    {
      int idx = doc.Layers.FindByFullPath(path, -1);
      if (idx >= 0) return idx;
      var parts = path.Split(new[] { "::" }, StringSplitOptions.None);
      Guid parent = Guid.Empty;
      string cur = "";
      for (int i = 0; i < parts.Length; i++)
      {
        cur = i == 0 ? parts[0] : cur + "::" + parts[i];
        int j = doc.Layers.FindByFullPath(cur, -1);
        if (j < 0)
        {
          var l = new Layer { Name = parts[i], Color = color };
          if (parent != Guid.Empty) l.ParentLayerId = parent;
          j = doc.Layers.Add(l);
        }
        parent = doc.Layers[j].Id;
      }
      return doc.Layers.FindByFullPath(path, -1);
    }

    static int Mat(RhinoDoc doc, string name, Color col, double transparency)
    {
      int i = doc.Materials.Find(name, true);
      if (i >= 0) return i;
      var m = new Material { Name = name, DiffuseColor = col, Transparency = transparency };
      if (transparency > 0) { m.Shine = Material.MaxShine * 0.6; m.ReflectionColor = Color.White; }
      return doc.Materials.Add(m);
    }

    static Guid Add(Ctx c, Brep b, string layer, string mat, string tag, string label, bool glass = false)
    {
      if (b == null) { RhinoApp.WriteLine($"Vision, Voice, Vibe: couldn't build {label}."); return Guid.Empty; }
      if (Math.Abs(c.K - 1) > 1e-12) b.Transform(Transform.Scale(Point3d.Origin, c.K));
      int mi = c.Mats[mat];
      var a = new ObjectAttributes
      {
        LayerIndex = c.Layers[layer], Name = label,
        MaterialIndex = mi, MaterialSource = ObjectMaterialSource.MaterialFromObject,
        ColorSource = ObjectColorSource.ColorFromObject, ObjectColor = c.Doc.Materials[mi].DiffuseColor,
      };
      if (tag != null && Specs.TryGetValue(tag, out var sp))
      {
        a.SetUserString(TagRegistry.KeyTag, tag);
        a.SetUserString(TagRegistry.KeyName, sp.Name);
        a.SetUserString(TagRegistry.KeyKind, sp.Kind);
        if (sp.Zone != null) a.SetUserString(TagRegistry.KeyZone, Scaled(sp.Zone, c.K, true));
        if (sp.Anchor != null) a.SetUserString(TagRegistry.KeyAnchor, Scaled(sp.Anchor, c.K, false));
        if (sp.Features != null) a.SetUserString(TagRegistry.KeyFeatures, sp.Features);
        foreach (var (key, value) in sp.Meta) a.SetUserString(TagRegistry.KeyMeta + key, value);
      }
      if (glass) a.SetUserString(TagRegistry.KeyGlass, "1");
      c.Count++;
      return c.Doc.Objects.AddBrep(b, a);
    }

    // "x,y,r" or "x,y,z" in metres -> model units; a zone also gets a 4th value, the floor height.
    static string Scaled(string csv, double k, bool zone)
    {
      var v = csv.Split(',').Select(s => double.Parse(s, System.Globalization.CultureInfo.InvariantCulture) * k).ToList();
      if (zone) v.Add(0.006 * k);
      return string.Join(",", v.Select(x => Fmt.N(x, "0.####")));
    }

    static Brep Box(double cx, double cy, double cz, double sx, double sy, double sz) =>
      new Box(new BoundingBox(cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2)).ToBrep();

    static Brep Cyl(double cx, double cy, double z0, double r, double h) =>
      new Cylinder(new Circle(new Plane(new Point3d(cx, cy, z0), Vector3d.ZAxis), r), h).ToBrep(true, true);

    static Brep Frustum(double cx, double cy, double z0, double r0, double z1, double r1)
    {
      var profile = new LineCurve(new Point3d(cx + r0, cy, z0), new Point3d(cx + r1, cy, z1));
      var rev = RevSurface.Create(profile, new Line(new Point3d(cx, cy, z0), new Point3d(cx, cy, z1)));
      return Brep.CreateFromRevSurface(rev, true, true);
    }

    static Curve Rect(params Point3d[] p) => new PolylineCurve(new[] { p[0], p[1], p[2], p[3], p[0] });

    // An arch with a semicircular head and radiused base corners, in the vertical plane y = yPlane (u = x, v = z).
    static Curve Arch(double cx, double z0, double w, double h, double rb, double yPlane)
    {
      double r = w / 2, x0 = cx - r, x1 = cx + r, zc = z0 + h - r;
      Point3d P(double u, double v) => new Point3d(u, yPlane, v);
      Arc A(double u, double v, double rad, double a0, double a1) => new Arc(new Circle(new Plane(P(u, v), Vector3d.XAxis, Vector3d.ZAxis), rad), new Interval(a0, a1));
      var pc = new PolyCurve();
      pc.Append(new Line(P(x0 + rb, z0), P(x1 - rb, z0)));
      pc.Append(A(x1 - rb, z0 + rb, rb, 1.5 * Math.PI, 2 * Math.PI));
      pc.Append(new Line(P(x1, z0 + rb), P(x1, zc)));
      pc.Append(A(cx, zc, r, 0, Math.PI));
      pc.Append(new Line(P(x0, zc), P(x0, z0 + rb)));
      pc.Append(A(x0 + rb, z0 + rb, rb, Math.PI, 1.5 * Math.PI));
      return pc;
    }

    // A planar outline with a hole, pushed through a thickness.
    static Brep Pierced(Curve outer, Curve hole, Vector3d thickness, double tol)
    {
      var faces = Brep.CreatePlanarBreps(new[] { outer, hole }, tol);
      if (faces == null || faces.Length == 0) return null;
      var start = outer.PointAtStart;
      return faces[0].Faces[0].CreateExtrusion(new LineCurve(start, start + thickness), true);
    }

    static Brep Planar(Curve outline, double tol)
    {
      var faces = Brep.CreatePlanarBreps(outline, tol);
      return faces != null && faces.Length > 0 ? faces[0] : null;
    }

    static void BuildShell(Ctx c)
    {
      double tol = 0.0005;
      double yN = RD / 2, xE = RW / 2;

      // North wall with the arched window W-01
      var northOuter = Rect(new Point3d(-xE - T, yN, 0), new Point3d(xE + T, yN, 0), new Point3d(xE + T, yN, RH), new Point3d(-xE - T, yN, RH));
      Add(c, Pierced(northOuter, Arch(-1.4, 0.35, 1.6, 2.55, 0.25, yN), new Vector3d(0, T, 0), tol), "Walls", "wall", "S-WALL", "North wall");
      Add(c, Planar(Arch(-1.4, 0.35, 1.6, 2.55, 0.25, yN + T * 0.45), tol), "Windows", "glass clear", "W-01", "W-01 glass", glass: true);
      double f = 0.045;
      Add(c, Pierced(Arch(-1.4, 0.35 - f, 1.6 + 2 * f, 2.55 + 2 * f, 0.25 + f, yN + T * 0.45 - 0.025), Arch(-1.4, 0.35, 1.6, 2.55, 0.25, yN + T * 0.45 - 0.025), new Vector3d(0, 0.05, 0), tol), "Windows", "frame slim", "W-01", "W-01 frame");

      // East wall with the ribbon window W-02 (y from -2.7 to 0.7, sill 1.0 m, head 2.15 m)
      double y0 = -2.7, y1 = 0.7, z0 = 1.0, z1 = 2.15;
      var eastOuter = Rect(new Point3d(xE, -yN - T, 0), new Point3d(xE, yN + T, 0), new Point3d(xE, yN + T, RH), new Point3d(xE, -yN - T, RH));
      var eastHole = Rect(new Point3d(xE, y0, z0), new Point3d(xE, y1, z0), new Point3d(xE, y1, z1), new Point3d(xE, y0, z1));
      Add(c, Pierced(eastOuter, eastHole, new Vector3d(T, 0, 0), tol), "Walls", "wall", "S-WALL", "East wall");
      double xg = xE + T * 0.55;
      Add(c, Brep.CreateFromCornerPoints(new Point3d(xg, y0, z0), new Point3d(xg, y1, z0), new Point3d(xg, y1, z1), new Point3d(xg, y0, z1), tol), "Windows", "glass clear", "W-02", "W-02 glass", glass: true);
      double fd = 0.08, xf = xg - 0.045;
      var frameOuter = Rect(new Point3d(xf, y0 - fd, z0 - fd), new Point3d(xf, y1 + fd, z0 - fd), new Point3d(xf, y1 + fd, z1 + fd), new Point3d(xf, y0 - fd, z1 + fd));
      var frameHole = Rect(new Point3d(xf, y0, z0), new Point3d(xf, y1, z0), new Point3d(xf, y1, z1), new Point3d(xf, y0, z1));
      Add(c, Pierced(frameOuter, frameHole, new Vector3d(0.09, 0, 0), tol), "Windows", "frame dark", "W-02", "W-02 frame");
      foreach (var ym in new[] { -(1.0 - 3.4 / 6), -(1.0 + 3.4 / 6) })
        Add(c, Box(xg, ym, (z0 + z1) / 2, 0.09, 0.06, z1 - z0), "Windows", "frame dark", "W-02", "W-02 mullion");

      // Plain south and west walls, floor and ceiling
      Add(c, Box(0, -yN - T / 2, RH / 2, RW + 2 * T, T, RH), "Walls", "wall", "S-WALL", "South wall");
      Add(c, Box(-xE - T / 2, 0, RH / 2, T, RD + 2 * T, RH), "Walls", "wall", "S-WALL", "West wall");
      Add(c, Box(0, 0, -0.05, RW + 2 * T, RD + 2 * T, 0.1), "Walls", "floor", "S-FLOOR", "Floor");
      Add(c, Box(0, 0, RH + 0.075, RW + 2 * T, RD + 2 * T, 0.15), "Walls", "ceiling", "S-CEIL", "Ceiling");
    }

    static void BuildFurniture(Ctx c)
    {
      // Sofa facing the arched window, on a rug
      Add(c, Box(-1.4, 3.2, 0.006, 2.8, 2.0, 0.012), "Furniture", "rug", "F-RUG", "Rug");
      Add(c, Box(-1.4, 2.6, 0.25, 1.74, 0.9, 0.42), "Furniture", "fabric", "F-SOFA", "Sofa seat");
      Add(c, Box(-1.4, 2.15, 0.62, 1.74, 0.2, 0.36), "Furniture", "fabric", "F-SOFA", "Sofa back");
      foreach (var x in new[] { -2.27, -0.53 })
        Add(c, new Cylinder(new Circle(new Plane(new Point3d(x, 2.6 - 0.45, 0.42), Vector3d.YAxis), 0.18), 0.9).ToBrep(true, true), "Furniture", "fabric", "F-SOFA", "Sofa arm");
      Add(c, Box(-1.4, 2.6, 0.03, 1.9, 0.8, 0.06), "Furniture", "oak", "F-SOFA", "Sofa plinth");
      // Floor lamp beside the sofa
      Add(c, Cyl(-2.95, 2.0, 0, 0.18, 0.03), "Furniture", "dark", "F-LAMP", "Lamp base");
      Add(c, Cyl(-2.95, 2.0, 0.03, 0.012, 1.5), "Furniture", "dark", "F-LAMP", "Lamp stem");
      Add(c, Frustum(-2.95, 2.0, 1.46, 0.27, 1.78, 0.2), "Furniture", "shade", "F-LAMP", "Lamp shade");
      // Dining table and four chairs
      Add(c, Box(-2.2, -1.5, 0.735, 2.2, 0.95, 0.05), "Furniture", "oak", "F-TABLE", "Table top");
      foreach (var (x, y) in new[] { (-3.2, -1.15), (-1.2, -1.15), (-3.2, -1.85), (-1.2, -1.85) })
        Add(c, Box(x, y, 0.355, 0.06, 0.06, 0.71), "Furniture", "oak", "F-TABLE", "Table leg");
      foreach (var (x, zz, side) in new[] { (-2.75, 0.62, -1.0), (-1.65, 0.62, -1.0), (-2.75, 2.38, 1.0), (-1.65, 2.38, 1.0) })
      {
        Add(c, Box(x, -zz, 0.45, 0.44, 0.44, 0.04), "Furniture", "dark", "F-CHAIR", "Chair seat");
        Add(c, Box(x, -(zz + side * 0.2), 0.68, 0.44, 0.035, 0.4), "Furniture", "dark", "F-CHAIR", "Chair back");
        Add(c, Box(x, -zz, 0.215, 0.36, 0.36, 0.43), "Furniture", "dark", "F-CHAIR", "Chair base");
      }
      // Terrazzo window bench under the ribbon window
      Add(c, Box(RW / 2 - 0.3, -1.0, 0.225, 0.55, 3.0, 0.45), "Furniture", "terrazzo", "F-BENCH", "Window bench");
      // Potted olive tree in the north-east corner
      Add(c, Frustum(3.2, 4.2, 0, 0.22, 0.5, 0.28), "Furniture", "pot", "F-PLANT", "Plant pot");
      Add(c, Cyl(3.2, 4.2, 0.45, 0.035, 0.9), "Furniture", "oak", "F-PLANT", "Plant trunk");
      Add(c, new Sphere(new Point3d(3.2, 4.2, 1.65), 0.62).ToBrep(), "Furniture", "leaf", "F-PLANT", "Plant crown");
    }

    static void BuildOutside(Ctx c)
    {
      // Abstract landscape seen through the openings. Not tagged, so it never counts as attention.
      double g = -0.12;
      Add(c, Brep.CreateFromCornerPoints(new Point3d(-200, -200, g), new Point3d(200, -200, g), new Point3d(200, 200, g), new Point3d(-200, 200, g), 0.001), "Outside", "ground", null, "Ground");
      foreach (var (x, z, w, h, d) in new[] { (-9.0, -20.0, 6.0, 7.0, 5.0), (2.0, -26.0, 9.0, 4.0, 6.0), (12.0, -18.0, 4.0, 11.0, 4.0), (-20.0, -32.0, 10.0, 5.0, 8.0), (22.0, -8.0, 6.0, 6.0, 10.0), (28.0, 6.0, 8.0, 3.0, 12.0), (20.0, 16.0, 5.0, 9.0, 5.0), (36.0, -4.0, 10.0, 14.0, 6.0) })
        Add(c, Box(x, -z, h / 2 - 0.1, w, d, h), "Outside", "outside", null, "Block");
      var trees = new[] { (-4.0, -11.0), (-1.0, -13.0), (4.0, -10.5), (11.0, 3.0), (12.5, -1.0), (14.0, 6.0), (-7.0, -15.0) };
      for (int i = 0; i < trees.Length; i++)
      {
        var (x, z) = trees[i];
        double s = 1.1 + (i % 3) * 0.35;
        Add(c, Cyl(x, -z, 0, 0.07, 2), "Outside", "outside", null, "Tree trunk");
        Add(c, new Sphere(new Point3d(x, -z, 2 + s * 0.8), s).ToBrep(), "Outside", "outside", null, "Tree crown");
      }
    }

    /// <summary>Swaps the material on every object marked as switchable glass.</summary>
    public static void ApplyGlass(RhinoDoc doc, string glassId)
    {
      var g = Catalog.GlassById(glassId);
      int mi = doc.Materials.Find("VVV glass " + g.Id, true);
      if (mi < 0) mi = Mat(doc, "VVV glass " + g.Id, g.Color, g.Transparency);
      var m = doc.Materials[mi];
      if (Math.Abs(m.Transparency - g.Transparency) > 1e-6 || m.DiffuseColor.ToArgb() != g.Color.ToArgb())
      {
        m.Transparency = g.Transparency;
        m.DiffuseColor = g.Color;
        doc.Materials.Modify(m, mi, true);
      }
      var settings = new ObjectEnumeratorSettings { NormalObjects = true, LockedObjects = true, HiddenObjects = true };
      foreach (var obj in doc.Objects.GetObjectList(settings).ToList())
      {
        if (obj.Attributes.GetUserString(TagRegistry.KeyGlass) != "1") continue;
        var a = obj.Attributes.Duplicate();
        a.MaterialIndex = mi;
        a.MaterialSource = ObjectMaterialSource.MaterialFromObject;
        a.ColorSource = ObjectColorSource.ColorFromObject;
        a.ObjectColor = g.Color;
        doc.Objects.ModifyAttributes(obj, a, true);
      }
      doc.Views.Redraw();
    }

    /// <summary>Puts the Perspective view at the web prototype's start position, at eye height, looking toward W-01.</summary>
    public static void SetupCamera(RhinoDoc doc)
    {
      double k = RhinoMath.UnitScale(UnitSystem.Meters, doc.ModelUnitSystem);
      var view = doc.Views.Find("Perspective", false) ?? doc.Views.ActiveView;
      if (view == null) return;
      doc.Views.ActiveView = view;
      var vp = view.ActiveViewport;
      if (!vp.IsPerspectiveProjection) vp.ChangeToPerspectiveProjection(true, 18);
      vp.Camera35mmLensLength = 18;
      var loc = new Point3d(0.6 * k, -3.6 * k, 1.6 * k);
      var dir = new Vector3d(-Math.Sin(0.18), Math.Cos(0.18), -0.02);
      vp.SetCameraLocations(loc + dir * (5 * k), loc);
      vp.ConstructionGridVisible = false;
      vp.ConstructionAxesVisible = false;
      vp.WorldAxesVisible = false;
      var mode = DisplayModeDescription.GetDisplayModes().FirstOrDefault(m => m.EnglishName == "Rendered")
              ?? DisplayModeDescription.GetDisplayModes().FirstOrDefault(m => m.EnglishName == "Shaded");
      if (mode != null) vp.DisplayMode = mode;
      view.Maximized = true;
      view.Redraw();
    }
  }
}
