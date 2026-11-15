# Visual Vibes

Visual Vibes learns what people respond to in a space and turns it into design direction. It works the way ad platforms read browsing data, but the output is window, wall, glass and furniture direction.

A participant walks an open-plan home in first person. Every window, wall and furniture area carries hidden metadata. The app records what they look at, for how long, and what they say. Meanwhile, wall finish, glass and furniture style are switched around them. It then decodes their preferences.

## Run it

The app loads its room from a JSON file, so it needs a local web server (opening `index.html` as a file will not work):

```bash
python3 -m http.server 8765
```

Open http://localhost:8765 in Chrome. There is no build step. three.js r128 loads from jsDelivr.

On a Mac you can double-click `start.command` instead: it serves this folder and opens the app. If the room stays on "Loading", the server dropped some of the app's module files; serve it with `python3 -m http.server 8765 --protocol HTTP/1.1` (Python 3.11 or later), which `start.command` does for you.

| Address | What it does |
| --- | --- |
| `/` | The Glazing Study, the default room |
| `/?room=garden-apartment` | The Garden Apartment with wall, glass and furniture switching |
| `/?room=open-loft` | The simpler open loft (no interior walls) |
| `/?room=<name>` | Loads `rooms/<name>.json` |
| `/egress.html` | Factory Egress: find your way out of a factory in an emergency |
| `/?debug=1` | Keeps the loop running in a background tab and exposes state as `window.__gd`, for automated test walks |
| `/legacy/gaze-decoder-v2.html` | The earlier single-file prototype |

Voice notes work in Chrome, Edge or Safari through the browser's own speech recognition: press **Speak** (or **V**) once and it keeps listening until you press it again. Each phrase becomes a note, linked to what was in view, and the glass on show, when the phrase began. Chrome sends the audio to Google to transcribe it, so voice needs an internet connection, and the page has to come from localhost so the browser can ask for the microphone. Inside a Claude artifact it uses Claude's dictation instead. "Ask Claude" still only works as a Claude artifact; elsewhere its button stays hidden.

## The Glazing Study (default)

The Glazing Study is narrowed to one question: **which glass, and why?** It is the Garden Apartment with these changes:

- **A unitized aluminium curtain wall on the sunny south side.** It has 11 modules of 1455 mm running floor to ceiling, 60 x 150 mm mullions with external caps, a transom at 2.7 m, a dark spandrel band at slab level and a stone plinth. **Facade view** (F) steps you into the garden to see the skin from outside.
- **Punched windows on the north side,** in the same aluminium system.
- **Glass is the only variable.** It changes on both facades at once, between four products: low-iron clear, neutral solar control, fritted dot and bronze tint. Each product has full metadata: make-up, coating, VLT, g-value, U-value, colour rendering, reflectance, acoustic Rw, thickness, weight, cost, carbon and lead time. Auto-rotate is on by default.
- **Walls and furniture are fixed:** lime plaster and the Latin set, in one layout. The columns are painted white.

Two rules keep large surfaces from dominating the result:

1. **Compare like with like.** Every glass is judged on the same windows, so size cancels out.
2. **Count only deliberate looking.** Attention counts only while the view is steady: turning slower than about 20 degrees a second, and moving slower than 0.6 m/s. Sweeping across walls while walking is ignored.

The report leads with:

- the glass to specify, from its own metadata
- the comparison, scored by steady looking per minute on show, with each remark point moving the score by 25%
- the four glasses side by side, showing how the person responded against each product's specification
- a glass explorer that plots any spec value against attention
- the curtain wall unrolled with heat, plus a module-by-module strip (inside and outside)
- the comment map

Design traits, the BIM schedule and plan heat sit under **Advanced data**.

## Factory Egress (`/egress.html`)

A second study on the same engine: the question is not "what do people like" but "can they get out". It is a behavioural wayfinding test, not a code compliance check.

- **The space.** Level 1 production hall of a factory at night, 40 × 26 m, with pallet racking (aisles and a dead end), CNC machines, a press, a conveyor, a robot cell, a forklift and a shift office. Three exits: two protected stair cores (with real stair flights behind the fire doors) and an external escape door onto a steel stair. Decoys: a goods lift, two loading shutters, the locked office and a former exit sealed during a fit-out.
- **14 signs with metadata.** ISO 7010-style running-figure signs, a superseded text-only sign, a lift prohibition and a "no exit" sign. Each records illumination (internally lit, photoluminescent, unlit), size, mounting, rated viewing distance (Z factor × sign height) and standard. Hanging signs are double-sided with the arrow drawn correctly for each face.
- **Spawn.** A 0.25 m floor grid (`src/egress/nav.js`) gives the walking distance from every point to the nearest exit. Each run starts at one of the farthest open spots, facing a random direction.
- **Pressure, each a switch on the start screen.** An alarm (sound and red beacons), camera shake with a comfort switch, stock falling from the racking onto the walker's own route a few metres ahead (always leaving another way out), a power cut that leaves emergency lighting only, and smoke.
- **What it records.** The route against the shortest one, time before the first move, hesitations and what was in view, wrong turns and detours, dead ends, doors tried, and for every sign: in view, readable, looked at, first-look distance and whether the person then went the way it points. An arrow audit checks each sign against the grid's shortest route (the old text sign points to the sealed door).
- **The report.** Route map, findings, sign table with verdicts, decision points, pinned remarks, results across all saved runs, and a 3D review with the heat and both routes on the floor.

## The Garden Apartment

A realistic 16 x 11 m garden apartment with a 3.2 m ceiling. Open living, dining and kitchen take up most of the plan. The apartment also has:

- a front door with an entry beside the kitchen
- a bathroom and laundry core
- a bedroom behind a partition with a doorway
- two exposed concrete columns
- a kitchen bulkhead with downlights
- oak floor planks, skirting and stone window sills

The south windows look onto a garden terrace and take direct sun.

**Rendering:** physically based lighting with filmic tone mapping, an atmospheric sky, an environment map for soft ambient light and reflections, soft sun shadows and patches through the windows, and contact shadows under the furniture. Daylight in the room follows the glass VLT.

The four furniture areas move between five spots, so one is always empty. One spot, in the north-west corner, only takes dining, study or nook. The bedroom and kitchen stay fixed and change with the furniture style.

## The Open Loft

`?room=open-loft` loads the simpler version: 16 x 11 m, 3.4 m ceiling, no interior partitions.

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

## Element metadata

Every element and every option in `rooms/garden-apartment.json` carries:

- **BIM properties:** IFC class, Uniclass code, spec section and performance data. For example: VLT, g-value, U-value and colour rendering for glass; light reflectance (LRV) and sound absorption (NRC) for finishes; seat heights and palettes for furniture. Each also has numbers for cost index, embodied carbon and lead time.
- **Ten design traits, each scored 0 to 1:** curved geometry, natural materials, warmth, texture, brightness, openness, low profile, craft, minimalism and privacy.

Attention is recorded per *element as seen*, for example "Arched windows · fritted glass" or "Walls · oak panelling", so each piece of data belongs to the version that was actually on show.

Every note records where the person stood (x, z, compass heading, eye height), the exact 3D point they were looking at and its distance, the element as seen, and the options on show.

## The report

- **Profile** and a **glass to specify** with a target VLT.
- **Four questions**, each with a verdict and a "Your pick" check:
  - Window shape compares attention share, since both shapes are always on show.
  - Wall finish, glass and furniture style compare attention per minute on show. An option needs at least 10 s on show to count.
- **Design DNA:**
  - For each trait, how much more (or less) the person centred their view on it than it simply appeared around them.
  - Which traits the positive and negative remarks clustered on.
  - Plain findings, for example what the strongest elements had in common.
- **Trait matrix:** every element as seen, against the ten traits, sorted by preference, with the shared traits marked.
- **Attribute explorer:** a scatter of any property (light, cost, carbon, NRC, lead time or any trait) against attention per minute on show, with a trend line and correlation.
- **Comment map:** every note pinned on the plan where it was made, with a sightline to the point being looked at, plus a table of positions and look points. In the 3D review, the notes float as numbered pins.
- **Element schedule:** BIM classification, key properties, attention, captures, remarks and a preference index for each element as seen. It can be downloaded as CSV.
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
  egress/               Factory Egress: builder, signs, walking-distance grid, hazards, tracker, report
egress.html             Factory Egress page
rooms/factory-egress.json  the factory: exits, decoys, racking, machines, signs and their metadata
legacy/                 the earlier single-file prototype
docs/                   reports and pitch notes
```

## Limits

- Attention means looking, not liking. That's why the app pairs it with notes and stated picks.
- Swapped options are compared across different moments of the walk, so auto-rotate and several participants make the comparison fairer.
- The decoder's weights are hand-set. Agreement with stated picks is the way to check and tune them.
- Gaze is the centre of the screen, not real eye tracking.
