using System;
using System.Linq;
using System.Text;
using Eto.Drawing;
using Eto.Forms;
using static System.FormattableString;

namespace VisionVoiceVibe
{
  /// <summary>
  /// The facilitator's window: walk controls, glass options, the note bar, and (in Observer mode) what the
  /// app sees live. Subject mode strips it down to walking, the note bar and neutral glass labels (Option A, B, C).
  /// With this window in front, W A S D or the arrow keys walk the Perspective view.
  /// </summary>
  public sealed class ObserverWindow : Form
  {
    static readonly Color Signal = Color.FromArgb(54, 81, 201), Mute = Color.FromArgb(110, 109, 103);
    const int W = 460;

    readonly Label clock = new Label(), status = new Label { Wrap = WrapMode.Word };
    readonly Label looking = new Label { Wrap = WrapMode.Word }, meta = new Label { Wrap = WrapMode.Word };
    readonly Label objs = new Label(), notes = new Label { Wrap = WrapMode.Word }, log = new Label { Wrap = WrapMode.Word };
    readonly Label walkHint = new Label { Wrap = WrapMode.Word, Text = "Drag in the Perspective view to look around. Shift walks faster; Q and E turn." };
    readonly Button run = new Button(), fresh = new Button { Text = "New walk" }, mode = new Button(), heat = new Button();
    readonly Button decode = new Button { Text = "Decode walk" }, export = new Button { Text = "Export data" };
    readonly Button voice = new Button(), add = new Button { Text = "Note" };
    readonly Label voiceLine = new Label { Wrap = WrapMode.Word };
    readonly Drawable walkPad = new Drawable { CanFocus = true, Height = 46 };
    readonly Button[] glass;
    readonly TextBox note = new TextBox { PlaceholderText = "Type a note… “this feels calm”" };
    readonly Control observerPart, endRow;
    NoteContext pending;
    string pendingSource = "typed", toast;
    DateTime toastUntil;
    bool shownSubject;

    public ObserverWindow()
    {
      Title = "Vision, Voice, Vibe";
      ClientSize = new Size(W, 880);
      Resizable = true;
      Minimizable = true;
      Maximizable = false;
      Padding = new Padding(14);

      objs.Font = new Font(FontFamilies.Monospace, 11);
      looking.Font = new Font(FontFamilies.Monospace, 11);
      clock.Font = new Font(FontFamilies.Monospace, 12);
      walkHint.TextColor = Mute;

      glass = Catalog.Glass.Select(g =>
      {
        var b = new Button();
        b.Click += (s, e) => Walk.SetGlass(g.Id);
        return b;
      }).ToArray();
      run.Click += (s, e) => Walk.ToggleRunning();
      fresh.Click += (s, e) => Walk.NewWalk();
      mode.Click += (s, e) => Walk.SetSubject(!Walk.Subject);
      heat.Click += (s, e) => Walk.SetHeat(!Walk.HeatOn);
      decode.Click += (s, e) => Walk.ShowReport();
      export.Click += (s, e) => Walk.ExportToFile(true);
      voice.Click += (s, e) => Walk.ToggleVoice();
      add.Click += (s, e) => Submit();
      note.KeyDown += (s, e) => { if (e.Key == Keys.Enter) { e.Handled = true; Submit(); } };
      note.TextChanged += (s, e) =>
      {
        if (string.IsNullOrWhiteSpace(note.Text)) pending = null;
        else if (pending == null) pending = Walk.Live.Context();   // the note belongs to what was in view when it began
      };
      walkPad.Paint += (s, e) =>
      {
        var g = e.Graphics;
        var size = walkPad.Size;
        bool on = walkPad.HasFocus;
        var rect = new RectangleF(0.5f, 0.5f, size.Width - 1, size.Height - 1);
        g.FillRectangle(on ? Color.FromArgb(54, 81, 201, 30) : Color.FromArgb(0, 0, 0, 12), rect);
        g.DrawRectangle(new Pen(on ? Signal : Color.FromArgb(205, 202, 194), on ? 2 : 1), rect);
        var font = new Font(SystemFont.Bold, 12);
        string text = on ? "Walking: W A S D or the arrow keys" : "Click here to walk with W A S D or the arrow keys";
        var ts = g.MeasureString(font, text);
        g.DrawText(font, on ? Signal : Mute, (size.Width - ts.Width) / 2, (size.Height - ts.Height) / 2, text);
      };
      walkPad.MouseDown += (s, e) => { walkPad.Focus(); e.Handled = true; };
      walkPad.GotFocus += (s, e) => walkPad.Invalidate();
      walkPad.LostFocus += (s, e) => { WalkNav.Release(); walkPad.Invalidate(); };
      walkPad.KeyDown += (s, e) => { if (WalkNav.KeyDown(e.Key, e.Shift)) e.Handled = true; };
      walkPad.KeyUp += (s, e) => { if (WalkNav.KeyUp(e.Key)) e.Handled = true; };
      Shown += (s, e) => walkPad.Focus();
      KeyDown += (s, e) => { if (!note.HasFocus && WalkNav.KeyDown(e.Key, e.Shift)) e.Handled = true; };
      KeyUp += (s, e) => { if (WalkNav.KeyUp(e.Key)) e.Handled = true; };
      LostFocus += (s, e) => WalkNav.Release();

      Button Pad(string text, double f, double turn)
      {
        var b = new Button { Text = text };
        b.Click += (s, e) => WalkNav.Move(f, 0, turn);
        return b;
      }

      Label H(string t) => new Label { Text = t, Font = new Font(SystemFont.Bold, 10), TextColor = Mute };

      var obs = new StackLayout { Spacing = 6, HorizontalContentAlignment = HorizontalAlignment.Stretch };
      foreach (var c in new Control[] { H("LOOKING AT"), looking, meta, H("TAGGED OBJECTS"), objs, H("NOTES"), notes, H("EVENT LOG"), log }) obs.Items.Add(c);
      observerPart = obs;
      endRow = Row(decode, export);

      var header = new StackLayout { Orientation = Orientation.Horizontal, VerticalContentAlignment = VerticalAlignment.Center };
      header.Items.Add(new Label { Text = "VISION, VOICE, VIBE", Font = new Font(SystemFont.Bold, 12) });
      header.Items.Add(new StackLayoutItem(null, true));
      header.Items.Add(clock);

      var noteRow = new TableLayout { Spacing = new Size(6, 0) };
      noteRow.Rows.Add(new TableRow(new TableCell(note, true), new TableCell(voice), new TableCell(add)));
      voiceLine.TextColor = Mute;

      var layout = new StackLayout { Spacing = 9, HorizontalContentAlignment = HorizontalAlignment.Stretch };
      foreach (var c in new Control[] {
        header, Row(run, fresh, mode, heat),
        H("WALK"), Row(Pad("↑ Forward", 0.5, 0), Pad("↓ Back", -0.5, 0), Pad("↶ Turn left", 0, Math.PI / 12), Pad("Turn right ↷", 0, -Math.PI / 12)), walkPad, walkHint,
        H("GLASS"), Row(glass), H("NOTES AND VOICE"), noteRow, voiceLine, status, observerPart, endRow })
        layout.Items.Add(c);
      Content = layout;

      // Sit beside Rhino's main window when there's room, so the model stays in view.
      try
      {
        var main = Rhino.UI.RhinoEtoApp.MainWindow;
        var area = Screen.PrimaryScreen.WorkingArea;
        int x = main.Bounds.Right + 8;
        if (x + W + 30 > area.Right) x = (int)area.Right - W - 40;
        Location = new Point(Math.Max((int)area.Left, x), Math.Max((int)area.Top, main.Bounds.Top));
      }
      catch { }

      Closed += (s, e) => { WalkNav.Release(); Walk.OnWindowClosed(this); };
      Refresh();
    }

    static TableLayout Row(params Control[] controls)
    {
      var r = new TableLayout { Spacing = new Size(6, 0) };
      r.Rows.Add(new TableRow(controls.Select(c => new TableCell(c, true))));
      return r;
    }

    public void Toast(string msg)
    {
      toast = msg;
      toastUntil = DateTime.Now.AddSeconds(3);
      status.Text = msg;
    }

    void Submit()
    {
      var text = note.Text?.Trim();
      if (string.IsNullOrEmpty(text)) return;
      Walk.Live.AddNote(text, pendingSource, pending);
      note.Text = "";
      pending = null;
      pendingSource = "typed";
      walkPad.Focus();   // hand the keys back to walking
      Refresh();
    }

    public void RefreshVoice()
    {
      voice.Text = Walk.VoiceOn ? "● Voice on" : "Voice off";
      voice.TextColor = Walk.VoiceOn ? Signal : Colors.Black;
      if (Walk.VoiceOn && !string.IsNullOrEmpty(Walk.VoiceLive) && !Walk.Subject)
      {
        voiceLine.Text = "… " + Walk.VoiceLive;
        voiceLine.TextColor = Signal;
      }
      else
      {
        voiceLine.Text = Walk.VoiceOn && Walk.Subject ? "● Listening" : Walk.VoiceStatus;
        voiceLine.TextColor = Mute;
      }
      voiceLine.Visible = !string.IsNullOrEmpty(voiceLine.Text);
    }

    public void Refresh()
    {
      RefreshVoice();
      var tr = Walk.Live; var reg = Walk.Reg; var s = tr.S;
      clock.Text = (Walk.Running ? (tr.Idle ? "◐ " : "● ") : "○ ") + Fmt.Clock(s.Elapsed);
      clock.TextColor = Walk.Running ? Signal : Mute;
      run.Text = Walk.Running ? "Pause" : "Start walk";
      mode.Text = Walk.Subject ? "Subject" : "Observer";
      heat.Text = Walk.HeatOn ? "Heat on" : "Heat off";
      heat.Enabled = !Walk.Subject;
      for (int i = 0; i < glass.Length; i++)
      {
        var g = Catalog.Glass[i];
        string label = Walk.Subject ? "Option " + g.Letter : $"{char.ToUpperInvariant(g.Id[0])}{g.Id.Substring(1)} {g.Vlt}%";
        glass[i].Text = (tr.GlassNow == g.Id ? "● " : "") + label;
      }
      observerPart.Visible = !Walk.Subject;
      endRow.Visible = !Walk.Subject;
      if (shownSubject != Walk.Subject) { shownSubject = Walk.Subject; ClientSize = new Size(W, Walk.Subject ? 420 : 880); }

      if (DateTime.Now < toastUntil) status.Text = toast;
      else if (reg.Order.Count == 0) status.Text = "No tagged objects yet. Run VVVBuildRoom for the test room, or VVVTag on your own model.";
      else if (!Walk.Running) status.Text = "Paused. Press Start walk to track the Perspective view again.";
      else if (tr.Idle) status.Text = "Paused while nobody moves or speaks. Walk, look around or add a note to carry on.";
      else status.Text = "";
      if (Walk.Subject) return;

      var info = reg.Get(tr.GazeTag);
      if (info != null)
      {
        looking.Text = Invariant($"{info.Id} · {info.Name}\n{tr.GazeDist:0.0} m away · {tr.GazeT:0.0} s this look{(tr.CurrentZone() == null ? " · outside zones" : "")}");
        meta.Text = string.Join("\n", info.Meta.Select(kv => kv.Key + ": " + (kv.Key == "Glass" ? Decoder.GlassSpec(info, tr.GlassNow) : kv.Value)));
      }
      else { looking.Text = "nothing tagged"; meta.Text = ""; }

      var sb = new StringBuilder();
      foreach (var t in reg.All.Where(t => t.IsWindow || tr.Stats(t.Id).Gaze > 0.05))
      {
        var st = tr.Stats(t.Id);
        var name = t.Name.Length > 18 ? t.Name.Substring(0, 17) + "…" : t.Name;
        sb.AppendLine(Invariant($"{t.Id,-8} {name,-18} {st.Gaze,6:0.0} s"));
        if (t.IsWindow) sb.AppendLine(Invariant($"         dwell {st.Dwell:0.0}  capt {st.Captures}  visits {st.Visits}{(st.Notes.Count > 0 ? "  notes " + st.Notes.Count : "")}"));
      }
      objs.Text = sb.Length == 0 ? "—" : sb.ToString().TrimEnd();

      notes.Text = s.Notes.Count == 0 ? "No notes yet. Type one, or turn Voice on." : string.Join("\n", s.Notes.AsEnumerable().Reverse().Take(6).Select(n =>
        $"“{n.Text}”\n   {Fmt.Clock(n.T)} · {(n.Target != null ? n.Target + " " + reg.Get(n.Target)?.Name : "room")} · {Catalog.GlassById(n.Glass).Name} · {(n.Sentiment > 0 ? "positive" : n.Sentiment < 0 ? "negative" : "neutral")} · {n.Source}{(n.FirstAtTarget ? " · first" : "")}"));
      log.Text = s.Events.Count == 0 ? "Walk into a ring on the floor and hold your look for 2 seconds." : string.Join("\n", s.Events.AsEnumerable().Reverse().Take(10).Select(ev => Fmt.Clock(ev.T) + "  " + ev.Text));
    }
  }
}
