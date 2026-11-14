// First-person movement: drag to look, WASD / arrows to walk, simple box collision.
import { S, CONFIG } from '../state.js';
import { $, $$ } from '../util.js';
import { camera, canvas } from '../scene/core.js';
import { built } from '../scene/builder.js';

const typing = e => e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
const blocked = () => !(S.started || S.review) || !$('#report').hidden;

export function setupControls({ onNoteKey }) {
  addEventListener('keydown', e => {
    if (typing(e) || blocked()) return;
    if (e.key === 'Enter') { e.preventDefault(); onNoteKey(); return; }
    S.keys.add(e.code);
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  });
  addEventListener('keyup', e => S.keys.delete(e.code));
  addEventListener('blur', () => S.keys.clear());

  let drag = null;
  canvas.addEventListener('pointerdown', e => {
    if (blocked()) return;
    drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); canvas.classList.add('drag');
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    const k = e.pointerType === 'touch' ? 0.006 : 0.0042;
    S.yaw -= (e.clientX - drag.x) * k; S.pitch -= (e.clientY - drag.y) * k;
    S.pitch = Math.max(-1.25, Math.min(1.25, S.pitch));
    drag = { x: e.clientX, y: e.clientY };
  });
  const end = () => { drag = null; canvas.classList.remove('drag'); };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);

  $$('#pad button').forEach(b => {
    const k = b.dataset.k;
    b.addEventListener('pointerdown', e => { e.preventDefault(); S.keys.add(k); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => S.keys.delete(k)));
  });
}

const hits = (x, z) => built.colliders.some(([a, b, c, d]) => x > a - 0.22 && x < b + 0.22 && z > c - 0.22 && z < d + 0.22);

export function move(dt) {
  const k = S.keys, run = k.has('ShiftLeft') || k.has('ShiftRight') ? 2 : 1;
  const sp = CONFIG.walkSpeed * run * dt, turn = CONFIG.turnSpeed * dt;
  let f = 0, s = 0;
  if (k.has('KeyW') || k.has('ArrowUp')) f += 1;
  if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
  if (k.has('KeyD')) s += 1;
  if (k.has('KeyA')) s -= 1;
  if (k.has('ArrowLeft') || k.has('KeyQ')) S.yaw += turn;
  if (k.has('ArrowRight') || k.has('KeyE')) S.yaw -= turn;
  const p = camera.position, ox = p.x, oz = p.z;
  p.x += (-Math.sin(S.yaw) * f + Math.cos(S.yaw) * s) * sp;
  p.z += (-Math.cos(S.yaw) * f - Math.sin(S.yaw) * s) * sp;
  const { w, d } = S.room.size, c = CONFIG.wallClear;
  p.x = Math.max(-w / 2 + c, Math.min(w / 2 - c, p.x));
  p.z = Math.max(-d / 2 + c, Math.min(d / 2 - c, p.z));
  if (hits(p.x, p.z)) { if (!hits(ox, p.z)) p.x = ox; else if (!hits(p.x, oz)) p.z = oz; else { p.x = ox; p.z = oz; } }
  p.y = S.eye;
  if (!S.review) S.session.walked += Math.hypot(p.x - ox, p.z - oz);
  camera.rotation.set(S.pitch, S.yaw, 0);
}

export function placeAtStart() {
  const st = S.room.start;
  camera.position.set(st.x, S.eye, st.z);
  S.yaw = st.yaw; S.pitch = -0.02;
  camera.rotation.set(S.pitch, S.yaw, 0);
  camera.updateMatrixWorld();
}
