// What makes the run feel urgent: an alarm (sound and red beacons), camera shake, stock falling
// from the racking into an aisle, a power cut that leaves only emergency lighting, and smoke.
// Each one is a switch on the start screen.
import * as THREE from 'three';
import { scene, hemi, sun, renderer } from '../scene/core.js';
import { B, MT, setLoadVisible, restoreLoads } from './build.js';

const ambient = scene.children.find(o => o.isAmbientLight);
const LIT = { hemi: 1.0, ambient: 0.3, sun: 1.7, exposure: 1.0 };
export const HZ = { shakes: [], bodies: [], dust: null, power: 1, flicker: 0, fog: null, fogTarget: 0, alarmOn: false, blocker: null, extra: [] };

export function setupLighting() {
  hemi.color.set(0xDCE4F0); hemi.groundColor.set(0x8A8A84);
  sun.position.set(6, 30, 5); sun.target.position.set(0, 0, 0); sun.color.set(0xF4F6FF);
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 16, bottom: -16, near: 5, far: 50 }); sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.mapSize.set(4096, 4096); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  HZ.fog = new THREE.FogExp2(0x55585C, 0); scene.fog = HZ.fog;
  setPower(true, true);
}

export function setPower(on, instant = false) {
  HZ.power = on ? 1 : 0;
  if (instant) applyPower(on ? 1 : 0);
  else HZ.flicker = 1.4;
}
function applyPower(k) {
  // the environment map lights every material on its own; it has to dim with the power too
  scene.traverse(o => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of ms) if (m.envMapIntensity !== undefined) { if (m.userData.env0 === undefined) m.userData.env0 = m.envMapIntensity; m.envMapIntensity = m.userData.env0 * (0.03 + 0.97 * k); } });
  hemi.intensity = LIT.hemi * (0.06 + 0.94 * k);
  if (ambient) ambient.intensity = LIT.ambient * (0.08 + 0.92 * k);
  sun.intensity = LIT.sun * k;
  renderer.toneMappingExposure = LIT.exposure + (1 - k) * 0.55;
  MT.highbay.color.set(k > 0.5 ? 0xF4F6FF : 0x2A2C30);
  MT.emerg.color.set(k > 0.5 ? 0x9A9A96 : 0xFFFFFF);
  B.emergLights.forEach(l => { l.intensity = k > 0.5 ? 0 : 9; });
  for (const id in B.signs) B.signs[id].mats.forEach(m => { if (m.emissiveMap) m.emissiveIntensity = k > 0.5 ? 0.06 : 0.55; });
}

// ---------- shake ----------
export function shake(amp, dur) { if (HZ.shakeScale) HZ.shakes.push({ amp: amp * HZ.shakeScale, dur, t: 0 }); }
export function shakeOffset(dt) {
  let a = 0;
  HZ.shakes = HZ.shakes.filter(s => { s.t += dt; const k = s.t / s.dur; if (k >= 1) return false; a += s.amp * (1 - k) * (1 - k) * Math.min(1, s.t * 12); return true; });
  if (!a) return null;
  const t = performance.now() / 1000;
  const n = f => Math.sin(t * f) * 0.6 + Math.sin(t * f * 2.31 + 1.7) * 0.4;
  return { x: a * 0.035 * n(23), y: a * 0.025 * n(31), z: a * 0.035 * n(19), rx: a * 0.018 * n(27), rz: a * 0.022 * n(17) };
}

// ---------- falling stock ----------
// Takes the loads off the rack faces either side of an aisle site and drops them across it.
export function collapse(site, room) {
  const [x0, x1, z0, z1] = site.rect, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, g = 9.81;
  const picked = [];
  for (const id in B.racks) B.racks[id].loads.forEach((b, i) => {
    if (b.level < 1) return;
    const near = site.axis === 'x'
      ? b.x > x0 - 0.9 && b.x < x1 + 0.9 && (Math.abs(b.z - z0) < 1.3 || Math.abs(b.z - z1) < 1.3)
      : b.z > z0 - 0.4 && b.z < z1 + 0.4 && (Math.abs(b.x - x0) < 1.5 || Math.abs(b.x - x1) < 1.5);
    if (near) picked.push({ id, i, b });
  });
  picked.sort((p, q) => q.b.y - p.b.y);
  const use = picked.slice(0, 14);
  // a single-depth run holds few loads near the site: top up with stock from the upper levels
  const cols = [0xB8946A, 0xC4A177, 0xD9D4C8, 0x6F8FB0, 0xA9845A];
  while (use.length < 12) {
    const fx = x0 + Math.random() * (x1 - x0), fz = site.axis === 'x' ? (Math.random() < 0.5 ? z0 - 0.5 : z1 + 0.5) : z0 + Math.random() * (z1 - z0);
    use.push({ id: null, b: { x: fx, y: 2 + Math.random() * 3, z: fz, w: 0.9, h: 0.6 + Math.random() * 0.4, d: 0.9, c: new THREE.Color(cols[use.length % cols.length]).convertSRGBToLinear() } });
  }
  // landing spots spread over the whole aisle width so it is really blocked
  const nx = site.axis === 'x' ? 2 : 3, nz = site.axis === 'x' ? 3 : 2, spots = [];
  for (let L = 0; L < 3; L++) for (let a = 0; a < nx; a++) for (let c = 0; c < nz; c++) spots.push([x0 + (a + 0.5) * (x1 - x0) / nx, L, z0 + (c + 0.5) * (z1 - z0) / nz]);
  const height = [];
  use.forEach(({ id, i, b }, k) => {
    if (id) setLoadVisible(id, i, false);
    const [tx, L, tz] = spots[k % spots.length], key = `${tx.toFixed(2)},${tz.toFixed(2)}`;
    const base = height[key] || 0, hh = Math.min(b.h, 0.9), ty = base + hh / 2; height[key] = base + hh * 0.85;
    const mat = new THREE.MeshStandardMaterial({ color: b.c.clone(), roughness: 0.85, envMapIntensity: 0.85 * (HZ.power ? 1 : 0.03) }); mat.userData.env0 = 0.85;
    const m = new THREE.Mesh(new THREE.BoxGeometry(b.w, hh, b.d * 0.95), mat); m.position.set(b.x, b.y, b.z); m.castShadow = m.receiveShadow = true;
    m.userData.tag = 'COLLAPSE'; scene.add(m); HZ.extra.push(m); B.targets.push(m);
    const T = Math.sqrt(2 * Math.max(0.3, b.y - ty) / g) * (0.9 + Math.random() * 0.3), delay = k * 0.07 + Math.random() * 0.1;
    HZ.bodies.push({ m, p0: m.position.clone(), to: new THREE.Vector3(tx + (Math.random() - 0.5) * 0.3, ty, tz + (Math.random() - 0.5) * 0.3), T, t: -delay,
      spin: new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 6), rest: new THREE.Euler((Math.random() - 0.5) * 0.5, Math.random() * Math.PI, (Math.random() - 0.5) * 0.5) });
  });
  // a buckled beam lying across the aisle
  const beam = new THREE.Mesh(new THREE.BoxGeometry(site.axis === 'x' ? 2.6 : 0.12, 0.12, site.axis === 'x' ? 0.12 : 2.6), MT.rackOrange);
  beam.position.set(cx, 0.35, cz); beam.rotation.y = 0.5; beam.rotation.z = 0.25; beam.castShadow = true; beam.userData.tag = 'COLLAPSE';
  beam.visible = false; scene.add(beam); HZ.extra.push(beam); HZ.beam = { m: beam, t: 0.6 };
  dust(cx, cz);
  HZ.blocker = [x0, x1, z0, z1];
  return { site: site.id, rect: [x0, x1, z0, z1], boxes: use.length };
}
function dust(x, z) {
  const n = 420, g = new THREE.BufferGeometry(), p = new Float32Array(n * 3), v = [];
  for (let i = 0; i < n; i++) { p[i * 3] = x + (Math.random() - 0.5) * 2; p[i * 3 + 1] = Math.random() * 1.2; p[i * 3 + 2] = z + (Math.random() - 0.5) * 2; v.push([(Math.random() - 0.5) * 2.4, Math.random() * 1.1, (Math.random() - 0.5) * 2.4]); }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const m = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xB9B3A6, size: 0.18, transparent: true, opacity: 0.55, depthWrite: false }));
  scene.add(m); HZ.extra.push(m); HZ.dust = { m, v, t: 0 };
}

export function tickHazards(dt, t) {
  for (const b of HZ.bodies) {
    if (b.done) continue; b.t += dt; if (b.t < 0) continue;
    const k = Math.min(1, b.t / b.T), m = b.m;
    m.position.lerpVectors(b.p0, b.to, k); m.position.y = b.p0.y + (b.to.y - b.p0.y) * k * k;
    m.rotation.x += b.spin.x * dt; m.rotation.y += b.spin.y * dt; m.rotation.z += b.spin.z * dt;
    if (k >= 1) { m.rotation.copy(b.rest); b.done = true; }
  }
  if (HZ.beam) { HZ.beam.t -= dt; if (HZ.beam.t <= 0) { HZ.beam.m.visible = true; HZ.beam = null; } }
  if (HZ.dust) {
    const d = HZ.dust; d.t += dt; const a = d.m.geometry.attributes.position;
    for (let i = 0; i < d.v.length; i++) { a.array[i * 3] += d.v[i][0] * dt; a.array[i * 3 + 1] += d.v[i][1] * dt; a.array[i * 3 + 2] += d.v[i][2] * dt; d.v[i][0] *= 0.97; d.v[i][1] *= 0.97; d.v[i][2] *= 0.97; }
    a.needsUpdate = true; d.m.material.opacity = Math.max(0, 0.55 * (1 - d.t / 6)); if (d.t > 6) { d.m.visible = false; HZ.dust = null; }
  }
  // power: flicker for a moment, then settle
  if (HZ.flicker > 0) { HZ.flicker -= dt; applyPower(HZ.flicker > 0 ? (Math.random() < 0.45 ? 1 : 0.1) : HZ.power); }
  // smoke thickens towards its target
  if (HZ.fog) HZ.fog.density += (HZ.fogTarget - HZ.fog.density) * Math.min(1, dt * 0.06);
  if (HZ.fog) HZ.fog.color.set(HZ.power ? 0x6A6C70 : 0x26282B);
  // alarm beacons flash
  const on = HZ.alarmOn && (t % 1) < 0.18;
  for (const b of B.beacons) b.m.material.color.set(on ? (b.amber ? 0xFFB020 : 0xFF2A1A) : (b.amber ? 0x5A3A10 : 0x401010));
}

export function resetHazards() {
  HZ.shakes = []; HZ.bodies = []; HZ.beam = null; HZ.dust = null; HZ.blocker = null; HZ.alarmOn = false; HZ.fogTarget = 0;
  if (HZ.fog) HZ.fog.density = 0;
  HZ.extra.forEach(o => { scene.remove(o); o.geometry && o.geometry.dispose(); }); HZ.extra = [];
  B.targets = B.targets.filter(o => o.userData.tag !== 'COLLAPSE');
  restoreLoads(); setPower(true, true); HZ.flicker = 0;
}

// ---------- sound (Web Audio, made on the fly: no files) ----------
let ac = null, alarmNodes = null;
export function startAlarm() {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)(); ac.resume();
    const o = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain(), f = ac.createBiquadFilter(), g = ac.createGain();
    o.type = 'square'; o.frequency.value = 885; lfo.type = 'square'; lfo.frequency.value = 1; lg.gain.value = 85;
    f.type = 'lowpass'; f.frequency.value = 2200; g.gain.value = 0;
    lfo.connect(lg); lg.connect(o.frequency); o.connect(f); f.connect(g); g.connect(ac.destination);
    o.start(); lfo.start(); g.gain.linearRampToValueAtTime(0.035, ac.currentTime + 0.4);
    alarmNodes = { o, lfo, g };
  } catch (e) { alarmNodes = null; }
}
export function stopAlarm() {
  if (!alarmNodes || !ac) return; const { o, lfo, g } = alarmNodes; alarmNodes = null;
  try { g.gain.cancelScheduledValues(ac.currentTime); g.gain.setValueAtTime(g.gain.value, ac.currentTime); g.gain.linearRampToValueAtTime(0, ac.currentTime + 0.6); o.stop(ac.currentTime + 0.7); lfo.stop(ac.currentTime + 0.7); } catch (e) {}
}
export function crash(level = 1) {
  if (!ac) return;
  try {
    const len = 2.2, buf = ac.createBuffer(1, ac.sampleRate * len, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) { const t = i / ac.sampleRate; d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 2.2) * (1 + 0.6 * Math.sin(t * 40)); }
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = buf; f.type = 'lowpass'; f.frequency.value = 420; g.gain.value = 0.55 * level;
    s.connect(f); f.connect(g); g.connect(ac.destination); s.start();
    const c = ac.createOscillator(), cg = ac.createGain(); c.type = 'triangle'; c.frequency.value = 180; cg.gain.value = 0.12 * level;
    cg.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.5); c.connect(cg); cg.connect(ac.destination); c.start(); c.stop(ac.currentTime + 0.5);
  } catch (e) {}
}
export function thud() { crash(0.35); }
