using System;
using System.Collections.Generic;
using System.Diagnostics;
using Eto.Forms;
using Rhino;
using Rhino.Display;
using Rhino.Geometry;
using Rhino.UI;

namespace VisionVoiceVibe
{
  /// <summary>
  /// First-person walking, since Rhino for Mac has no Walkabout: W A S D or the arrow keys while the
  /// Vision, Voice, Vibe window is in front, and drag in the Perspective view to look around.
  /// Eye height stays where it is; walls of the tagged model stop you walking out of the room.
  /// </summary>
  public static class WalkNav
  {
    static readonly HashSet<Keys> held = new HashSet<Keys>();
    static readonly Keys[] Handled = { Keys.W, Keys.A, Keys.S, Keys.D, Keys.Q, Keys.E, Keys.Up, Keys.Down, Keys.Left, Keys.Right };
    static readonly Stopwatch clock = Stopwatch.StartNew();
    static UITimer timer;
    static LookCallback look;
    static bool fast;
    static double last;

    public static void Init()
    {
      timer = new UITimer { Interval = 1.0 / 40 };
      timer.Elapsed += (s, e) => Tick();
      look = new LookCallback { Enabled = true };
    }

    public static bool KeyDown(Keys key, bool shift)
    {
      var k = key & Keys.KeyMask;
      if (Array.IndexOf(Handled, k) < 0) return false;
      fast = shift;
      held.Add(k);
      if (!timer.Started) { last = clock.Elapsed.TotalSeconds; timer.Start(); }
      return true;
    }

    public static bool KeyUp(Keys key)
    {
      bool had = held.Remove(key & Keys.KeyMask);
      if (held.Count == 0) timer.Stop();
      return had;
    }

    public static void Release() { held.Clear(); timer?.Stop(); }

    static void Tick()
    {
      double now = clock.Elapsed.TotalSeconds, dt = Math.Min(0.1, now - last);
      last = now;
      double f = 0, s = 0, turn = 0, speed = 1.7 * (fast ? 2 : 1);
      if (held.Contains(Keys.W) || held.Contains(Keys.Up)) f += 1;
      if (held.Contains(Keys.S) || held.Contains(Keys.Down)) f -= 1;
      if (held.Contains(Keys.D)) s += 1;
      if (held.Contains(Keys.A)) s -= 1;
      if (held.Contains(Keys.Left) || held.Contains(Keys.Q)) turn += 1;
      if (held.Contains(Keys.Right) || held.Contains(Keys.E)) turn -= 1;
      Move(f * speed * dt, s * speed * dt, turn * 1.6 * dt);
    }

    static RhinoViewport WalkViewport(out RhinoView view)
    {
      view = RhinoDoc.ActiveDoc?.Views.ActiveView;
      var vp = view?.ActiveViewport;
      return vp != null && vp.IsPerspectiveProjection ? vp : null;
    }

    static Vector3d Dir(double yaw, double pitch) => new Vector3d(Math.Cos(pitch) * Math.Cos(yaw), Math.Cos(pitch) * Math.Sin(yaw), Math.Sin(pitch));

    static (double Yaw, double Pitch) Angles(RhinoViewport vp)
    {
      var d = vp.CameraDirection;
      d.Unitize();
      return (Math.Atan2(d.Y, d.X), Math.Asin(Math.Max(-1, Math.Min(1, d.Z))));
    }

    /// <summary>Moves the camera: forward and sideways in metres, turn in radians (positive turns left).</summary>
    public static void Move(double forward, double strafe, double turn)
    {
      var vp = WalkViewport(out var view);
      if (vp == null) return;
      double k = Walk.Reg.UnitsPerMeter;
      var (yaw, pitch) = Angles(vp);
      yaw += turn;
      var flat = new Vector3d(Math.Cos(yaw), Math.Sin(yaw), 0);
      var right = new Vector3d(flat.Y, -flat.X, 0);
      var p = Clamp(vp.CameraLocation + (flat * forward + right * strafe) * k);
      vp.SetCameraLocations(p + Dir(yaw, pitch) * (5 * k), p);
      view.Redraw();
    }

    /// <summary>Turns the head by a mouse drag, in pixels.</summary>
    public static void Look(double dx, double dy)
    {
      var vp = WalkViewport(out var view);
      if (vp == null) return;
      double k = Walk.Reg.UnitsPerMeter;
      var (yaw, pitch) = Angles(vp);
      yaw -= dx * 0.0042;
      pitch = Math.Max(-1.25, Math.Min(1.25, pitch - dy * 0.0042));
      var p = vp.CameraLocation;
      vp.SetCameraLocations(p + Dir(yaw, pitch) * (5 * k), p);
      view.Redraw();
    }

    static Point3d Clamp(Point3d p)
    {
      var b = Walk.Reg.WalkBounds;
      if (!b.IsValid) return p;
      double inset = 0.55 * Walk.Reg.UnitsPerMeter;
      if (b.Max.X - b.Min.X > 2 * inset) p.X = Math.Max(b.Min.X + inset, Math.Min(b.Max.X - inset, p.X));
      if (b.Max.Y - b.Min.Y > 2 * inset) p.Y = Math.Max(b.Min.Y + inset, Math.Min(b.Max.Y - inset, p.Y));
      return p;
    }

    /// <summary>Left-drag in the Perspective view turns the head while a walk is running.</summary>
    sealed class LookCallback : MouseCallback
    {
      System.Drawing.Point? lastPt;

      static bool IsWalkView(RhinoView v)
      {
        var active = RhinoDoc.ActiveDoc?.Views.ActiveView;
        return v != null && active != null && v.ActiveViewportID == active.ActiveViewportID && v.ActiveViewport.IsPerspectiveProjection;
      }

      protected override void OnMouseDown(MouseCallbackEventArgs e)
      {
        if (!Walk.Running || e.MouseButton != MouseButton.Left || !IsWalkView(e.View)) return;
        lastPt = e.ViewportPoint;
        e.Cancel = true;
      }

      protected override void OnMouseMove(MouseCallbackEventArgs e)
      {
        if (lastPt == null) return;
        var p = e.ViewportPoint;
        Look(p.X - lastPt.Value.X, p.Y - lastPt.Value.Y);
        lastPt = p;
        e.Cancel = true;
      }

      protected override void OnMouseUp(MouseCallbackEventArgs e)
      {
        if (lastPt == null) return;
        lastPt = null;
        e.Cancel = true;
      }
    }
  }
}
