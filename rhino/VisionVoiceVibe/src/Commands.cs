using System;
using System.IO;
using System.Linq;
using Rhino;
using Rhino.Commands;
using Rhino.DocObjects;
using Rhino.Input;
using Rhino.Input.Custom;
using static System.FormattableString;

namespace VisionVoiceVibe
{
  /// <summary>Opens the facilitator window.</summary>
  public sealed class VisionVoiceVibeCommand : Command
  {
    public override string EnglishName => "VisionVoiceVibe";
    protected override Result RunCommand(RhinoDoc doc, RunMode mode)
    {
      Walk.Init();
      Walk.Reg.Scan(doc);
      Walk.ShowWindow();
      return Result.Success;
    }
  }

  /// <summary>Builds the web prototype's test room in this document and starts a walk at the entrance.</summary>
  public sealed class VVVBuildRoomCommand : Command
  {
    public override string EnglishName => "VVVBuildRoom";
    protected override Result RunCommand(RhinoDoc doc, RunMode mode)
    {
      Walk.Init();
      int n = TestRoom.Build(doc);
      TestRoom.SetupCamera(doc);
      Walk.Reg.Scan(doc);
      Walk.Live.GlassNow = "clear";
      Walk.NewWalk();
      Walk.ShowWindow();
      Walk.Start();
      RhinoApp.WriteLine(Invariant($"Vision, Voice, Vibe: built the test room ({n} objects, {Walk.Reg.Order.Count} tags). Walk with W A S D or the arrow keys while the Vision, Voice, Vibe window is in front, and drag in the view to look around."));
      return Result.Success;
    }
  }

  public sealed class VVVStartCommand : Command
  {
    public override string EnglishName => "VVVStart";
    protected override Result RunCommand(RhinoDoc doc, RunMode mode) { Walk.Init(); Walk.Start(); return Result.Success; }
  }

  public sealed class VVVPauseCommand : Command
  {
    public override string EnglishName => "VVVPause";
    protected override Result RunCommand(RhinoDoc doc, RunMode mode) { Walk.Pause(); return Result.Success; }
  }

  public sealed class VVVNewWalkCommand : Command
  {
    public override string EnglishName => "VVVNewWalk";
    protected override Result RunCommand(RhinoDoc doc, RunMode mode) { Walk.NewWalk(); RhinoApp.WriteLine("Vision, Voice, Vibe: new walk."); return Result.Success; }
  }

  /// <summary>Adds a note from the command line, linked to what is in view right now.</summary>
  public sealed class VVVNoteCommand : Command
  {
    public override string EnglishName => "VVVNote";
    protected override Result RunCommand(RhinoDoc doc, RunMode mode)
    {
      var gs = new GetString();
      gs.SetCommandPrompt("What did they say?");
      gs.GetLiteralString();
      if (gs.CommandResult() != Result.Success) return gs.CommandResult();
      var note = Walk.Live.AddNote(gs.StringResult(), "typed", null);
      if (note == null) return Result.Nothing;
      RhinoApp.WriteLine($"Vision, Voice, Vibe: note linked to {(note.Target ?? "the room")}.");
      Walk.Window?.Refresh();
      return Result.Success;
    }
  }

  public sealed class VVVGlassCommand : Command
  {
    public override string EnglishName => "VVVGlass";
    protected override Result RunCommand(RhinoDoc doc, RunMode mode)
    {
      var go = new GetOption();
      go.SetCommandPrompt("Glass to show");
      foreach (var g in Catalog.Glass) go.AddOption(char.ToUpperInvariant(g.Id[0]) + g.Id.Substring(1));
      if (go.Get() != GetResult.Option) return Result.Cancel;
      var pick = Catalog.Glass[go.Option().Index - 1];
      Walk.SetGlass(pick.Id);
      RhinoApp.WriteLine($"Vision, Voice, Vibe: showing {pick.Name} (VLT {pick.Vlt}%).");
      return Result.Success;
    }
  }

  public sealed class VVVModeCommand : Command
  {
    public override string EnglishName => "VVVMode";
    protected override Result RunCommand(RhinoDoc doc, RunMode mode)
    {
      var go = new GetOption();
      go.SetCommandPrompt("Who is the screen for?");
      go.AddOption("Observer");
      go.AddOption("Subject");
      if (go.Get() != GetResult.Option) return Result.Cancel;
      Walk.SetSubject(go.Option().EnglishName == "Subject");
      return Result.Success;
    }
  }

  public sealed class VVVDecodeCommand : Command
  {
    public override string EnglishName => "VVVDecode";
    protected override Result RunCommand(RhinoDoc doc, RunMode mode) { Walk.Init(); Walk.ShowReport(); return Result.Success; }
  }

  public sealed class VVVExportCommand : Command
  {
    public override string EnglishName => "VVVExport";
    protected override Result RunCommand(RhinoDoc doc, RunMode mode) { Walk.Init(); Walk.ExportToFile(true); return Result.Success; }
  }

  /// <summary>Tags objects in your own model so the walk can track them. Metadata goes in Attribute User Text as vvv.meta.*.</summary>
  public sealed class VVVTagCommand : Command
  {
    public override string EnglishName => "VVVTag";
    protected override Result RunCommand(RhinoDoc doc, RunMode mode)
    {
      var go = new GetObject();
      go.SetCommandPrompt("Select objects to tag");
      go.GroupSelect = true;
      go.SubObjectSelect = false;
      go.GetMultiple(1, 0);
      if (go.CommandResult() != Result.Success) return go.CommandResult();

      string tag = "";
      if (RhinoGet.GetString("Tag, for example W-03, S-WALL or F-DESK", false, ref tag) != Result.Success || string.IsNullOrWhiteSpace(tag)) return Result.Cancel;
      tag = tag.Trim();
      string name = tag;
      RhinoGet.GetString("Name", true, ref name);

      var gk = new GetOption();
      gk.SetCommandPrompt("Kind");
      foreach (var k in new[] { "Window", "Surface", "Furniture", "Other" }) gk.AddOption(k);
      if (gk.Get() != GetResult.Option) return Result.Cancel;
      string kind = gk.Option().EnglishName.ToLowerInvariant();

      bool glass = false;
      if (kind == "window" && RhinoGet.GetBool("Is this the glass (switchable in the glass test)?", true, "No", "Yes", ref glass) == Result.Cancel) return Result.Cancel;

      int count = 0;
      for (int i = 0; i < go.ObjectCount; i++)
      {
        var obj = go.Object(i).Object();
        if (obj == null) continue;
        var a = obj.Attributes.Duplicate();
        a.SetUserString(TagRegistry.KeyTag, tag);
        a.SetUserString(TagRegistry.KeyName, string.IsNullOrWhiteSpace(name) ? tag : name.Trim());
        a.SetUserString(TagRegistry.KeyKind, kind);
        if (glass) a.SetUserString(TagRegistry.KeyGlass, "1");
        if (doc.Objects.ModifyAttributes(obj, a, true)) count++;
      }
      Walk.Reg.Dirty = true;
      RhinoApp.WriteLine($"Vision, Voice, Vibe: tagged {count} object(s) as {tag}. Add hidden metadata as Attribute User Text with keys like vvv.meta.Material. Windows get a floor zone automatically; set vvv.zone to \"x,y,radius\" to place it yourself.");
      return Result.Success;
    }
  }

  /// <summary>Prints the live walk in one line and saves its data, for checking a session or a script.</summary>
  public sealed class VVVStatusCommand : Command
  {
    public override string EnglishName => "VVVStatus";
    protected override Result RunCommand(RhinoDoc doc, RunMode mode)
    {
      Walk.Init();
      if (Walk.Reg.Dirty) Walk.Reg.Scan(doc);
      var tr = Walk.Live;
      var parts = Walk.Reg.Windows.Select(w => Invariant($"{w.Id} gaze {tr.Stats(w.Id).Gaze:0.0}s capt {tr.Stats(w.Id).Captures} visits {tr.Stats(w.Id).Visits}"));
      RhinoApp.WriteLine(Invariant($"Vision, Voice, Vibe: {(Walk.Running ? "running" : "paused")} · {Fmt.Secs(tr.S.Elapsed)} · {tr.S.Notes.Count} notes · looking at {tr.GazeTag ?? "nothing"} · {string.Join(" · ", parts)}"));
      var json = Report.Json(tr, Decoder.Decode(tr));
      var path = Path.Combine(Walk.OutputDir(doc), "status.json");
      File.WriteAllText(path, json);
      RhinoApp.WriteLine("Status saved to " + path);
      return Result.Success;
    }
  }

  /// <summary>Runs a scripted walk through the test room (real ray casts, simulated time) and shows its report.</summary>
  public sealed class VVVSelfTestCommand : Command
  {
    public override string EnglishName => "VVVSelfTest";
    protected override Result RunCommand(RhinoDoc doc, RunMode mode)
    {
      Walk.Init();
      return SelfTest.Run(doc) ? Result.Success : Result.Failure;
    }
  }
}
