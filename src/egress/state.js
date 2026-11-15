// Egress run state. One object, read and written by the egress modules; main.js owns the lifecycle.

export const EC = {
  walkSpeed: 1.7, turnSpeed: 1.6,
  steadyTurn: 0.5,        // rad/s: gaze held steadier than this counts as looking (walking is allowed: people read signs on the move)
  pathEvery: 0.25,        // s between path samples
  hesitateSpeed: 0.2,     // m/s: slower than this counts as standing
  hesitateMin: 1.0,       // s of standing (after the first move) that counts as a hesitation
  wrongTurn: 2.5,         // m: getting this much farther from the exit than your best counts as a wrong turn
  firstLook: 0.25,        // s of fixation (within about 3 degrees, steady) that counts as having looked at a sign
  followWindow: 4.0,      // s after first looking at a sign used to judge whether the person followed it
  decoyReach: 1.3         // m: standing this close in front of a door, facing it, counts as trying it
};

export const E = {
  room: null, grid: null, F: null, F0: null,
  run: null, opts: {},
  started: false, done: false, review: false, subject: true,
  eye: 1.6, yaw: 0, pitch: 0, keys: new Set(),
  pos: { x: 0, z: 0 },
  gazeTag: null, gazePoint: null, gazeDist: 0, inView: new Set()
};

export function newRun({ participant = '', opts = {}, spawn }) {
  E.run = {
    id: 'run-' + Date.now().toString(36), participant, opts: { ...opts }, spawn,
    startedAt: new Date().toISOString(),
    t: 0, walked: 0, optimal0: 0, path: [], events: [],
    orientT: null, hes: [], wrong: [], deadEnds: {}, decoys: {}, signs: {}, obj: {}, notes: [],
    look: { steady: 0, sweeping: 0 }, exit: null, collapse: null, collapses: [], powerEvents: [], powerCutAt: null, smokeAt: null,
    best: { d: Infinity, x: 0, z: 0 }, openHes: null, openWrong: null, still: 0
  };
  for (const s of E.room.signs) E.run.signs[s.id] = { vis: 0, legible: 0, attn: 0, firstVis: null, firstLook: null, followed: null, check: null, visDark: 0 };
}

export function logEvent(type, text, extra = {}) {
  const r = E.run; if (!r) return;
  r.events.push({ t: +r.t.toFixed(1), type, text, x: +E.pos.x.toFixed(2), z: +E.pos.z.toFixed(2), ...extra });
}
