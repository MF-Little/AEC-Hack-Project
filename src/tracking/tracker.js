// Per-frame tracking: area zones, centre-weighted attention rays, gaze, fixations, captures,
// and exposure: how long each option was on show and how much attention its element drew.
import * as THREE from 'three';
import { S, CONFIG } from '../state.js';
import { camera } from '../scene/core.js';
import { built } from '../scene/builder.js';
import { SAMPLES, WSUM, deposit } from '../scene/heatmap.js';
import { log, toast } from '../ui/feed.js';
import { zoneStats } from '../state.js';
import { instKey, activeKeys, blankInst } from '../decoder/instances.js';

const inst = k => S.session.inst[k] || (S.session.inst[k] = blankInst());

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let pathTimer = 0, frame = 0, prev = null, angS = 0, spdS = 0;
export function resetMotion() { prev = null; angS = 0; spdS = 0; }

// Which variable an object belongs to: walls -> wall finish, windows -> glass, furniture -> style.
const VAR_OF = { wall: 'walls', window: 'glass', furniture: 'style' };
export const varOf = o => VAR_OF[o.kind] || null;

export function currentZone() {
  for (const z of S.zones) { const st = S.session.zones[z.id]; if (st && st.inZone) return z; }
  return null;
}

export function endFixation() {
  const g = S.gaze; if (!g.tag) return;
  const o = S.objects[g.tag];
  if (g.t >= CONFIG.captureAfter) {
    o.s.fixations.push(+g.t.toFixed(2));
    if (g.captured) log('fix', g.tag, `Held ${g.t.toFixed(1)} s on ${o.name}`);
  } else if (g.t >= CONFIG.glanceMin) o.s.glances++;
}

export function track(dt) {
  const ses = S.session, p = camera.position;
  ses.elapsed += dt; frame++;

  pathTimer += dt;
  if (pathTimer > CONFIG.pathEvery) { pathTimer = 0; ses.path.push([+p.x.toFixed(2), +p.z.toFixed(2)]); if (ses.path.length > 6000) ses.path.shift(); }
  ses.halves[p.z < 0 ? 'north' : 'south'] += dt;

  // Zones follow the furniture; their stats are kept by id so a layout change doesn't reset them.
  for (const z of S.zones) {
    const st = ses.zones[z.id] || (ses.zones[z.id] = zoneStats());
    const inside = Math.hypot(p.x - z.x, p.z - z.z) < z.r;
    if (inside && !st.inZone) { st.visits++; if (st.firstAt === null) st.firstAt = +ses.elapsed.toFixed(1); log('enter', z.id, `Entered ${z.name.toLowerCase()} area`); }
    if (!inside && st.inZone) log('exit', z.id, `Left ${z.name.toLowerCase()} area after ${st.run.toFixed(1)} s`);
    st.run = inside ? (st.inZone ? st.run + dt : 0) : 0;
    st.inZone = inside;
    if (inside) st.dwell += dt;
    if (built.zoneFills[z.id]) built.zoneFills[z.id].material.opacity = inside ? 0.12 : 0.03;
  }
  const zone = currentZone();

  // Deliberate looking: only a steady view counts. Sweeping across walls while walking or turning doesn't.
  if (prev) {
    const ang = (Math.abs(S.yaw - prev.yaw) + Math.abs(S.pitch - prev.pitch)) / dt;
    const spd = Math.hypot(p.x - prev.x, p.z - prev.z) / dt;
    angS = angS * 0.8 + Math.min(ang, 6) * 0.2; spdS = spdS * 0.8 + Math.min(spd, 6) * 0.2;
  }
  prev = { yaw: S.yaw, pitch: S.pitch, x: p.x, z: p.z };
  const steady = angS < CONFIG.steadyTurn && spdS < CONFIG.steadyMove;
  S.deliberate = steady;
  ses.look[steady ? 'deliberate' : 'passing'] += dt;
  if (S.outside) ses.look.outside += dt;

  // Exposure clocks: every option currently on show gains time.
  for (const [v, id] of Object.entries(S.choice)) ses.exposure[v][id].time += dt;
  for (const k of activeKeys()) inst(k).time += dt;

  // Centre-weighted attention. Outer rings are sampled every other frame (with double time).
  let hit = null;
  for (let i = 0; i < SAMPLES.length; i++) {
    const outer = i > 8;
    if (outer && (frame & 1)) continue;
    const [sx, sy, w] = SAMPLES[i], t = outer ? dt * 2 : dt;
    ndc.set(sx / camera.aspect, sy);
    ray.setFromCamera(ndc, camera);
    const h = ray.intersectObjects(built.targets, false)[0];
    if (i === 0) hit = h;
    if (!h) continue;
    const tg = h.object.userData.tag, o = S.objects[tg], a = w * t / WSUM;
    const I = inst(instKey(tg)); I.vis += t / SAMPLES.length;               // merely in view: always counted
    if (!steady) { o.s.passing = (o.s.passing || 0) + a; continue; }        // sweeping past: not counted as attention
    o.s.attn += a; I.attn += a;
    const v = varOf(o); if (v) ses.exposure[v][S.choice[v]].attn += a;
    const part = h.object.userData.part;
    if (part) { const pt = ses.parts[part] || (ses.parts[part] = { in: 0, out: 0 }); pt[S.outside ? 'out' : 'in'] += a; }
    deposit(h.point, w * t, tg);
  }

  const tag = hit ? hit.object.userData.tag : null;
  if (tag !== S.gaze.tag) { endFixation(); S.gaze = { tag, t: 0, captured: false, dist: 0 }; }
  if (!tag) return;
  const o = S.objects[tag];
  S.gaze.t += dt; S.gaze.dist = hit.distance; o.s.gaze += dt;
  S.gaze.point = { x: +hit.point.x.toFixed(2), y: +hit.point.y.toFixed(2), z: +hit.point.z.toFixed(2) };
  inst(instKey(tag)).gaze += dt;
  S.gaze.part = hit.object.userData.part || null;
  o.s.minDist = Math.min(o.s.minDist, hit.distance);
  if (!S.gaze.captured && S.gaze.t >= CONFIG.captureAfter && zone) {
    S.gaze.captured = true; o.s.captures++; inst(instKey(tag)).captures++;
    const v = varOf(o); if (v) ses.exposure[v][S.choice[v]].captures++;
    ses.captures.push({ x: +p.x.toFixed(2), z: +p.z.toFixed(2), tag, zone: zone.id, t: +ses.elapsed.toFixed(1), choice: { ...S.choice } });
    const msg = `Captured ${o.name} · ${hit.distance.toFixed(1)} m · in ${zone.name.toLowerCase()} area`;
    log('capture', tag, msg); if (!S.subject) toast('● ' + msg);
  }
}
