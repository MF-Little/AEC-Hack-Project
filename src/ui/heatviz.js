// 2D views of the recorded attention heat: a plan (seen from above) and the two window walls unrolled.
// The heat is recorded on its own layer during the walk and never shown to the participant.
import { S } from '../state.js';
import { allCells } from '../scene/heatmap.js';
import { planFrame, drawWalls, drawFurniture } from './plan.js';

const STOPS = [[0, [54, 81, 201]], [0.33, [38, 191, 217]], [0.66, [250, 217, 64]], [1, [235, 64, 38]]];
function ramp(t) {
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i], [t0, c0] = STOPS[i - 1];
    if (t <= t1) { const k = (t - t0) / (t1 - t0); return c0.map((v, j) => Math.round(v + (c1[j] - v) * k)); }
  }
  return STOPS[STOPS.length - 1][1];
}

// Splat weighted points into an offscreen canvas, then colour by accumulated intensity.
function heatLayer(w, h, dpr, pts, radius) {
  const off = document.createElement('canvas'); off.width = Math.round(w * dpr); off.height = Math.round(h * dpr);
  const c = off.getContext('2d'); c.scale(dpr, dpr); c.globalCompositeOperation = 'lighter';
  const max = Math.max(1e-6, ...pts.map(p => p[2]));
  for (const [x, y, wt] of pts) {
    const g = c.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, `rgba(255,255,255,${Math.min(1, wt / max) * 0.5})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  const img = c.getImageData(0, 0, off.width, off.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i + 3] / 255;
    if (v < 0.025) { d[i + 3] = 0; continue; }
    const [r, g, b] = ramp(Math.min(1, v * 1.15));
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = Math.round(255 * Math.min(0.88, 0.2 + v));
  }
  c.putImageData(img, 0, 0);
  return off;
}

export function drawPlanHeat(cv) {
  const f = planFrame(cv, true); if (!f) return;
  const { c, cw, ch, dpr, X, Z, sc, mute } = f;
  drawFurniture(f);
  const pts = allCells().map(k => [X(k.x), Z(k.z), k.w]);
  if (pts.length) { c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(heatLayer(cw, ch, dpr, pts, 0.5 * sc), 0, 0); c.restore(); }
  drawWalls(f);
  c.fillStyle = mute; c.textAlign = 'center'; c.font = '11px "IBM Plex Mono", monospace';
  S.zones.forEach(z => c.fillText(z.name, X(z.x), Z(z.z) + 4));
  const nm = id => (S.objects[id] || { name: '' }).name.toLowerCase();
  c.fillText(nm(S.room.facades.north.id), X(0), Z(-f.D / 2 - f.T) - 10);
  c.fillText(nm(S.room.facades.south.id), X(0), Z(f.D / 2 + f.T) + 18);
}

// One window wall, unrolled: x along the wall, height up. side = 'north' | 'south'.
export function drawElevation(cv, side) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = cv.clientWidth, ch = cv.clientHeight; if (!cw || !ch) return;
  if (cv.width !== Math.round(cw * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, cw, ch);
  const room = S.room, { w: W, d: D, h: H } = room.size, f = room.facades[side];
  const pad = 14, sc = Math.min((cw - 2 * pad) / W, (ch - 2 * pad - 14) / H);
  const ox = (cw - W * sc) / 2, oy = pad + H * sc;
  const X = x => ox + (x + W / 2) * sc, Y = y => oy - y * sc;
  const css = getComputedStyle(document.documentElement);
  const ink = css.getPropertyValue('--ink').trim(), mute = css.getPropertyValue('--mute').trim();
  c.fillStyle = css.getPropertyValue('--paper').trim(); c.fillRect(X(-W / 2), Y(H), W * sc, H * sc);
  const near = side === 'north' ? k => k.z < -D / 2 + 0.5 : k => k.z > D / 2 - 0.5;
  const pts = allCells().filter(near).map(k => [X(k.x), Y(k.y), k.w]);
  if (pts.length) { c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(heatLayer(cw, ch, dpr, pts, 0.45 * sc), 0, 0); c.restore(); }
  c.strokeStyle = ink; c.lineWidth = 1.2;
  c.strokeRect(X(-W / 2), Y(H), W * sc, H * sc);
  if (f.type === 'curtain') {
    c.lineWidth = 1;
    for (let i = 0; i <= f.modules; i++) { const x = -W / 2 + i * W / f.modules; c.beginPath(); c.moveTo(X(x), Y(0)); c.lineTo(X(x), Y(H)); c.stroke(); }
    c.beginPath(); c.moveTo(X(-W / 2), Y(f.transom)); c.lineTo(X(W / 2), Y(f.transom)); c.stroke();
    c.fillStyle = mute; c.font = '9.5px "IBM Plex Mono", monospace'; c.textAlign = 'center';
    for (let i = 0; i < f.modules; i++) c.fillText('M' + String(i + 1).padStart(2, '0'), X(-W / 2 + (i + 0.5) * W / f.modules), Y(H) - 4);
  } else f.xs.forEach(x => {
    const x0 = X(x - f.w / 2), x1 = X(x + f.w / 2), y0 = Y(f.sill);
    c.beginPath();
    if (f.shape === 'arch') { const r = f.w / 2, yc = f.sill + f.h - r; c.moveTo(x0, y0); c.lineTo(x0, Y(yc)); c.arc(X(x), Y(yc), r * sc, Math.PI, 0); c.lineTo(x1, y0); c.closePath(); }
    else c.rect(x0, Y(f.sill + f.h), f.w * sc, f.h * sc);
    c.stroke();
  });
  c.fillStyle = mute; c.font = '10.5px "IBM Plex Mono", monospace';
  c.textAlign = 'left'; c.fillText('west', X(-W / 2), oy + 13);
  c.textAlign = 'right'; c.fillText('east', X(W / 2), oy + 13);
  c.textAlign = 'center'; c.fillText(`${W} m`, X(0), oy + 13);
}
