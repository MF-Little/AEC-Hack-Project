// Top-down plan: walls, both window walls, furniture footprints, area zones, path, captures, viewer.
// Also used as the base drawing for the plan heatmap.
import { S } from '../state.js';
import { camera } from '../scene/core.js';
import { built } from '../scene/builder.js';

export function planFrame(cv, big) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = cv.clientWidth, ch = cv.clientHeight; if (!cw || !ch) return null;
  if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, cw, ch);
  const { w: W, d: D } = S.room.size, T = S.room.wallT, pad = big ? 30 : 8;
  const sc = Math.min((cw - 2 * pad) / (W + 2 * T), (ch - 2 * pad) / (D + 2 * T));
  const css = getComputedStyle(document.documentElement);
  const col = k => css.getPropertyValue(k).trim();
  return { c, cw, ch, dpr, sc, W, D, T, X: x => cw / 2 + x * sc, Z: z => ch / 2 + z * sc, ink: col('--ink'), sig: col('--signal'), mute: col('--mute'), rule: col('--rule') };
}

export function drawFurniture(f) {
  const { c, X, Z, sc, mute } = f;
  c.fillStyle = mute; c.globalAlpha = 0.25;
  built.furnColliders.forEach(([a, b, z0, z1]) => c.fillRect(X(a), Z(z0), (b - a) * sc, (z1 - z0) * sc));
  c.globalAlpha = 1;
}

export function drawWalls(f) {
  const { c, X, Z, sc, W, D, T, ink, sig } = f, room = S.room;
  c.fillStyle = ink;
  c.fillRect(X(-W / 2 - T), Z(-D / 2 - T), (W + 2 * T) * sc, T * sc);
  c.fillRect(X(-W / 2 - T), Z(D / 2), (W + 2 * T) * sc, T * sc);
  c.fillRect(X(-W / 2 - T), Z(-D / 2 - T), T * sc, (D + 2 * T) * sc);
  c.fillRect(X(W / 2), Z(-D / 2 - T), T * sc, (D + 2 * T) * sc);
  const N = room.facades.north, Sth = room.facades.south;
  c.strokeStyle = sig; c.lineWidth = 2;
  N.xs.forEach(x => {
    c.clearRect(X(x - N.w / 2), Z(-D / 2 - T) - 1, N.w * sc, T * sc + 2);
    c.beginPath(); c.moveTo(X(x - N.w / 2), Z(-D / 2 - T / 2)); c.lineTo(X(x + N.w / 2), Z(-D / 2 - T / 2)); c.stroke();
  });
  Sth.xs.forEach(x => {
    c.clearRect(X(x - Sth.w / 2), Z(D / 2) - 1, Sth.w * sc, T * sc + 2);
    c.beginPath(); c.moveTo(X(x - Sth.w / 2), Z(D / 2 + T / 2)); c.lineTo(X(x + Sth.w / 2), Z(D / 2 + T / 2)); c.stroke();
    c.lineWidth = 1; c.beginPath(); c.arc(X(x), Z(D / 2 + T / 2), Sth.w / 2 * sc, Math.PI, 0, true); c.stroke(); c.lineWidth = 2;
  });
  c.lineWidth = 1;
}

export function drawPlan(cv, big) {
  if (!S.session) return;
  const f = planFrame(cv, big); if (!f) return;
  const { c, X, Z, sc, sig, ink, mute } = f, { D, T } = f;
  drawFurniture(f);
  drawWalls(f);
  c.strokeStyle = sig; c.setLineDash([4, 4]);
  S.zones.forEach(z => { c.beginPath(); c.arc(X(z.x), Z(z.z), z.r * sc, 0, Math.PI * 2); c.stroke(); });
  c.setLineDash([]);
  c.fillStyle = mute; c.textAlign = 'center'; c.font = `${big ? 12 : 9}px "IBM Plex Mono", monospace`;
  S.zones.forEach(z => c.fillText(z.name, X(z.x), Z(z.z) + (big ? 4 : 3)));
  if (big) { c.fillText('rectangular windows', X(0), Z(-D / 2 - T) - 10); c.fillText('arched windows', X(0), Z(D / 2 + T) + 18); }
  const pts = S.session.path;
  if (pts.length > 1) {
    c.strokeStyle = ink; c.globalAlpha = 0.55; c.lineWidth = big ? 1.6 : 1.1; c.lineJoin = 'round';
    c.beginPath(); pts.forEach(([x, z], i) => i ? c.lineTo(X(x), Z(z)) : c.moveTo(X(x), Z(z))); c.stroke();
    c.globalAlpha = 1; c.lineWidth = 1;
  }
  c.fillStyle = sig;
  S.session.captures.forEach(k => { c.beginPath(); c.arc(X(k.x), Z(k.z), big ? 4.5 : 2.5, 0, Math.PI * 2); c.fill(); });
  const p = camera.position;
  c.globalAlpha = 0.2; c.beginPath(); c.moveTo(X(p.x), Z(p.z));
  c.arc(X(p.x), Z(p.z), (big ? 2.2 : 1.8) * sc, -Math.PI / 2 - S.yaw - 0.55, -Math.PI / 2 - S.yaw + 0.55); c.closePath(); c.fill();
  c.globalAlpha = 1; c.fillStyle = ink;
  c.beginPath(); c.arc(X(p.x), Z(p.z), big ? 4.5 : 3, 0, Math.PI * 2); c.fill();
}
