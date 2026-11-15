# Vision, Voice, Vibe for Rhino

A Rhino 9 plug-in port of the web prototype (`gaze-decoder.html`). A client walks a Rhino model in the Perspective view; the plug-in reads the camera ten times a second, works out which tagged object is in the centre of view, links what the client says to what they were looking at, and decodes it against the hidden metadata into a design direction and a glass spec.

Rhino does the rendering and gives us the camera. Everything else (tags, gaze, zones, captures, notes, decoding, the report) lives in the plug-in.

Tested on Rhino 9.1 for Mac (Apple silicon). It's built against .NET 10. The only Mac-only part is continuous voice, which uses Apple's Speech framework and is left out of a Windows build, so the rest should build for Rhino 9 on Windows too, but that hasn't been tried.

## Install

1. In Rhino, open **Rhinoceros › Settings… › Plug-ins** (or run `PlugInManager`).
2. Click **Install…** and pick `install/visionvoicevibe-0.1.5-rh9_1-mac.yak`. Rhino 9's installer only takes `.yak` packages, so pick the `.yak`, not the `.rhp`.
3. If Rhino says so, restart it.

## Try it

1. Open `VVV test room.3dm`, or run `VVVBuildRoom` in an empty document. That builds the web prototype's room (8 × 10 m, an arched window W-01, a ribbon window W-02, furniture) with the same tags and hidden metadata, puts the camera at the door, and opens the **Vision, Voice, Vibe** window.
2. Walk. Rhino for Mac has no Walkabout, so the plug-in walks for you: click the **walking area** in the Vision, Voice, Vibe window (it turns blue), then use **W A S D** or the **arrow keys** (Shift is faster, Q and E turn), or the Forward, Back and Turn buttons. **Drag in the Perspective view** to look around.
3. Talk. Press **Voice** to start listening; it stays on until you press it again. The words show up live in the window, and each pause turns the phrase into a note linked to whatever was in view when it began. The first time, macOS asks whether Rhino may use the microphone and speech recognition. Recognition runs on the Mac when the system supports it. You can also type a note and press Enter.
4. Switch the glass (Clear 91%, Frit 58%, Bronze 35%) to run the glass taste test.
5. Press **Decode walk**. The report opens in Rhino and is saved as HTML and JSON in `Vision Voice Vibe walks/` next to the model (or in `~/Documents/Vision Voice Vibe` for an unsaved model).

**Observer** mode shows what the app sees: floor zones, live window tags, the attention heat map, and the live panel. **Subject** mode hides all of it and labels the glass Option A, B and C, so the client gets no cues. See `docs/Gaze Decoder - Session Process.md` for how to run a session.

`VVVSelfTest` runs a scripted walk through the test room (real ray casts, simulated time) and opens its report. It's the quickest check that everything works.

## Commands

| Command | What it does |
| --- | --- |
| `VisionVoiceVibe` | Opens the facilitator window |
| `VVVBuildRoom` | Builds the test room in this document and starts a walk |
| `VVVStart`, `VVVPause`, `VVVNewWalk` | Walk controls |
| `VVVNote` | Adds a note from the command line |
| `VVVGlass` | Switches the glass: Clear, Frit or Bronze |
| `VVVMode` | Observer or Subject |
| `VVVDecode` | Decodes the walk and shows the report |
| `VVVExport` | Saves the walk as JSON (and the report beside it) |
| `VVVTag` | Tags selected objects in your own model |
| `VVVStatus` | Prints a one-line status and saves `status.json` |
| `VVVSelfTest` | Runs the scripted test walk |

## Tag your own model

Everything the plug-in tracks is ordinary Attribute User Text, so it works on any model:

| Key | Example | Meaning |
| --- | --- | --- |
| `vvv.tag` | `W-03` | Groups objects into one tracked thing. Every tagged object is a gaze target. |
| `vvv.name` | `Corner window` | Display name |
| `vvv.kind` | `window`, `surface`, `furniture`, `other` | Windows get zones and drive the decoding; surfaces (walls, floor) also keep the camera in the room |
| `vvv.meta.<Field>` | `vvv.meta.Glass` = `Low-iron, VLT 88%` | The hidden metadata a remark is matched against (Geometry, Size, Sill, Glass, Frame, Facing, Material...) |
| `vvv.zone` | `2.3,-1.0,1.8` | Floor zone centre x, y and radius, in model units. Windows without one get a 1.8 m zone 1.2 m into the room. |
| `vvv.features` | `curvature=1;verticality=0.85;frame=-0.7;sill=0.8` | Where a window sits on the preference axes, from -1 to 1 |
| `vvv.glass` | `1` | This object is glass the glass test can swap |
| `vvv.anchor` | `-1.4,5.0,3.08` | Where the floating tag sits |

`VVVTag` sets the first four for you; add the rest in the Properties panel.

## Build from source

You need the .NET 10 SDK and Rhino 9 installed (the project references RhinoCommon, Eto and Rhino.UI from the Rhino app).

```bash
cd VisionVoiceVibe
dotnet build -c Release
```

To make an installable package, copy `bin/Release/net10.0/VisionVoiceVibe.rhp` and `VisionVoiceVibe.deps.json` into an empty folder, then run Rhino's `yak` there:

```bash
"/Applications/Rhino 9.app/Contents/Resources/bin/yak" spec
"/Applications/Rhino 9.app/Contents/Resources/bin/yak" build --platform mac
```

## How it maps to the web prototype

| | Web prototype | Rhino plug-in |
| --- | --- | --- |
| Room | three.js scene | Rhino geometry; same tags and metadata as user text |
| Walking | WASD and drag | W A S D and drag (own controls, since Rhino for Mac has no Walkabout) |
| Gaze and attention | centre ray plus 3 rings, 37 rays | same, against meshes of the tagged objects |
| Zones, captures, glances, fixations | 2 s rule | same rules and thresholds |
| Heat map | shader glow | painted onto a fine mesh of each surface (same 0.36 m spread) and drawn as 16 smooth, see-through contour bands that fade out at the edges |
| Notes | typed or browser speech | typed, or continuous voice through Apple's speech recognition (on the Mac where supported); context taken when a phrase begins; first remark at each object flagged |
| Decoding and report | `decode()` and the report sheet | same rules; same sheet, rendered in Rhino and saved as HTML and JSON |
| Idle time | counted | tracking pauses after 20 s with no movement or notes |
| "Ask Claude" | Claude artifact only | not ported |

## Known gaps

- Only tested on Rhino 9.1 for Mac. Continuous voice is Mac-only; on Windows, press Windows + H in the note box to dictate.
- Updating the plug-in means installing the new `.yak` and restarting Rhino; Rhino can't unload a plug-in while it runs.
- Gaze is the centre of the view, not eye tracking, same as the web prototype.
- Block instances aren't tracked yet; tag the objects inside them, or explode them.
