// Materials and procedural textures. Wall textures are drawn so that one texture
// repeat equals a fixed size in metres (wall UVs are in metres).
import * as THREE from 'three';
import { hex } from '../util.js';

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });

function canvasTex(size, draw, metres = 1) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  draw(cv.getContext('2d'), size);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / metres, 1 / metres);
  return t;
}

// 1.2 m tiles
const oakTex = canvasTex(256, (c, n) => {
  const tones = ['#C9AE86', '#C3A67C', '#CDB38D', '#BFA176', '#C7AB82'];
  const bw = n / 10;
  for (let i = 0; i < 10; i++) {
    c.fillStyle = tones[(i * 3) % tones.length]; c.fillRect(i * bw, 0, bw, n);
    c.fillStyle = 'rgba(90,60,30,0.10)';
    for (let k = 0; k < 7; k++) c.fillRect(i * bw + 3 + (k * 5) % (bw - 6), (k * 41 + i * 17) % n, 1, 40 + k * 6);
    c.fillStyle = 'rgba(60,40,20,0.35)'; c.fillRect(i * bw, 0, 1.2, n);
  }
}, 1.2);

const concreteTex = canvasTex(256, (c, n) => {
  c.fillStyle = '#B9B6B0'; c.fillRect(0, 0, n, n);
  const bh = n / 8;
  for (let i = 0; i < 8; i++) {
    c.fillStyle = i % 2 ? '#B3B0AA' : '#BEBBB5'; c.fillRect(0, i * bh, n, bh - 1);
    c.fillStyle = '#9C9993'; c.fillRect(0, i * bh + bh - 1, n, 1);
    for (let k = 0; k < 6; k++) { c.fillStyle = 'rgba(110,106,100,0.2)'; c.fillRect((i * 53 + k * 47) % n, i * bh + 6 + (k % 3) * 8, 30 + k * 9, 1); }
  }
  for (let k = 0; k < 40; k++) { c.fillStyle = 'rgba(90,88,84,0.25)'; c.beginPath(); c.arc((k * 97) % n, (k * 61) % n, 1.2, 0, 7); c.fill(); }
}, 1.2);

const fritTex = (() => {
  const t = canvasTex(64, (c) => {
    c.fillStyle = 'rgba(228,236,239,0.10)'; c.fillRect(0, 0, 64, 64);
    c.fillStyle = 'rgba(250,250,247,0.95)';
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { c.beginPath(); c.arc(16 + i * 32, 16 + j * 32, 11.3, 0, Math.PI * 2); c.fill(); }
  }, 1);
  t.repeat.set(9, 9); return t;
})();

const tatamiTex = (() => {
  const t = canvasTex(128, (c, n) => {
    c.fillStyle = '#CFC8A2'; c.fillRect(0, 0, n, n);
    for (let y = 0; y < n; y += 3) { c.fillStyle = y % 6 ? 'rgba(120,110,70,0.12)' : 'rgba(255,255,255,0.10)'; c.fillRect(0, y, n, 1); }
  }, 1);
  t.repeat.set(3, 2); return t;
})();

export const M = {
  wall: std(0xEFE6D6, { roughness: 1 }),          // the switchable wall finish
  floor: std(0xD8CDBD, { roughness: 0.75 }),
  ceil: std(0xF4F3EF, { roughness: 1 }),
  frame: std(0x3B3936, { roughness: 0.5, metalness: 0.3 }),
  outside: std(0xF8F7F3, { roughness: 1 }),
  ground: std(0xE3E1DB, { roughness: 1 }),
  leaf: std(0xD8DDD0, { roughness: 1, flatShading: true }),
  tatami: std(0xffffff, { map: tatamiTex, roughness: 1 })
};

export const WALL_FINISH = {
  plaster:  { color: 0xEFE6D6, map: null, roughness: 1 },
  oak:      { color: 0xffffff, map: oakTex, roughness: 0.7 },
  concrete: { color: 0xffffff, map: concreteTex, roughness: 0.95 }
};
export function setWallFinish(id) {
  const f = WALL_FINISH[id]; if (!f) return;
  M.wall.color.setHex(f.color); M.wall.map = f.map; M.wall.roughness = f.roughness; M.wall.needsUpdate = true;
}

export const edgeMat = new THREE.LineBasicMaterial({ color: 0x8E8B83 });

export const glassMat = new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false });
export function setGlass(def) {
  glassMat.color.setHex(hex(def.color));
  glassMat.opacity = def.opacity;
  glassMat.map = def.frit ? fritTex : null;
  glassMat.needsUpdate = true;
}

// Furniture palettes, one per style. Materials are made once and reused.
const PAL = {
  japanese: { wood: 0xDCC8A4, dark: 0x3A3530, fabric: 0xE6E0D2, accent: 0x9AA383, rug: 'tatami', paper: 0xF7F2E6, metal: 0x3A3530, plant: 0x7E8F6A, pot: 0x5B544C, book: [0xC9BFA9, 0x8E8A7A, 0xB5A98C] },
  latin:    { wood: 0x6B4428, dark: 0x3B2416, fabric: 0xB8653F, accent: 0xC99A4B, rug: 0xC8A97A, paper: 0xD9B98A, metal: 0x2E2A26, plant: 0x6F8A6B, pot: 0xB5653D, book: [0xB8653F, 0x6F8A6B, 0xC99A4B] },
  scandi:   { wood: 0xE3D3B8, dark: 0x2B2B2B, fabric: 0xBFC1C0, accent: 0xF2F1EE, rug: 0xDCDAD5, paper: 0xF4F3F0, metal: 0x2B2B2B, plant: 0x6E8B67, pot: 0xEDEBE6, book: [0xD9D6CF, 0x8E9A9B, 0xC9B79F] }
};
const cache = {};
export function palette(style) {
  if (cache[style]) return cache[style];
  const p = PAL[style], m = {};
  for (const [k, v] of Object.entries(p)) {
    if (k === 'rug') m.rug = v === 'tatami' ? M.tatami : std(v, { roughness: 1 });
    else if (k === 'book') m.book = v.map(c => std(c));
    else if (k === 'paper') m.paper = std(v, { roughness: 1, emissive: v, emissiveIntensity: 0.35, side: THREE.DoubleSide });
    else if (k === 'metal') m.metal = std(v, { roughness: 0.5, metalness: 0.4 });
    else if (k === 'plant') m.plant = std(v, { roughness: 1, flatShading: true });
    else m[k] = std(v, { roughness: k === 'wood' || k === 'dark' ? 0.6 : 0.95 });
  }
  m.rattan = std(0xC4A574, { roughness: 1, side: THREE.DoubleSide });
  return (cache[style] = m);
}
