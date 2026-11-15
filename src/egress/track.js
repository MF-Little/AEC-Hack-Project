// Per-frame egress tracking: route, orientation time, hesitations, wrong turns, dead ends, doors
// tried, sign visibility and sign looking, whether a sign was followed, and the exit reached.
//
// Rules (all in metres and seconds):
//  - In view: a sign is on screen, its face turned towards you, nothing solid in between, and
//    smoke and darkness thin enough for its illumination type.
//  - Legible: in view and no farther than its rated viewing distance (Z factor x sign height).
//  - Looked at: fixation time, the sign within about 3 degrees of the centre of view while the
//    view is steady (turning slower than 0.5 rad/s; walking is allowed).
//  - Followed: in the 4 s after first looking at a sign, you moved at least 1.2 m within 60
//    degrees of the direction it points.
import * as THREE from 'three';
import { camera } from '../scene/core.js';
import { SAMPLES, WSUM, deposit } from '../scene/heatmap.js';
import { E, EC, logEvent } from './state.js';
import { B } from './build.js';
import { distAt, dirOf, wallSide } from './nav.js';

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), v = new THREE.Vector3(), dir = new THREE.Vector3();
let frame = 0, lastYaw = 0, lastPitch = 0, angS = 0, spS = 0, lastX = 0, lastZ = 0, pathT = 0;
export const hooks = { onDecoy: null, onDeadEnd: null };

export function resetTrack() { lastYaw = E.yaw; lastPitch = E.pitch; angS = 0; spS = 0; lastX = E.pos.x; lastZ = E.pos.z; pathT = 0; frame = 0; E.inView = new Set(); E.gazeTag = null; }

export function track(dt) {
  const r = E.run, { x, z } = E.pos; r.t += dt; frame++;
  camera.updateMatrixWorld();
  const moved = Math.hypot(x - lastX, z - lastZ); lastX = x; lastZ = z; r.walked += moved;
  spS += (moved / dt - spS) * Math.min(1, dt * 6);
  const dy = Math.atan2(Math.sin(E.yaw - lastYaw), Math.cos(E.yaw - lastYaw)), dp = E.pitch - lastPitch; lastYaw = E.yaw; lastPitch = E.pitch;
  angS += (Math.hypot(dy, dp) / dt - angS) * Math.min(1, dt * 8);
  const steady = angS < EC.steadyTurn; E.steady = steady; E.speed = spS;
  r.look[steady ? 'steady' : 'sweeping'] += dt;
  const D = distAt(E.grid, E.F, x, z); E.D = D;

  pathT += dt;
  if (pathT >= EC.pathEvery) { pathT = 0; r.path.push([+r.t.toFixed(2), +x.toFixed(2), +z.toFixed(2), isFinite(D) ? +D.toFixed(1) : null]); }
  if (r.orientT === null && Math.hypot(x - r.spawn.x, z - r.spawn.z) > 1.0) {
    r.orientT = +r.t.toFixed(1); r.best = { d: D, x, z, t: r.t, w: r.walked };
    logEvent('move', `Started moving after ${r.orientT.toFixed(1)} s`);
  }
  if (r.orientT !== null) { hesitation(r, dt, x, z, Math.abs(dy)); wrongTurn(r, D, x, z); }
  deadEnds(r, dt, x, z);
  decoys(r, x, z);
  if (!(frame & 1)) signsInView(r, dt * 2);
  gaze(r, dt, steady);
  followChecks(r, x, z);
  return exitCheck(r, x, z);
}

function hesitation(r, dt, x, z, turn) {
  r.still = spS < EC.hesitateSpeed ? r.still + dt : 0;
  if (!r.openHes && r.still >= EC.hesitateMin) r.openHes = { t: +(r.t - r.still).toFixed(1), x: +x.toFixed(2), z: +z.toFixed(2), dur: 0, signs: new Set(E.inView), looked: {}, turned: 0, D: isFinite(E.D) ? +E.D.toFixed(1) : null };
  const h = r.openHes; if (!h) return;
  h.dur = r.t - h.t; h.turned += turn; E.inView.forEach(s => h.signs.add(s));
  if (E.gazeTag && E.steady) h.looked[E.gazeTag] = (h.looked[E.gazeTag] || 0) + dt;
  if (spS > EC.hesitateSpeed * 1.75) closeHes(r);
}
export function closeHes(r) {
  const h = r.openHes; if (!h) return; r.openHes = null;
  const looked = Object.entries(h.looked).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, s]) => [id, +s.toFixed(1)]);
  r.hes.push({ t: h.t, x: h.x, z: h.z, D: h.D, dur: +h.dur.toFixed(1), signs: [...h.signs], looked, turnedDeg: Math.round(h.turned * 180 / Math.PI) });
  logEvent('hesitate', `Stopped for ${h.dur.toFixed(1)} s${h.signs.size ? ', signs in view: ' + [...h.signs].join(', ') : ', no sign in view'}`);
}

function wrongTurn(r, D, x, z) {
  if (!isFinite(D)) return;
  if (D < r.best.d) { r.best = { d: D, x, z, t: r.t, w: r.walked }; if (r.openWrong) closeWrong(r); }
  const w = r.openWrong;
  if (!w && D > r.best.d + EC.wrongTurn) {
    r.openWrong = { t: +r.best.t.toFixed(1), x: +r.best.x.toFixed(2), z: +r.best.z.toFixed(2), D: +r.best.d.toFixed(1), w0: r.best.w, peak: D - r.best.d, signs: [...E.inView] };
    logEvent('wrong', `Heading away from the nearest exit (now ${(D - r.best.d).toFixed(1)} m farther than at best)`);
  } else if (w) { w.peak = Math.max(w.peak, D - r.best.d); if (D <= r.best.d + 0.6) closeWrong(r); }
}
export function closeWrong(r) {
  const w = r.openWrong; if (!w) return; r.openWrong = null;
  r.wrong.push({ t: w.t, x: w.x, z: w.z, D: w.D, peak: +w.peak.toFixed(1), detour: +(r.walked - w.w0).toFixed(1), back: +r.t.toFixed(1), signs: w.signs });
}
// After the falling stock changes the map, distances are measured on the new map
export function rebase(r) { if (r.openWrong) closeWrong(r); const D = distAt(E.grid, E.F, E.pos.x, E.pos.z); r.best = { d: D, x: E.pos.x, z: E.pos.z, t: r.t, w: r.walked }; }

function deadEnds(r, dt, x, z) {
  for (const de of E.room.deadEnds) {
    const [a, b, c, d] = de.rect, inside = x > a && x < b && z > c && z < d;
    const s = r.deadEnds[de.id] || (r.deadEnds[de.id] = { entries: 0, time: 0, in: false });
    if (inside && !s.in) {
      if (r.t < 0.5) { s.spawnedIn = true; logEvent('deadend', `Started inside ${de.name}`); }
      else { s.entries++; logEvent('deadend', `Entered ${de.name}`); hooks.onDeadEnd && hooks.onDeadEnd(de); }
    }
    if (inside && s.entries) s.time += dt; s.in = inside;
  }
}

// Trying a door: standing in front of it (within 1.3 m of its face and inside its width) and facing it
function atDoor(d, x, z) {
  const n = dirOf(d.face), rx = x - d.x, rz = z - d.z, perp = rx * n[0] + rz * n[1], lat = Math.abs(rx * n[1] - rz * n[0]);
  const facing = -(-Math.sin(E.yaw) * n[0] + -Math.cos(E.yaw) * n[1]);
  return perp > -0.2 && perp < EC.decoyReach && lat < d.w / 2 + 0.25 && facing > 0.6;
}
function decoys(r, x, z) {
  for (const d of E.room.decoys) {
    const s = r.decoys[d.id], at = atDoor(d.door, x, z);
    if (at && !s) { r.decoys[d.id] = { t: +r.t.toFixed(1), x: +x.toFixed(2), z: +z.toFixed(2), tries: 1, near: true }; logEvent('decoy', `Tried ${d.name}`); hooks.onDecoy && hooks.onDecoy(d); }
    else if (at && s && !s.near) { s.tries++; s.near = true; hooks.onDecoy && hooks.onDecoy(d); }
    else if (!at && s && s.near) s.near = false;
  }
}

function signsInView(r, dt) {
  E.inView = new Set();
  const cam = camera.position, env = E.env || { power: 1, fog: 0 };
  for (const id in B.signs) {
    const S = B.signs[id], st = r.signs[id], def = S.def;
    const dx = cam.x - S.pos.x, dz = cam.z - S.pos.z, fl = Math.hypot(dx, dz) || 1, dist = Math.hypot(dx, dz, cam.y - S.pos.y);
    if (dist > 45) continue;
    const facing = Math.max(...S.normals.map(n => (n[0] * dx + n[1] * dz) / fl));
    if (facing < 0.15) continue;
    v.copy(S.pos).project(camera); if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) continue;
    // smoke: Beer-Lambert-style transmission through the fog; lit signs cut through further
    const trans = Math.exp(-Math.pow(env.fog * dist, 2)), need = def.illum === 'internal' ? 0.05 : 0.18;
    if (trans < need) continue;
    // darkness: unlit signs need light to be read; photoluminescent ones glow, but faintly
    if (!env.power && ((def.illum === 'none' && dist > 4) || (def.illum === 'photolum' && dist > 12))) continue;
    dir.copy(S.pos).sub(cam).normalize(); ray.set(cam, dir); ray.far = dist + 0.2;
    const hit = ray.intersectObjects(B.targets, false)[0];
    if (hit && hit.object.userData.tag !== id && hit.distance < dist - 0.2) continue;
    E.inView.add(id); st.vis += dt;
    const legible = dist <= B.objects[id].rated && facing > 0.35; if (legible) st.legible += dt;
    if (!env.power) st.visDark += dt;
    if (!st.firstVis) { st.firstVis = { t: +r.t.toFixed(1), dist: +dist.toFixed(1), legible }; logEvent('sign', `${id} came into view at ${dist.toFixed(1)} m${legible ? '' : dist > B.objects[id].rated ? ' (beyond its rated distance)' : ' (at a steep angle)'}`, { sign: id }); }
  }
}

function gaze(r, dt, steady) {
  const per = {}, fix = new Set(); let centre = null;
  for (let i = 0; i < SAMPLES.length; i++) {
    const outer = i > 8; if (outer && (frame & 1)) continue;
    const [sx, sy, w] = SAMPLES[i], t = outer ? dt * 2 : dt;
    ndc.set(sx / camera.aspect, sy); ray.setFromCamera(ndc, camera); ray.far = 45;
    const h = ray.intersectObjects(B.targets, false)[0];
    if (!h) continue;
    const tag = h.object.userData.tag;
    if (i === 0) centre = h;
    if (i <= 8) fix.add(tag);   // centre ray and the 3-degree ring: what the eye is resting on
    if (steady) { per[tag] = (per[tag] || 0) + w * t / WSUM; deposit(h.point, w * t, tag); }
  }
  for (const tag in per) { const o = r.obj[tag] || (r.obj[tag] = 0); r.obj[tag] = o + per[tag]; }
  // Signs are small, so the area-weighted score above under-counts them. For signs, looking is
  // fixation time: seconds the sign sits within about 3 degrees of the centre while the view is steady.
  if (steady) for (const tag of fix) {
    const st = r.signs[tag];
    if (st && E.inView.has(tag)) {   // a sign too dark or smoky to read is not being looked at
      st.attn += dt;
      if (!st.firstLook && st.attn >= EC.firstLook) {
        const S = B.signs[tag], dist = camera.position.distanceTo(S.pos);
        st.firstLook = { t: +r.t.toFixed(1), dist: +dist.toFixed(1), x: +E.pos.x.toFixed(2), z: +E.pos.z.toFixed(2) };
        st.check = { t0: r.t, x: E.pos.x, z: E.pos.z };
        logEvent('look', `Looked at ${tag} (${B.objects[tag].name}) from ${dist.toFixed(1)} m`, { sign: tag });
      }
    }
  }
  E.gazeTag = centre ? centre.object.userData.tag : null;
  E.gazePoint = centre ? centre.point : null; E.gazeDist = centre ? centre.distance : 0;
}

function followChecks(r, x, z) {
  for (const id in r.signs) {
    const st = r.signs[id]; if (!st.check || st.followed !== null) continue;
    if (r.t - st.check.t0 < EC.followWindow) continue;
    const def = B.signs[id].def, p = dirOf(def.points);
    const mx = x - st.check.x, mz = z - st.check.z, L = Math.hypot(mx, mz);
    // a sign over an exit door is followed by heading for that door
    if (def.exit) { const d = E.room.exits.find(e => e.id === def.exit).door; st.followed = Math.hypot(st.check.x - d.x, st.check.z - d.z) - Math.hypot(x - d.x, z - d.z) > 1 ? 'yes' : L < 1.2 ? 'stood' : 'no'; }
    else if (!p) st.followed = 'n/a';
    else if (L < 1.2) st.followed = 'stood';
    else st.followed = (mx * p[0] + mz * p[1]) / L > 0.5 ? 'yes' : 'no';
    st.check = null;
  }
}

function exitCheck(r, x, z) {
  for (const e of E.room.exits) {
    const d = e.door, n = dirOf(d.face), past = (d.x - x) * n[0] + (d.z - z) * n[1];
    const lat = n[0] ? Math.abs(z - d.z) : Math.abs(x - d.x);
    if (past > 0.35 && lat < d.w / 2 + 0.3) {
      r.exit = { id: e.id, t: +r.t.toFixed(1) }; logEvent('exit', `Reached ${e.name}`);
      for (const s of E.room.signs) { const st = r.signs[s.id]; if (s.exit === e.id && st.check) { st.followed = 'yes'; st.check = null; } }
      return e;
    }
  }
  return null;
}

// What the panel shows: the tagged thing at the centre of view
export function lookingAt() { return E.gazeTag ? B.objects[E.gazeTag] : null; }
export { wallSide };
