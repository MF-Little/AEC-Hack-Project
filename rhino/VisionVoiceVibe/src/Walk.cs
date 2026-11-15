using System;
using System.Diagnostics;
using System.IO;
using Eto.Forms;
using Rhino;
using Rhino.DocObjects;

namespace VisionVoiceVibe
{
  /// <summary>
  /// Runs the walk: a 10 Hz timer reads the active Perspective camera and feeds the tracker. Rhino does the
  /// navigation (Walkabout, or ordinary view controls); this only watches where the camera points.
  /// </summary>
  public static class Walk
  {
    public static readonly TagRegistry Reg = new TagRegistry();
    public static readonly Tracker Live = new Tracker(Reg);
    public static bool Running { get; private set; }
    public static bool Subject { get; private set; }
    public static bool HeatOn { get; private set; } = true;
    public static ObserverWindow Window { get; private set; }
    public static bool VoiceOn { get; private set; }
    public static string VoiceLive { get; private set; } = "";
    public static string VoiceStatus { get; private set; } = "";
    static NoteContext voiceCtx;
#if MACOS
    static MacSpeech speech;
#endif

    static WalkConduit conduit;
    static UITimer timer;
    static readonly Stopwatch clock = Stopwatch.StartNew();
    static double lastTick, lastScan, uiAccum;
    static bool initialised;

    public static void Init()
    {
      if (initialised) return;
      initialised = true;
      conduit = new WalkConduit { Enabled = true };
      RhinoDoc.AddRhinoObject += (s, e) => Reg.Dirty = true;
      RhinoDoc.DeleteRhinoObject += (s, e) => Reg.Dirty = true;
      RhinoDoc.UndeleteRhinoObject += (s, e) => Reg.Dirty = true;
      RhinoDoc.ReplaceRhinoObject += (s, e) => Reg.Dirty = true;
      RhinoDoc.ModifyObjectAttributes += (s, e) => { if (Matters(e.OldAttributes, e.NewAttributes)) Reg.Dirty = true; };
      RhinoDoc.EndOpenDocument += (s, e) => { Reg.Dirty = true; Live.NewSession(); };
      RhinoDoc.NewDocument += (s, e) => { Reg.Dirty = true; Live.NewSession(); };
      Live.Logged += ev => { if (!Subject && ev.Type == "capture") RhinoApp.WriteLine("Vision, Voice, Vibe: " + ev.Text); };
      Live.Toasted += msg => { if (!Subject) Window?.Toast(msg); };
      WalkNav.Init();
      timer = new UITimer { Interval = 0.1 };
      timer.Elapsed += (s, e) => Tick();
      timer.Start();
    }

    static bool Matters(ObjectAttributes a, ObjectAttributes b) =>
      a == null || b == null
      || a.GetUserString(TagRegistry.KeyTag) != b.GetUserString(TagRegistry.KeyTag)
      || a.GetUserStrings().Count != b.GetUserStrings().Count
      || a.Visible != b.Visible || a.LayerIndex != b.LayerIndex;

    static void Tick()
    {
      double now = clock.Elapsed.TotalSeconds;
      double dt = Math.Min(Rules.MaxStep, now - lastTick);
      lastTick = now;
      var doc = RhinoDoc.ActiveDoc;
      if (doc == null) return;
      if ((Reg.Dirty || Reg.DocSerial != doc.RuntimeSerialNumber) && now - lastScan > 0.5) { Reg.Scan(doc); lastScan = now; }
      if (Running)
      {
        var vp = doc.Views.ActiveView?.ActiveViewport;
        if (vp != null && vp.IsPerspectiveProjection)
        {
          var dir = vp.CameraDirection;
          dir.Unitize();
          try { Live.Step(dt, vp.CameraLocation, dir, vp.CameraX, vp.CameraY); }
          catch (Exception ex) { Running = false; RhinoApp.WriteLine("Vision, Voice, Vibe stopped tracking: " + ex.Message); }
        }
      }
      uiAccum += dt;
      if (uiAccum >= 0.25)
      {
        uiAccum = 0;
        Window?.Refresh();
        if (Running && !Subject) doc.Views.ActiveView?.Redraw();
      }
    }

    public static void Start()
    {
      Running = true;
      Window?.Refresh();
      RhinoApp.WriteLine("Vision, Voice, Vibe: walk running. Walk with W A S D or the arrow keys while the Vision, Voice, Vibe window is in front; drag in the view to look around.");
    }

    public static void Pause()
    {
      Running = false;
      Live.Interrupt();
      Window?.Refresh();
      RhinoDoc.ActiveDoc?.Views.Redraw();
    }

    public static void ToggleRunning() { if (Running) Pause(); else Start(); }

    public static void NewWalk()
    {
      Live.NewSession();
      RhinoDoc.ActiveDoc?.Views.Redraw();
      Window?.Refresh();
    }

    public static void SetSubject(bool on)
    {
      Subject = on;
      RhinoDoc.ActiveDoc?.Views.Redraw();
      Window?.Refresh();
    }

    public static void SetHeat(bool on)
    {
      HeatOn = on;
      RhinoDoc.ActiveDoc?.Views.Redraw();
      Window?.Refresh();
    }

    public static void SetGlass(string id)
    {
      Live.SetGlass(id);
      var doc = RhinoDoc.ActiveDoc;
      if (doc != null) TestRoom.ApplyGlass(doc, id);
      Window?.Refresh();
    }

    /// <summary>Turns continuous listening on or off. Each phrase becomes a note linked to what was in view as it began.</summary>
    public static void ToggleVoice()
    {
#if MACOS
      if (speech == null)
      {
        speech = new MacSpeech();
        speech.Partial += text =>
        {
          if (voiceCtx == null) voiceCtx = Live.Context();
          VoiceLive = text;
          Live.Touch();
          Window?.RefreshVoice();
        };
        speech.Phrase += text =>
        {
          var ctx = voiceCtx;
          voiceCtx = null;
          VoiceLive = "";
          Live.AddNote(text, "voice", ctx);
          Window?.Refresh();
        };
        speech.Status += (on, message) =>
        {
          VoiceOn = on;
          VoiceStatus = message;
          if (!on) { VoiceLive = ""; voiceCtx = null; }
          Window?.Refresh();
        };
      }
      if (speech.IsOn) speech.Stop(); else speech.Start();
#else
      VoiceStatus = Dictation.Hint;
      Window?.Refresh();
#endif
    }

    public static void ShowWindow()
    {
      if (Window == null)
      {
        Window = new ObserverWindow();
        Window.Owner = Rhino.UI.RhinoEtoApp.MainWindow;
      }
      Window.Show();
      Window.BringToFront();
    }

    public static void OnWindowClosed(ObserverWindow w) { if (Window == w) Window = null; }

    public static string OutputDir(RhinoDoc doc)
    {
      string dir;
      if (!string.IsNullOrEmpty(doc?.Path)) dir = Path.Combine(Path.GetDirectoryName(doc.Path), "Vision Voice Vibe walks");
      else
      {
        var docs = Path.Combine(System.Environment.GetFolderPath(System.Environment.SpecialFolder.UserProfile), "Documents");
        if (!Directory.Exists(docs)) docs = System.Environment.GetFolderPath(System.Environment.SpecialFolder.MyDocuments);
        dir = Path.Combine(docs, "Vision Voice Vibe");
      }
      try { Directory.CreateDirectory(dir); return dir; }
      catch
      {
        var tmp = Path.Combine(Path.GetTempPath(), "Vision Voice Vibe");
        Directory.CreateDirectory(tmp);
        return tmp;
      }
    }

    /// <summary>Decodes a walk, saves the sheet and the data, and shows the sheet in Rhino.</summary>
    public static string ShowReport(Tracker tr = null, string label = null)
    {
      bool live = tr == null || tr == Live;
      tr = tr ?? Live;
      bool wasRunning = live && Running;
      if (live) Pause();
      var d = Decoder.Decode(tr);
      var html = Report.Html(tr, d);
      var json = Report.Json(tr, d);
      var (htmlPath, _) = Report.Save(OutputDir(RhinoDoc.ActiveDoc), html, json, label);
      RhinoApp.WriteLine("Vision, Voice, Vibe: decoded walk saved to " + htmlPath);
      var w = new ReportWindow(html, htmlPath, json, wasRunning) { Owner = Rhino.UI.RhinoEtoApp.MainWindow };
      w.Show();
      return htmlPath;
    }

    /// <summary>Saves the live walk's data as JSON (and the sheet beside it). Returns the JSON path.</summary>
    public static string ExportToFile(bool announce, string label = null)
    {
      Live.Interrupt();
      var d = Decoder.Decode(Live);
      var (htmlPath, jsonPath) = Report.Save(OutputDir(RhinoDoc.ActiveDoc), Report.Html(Live, d), Report.Json(Live, d), label);
      if (announce)
      {
        RhinoApp.WriteLine("Vision, Voice, Vibe: walk data saved to " + jsonPath);
        Window?.Toast("Saved to " + jsonPath);
      }
      return jsonPath;
    }
  }
}
