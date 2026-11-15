# Visual Vibes presentation

The hackathon deck: 21 slides covering the glazing study, the decoded report and the Factory Egress life-safety study.

- `index.html` shows every slide in order, scaled to the window. Open it through the local server (`python3 -m http.server 8765`, then http://localhost:8765/presentation/), or straight from disk.
- `slides/` holds one HTML file per slide; `deck.css` is their shared style and `deck.json` the slide order and sections.
- `images/` holds every screenshot the slides use, plus a few spare captures (lit and dark aisle shots, the 3D review, the report's answer card and "Why" list).

- `images/concept-metadata-overlay.png` (and `.webp`) is the concept illustration: building elements tagged with their metadata while attention is decoded.
- `video/egress-cinematic.mp4` is a 47 s cinematic Factory Egress run with sound (1080p); `egress-cinematic-720p.mp4` is a smaller copy. Use it as a backup if the live demo misbehaves.

All screenshots are captured from the running prototype. The glazing walk and the egress run are scripted demo runs, not study participants.
