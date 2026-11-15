using System;
using System.Collections.Generic;
using Rhino.Geometry;

namespace VisionVoiceVibe
{
  /// <summary>
  /// A fine mesh (about 15 cm spacing) of one tagged object that attention is painted onto, like the web
  /// prototype's heat shader: every hit adds a Gaussian (sigma 0.36 m) to the mesh points around it.
  /// Built the first time the object is looked at.
  /// </summary>
  public sealed class HeatOverlay
  {
    public const double Sigma = 0.36;          // metres, same spread as the web prototype
    public Mesh Mesh;
    public Point3d[] Pos;                      // mesh points
    public Point3d[] Lifted;                   // the same points nudged off the surface, for drawing
    public double Cell;                        // grid cell for finding nearby points (3 sigma)
    public readonly Dictionary<(int, int, int), List<int>> Grid = new Dictionary<(int, int, int), List<int>>();
    public int Count => Pos.Length;

    public (int, int, int) Key(Point3d p) => ((int)Math.Floor(p.X / Cell), (int)Math.Floor(p.Y / Cell), (int)Math.Floor(p.Z / Cell));

    public static HeatOverlay Build(RayTarget t, double k)
    {
      Mesh m = null;
      var mp = new MeshingParameters
      {
        MaximumEdgeLength = 0.15 * k, MinimumEdgeLength = 1e-4 * k, SimplePlanes = false,
        RefineGrid = true, JaggedSeams = false, GridMinCount = 4,
      };
      try
      {
        switch (t.Geometry)
        {
          case Brep b: m = TagRegistry.Join(Mesh.CreateFromBrep(b, mp)); break;
          case Extrusion e: { var b2 = e.ToBrep(); if (b2 != null) m = TagRegistry.Join(Mesh.CreateFromBrep(b2, mp)); break; }
          case Surface s: { var b3 = s.ToBrep(); if (b3 != null) m = TagRegistry.Join(Mesh.CreateFromBrep(b3, mp)); break; }
        }
      }
      catch { m = null; }
      if (m == null || m.Vertices.Count == 0) m = t.Mesh?.DuplicateMesh();
      if (m == null || m.Vertices.Count == 0) return null;
      m.Normals.ComputeNormals();

      var o = new HeatOverlay { Mesh = m, Cell = 3 * Sigma * k };
      int n = m.Vertices.Count;
      o.Pos = new Point3d[n];
      o.Lifted = new Point3d[n];
      for (int i = 0; i < n; i++)
      {
        Point3d p = m.Vertices[i];
        Vector3d nv = m.Normals[i];
        o.Pos[i] = p;
        o.Lifted[i] = p + nv * (0.006 * k);   // 6 mm proud of the surface so it doesn't flicker
        var key = o.Key(p);
        if (!o.Grid.TryGetValue(key, out var list)) o.Grid[key] = list = new List<int>();
        list.Add(i);
      }
      return o;
    }
  }
}
