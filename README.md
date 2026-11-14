# Gaze Decoder

Gaze Decoder learns what people respond to in a space and turns it into design direction. It works the way ad platforms read browsing data, but the output is window, wall, glass and furniture direction.

A participant walks an open-plan home in first person. Every window, wall and furniture area carries hidden metadata. The app records what they look at, for how long, and what they say. Meanwhile, wall finish, glass and furniture style are switched around them. It then decodes their preferences.

## Run it

The app loads its room from a JSON file, so it needs a local web server (opening `index.html` as a file will not work):

```bash
python3 -m http.server 8765
```

Open http://localhost:8765 in Chrome. There is no build step. three.js r128 loads from jsDelivr.

| Address | What it does |
| --- | --- |
| `/` | The Open Loft, the default room |
| `/?room=<name>` | Loads `rooms/<name>.json` |
| `/?debug=1` | Keeps the loop running in a background tab and exposes state as `window.__gd`, for automated test walks |
| `/legacy/gaze-decoder-v2.html` | The earlier single-file prototype |

Voice dictation and "Ask Claude" only work when the page runs as a Claude artifact. Elsewhere those buttons stay hidden and typed notes still work.

## The Open Loft

An open-plan home: 16 x 11 m, 3.4 m ceiling, no interior partitions.

- **North side: four rectangular windows. South side: four arched windows.** Both have the same glass area (3.84 m² each), sill, frame and view outside, so shape is the only difference.
- **Four furniture areas** (living, dining, study, reading nook) sit on four spots, two near each window wall. A kitchen runs along the east wall.
- **Three switchable variables, three options each:**

| Variable | Options |
| --- | --- |
| Wall finish | Lime plaster, oak panelling, board-formed concrete |
| Glass | Low-iron clear (VLT 91%), fritted dot (58%), bronze tint (35%); daylight in the room follows the VLT |
| Furniture style | Japanese, Latin, Scandinavian |

- **Shuffle layout** moves the four areas between the spots. The living area might sit by the arched windows in one walk and by the rectangular ones in the next.

## Running a walk

1. The start screen asks for:
   - a participant code (no names)
   - the furniture style (or random)
   - the layout (random or default)
   - eye height (standing 1.6 m, or seated 1.2 m)
   - **auto-rotate**, which switches walls, glass and style in turn every 20 s for blind tests
   - consent
2. Walk. In Observer mode, the Design options panel switches options (keys 1–9) and shuffles the layout (L). Subject mode hides every control and tracking cue.
3. Press **Decode walk** for the report.

## What it captures

- **Attention.** 37 rays per frame. The crosshair counts fully; rings at about 3°, 7° and 12° count 0.7, 0.35 and 0.12. The result is normalised to seconds.
- **The heatmap.** Attention is recorded on its own hidden layer during the walk, so the participant never sees it. The report shows it as a plan and as unrolled north and south wall elevations. **Review heatmap in 3D** lets you walk the room with the heat painted on while tracking is paused.
- **Exposure.** For each option, how long it was on show and how much attention its element drew in that time (walls for wall finish, windows for glass, furniture for style).
- **Areas.** Dwell, visits and first-visit order for each furniture area, and time spent on each side of the room.
- **Captures.** A look held for 2 s or more while standing in an area.
- **Notes.** Typed or spoken remarks. Each is linked to the element in view, stamped with the options on show, scored for tone and scanned for attribute words.

## The report

- **Profile** and a **glass to specify** with a target VLT.
- **Four questions**, each with a verdict and a "Your pick" check:
  - Window shape compares attention share, since both shapes are always on show.
  - Wall finish, glass and furniture style compare attention per minute on show. An option needs at least 10 s on show to count.
- **Attention heat:** the plan heatmap and both window walls, unrolled.
- **Where time went** (areas and sides of the room), the walk path, and attention by element.
- **The reading**, with the number behind every line, and **suggested** elements, concepts and materials.
- **Notes**, each with what was on show at the time.
- **Group results** across every walk saved on this device. Walks can be exported and imported as JSON.

## Project structure

```
index.html              page markup, start screen, options panel
styles.css              all styles
rooms/open-loft.json    room size, window walls, spots, variables and options, metadata, recommendations
src/
  main.js               boot, walk lifecycle, review mode, frame loop
  state.js              shared state, config, session model
  util.js, storage.js, platform.js
  scene/                renderer and lights, materials and textures, shell builder, furniture library,
                        option switching and layout shuffle, heatmap layer
  tracking/             movement and collision, per-frame tracker, notes
  decoder/decode.js     the four questions, areas, glass choice, reading, recommendations, export
  ui/                   observer panel, plan, heat visualisations, event feed, report
legacy/                 the earlier single-file prototype
docs/                   reports and pitch notes
```

## Limits

- Attention means looking, not liking. That's why the app pairs it with notes and stated picks.
- Swapped options are compared across different moments of the walk, so auto-rotate and several participants make the comparison fairer.
- The decoder's weights are hand-set. Agreement with stated picks is the way to check and tune them.
- Gaze is the centre of the screen, not real eye tracking.
