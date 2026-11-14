# Gaze Decoder

Gaze Decoder learns what people respond to in a space and turns it into design direction. It works the way ad platforms read browsing data, but its output is design elements, concepts and materials instead of ads.

A viewer walks a minimal 3D room in first person. Every window, surface and piece of furniture carries hidden metadata (geometry, glass type, light transmission, frame, material). The app records what the viewer looks at, how long, from how close, and what they say. It then decodes their preferences and suggests a glass specification and design moves.

## Run it

Open `gaze-decoder.html` in a browser (Chrome works best). No build step and no install. It loads three.js r128 from cdnjs.

To serve it locally:

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765/gaze-decoder.html.

Voice dictation and "Ask Claude to interpret this walk" only work when the page runs as a Claude artifact. Outside Claude, those two buttons are hidden and typed notes still work.

## Controls

| Action | Control |
| --- | --- |
| Look around | Drag with the mouse (touch-drag on a phone) |
| Walk | W A S D or arrow keys; Shift to walk faster |
| Turn | Left and right arrows, or Q and E |
| Add a note | Enter, type, Enter (or press Speak in Claude) |
| Switch glass | Glass widget, or keys 1, 2, 3 |
| Heatmap on or off | Heatmap button, or H |
| Hide tracking for a blind test | Subject mode |
| See the results | Decode walk |

## What it captures

- **Gaze:** time the centre of view (the crosshair) rests on each tagged object.
- **Attention heatmap:** 37 rays per frame. The centre counts fully; rings at about 3°, 7° and 12° count 0.7, 0.35 and 0.12. Hits build up in 0.2 m cells and are painted onto every surface.
- **Zones:** a 1.8 m floor radius in front of each window, used for dwell time and visits.
- **Captures:** a look held for 2 s or more while standing inside a zone.
- **Notes:** typed or spoken remarks. Each is linked to the object being looked at and scored for tone and attribute words.
- **Glass taste test:** for each of the three glasses (low-iron clear 91% VLT, fritted dot 58%, bronze tint 35%), how long it was shown and how much the viewer looked at the windows while it was in place.

## The room

| Tag | Object |
| --- | --- |
| W-01 | Arched window, north wall |
| W-02 | Ribbon window with sharp corners, east wall |
| S-WALL, S-FLOOR, S-CEIL | Lime plaster walls, polished concrete floor, concrete soffit |
| F-SOFA, F-RUG, F-LAMP | Bouclé sofa, wool rug, linen floor lamp |
| F-TABLE, F-CHAIR | Oak dining table, four ash chairs |
| F-BENCH, F-PLANT | Terrazzo window bench, potted olive tree |

## Report

The report (Decode walk) includes:

- A plan with the walk path and capture points.
- An attention table for every object.
- The glass taste test.
- The hidden metadata.
- Every note.
- Plain-language reasons for the result.
- Preference axes: sharp ↔ curved, horizontal ↔ vertical, slim ↔ expressed frame, raised ↔ low sill.
- A suggested glass specification with a target VLT, and design elements, concepts and materials.
- Copy data, which exports the session as JSON.

## Docs

- `docs/Gaze Decoder - AEC Opportunities.pdf`: use cases, client and designer needs, precedents and a pilot proposal.
- `docs/Gaze Decoder - Prototype Report.pdf`: what is captured, rules, parameters, variables, decoding logic and critique (written for the first version, before the heatmap, furniture and glass widget).
- `docs/Hackathon Pitch and Use Cases.md`: pitch line, use cases, judge Q&A and the 3-minute demo script.

## Limits

This is a hackathon prototype:

- Attention means looking, not liking.
- The two windows differ in several traits at once.
- The decoder's weights are hand-set, not fitted to data.
- Sessions are not saved between visits.
- Use it to start a conversation with clients, not as a measuring instrument.
