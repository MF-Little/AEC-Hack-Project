// One shared state object. Modules read and write it; main.js owns the lifecycle.

export const CONFIG = {
  captureAfter: 2.0,    // seconds of sustained look inside a zone that counts as a capture
  glanceMin: 0.25,      // shortest look counted as a glance
  pathEvery: 0.35,      // seconds between path samples
  walkSpeed: 1.7,       // m/s, doubled with Shift
  turnSpeed: 1.6,       // rad/s for arrow keys
  wallClear: 0.3,       // how close the viewer can get to a wall
  minShown: 10,         // seconds an option must be on show to count in its comparison
  rotateEvery: 20,      // auto-rotate: seconds between option changes
  zoneR: 2.0            // radius of each furniture-area zone
};

export const VARS = ['walls', 'glass', 'style'];

export const S = {
  room: null,
  objects: {},          // id -> { name, label, kind, meta, s: stats }
  zones: [],            // [{ id, name, x, z, r }] rebuilt with each layout
  choice: {},           // { walls, glass, style } currently shown
  layout: {},           // { living: 'NW', ... }
  session: null,
  gaze: { tag: null, t: 0, captured: false, dist: 0 },
  heatLive: false,      // heatmap painted during the walk (observer only, off by default)
  review: false,        // heatmap review mode: tracking paused, heat shown
  subject: false,
  eye: 1.6,
  yaw: 0, pitch: 0,
  keys: new Set(),
  started: false
};

export function blankStats() {
  return { gaze: 0, attn: 0, captures: 0, glances: 0, fixations: [], minDist: Infinity, notes: [] };
}

export function registerObjects(room) {
  S.objects = {};
  for (const [id, o] of Object.entries(room.objects)) S.objects[id] = { ...o, id, meta: { ...o.meta }, s: blankStats() };
}

export function zoneStats() { return { dwell: 0, visits: 0, firstAt: null, inZone: false, run: 0 }; }

export function newSession({ participant = '', seed = Date.now() % 1e9, autoRotate = false, styleMode = 'fixed' } = {}) {
  const room = S.room;
  S.session = {
    id: 'walk-' + Date.now().toString(36),
    participant, seed, autoRotate, styleMode,
    startedAt: new Date().toISOString(),
    elapsed: 0, walked: 0, path: [], events: [], notes: [], captures: [],
    zones: {},                         // zone id -> stats (zones move with the layout, ids stay)
    halves: { north: 0, south: 0 },    // time spent on each side of the room
    layouts: [],                       // every layout shown, with the time it appeared
    exposure: Object.fromEntries(Object.entries(room.variables).map(([v, def]) => [v,
      Object.fromEntries(Object.keys(def.options).map(o => [o, { time: 0, attn: 0, captures: 0, sentiment: 0, notes: 0 }]))])),
    stated: {}                         // test id -> option id the participant said they preferred
  };
  for (const o of Object.values(S.objects)) o.s = blankStats();
  S.gaze = { tag: null, t: 0, captured: false, dist: 0 };
}
