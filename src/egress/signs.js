// Safety-sign faces drawn on canvases: an ISO 7010 E001-style running figure with a door and an
// arrow, a superseded text-only "EXIT" sign, a lift prohibition sign and a "NO EXIT" sign.
// The arrow is chosen per face from the sign's world direction, so hanging signs read correctly
// from both sides.
import * as THREE from 'three';

const GREEN = '#0B7A43', RED = '#C8102E', WHITE = '#FFFFFF', INK = '#1A1A1A';

// Which arrow a viewer sees: the face looks along `face` (the viewer looks the opposite way)
const V = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
export function arrowFor(face, points) {
  if (!points) return null;
  const f = V[face], d = V[points], fwd = [-f[0], -f[1]], right = [-fwd[1], fwd[0]];
  const a = d[0] * fwd[0] + d[1] * fwd[1], r = d[0] * right[0] + d[1] * right[1];
  if (a > 0.7) return 'up'; if (a < -0.7) return 'down';
  return r > 0 ? 'right' : 'left';
}

function figure(c, x, y, s, mirror) {
  c.save(); c.translate(x, y); c.scale(mirror ? -s : s, s); if (mirror) c.translate(-1, 0);
  c.strokeStyle = WHITE; c.fillStyle = WHITE; c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = 0.1;
  c.beginPath(); c.arc(0.56, 0.13, 0.09, 0, Math.PI * 2); c.fill();
  const line = pts => { c.beginPath(); c.moveTo(...pts[0]); pts.slice(1).forEach(p => c.lineTo(...p)); c.stroke(); };
  c.lineWidth = 0.13; line([[0.5, 0.28], [0.38, 0.57]]);
  c.lineWidth = 0.085;
  line([[0.49, 0.32], [0.64, 0.43], [0.78, 0.34]]);
  line([[0.47, 0.32], [0.32, 0.39], [0.22, 0.29]]);
  line([[0.38, 0.57], [0.56, 0.71], [0.53, 0.93]]);
  line([[0.38, 0.57], [0.25, 0.75], [0.07, 0.79]]);
  c.restore();
}
function door(c, x, y, w, h, lw) {
  c.strokeStyle = WHITE; c.lineWidth = lw; c.strokeRect(x, y, w, h);
}
function arrow(c, cx, cy, s, dir) {
  c.save(); c.translate(cx, cy);
  c.rotate({ right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[dir]);
  c.fillStyle = WHITE; c.beginPath();
  c.moveTo(-0.42 * s, -0.11 * s); c.lineTo(0.06 * s, -0.11 * s); c.lineTo(0.06 * s, -0.3 * s); c.lineTo(0.44 * s, 0);
  c.lineTo(0.06 * s, 0.3 * s); c.lineTo(0.06 * s, 0.11 * s); c.lineTo(-0.42 * s, 0.11 * s); c.closePath(); c.fill();
  c.restore();
}

export function drawSign(kind, arrowDir, [wmm, hmm]) {
  const H = 256, W = Math.round(H * wmm / hmm), cv = document.createElement('canvas');
  cv.width = W; cv.height = H; const c = cv.getContext('2d');
  if (kind === 'exit') {
    c.fillStyle = GREEN; c.fillRect(0, 0, W, H);
    c.strokeStyle = WHITE; c.lineWidth = 6; c.strokeRect(5, 5, W - 10, H - 10);
    const sq = H - 40, left = arrowDir === 'left';
    // pictogram square (figure + door) and arrow square, divided by a white rule
    const px = left ? W - 20 - sq : 20, ax = left ? 20 : W - 20 - sq;
    door(c, left ? px + 8 : px + sq * 0.52, 30, sq * 0.4, sq - 20, 8);
    figure(c, left ? px + sq * 0.35 : px + 4, 34, sq * 0.62, left);
    if (arrowDir) {
      c.fillStyle = WHITE; c.fillRect(left ? ax + sq + 6 : ax - 10, 18, 4, H - 36);
      arrow(c, ax + sq / 2, H / 2, sq * 0.95, arrowDir);
    }
  } else if (kind === 'text') {
    c.fillStyle = '#2E7D4F'; c.fillRect(0, 0, W, H);
    c.fillStyle = WHITE; c.font = `800 ${H * 0.52}px Arial, sans-serif`; c.textBaseline = 'middle';
    const left = arrowDir === 'left';
    c.textAlign = left ? 'right' : 'left'; c.fillText('EXIT', left ? W - 26 : 26, H / 2 + 6);
    if (arrowDir) arrow(c, left ? H * 0.55 : W - H * 0.55, H / 2, H * 0.8, arrowDir);
    // age: faded, scuffed
    c.fillStyle = 'rgba(255,240,200,0.18)'; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(60,50,30,${Math.random() * 0.12})`; c.fillRect(Math.random() * W, Math.random() * H, 3, 2); }
  } else if (kind === 'nolift') {
    c.fillStyle = WHITE; c.fillRect(0, 0, W, H);
    c.strokeStyle = INK; c.lineWidth = 4; c.strokeRect(4, 4, W - 8, H - 8);
    const r = H * 0.27, cx = W / 2, cy = H * 0.36;
    c.fillStyle = INK; c.fillRect(cx - r * 0.45, cy - r * 0.6, r * 0.9, r * 1.2);
    c.fillStyle = WHITE; c.beginPath(); c.moveTo(cx, cy - r * 0.42); c.lineTo(cx - r * 0.22, cy - r * 0.12); c.lineTo(cx + r * 0.22, cy - r * 0.12); c.fill();
    c.beginPath(); c.moveTo(cx, cy + r * 0.42); c.lineTo(cx - r * 0.22, cy + r * 0.12); c.lineTo(cx + r * 0.22, cy + r * 0.12); c.fill();
    c.strokeStyle = RED; c.lineWidth = r * 0.2; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(cx - r * 0.7, cy - r * 0.7); c.lineTo(cx + r * 0.7, cy + r * 0.7); c.stroke();
    c.fillStyle = INK; c.textAlign = 'center'; c.font = `700 ${H * 0.085}px Arial, sans-serif`;
    c.fillText('IN CASE OF FIRE', cx, H * 0.78); c.fillText('DO NOT USE LIFT', cx, H * 0.9);
  } else if (kind === 'noexit') {
    c.fillStyle = RED; c.fillRect(0, 0, W, H);
    c.strokeStyle = WHITE; c.lineWidth = 6; c.strokeRect(6, 6, W - 12, H - 12);
    c.fillStyle = WHITE; c.font = `800 ${H * 0.46}px Arial, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('NO EXIT', W / 2, H / 2 + 4);
  }
  const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
  return t;
}

// Material by illumination: lit signs glow (unaffected by room light), photoluminescent signs glow
// faintly green in the dark, unlit signs depend entirely on the room light.
export function signMaterial(map, illum) {
  if (illum === 'internal') return new THREE.MeshBasicMaterial({ map, toneMapped: false, color: 0xEDEDED });
  const m = new THREE.MeshStandardMaterial({ map, roughness: 0.55, envMapIntensity: 0.4 });
  if (illum === 'photolum') { m.emissive = new THREE.Color(0x9BE88A); m.emissiveMap = map; m.emissiveIntensity = 0.06; }
  return m;
}
