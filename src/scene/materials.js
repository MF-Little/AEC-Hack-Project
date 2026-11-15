// Materials and procedural textures. Colours are written as sRGB hex and converted to linear
// for the physically based pipeline. Wall textures repeat per metre (wall UVs are in metres).
import * as THREE from 'three';
import { hex } from '../util.js';

const ENV = 0.85;   // how strongly the environment map lights each material
const lin = c => new THREE.Color(c).convertSRGBToLinear();
export function std(color, extra = {}) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.9, envMapIntensity: ENV, ...extra });
  m.color.copy(lin(color));
  if (extra.emissive !== undefined) m.emissive.copy(lin(extra.emissive));
  return m;
}

function canvasTex(size, draw, metres = 1, w = size) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = size;
  draw(cv.getContext('2d'), w, size);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / metres, 1 / metres);
  t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
  return t;
}
const noise = (c, w, h, n, alpha, size = 1.4) => { for (let i = 0; i < n; i++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${alpha})`; c.fillRect(Math.random() * w, Math.random() * h, size, size); } };

// Oak floor: 180 mm planks with staggered joints; one tile = 1.8 x 1.8 m
const floorTex = canvasTex(512, (c, w, h) => {
  const rows = 10, ph = h / rows, tones = ['#C9AA80', '#C2A177', '#CFB088', '#BE9C70', '#C6A67C', '#CBAD85'];
  for (let r = 0; r < rows; r++) {
    let x = -((r * 173) % 300);
    while (x < w) {
      const len = 220 + ((r * 37 + x) % 160);
      c.fillStyle = tones[(r * 3 + Math.floor(x / 97)) % tones.length]; c.fillRect(x, r * ph, len, ph);
      c.strokeStyle = 'rgba(90,60,30,0.13)'; c.lineWidth = 1;
      for (let k = 0; k < 6; k++) { c.beginPath(); const y = r * ph + 4 + k * (ph - 8) / 5; c.moveTo(x, y); c.bezierCurveTo(x + len * 0.3, y + 2, x + len * 0.6, y - 2, x + len, y + 1); c.stroke(); }
      c.fillStyle = 'rgba(60,40,20,0.35)'; c.fillRect(x, r * ph, 1.5, ph);
      x += len;
    }
    c.fillStyle = 'rgba(60,40,20,0.3)'; c.fillRect(0, r * ph, w, 1.2);
  }
  noise(c, w, h, 4000, 0.04);
}, 1.8);

const plasterTex = canvasTex(256, (c, w, h) => {
  c.fillStyle = '#F1EADF'; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 60; i++) { const g = c.createRadialGradient((i * 83) % w, (i * 47) % h, 0, (i * 83) % w, (i * 47) % h, 30 + (i % 5) * 8); g.addColorStop(0, `rgba(${i % 2 ? '255,255,255' : '180,165,140'},0.05)`); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); }
  noise(c, w, h, 3000, 0.015, 1.5);
}, 1.5);

const oakTex = canvasTex(256, (c, w, h) => {
  const tones = ['#C9AE86', '#C3A67C', '#CDB38D', '#BFA176', '#C7AB82'], bw = w / 10;
  for (let i = 0; i < 10; i++) {
    c.fillStyle = tones[(i * 3) % tones.length]; c.fillRect(i * bw, 0, bw, h);
    c.strokeStyle = 'rgba(90,60,30,0.12)';
    for (let k = 0; k < 5; k++) { c.beginPath(); const x = i * bw + 3 + k * (bw - 6) / 4; c.moveTo(x, 0); c.bezierCurveTo(x + 2, h * 0.3, x - 2, h * 0.7, x + 1, h); c.stroke(); }
    c.fillStyle = 'rgba(50,32,16,0.45)'; c.fillRect(i * bw, 0, 1.5, h);
  }
}, 1.2);

const concreteTex = canvasTex(256, (c, w, h) => {
  c.fillStyle = '#B4B1AB'; c.fillRect(0, 0, w, h);
  const bh = h / 8;
  for (let i = 0; i < 8; i++) {
    c.fillStyle = i % 2 ? '#AEABA5' : '#B9B6B0'; c.fillRect(0, i * bh, w, bh - 1);
    c.fillStyle = '#96938D'; c.fillRect(0, i * bh + bh - 1, w, 1);
    for (let k = 0; k < 8; k++) { c.fillStyle = 'rgba(100,96,90,0.18)'; c.fillRect((i * 53 + k * 47) % w, i * bh + 4 + (k % 4) * 6, 30 + k * 9, 1); }
  }
  noise(c, w, h, 6000, 0.06, 1.6);
  for (let k = 0; k < 50; k++) { c.fillStyle = 'rgba(80,78,74,0.3)'; c.beginPath(); c.arc((k * 97) % w, (k * 61) % h, 1.3, 0, 7); c.fill(); }
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
  const t = canvasTex(128, (c, w, h) => {
    c.fillStyle = '#CFC8A2'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 3) { c.fillStyle = y % 6 ? 'rgba(120,110,70,0.12)' : 'rgba(255,255,255,0.10)'; c.fillRect(0, y, w, 1); }
  }, 1);
  t.repeat.set(3, 2); return t;
})();

const grassTex = canvasTex(256, (c, w, h) => { c.fillStyle = '#7E9566'; c.fillRect(0, 0, w, h); noise(c, w, h, 12000, 0.08, 2); }, 4);

// Soft contact shadow under furniture: a blurred dark rectangle
export const blobTex = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const c = cv.getContext('2d'); c.filter = 'blur(14px)';
  c.fillStyle = 'rgba(0,0,0,1)'; c.fillRect(26, 26, 76, 76);
  return new THREE.CanvasTexture(cv);
})();
export const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: blobTex, transparent: true, opacity: 0.38, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });

floorTex.repeat.set(1 / 1.8, 1 / 1.8);
export const M = {
  wall: std(0xffffff, { map: plasterTex, roughness: 0.95 }),   // the switchable wall finish
  floor: std(0xffffff, { map: floorTex, roughness: 0.55 }),
  ceil: std(0xFAF8F4, { roughness: 1, envMapIntensity: 1.3 }),
  core: std(0xffffff, { map: plasterTex, roughness: 0.95 }),
  column: std(0xF3F0EA, { roughness: 0.9 }),
  spandrel: std(0x2A2D30, { roughness: 0.15, metalness: 0.4 }),
  skirting: std(0xE9E5DD, { roughness: 0.6 }),
  door: std(0xD9CDB8, { roughness: 0.6 }),
  doorFrame: std(0xE9E5DD, { roughness: 0.5 }),
  handle: std(0x4A4744, { roughness: 0.3, metalness: 0.8 }),
  sill: std(0xE4E0D8, { roughness: 0.4 }),
  frame: std(0x2F2D2B, { roughness: 0.45, metalness: 0.5 }),
  light: new THREE.MeshBasicMaterial({ color: 0xFFF6E8 }),
  grass: std(0xffffff, { map: grassTex, roughness: 1 }),
  paving: std(0xC9C4BA, { roughness: 0.9 }),
  hedge: std(0x4F6A3E, { roughness: 1, flatShading: true }),
  leaf: std(0x5F7F48, { roughness: 1, flatShading: true }),
  trunk: std(0x5A4632, { roughness: 1 }),
  building: std(0xD8D2C8, { roughness: 0.9 }),
  tatami: std(0xffffff, { map: tatamiTex, roughness: 1 })
};
// The test glass and the walls switch, so their textures need the floor's repeat logic too
M.wall.map.repeat.set(1 / 1.5, 1 / 1.5);

export const WALL_FINISH = {
  plaster:  { color: 0xffffff, map: plasterTex, roughness: 0.95 },
  oak:      { color: 0xffffff, map: oakTex, roughness: 0.6 },
  concrete: { color: 0xffffff, map: concreteTex, roughness: 0.9 }
};
export function setWallFinish(id) {
  const f = WALL_FINISH[id]; if (!f) return;
  for (const m of [M.wall]) { m.color.copy(lin(f.color)); m.map = f.map; m.roughness = f.roughness; m.needsUpdate = true; }
}

// Edges are kept as a no-op hook: the realistic look draws no outlines.
export const edgeMat = new THREE.LineBasicMaterial({ color: 0x8E8B83 });

export const glassMat = new THREE.MeshPhysicalMaterial({ transparent: true, roughness: 0.04, metalness: 0, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.2, reflectivity: 0.6 });
export function setGlass(def) {
  glassMat.color.copy(lin(hex(def.color)));
  glassMat.opacity = def.frit ? 1 : Math.max(def.opacity, 0.12);
  glassMat.map = def.frit ? fritTex : null;
  glassMat.needsUpdate = true;
}

// Furniture palettes, one per style. Materials are made once and reused.
const PAL = {
  japanese: { wood: 0xD9C29A, dark: 0x3A3530, fabric: 0xE3DCCB, accent: 0x9AA383, rug: 'tatami', paper: 0xF7F2E6, metal: 0x3A3530, plant: 0x6F8A55, pot: 0x5B544C, book: [0xC9BFA9, 0x8E8A7A, 0xB5A98C] },
  latin:    { wood: 0x5E3B22, dark: 0x352015, fabric: 0xB25C38, accent: 0xC4923F, rug: 0xC4A574, paper: 0xD9B98A, metal: 0x2E2A26, plant: 0x667F55, pot: 0xAE5E38, book: [0xB25C38, 0x667F55, 0xC4923F] },
  scandi:   { wood: 0xDCC9A8, dark: 0x2B2B2B, fabric: 0xB8BAB8, accent: 0xF0EFEB, rug: 0xD8D5CF, paper: 0xF4F3F0, metal: 0x2B2B2B, plant: 0x5E7F52, pot: 0xEDEBE6, book: [0xD9D6CF, 0x8E9A9B, 0xC9B79F] }
};
const cache = {};
export function palette(style) {
  if (cache[style]) return cache[style];
  const p = PAL[style], m = {};
  for (const [k, v] of Object.entries(p)) {
    if (k === 'rug') m.rug = v === 'tatami' ? M.tatami : std(v, { roughness: 1 });
    else if (k === 'book') m.book = v.map(c => std(c, { roughness: 0.8 }));
    else if (k === 'paper') m.paper = std(v, { roughness: 1, emissive: v, emissiveIntensity: 0.6, side: THREE.DoubleSide });
    else if (k === 'metal') m.metal = std(v, { roughness: 0.35, metalness: 0.7 });
    else if (k === 'plant') m.plant = std(v, { roughness: 1, flatShading: true });
    else if (k === 'fabric') m.fabric = std(v, { roughness: 1, envMapIntensity: 0.4 });
    else m[k] = std(v, { roughness: k === 'wood' || k === 'dark' ? 0.55 : 0.85 });
  }
  m.rattan = std(0xC4A574, { roughness: 1, side: THREE.DoubleSide });
  m.linen = std(0xF1EEE7, { roughness: 1 });
  return (cache[style] = m);
}
