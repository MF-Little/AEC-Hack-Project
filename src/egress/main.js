// Factory Egress entry point: build the factory, spawn at a farthest point, run the emergency,
// track the escape, then hand over to the report.
import * as THREE from 'three';
import { renderer, scene, camera, resize, canvas } from '../scene/core.js';
import { attachOverlays, clearHeat, pushHeat, setHeatVisible } from '../scene/heatmap.js';
import { $, $$, esc, rng, clockFmt } from '../util.js';
import { E, EC, newRun, logEvent } from './state.js';
import { buildFactory, B, tickDoors, closeDoors } from './build.js';
import { makeGrid, field, farthest, pathFrom, pathLength, distAt, freeRun, CS } from './nav.js';
import * as NAV from './nav.js';
import { HZ, setupLighting, setPower, shake, shakeOffset, collapse, tickHazards, resetHazards, startAlarm, stopAlarm, crash, thud } from './hazards.js';
import { track, resetTrack, closeHes, closeWrong, rebase, hooks, lookingAt } from './track.js';
import { setupReport, openReport, drawRoute, saveRun, analyseNote } from './report.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.get('debug') === '1';
const SPEED = DEBUG ? Math.min(2, Math.max(0.25, +params.get('speed') || 1)) : 1;   // debug only: faster scripted test walks
const nextFrame = DEBUG
  ? f => { const t0 = performance.now(), ch = new MessageChannel(); ch.port1.onmessage = () => { if (performance.now() - t0 < 15) ch.port2.postMessage(0); else f(performance.now()); }; ch.port2.postMessage(0); }
  : f => requestAnimationFrame(f);
if (DEBUG) Object.assign(window, { __collapseAt: (id, ahead = 5) => { const s = room().collapseSites.find(c => c.id === id); return s && E.run ? fireCollapse(E.run, s, ahead) : false; }, __nav: NAV, __eg: E, __hz: HZ, __B: B, __cam: camera, __r: renderer, __scene: scene });

let baseColliders = [], sound = true;
const room = () => E.room;

// ---------- movement ----------
const typing = e => e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
const blocked = () => !((E.started && !E.done) || E.review) || !$('#report').hidden;
function setupControls() {
  addEventListener('keydown', e => {
    if (typing(e) || blocked()) return;
    if (e.key === 'Enter' && !E.review) { e.preventDefault(); $('#note').focus(); return; }
    if (e.key === 'Escape' && E.review) { exitReview(); return; }
    E.keys.add(e.code); if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  });
  addEventListener('keyup', e => E.keys.delete(e.code));
  addEventListener('blur', () => E.keys.clear());
  let drag = null;
  canvas.addEventListener('pointerdown', e => { if (blocked()) return; drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); canvas.classList.add('drag'); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
  canvas.addEventListener('pointermove', e => { if (!drag) return; const k = e.pointerType === 'touch' ? 0.006 : 0.0042; E.yaw -= (e.clientX - drag.x) * k; E.pitch = Math.max(-1.25, Math.min(1.25, E.pitch - (e.clientY - drag.y) * k)); drag = { x: e.clientX, y: e.clientY }; });
  const end = () => { drag = null; canvas.classList.remove('drag'); };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  $$('#pad button').forEach(b => { const k = b.dataset.k; b.addEventListener('pointerdown', e => { e.preventDefault(); E.keys.add(k); }); ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => E.keys.delete(k))); });
}
const R = 0.22;
const hits = (x, z) => B.colliders.some(([a, b, c, d]) => x > a - R && x < b + R && z > c - R && z < d + R);
function move(dt) {
  const k = E.keys, run = k.has('ShiftLeft') || k.has('ShiftRight') ? 2 : 1, sp = EC.walkSpeed * run * dt;
  let f = 0, s = 0;
  if (k.has('KeyW') || k.has('ArrowUp')) f += 1; if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
  if (k.has('KeyD')) s += 1; if (k.has('KeyA')) s -= 1;
  if (k.has('ArrowLeft') || k.has('KeyQ')) E.yaw += EC.turnSpeed * dt; if (k.has('ArrowRight') || k.has('KeyE')) E.yaw -= EC.turnSpeed * dt;
  const p = E.pos, ox = p.x, oz = p.z;
  p.x += (-Math.sin(E.yaw) * f + Math.cos(E.yaw) * s) * sp; p.z += (-Math.cos(E.yaw) * f - Math.sin(E.yaw) * s) * sp;
  if (hits(p.x, p.z)) { if (!hits(ox, p.z)) p.x = ox; else if (!hits(p.x, oz)) p.z = oz; else { p.x = ox; p.z = oz; } }
  p.x = Math.max(-23, Math.min(23, p.x)); p.z = Math.max(-16, Math.min(16, p.z));
}
function applyCamera(sh) {
  camera.position.set(E.pos.x + (sh ? sh.x : 0), E.eye + (sh ? sh.y : 0), E.pos.z + (sh ? sh.z : 0));
  camera.rotation.set(E.pitch + (sh ? sh.rx : 0), E.yaw, sh ? sh.rz : 0);
}

// ---------- the run ----------
function spawnPoint(r) {
  const { pick } = farthest(E.grid0, E.F0, r);
  // face a random open direction (never straight at a wall)
  const dirs = [];
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a), run = freeRun(E.grid0, pick.x, pick.z, dx, dz, 8); if (run >= 3) dirs.push([dx, dz]); }
  const [dx, dz] = dirs.length ? dirs[Math.floor(r() * dirs.length)] : [0, -1];
  return { x: +pick.x.toFixed(2), z: +pick.z.toFixed(2), yaw: Math.atan2(-dx, -dz), d: +pick.d.toFixed(1) };
}

function startRun({ participant = '', eye = 1.6, opts }) {
  resetHazards(); closeDoors(); clearHeat(); setHeatVisible(false); clearReviewLines();
  B.colliders = baseColliders.slice(); E.grid = E.grid0; E.F = E.F0;
  const seed = Math.floor(Math.random() * 1e9), r = rng(seed), sp = spawnPoint(r);
  E.eye = eye; E.opts = opts; E.done = false; E.review = false;
  newRun({ participant, opts, spawn: sp }); E.run.seed = seed;
  E.run.optimal0 = +distAt(E.grid0, E.F0, sp.x, sp.z).toFixed(1);
  E.run.route0 = pathFrom(E.grid0, E.F0, sp.x, sp.z).map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]);
  E.pos.x = sp.x; E.pos.z = sp.z; E.yaw = sp.yaw; E.pitch = 0; applyCamera(null); resetTrack();
  HZ.shakeScale = opts.shake ? 1 : 0;
  sound = opts.sound; $('#soundbtn').textContent = sound ? 'Sound on' : 'Sound off'; $('#soundbtn').setAttribute('aria-pressed', sound);
  if (sound) startAlarm(); HZ.alarmOn = true; document.body.classList.add('alarm');
  E.timeline = { bang: false, collapseTry: 0, aftershock: false, power: false, smoke: false, eligibleAt: null, powerPlan: [] };
  E.blockers = [];
  E.started = true;
  $('#feed').innerHTML = ''; renderSignList();
  logEvent('start', `Spawned ${sp.d} m from the nearest exit on foot${participant ? ' · ' + participant : ''}`);
}

// Scripted pressure. The falling stock is placed on the walker's own shortest route, a few metres
// ahead, so it always forces a decision rather than landing somewhere irrelevant. Up to three
// collapses per run, each on the route the person has just been pushed onto, always leaving a way out.
// The power fails, a generator brings the lights back for a few seconds, then they fail again.
const MAX_COLLAPSES = 3, COLLAPSE_GAP = 13;
function scenario(dt) {
  const r = E.run, T = E.timeline, t = r.t, o = E.opts, cs = r.collapses, last = cs[cs.length - 1];
  if (!T.bang && t > 0.6) { T.bang = true; shake(0.7, 1.8); if (sound) crash(0.5); logEvent('shake', 'A heavy impact shakes the building'); }
  const ready = o.collapse && cs.length < MAX_COLLAPSES && r.orientT !== null && t > 2.5 && t < 120 && (!last || t > last.t + COLLAPSE_GAP);
  if (ready && T.eligibleAt === null) T.eligibleAt = t;
  if (ready && (T.collapseTry -= dt) <= 0) { T.collapseTry = 0.5; if (tryCollapse(r, t - T.eligibleAt > 12)) T.eligibleAt = null; }
  // power: first cut just after the first collapse, then back on, off, on, off
  const powerAt = cs.length ? cs[0].t + 1.6 : (o.collapse ? 30 : 18);
  if (o.power && !T.power && t > powerAt) {
    T.power = true; powerSwitch(r, false, 'Power cut: emergency lighting only');
    T.powerPlan = [[t + 9, true, 'The generator brings the lights back'], [t + 15, false, 'The lights fail again'], [t + 31, true, 'Lights back on, flickering'], [t + 36, false, 'The lights fail again']];
  }
  while (T.powerPlan.length && t > T.powerPlan[0][0]) { const [, on, msg] = T.powerPlan.shift(); powerSwitch(r, on, msg); }
  // smoke thickens in stages, a step with every collapse
  const smokeAt = cs.length ? cs[0].t + 3 : (o.collapse ? 32 : 15);
  if (o.smoke && !T.smoke && t > smokeAt) { T.smoke = true; r.smokeAt = +t.toFixed(1); logEvent('smoke', 'Smoke is building up'); }
  if (T.smoke) HZ.fogTarget = Math.min(0.085, 0.03 + 0.022 * Math.max(0, cs.length - 1) + 0.0004 * (t - r.smokeAt));
  if (!T.aftershock && t > (cs.length ? cs[0].t + 14 : 40)) { T.aftershock = true; shake(0.35, 1.4); if (sound) thud(); }
}
function powerSwitch(r, on, msg) {
  if ((HZ.power === 1) === on) return;
  setPower(on); if (!on && r.powerCutAt === null) r.powerCutAt = +r.t.toFixed(1);
  (r.powerEvents || (r.powerEvents = [])).push([+r.t.toFixed(1), on ? 1 : 0]);
  logEvent('power', msg); if (sound) thud();
}
const ray = new THREE.Raycaster();
function tryCollapse(r, anyView) {
  // candidate sites on the walker's shortest route, 3.5 to 14 m ahead; prefer one they can see
  // (within 55 degrees of where they face, nothing solid in between) and about 8 m away
  const path = pathFrom(E.grid, E.F, E.pos.x, E.pos.z), found = new Map(); let acc = 0;
  for (let i = 1; i < path.length && acc < 14; i++) {
    const [ax, az] = path[i - 1], [bx, bz] = path[i], L = Math.hypot(bx - ax, bz - az);
    for (let s = 0; s <= L; s += 0.25) {
      const x = ax + (bx - ax) * s / L, z = az + (bz - az) * s / L, d = acc + s;
      if (d < 3.5 || d > 14) continue;
      for (const site of room().collapseSites) { if (r.collapses.some(c => c.site === site.id)) continue; const [a, b, c, e] = site.rect; if (x > a - 0.2 && x < b + 0.2 && z > c - 0.2 && z < e + 0.2 && !found.has(site)) found.set(site, d); }
    }
    acc += L;
  }
  const fx = -Math.sin(E.yaw), fz = -Math.cos(E.yaw), cam = camera.position;
  const seen = site => {
    const [a, b, c, e] = site.rect, cx = (a + b) / 2, cz = (c + e) / 2, dx = cx - cam.x, dz = cz - cam.z, L = Math.hypot(dx, dz);
    if ((dx * fx + dz * fz) / L < Math.cos(55 * Math.PI / 180)) return false;
    ray.set(cam, new THREE.Vector3(dx, 1.4 - cam.y, dz).normalize()); ray.far = L;
    const h = ray.intersectObjects(B.targets, false)[0]; return !h || h.distance > L - 1.6;
  };
  let best = null;
  for (const [site, d] of found) { if (!seen(site) && !anyView) continue; if (!best || Math.abs(d - 8) < Math.abs(best.d - 8)) best = { site, d }; }
  if (!best) return false;
  return fireCollapse(r, best.site, best.d);
}
// Drop the stock (or roof debris) at one site, if a way out remains, and re-plan every distance
function fireCollapse(r, site, ahead) {
  const best = { site, d: ahead };
  const g = makeGrid(room(), [...E.blockers, best.site.rect]), F = field(g), Dn = distAt(g, F, E.pos.x, E.pos.z);
  if (!isFinite(Dn)) return false;
  const Db = distAt(E.grid, E.F, E.pos.x, E.pos.z);
  const info = collapse(best.site, room());
  B.colliders.push(best.site.rect); E.blockers.push(best.site.rect); E.grid = g; E.F = F;
  const ev = { n: r.collapses.length + 1, t: +r.t.toFixed(1), ...info, x: +E.pos.x.toFixed(2), z: +E.pos.z.toFixed(2), ahead: +best.d.toFixed(1), walkedAt: +r.walked.toFixed(1), before: +Db.toFixed(1), after: +Dn.toFixed(1),
    route: pathFrom(g, F, E.pos.x, E.pos.z).map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]) };
  r.collapses.push(ev); if (!r.collapse) r.collapse = ev;
  rebase(r);
  if (r.collapses.length > 1 && HZ.power === 1 && E.timeline.power) powerSwitch(r, false, 'The impact knocks the lights out again');
  shake(1.0, 2.4); if (sound) crash(1);
  const what = info.from === 'roof' ? 'ductwork and a light fitting fell from the roof' : 'stock fell from the racking';
  logEvent('collapse', `${ev.n > 1 ? 'Another collapse: ' + what : what[0].toUpperCase() + what.slice(1)} ${best.d.toFixed(0)} m ahead and blocked the way (${info.site}); the shortest way out is now ${Dn.toFixed(1)} m instead of ${Db.toFixed(1)} m`);
  return true;
}

function finish(kind, exit) {
  if (E.done) return;
  const r = E.run; E.done = true; E.keys.clear();
  closeHes(r); closeWrong(r);
  stopAlarm(); HZ.alarmOn = false; document.body.classList.remove('alarm');
  r.result = kind; r.duration = +r.t.toFixed(1); r.walked = +r.walked.toFixed(1);
  const lc = r.collapses[r.collapses.length - 1];
  r.best_possible = lc ? +(lc.walkedAt + lc.after).toFixed(1) : r.optimal0;
  r.efficiency = r.walked > 0 ? Math.min(1, r.best_possible / r.walked) : 0;
  saveRun(r);
  const mm = clockFmt(r.t);
  $('#outeyebrow').textContent = kind === 'exit' ? 'Run complete' : kind === 'time' ? 'Time is up' : 'Run ended';
  $('#outtitle').textContent = kind === 'exit' ? `Out in ${mm}` : kind === 'time' ? 'Still inside' : 'Run ended';
  $('#outtext').textContent = kind === 'exit'
    ? `You left by ${room().exits.find(e => e.id === exit.id).name.toLowerCase()} after walking ${r.walked.toFixed(0)} m. The shortest possible way was ${r.best_possible.toFixed(0)} m.`
    : `You were still inside after ${mm}, ${isFinite(E.D) ? E.D.toFixed(0) + ' m from the nearest exit' : 'cut off from the exits'}.`;
  $('#outcard').hidden = false; setTimeout(() => $('#seeresults').focus(), 50);
}

// ---------- review in 3D ----------
let reviewLines = [];
function ribbon(pts, w, color, y, dashed = false) {
  const g = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, opacity: 0.9, depthWrite: false });
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], L = Math.hypot(bx - ax, bz - az); if (L < 0.01) continue;
    const segs = dashed ? Math.max(1, Math.floor(L / 0.6)) : 1;
    for (let k = 0; k < segs; k++) {
      const s0 = k / segs, s1 = dashed ? (k + 0.55) / segs : 1, l = L * (s1 - s0);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(l, w), mat); m.rotation.x = -Math.PI / 2; m.rotation.z = -Math.atan2(bz - az, bx - ax);
      m.position.set(ax + (bx - ax) * (s0 + s1) / 2, y, az + (bz - az) * (s0 + s1) / 2); g.add(m);
    }
  }
  scene.add(g); reviewLines.push(g); return g;
}
function clearReviewLines() { reviewLines.forEach(g => { scene.remove(g); g.traverse(o => o.geometry && o.geometry.dispose()); }); reviewLines = []; }
function enterReview() {
  const r = E.run; if (!r) return;
  E.review = true; document.body.classList.add('reviewing');
  pushHeat(); setHeatVisible(true); clearReviewLines();
  ribbon(r.route0, 0.14, 0x0B9A55, 0.03, true);
  (r.collapses || (r.collapse ? [r.collapse] : [])).forEach(c => ribbon(c.route, 0.14, 0x0B9A55, 0.035, true));
  ribbon(r.path.map(p => [p[1], p[2]]), 0.16, 0x3651C9, 0.04);
  for (const h of r.hes) { const m = new THREE.Mesh(new THREE.CircleGeometry(0.25 + Math.min(1.2, h.dur * 0.12), 28), new THREE.MeshBasicMaterial({ color: 0xE3A23B, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false })); m.rotation.x = -Math.PI / 2; m.position.set(h.x, 0.05, h.z); scene.add(m); reviewLines.push(m); }
  setPower(true, true); HZ.fogTarget = 0; if (HZ.fog) HZ.fog.density = 0;
  E.pos.x = r.spawn.x; E.pos.z = r.spawn.z; E.yaw = r.spawn.yaw; E.pitch = -0.05; E.eye = 1.6;
  $('#report').hidden = true;
}
function exitReview() { E.review = false; document.body.classList.remove('reviewing'); setHeatVisible(false); clearReviewLines(); openReport(); }

// ---------- panel ----------
function setSubject(sub) { E.subject = sub; document.body.classList.toggle('subject', sub); $('#m-sub').setAttribute('aria-pressed', sub); $('#m-obs').setAttribute('aria-pressed', !sub); }
let toastT = 0, msgT = 0;
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2200); }
function message(t) { const el = $('#msg'); el.textContent = t; el.classList.add('show'); clearTimeout(msgT); msgT = setTimeout(() => el.classList.remove('show'), 2600); }
function renderSignList() {
  const r = E.run; if (!r) return;
  $('#signlist').innerHTML = room().signs.map(s => {
    const st = r.signs[s.id], cls = st.attn >= EC.firstLook ? 'look' : st.vis > 0 ? 'vis' : '', live = E.inView.has(s.id) ? ' live' : '';
    const txt = st.attn >= EC.firstLook ? `looked ${st.attn.toFixed(1)} s${st.followed && st.followed !== 'n/a' ? ' · followed: ' + st.followed : ''}` : st.vis > 0 ? `in view ${st.vis.toFixed(0)} s` : '–';
    return `<div class="srow"><span class="dot ${cls}${live}"></span><span class="id">${s.id}</span><span>${esc(s.name)}</span><span class="st">${txt}</span></div>`;
  }).join('');
}
let feedN = 0;
function renderPanel() {
  const r = E.run; if (!r) return;
  $('#clock').textContent = clockFmt(r.t);
  const st = E.speed < EC.hesitateSpeed ? (r.openHes ? 'hesitating' : 'standing') : 'moving';
  $('#runmeta').innerHTML = [
    ['Nearest exit', isFinite(E.D) ? `${E.D.toFixed(1)} m on foot` : 'cut off'],
    ['Walked', `${r.walked.toFixed(1)} m · shortest at start ${r.optimal0} m`],
    ['Now', `${st}${r.openWrong ? ' · <b style="color:var(--warm)">heading away</b>' : ''} · ${E.steady ? 'steady view' : 'turning'}`],
    ['Hazards', [r.collapses.length && (r.collapses.length > 1 ? r.collapses.length + ' aisles blocked' : 'aisle blocked'), r.powerCutAt !== null && (HZ.power ? 'lights back on' : 'power cut'), r.smokeAt !== null && 'smoke'].filter(Boolean).join(', ') || 'alarm only']
  ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  const o = lookingAt();
  $('#now').innerHTML = o ? `<b>${esc(o.name)}</b><span class="k">${esc(o.id)} · ${E.gazeDist.toFixed(1)} m</span>` : '<span class="k">nothing tagged</span>';
  $('#nowmeta').innerHTML = o && o.props ? Object.entries(o.props).slice(0, 6).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('') : '';
  renderSignList();
  drawRoute($('#plan'), r, { live: true, pos: E.pos, yaw: E.yaw });
  if (r.events.length !== feedN) {
    feedN = r.events.length;
    $('#feed').innerHTML = r.events.slice(-12).reverse().map(e => `<li class="${e.type}"><span class="t">${clockFmt(e.t)}</span><span class="m">${esc(e.text)}</span></li>`).join('');
  }
}

function addNote(text) {
  text = text.trim(); if (!text || !E.run) return;
  const r = E.run, a = analyseNote(text);
  const n = { n: r.notes.length + 1, t: +r.t.toFixed(1), text, x: +E.pos.x.toFixed(2), z: +E.pos.z.toFixed(2), heading: Math.round(((-E.yaw * 180 / Math.PI) % 360 + 360) % 360),
    target: E.gazeTag, dist: E.gazeTag ? +E.gazeDist.toFixed(1) : null, inView: [...E.inView], D: isFinite(E.D) ? +E.D.toFixed(1) : null, sentiment: a.sentiment, cues: a.cues };
  r.notes.push(n); logEvent('note', `“${text}”${n.target ? ' → ' + (B.objects[n.target] ? B.objects[n.target].name : n.target) : ''}`);
  if (!E.subject) toast(`Note ${n.n} pinned at x ${n.x}, z ${n.z}`);
  $('#notebtn').innerHTML = `<span class="ncount">${r.notes.length}</span>Note`;
}

// ---------- boot ----------
async function boot() {
  let rm;
  try { const res = await fetch('rooms/factory-egress.json'); if (!res.ok) throw new Error(res.status); rm = await res.json(); }
  catch (e) { $('#fatal').hidden = false; $('#fatal').innerHTML = '<h1>Room file not found</h1><p>Open this page through a local server (for example <code>python3 -m http.server</code>), not as a file.</p>'; return; }
  E.room = rm;
  buildFactory(rm); attachOverlays(B.overlays); setHeatVisible(false); setupLighting();
  baseColliders = B.colliders.slice();
  E.grid0 = makeGrid(rm); E.F0 = field(E.grid0); E.grid = E.grid0; E.F = E.F0;
  $('#task').textContent = rm.task; $('#startmeta').textContent = `${rm.name} · ${rm.summary}`;
  // preview behind the start screen: a view down the racking
  E.pos.x = -13.6; E.pos.z = 4.5; E.yaw = -0.62; E.pitch = 0.04; applyCamera(null);
  $('#start').hidden = false;
  setupControls();
  hooks.onDecoy = d => message(d.msg);
  hooks.onDeadEnd = d => { if (!E.subject) toast(`Dead end: ${d.name}`); };
  setupReport({ onNewRun: () => { $('#report').hidden = true; $('#start').hidden = false; }, onReview: enterReview });
  $('#m-obs').onclick = () => setSubject(false); $('#m-sub').onclick = () => setSubject(true);
  $('#logbtn').onclick = () => document.body.classList.toggle('show-log');
  $('#soundbtn').onclick = e => { sound = !sound; e.target.textContent = sound ? 'Sound on' : 'Sound off'; e.target.setAttribute('aria-pressed', sound); if (!sound) stopAlarm(); else if (E.started && !E.done) startAlarm(); e.target.blur(); };
  $('#endbtn').onclick = e => { e.target.blur(); if (E.started && !E.done) finish('ended'); else if (E.run) openReport(); };
  $('#seeresults').onclick = () => { $('#outcard').hidden = true; openReport(); };
  $('#backreport').onclick = exitReview;
  $('#notebar').addEventListener('submit', e => { e.preventDefault(); const i = $('#note'); if (E.started && !E.done) addNote(i.value); i.value = ''; i.blur(); });
  $('#note').addEventListener('keydown', e => { if (e.key === 'Escape') e.target.blur(); });
  // switching study mid-run would lose the run, so ask first
  $$('.studies a:not([aria-current])').forEach(a => a.addEventListener('click', e => { if (E.started && !E.done && !confirm('Leave this run for the glazing study? It has not finished and will not be saved.')) e.preventDefault(); }));
  $('#startform').addEventListener('submit', e => {
    e.preventDefault();
    if (!$('#consent').checked) { $('#consent').focus(); return; }
    $('#start').hidden = true; $('#notebtn').textContent = 'Note';
    startRun({ participant: $('#pcode').value.trim().slice(0, 24), eye: +document.querySelector('input[name="eye"]:checked').value,
      opts: { collapse: $('#o-collapse').checked, power: $('#o-power').checked, smoke: $('#o-smoke').checked, shake: $('#o-shake').checked, sound: $('#o-sound').checked } });
  });
  nextFrame(frame);
}

addEventListener('resize', resize); resize();
let last = performance.now(), uiT = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000) * SPEED; last = now;
  if ($('#report').hidden) {
    if (E.review) { move(dt); applyCamera(null); }
    else if (E.started && !E.done) {
      move(dt); scenario(dt);
      tickHazards(dt, E.run.t); tickDoors(dt, E.pos.x, E.pos.z);
      E.env = { power: HZ.power, fog: HZ.fog ? HZ.fog.density : 0 };
      applyCamera(shakeOffset(dt));
      const ex = track(dt);
      $('#eclock').textContent = clockFmt(E.run.t);
      if (ex) finish('exit', ex); else if (E.run.t >= room().timeLimit) finish('time');
      if ((uiT += dt) > 0.25) { uiT = 0; if (!E.subject) renderPanel(); }
    } else { tickHazards(dt, performance.now() / 1000); if (E.done) tickDoors(dt, E.pos.x, E.pos.z); applyCamera(null); }
  }
  renderer.render(scene, camera);
  nextFrame(frame);
}
boot();
