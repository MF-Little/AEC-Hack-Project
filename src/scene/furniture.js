// Furniture: four areas (living, dining, study, nook) placed on four spots, plus a fixed kitchen.
// Three styles share the same layout logic. Each area is built facing -z (towards its windows)
// and turned to face whichever side of the room it sits on.
import * as THREE from 'three';
import { scene } from './core.js';
import { palette, blobMat } from './materials.js';
import { built, edges, tagMesh, mergeTargets } from './builder.js';
import { attachOverlays } from './heatmap.js';
import { S, CONFIG } from '../state.js';

let furnRoot = null;
const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const C = (rt, rb, h, seg = 24, open = false, ts = 0, tl = Math.PI * 2) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open, ts, tl);
const HALF_SPHERE = r => new THREE.SphereGeometry(r, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2);

function P(g, geo, mat, x, y, z, tag, { edge = true, shadow = true, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz);
  tagMesh(m, tag, built.furnTargets, shadow);
  if (edge) edges(m, 30);
  g.add(m); return m;
}
const legs4 = (g, mat, tag, x, z, h, r = 0.015) => [[-x, -z], [x, -z], [-x, z], [x, z]].forEach(([a, b]) => P(g, C(r, r, h, 8), mat, a, h / 2, b, tag, { edge: false }));
function plant(g, p, tag, x, z, big = 1) {
  P(g, C(0.22 * big, 0.17 * big, 0.4 * big, 18), p.pot, x, 0.2 * big, z, tag);
  P(g, C(0.02, 0.03, 0.9 * big, 6), p.wood, x, 0.4 * big + 0.45 * big, z, tag, { edge: false });
  P(g, new THREE.IcosahedronGeometry(0.42 * big, 1), p.plant, x, 1.35 * big, z, tag, { sy: 1.3 });
}
function agave(g, p, tag, x, z) {
  P(g, C(0.32, 0.25, 0.55, 18), p.pot, x, 0.275, z, tag);
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    P(g, new THREE.ConeGeometry(0.06, 0.75, 5), p.plant, x + Math.sin(a) * 0.12, 0.85, z + Math.cos(a) * 0.12, tag, { edge: false, rx: Math.cos(a) * 0.55, rz: -Math.sin(a) * 0.55 });
  }
}
function books(g, p, tag, x0, y, z, n, span) {
  for (let i = 0; i < n; i++) P(g, B(span / n * 0.8, 0.22 + (i % 3) * 0.03, 0.18), p.book[i % 3], x0 + i * span / n, y + 0.12, z, tag, { edge: false });
}

/* ---------- areas (local frame: front = -z, towards the windows) ---------- */
function living(g, p, st, T) {
  if (st === 'latin') P(g, C(1.35, 1.35, 0.015, 40), p.rug, 0, 0.008, 0.2, T, { shadow: false, edge: false });
  else P(g, B(2.9, 0.015, 2.1), p.rug, 0, 0.008, 0.2, T, { shadow: false, edge: st === 'japanese' });
  if (st === 'japanese') {
    P(g, B(2.3, 0.18, 0.9), p.wood, 0, 0.09, 0.85, T);
    P(g, B(2.2, 0.12, 0.82), p.fabric, 0, 0.24, 0.85, T);
    P(g, B(2.2, 0.38, 0.16), p.fabric, 0, 0.45, 1.2, T);
    P(g, B(0.9, 0.05, 0.9), p.wood, 0, 0.33, -0.15, T);
    legs4(g, p.wood, T, 0.38, 0.38, 0.31, 0.03);
    [-1.0, 1.0].forEach(x => P(g, B(0.6, 0.08, 0.6), p.accent, x, 0.04, -0.2, T));
    P(g, B(0.03, 1.8, 1.2), p.paper, 1.75, 0.95, 0.6, T, { edge: false });
    for (let i = 0; i <= 4; i++) P(g, B(0.05, 1.85, 0.03), p.wood, 1.75, 0.95, i * 0.3, T, { edge: false });
    for (let j = 0; j <= 6; j++) P(g, B(0.05, 0.03, 1.2), p.wood, 1.75, 0.05 + j * 0.3, 0.6, T, { edge: false });
    P(g, B(0.3, 0.06, 0.3), p.wood, -1.75, 0.03, 0.9, T);
    P(g, C(0.2, 0.2, 0.7, 20), p.paper, -1.75, 0.42, 0.9, T);
    return [[-1.2, 1.2, -0.65, 1.3], [1.6, 1.9, -0.05, 1.25], [-2.0, -1.5, 0.65, 1.15]];
  }
  if (st === 'latin') {
    P(g, B(2.2, 0.42, 0.95), p.fabric, 0, 0.24, 0.8, T);
    P(g, B(2.2, 0.5, 0.28), p.fabric, 0, 0.62, 1.2, T);
    [-1.12, 1.12].forEach(x => P(g, C(0.22, 0.22, 0.95, 20), p.fabric, x, 0.48, 0.8, T, { rx: Math.PI / 2 }));
    P(g, C(0.55, 0.55, 0.06, 32), p.wood, 0, 0.42, -0.2, T);
    P(g, C(0.16, 0.22, 0.4, 16), p.wood, 0, 0.2, -0.2, T);
    P(g, C(0.4, 0.38, 0.42, 24), p.rattan, -1.8, 0.21, -0.25, T);
    P(g, C(0.42, 0.42, 0.42, 24, true, Math.PI, Math.PI), p.rattan, -1.8, 0.63, -0.25, T, { edge: false });
    agave(g, p, T, 1.8, 0.9);
    return [[-1.35, 1.35, 0.3, 1.35], [-0.6, 0.6, -0.75, 0.35], [-2.25, -1.35, -0.7, 0.2], [1.45, 2.15, 0.55, 1.25]];
  }
  P(g, B(2.0, 0.2, 0.85), p.fabric, 0, 0.42, 0.8, T);
  P(g, B(2.0, 0.42, 0.15), p.fabric, 0, 0.72, 1.18, T);
  [-1.0, 1.0].forEach(x => P(g, B(0.1, 0.28, 0.85), p.fabric, x, 0.55, 0.8, T));
  [[-0.9, 0.45], [0.9, 0.45], [-0.9, 1.15], [0.9, 1.15]].forEach(([x, z]) => P(g, C(0.02, 0.02, 0.32, 8), p.dark, x, 0.16, z, T, { edge: false }));
  P(g, C(0.45, 0.45, 0.035, 40), p.wood, 0, 0.4, -0.2, T, { sx: 1.5 });
  [[-0.5, -0.2], [0.5, -0.2], [0, 0.1]].forEach(([x, z]) => P(g, C(0.018, 0.018, 0.38, 8), p.dark, x, 0.19, z, T, { edge: false }));
  P(g, C(0.18, 0.18, 0.04, 20), p.dark, 1.75, 0.02, 1.0, T);
  P(g, C(0.015, 0.015, 1.5, 8), p.dark, 1.75, 0.77, 1.0, T, { edge: false });
  P(g, C(0.08, 0.28, 0.25, 24), p.accent, 1.75, 1.6, 1.0, T);
  plant(g, p, T, -1.8, 1.0, 1.1);
  return [[-1.1, 1.1, 0.35, 1.3], [-0.7, 0.7, -0.5, 0.1], [1.55, 1.95, 0.8, 1.2], [-2.05, -1.55, 0.75, 1.25]];
}

function dining(g, p, st, T) {
  if (st === 'japanese') {
    P(g, B(1.8, 0.05, 0.85), p.wood, 0, 0.72, 0, T);
    legs4(g, p.wood, T, 0.8, 0.35, 0.7, 0.03);
    [[-0.45, -1], [0.45, -1], [-0.45, 1], [0.45, 1]].forEach(([x, s]) => {
      P(g, B(0.42, 0.04, 0.42), p.wood, x, 0.45, s * 0.62, T);
      P(g, B(0.42, 0.3, 0.03), p.wood, x, 0.72, s * 0.81, T);
      [-0.18, 0.18].forEach(dz => P(g, B(0.38, 0.43, 0.03), p.dark, x, 0.215, s * 0.62 + dz, T, { edge: false }));
    });
    P(g, C(0.005, 0.005, 0.9, 4), p.dark, 0, 2.95, 0, T, { edge: false });
    P(g, new THREE.SphereGeometry(0.28, 20, 14), p.paper, 0, 2.25, 0, T, { edge: false, shadow: false });
    return [[-1.0, 1.0, -0.95, 0.95]];
  }
  if (st === 'latin') {
    P(g, B(2.0, 0.08, 0.95), p.wood, 0, 0.74, 0, T);
    legs4(g, p.wood, T, 0.85, 0.35, 0.7, 0.06);
    P(g, B(1.8, 0.07, 0.35), p.wood, 0, 0.45, -0.68, T);
    [-0.75, 0.75].forEach(x => P(g, B(0.07, 0.42, 0.3), p.wood, x, 0.21, -0.68, T));
    [-0.6, 0, 0.6].forEach(x => {
      P(g, B(0.44, 0.05, 0.44), p.rattan, x, 0.46, 0.68, T);
      P(g, B(0.44, 0.45, 0.04), p.rattan, x, 0.72, 0.88, T);
      P(g, B(0.4, 0.44, 0.4), p.dark, x, 0.22, 0.68, T, { edge: false });
    });
    P(g, C(0.005, 0.005, 1.2, 4), p.dark, 0, 2.8, 0, T, { edge: false });
    P(g, HALF_SPHERE(0.38), p.rattan, 0, 2.0, 0, T, { edge: false, shadow: false });
    return [[-1.1, 1.1, -0.95, 1.1]];
  }
  P(g, C(0.6, 0.6, 0.04, 40), p.wood, 0, 0.74, 0, T);
  P(g, C(0.06, 0.06, 0.7, 12), p.accent, 0, 0.36, 0, T, { edge: false });
  P(g, C(0.3, 0.3, 0.03, 24), p.accent, 0, 0.015, 0, T);
  [0, 1, 2, 3].forEach(i => {
    const a = i * Math.PI / 2 + Math.PI / 4, ch = new THREE.Group();
    ch.position.set(Math.sin(a) * 0.82, 0, Math.cos(a) * 0.82); ch.rotation.y = a; g.add(ch);
    P(ch, B(0.42, 0.035, 0.4), p.wood, 0, 0.45, 0, T);
    P(ch, B(0.42, 0.22, 0.03), p.wood, 0, 0.66, 0.19, T);
    legs4(ch, p.dark, T, 0.17, 0.16, 0.44);
  });
  P(g, C(0.005, 0.005, 1.2, 4), p.dark, 0, 2.8, 0, T, { edge: false });
  P(g, HALF_SPHERE(0.3), p.accent, 0, 2.0, 0, T, { edge: false, shadow: false });
  return [[-1.1, 1.1, -1.1, 1.1]];
}

function study(g, p, st, T) {
  if (st === 'japanese') {
    P(g, B(1.4, 0.04, 0.6), p.wood, 0, 0.72, -0.35, T);
    [-0.65, 0.65].forEach(x => P(g, B(0.04, 0.7, 0.55), p.wood, x, 0.35, -0.35, T));
    P(g, B(0.44, 0.04, 0.44), p.wood, 0, 0.45, 0.25, T);
    P(g, B(0.44, 0.35, 0.03), p.wood, 0, 0.7, 0.46, T);
    P(g, B(0.38, 0.43, 0.38), p.dark, 0, 0.215, 0.25, T, { edge: false });
    [-0.22, 0.22].forEach(dx => P(g, B(0.03, 1.6, 0.03), p.wood, 1.2 + dx, 0.8, 0.35, T, { edge: false }));
    for (let i = 0; i < 4; i++) P(g, B(0.5, 0.02, 0.3), p.wood, 1.2, 0.25 + i * 0.4, 0.35, T, { edge: false });
    books(g, p, T, 1.0, 0.66, 0.35, 5, 0.4);
  } else if (st === 'latin') {
    P(g, B(1.4, 0.06, 0.65), p.wood, 0, 0.74, -0.35, T);
    P(g, B(0.45, 0.7, 0.6), p.wood, -0.45, 0.35, -0.35, T);
    P(g, B(0.05, 0.7, 0.6), p.wood, 0.67, 0.35, -0.35, T);
    P(g, B(0.5, 0.08, 0.5), p.dark, 0, 0.45, 0.25, T);
    P(g, B(0.5, 0.5, 0.06), p.dark, 0, 0.75, 0.48, T);
    P(g, B(0.4, 0.41, 0.4), p.wood, 0, 0.2, 0.25, T, { edge: false });
    P(g, B(0.9, 1.8, 0.32), p.wood, 1.25, 0.9, 0.35, T);
    [0.5, 1.0, 1.5].forEach(y => books(g, p, T, 0.9, y - 0.12, 0.2, 6, 0.7));
  } else {
    P(g, B(1.3, 0.03, 0.6), p.accent, 0, 0.73, -0.35, T);
    legs4({ add: o => { o.position.z -= 0.35; g.add(o); } }, p.dark, T, 0.6, 0.26, 0.72);
    P(g, C(0.24, 0.24, 0.04, 24), p.fabric, 0, 0.45, 0.25, T);
    P(g, C(0.25, 0.25, 0.25, 24, true, -Math.PI / 2, Math.PI), p.fabric, 0, 0.6, 0.25, T, { edge: false });
    legs4({ add: o => { o.position.z += 0.25; g.add(o); } }, p.dark, T, 0.16, 0.16, 0.43);
    P(g, B(1.0, 0.8, 0.32), p.wood, 1.2, 0.4, 0.35, T);
    books(g, p, T, 0.85, 0.8, 0.35, 6, 0.7);
  }
  return [[-0.75, 0.75, -0.7, 0.0], [-0.3, 0.3, 0.0, 0.55], [0.75, 1.75, 0.15, 0.55]];
}

function nook(g, p, st, T) {
  if (st === 'japanese') {
    P(g, B(0.65, 0.1, 0.65), p.fabric, 0, 0.05, 0, T);
    P(g, B(0.45, 0.3, 0.45), p.wood, 0.65, 0.15, -0.1, T);
    P(g, B(0.3, 0.08, 0.2), p.dark, 0.65, 0.34, -0.1, T);
    P(g, new THREE.IcosahedronGeometry(0.18, 0), p.plant, 0.65, 0.52, -0.1, T, { sy: 0.6, sx: 1.4 });
    P(g, C(0.15, 0.15, 0.5, 18), p.paper, -0.65, 0.3, 0.3, T);
  } else if (st === 'latin') {
    P(g, C(0.4, 0.38, 0.42, 24), p.rattan, 0, 0.21, 0, T);
    P(g, C(0.42, 0.42, 0.42, 24, true, -Math.PI / 2, Math.PI), p.rattan, 0, 0.63, 0, T, { edge: false });
    P(g, C(0.25, 0.25, 0.5, 20), p.wood, 0.7, 0.25, -0.15, T);
    agave(g, p, T, -0.75, 0.35);
  } else {
    P(g, B(0.72, 0.12, 0.7), p.fabric, 0, 0.38, 0, T);
    P(g, B(0.72, 0.6, 0.1), p.fabric, 0, 0.72, 0.36, T, { rx: -0.25 });
    legs4(g, p.wood, T, 0.3, 0.28, 0.32, 0.02);
    P(g, C(0.22, 0.22, 0.02, 24), p.accent, 0.7, 0.55, -0.1, T);
    P(g, C(0.02, 0.02, 0.54, 8), p.dark, 0.7, 0.27, -0.1, T, { edge: false });
    plant(g, p, T, -0.75, 0.35);
  }
  return [[-0.95, 0.95, -0.5, 0.65]];
}

// Soft contact shadows: a blurred dark patch under each footprint, so pieces sit on the floor.
function blobs(g, rects, y = 0.018) {
  rects.forEach(([x0, x1, z0, z1]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry((x1 - x0) * 1.3, (z1 - z0) * 1.3), blobMat);
    m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.renderOrder = 1;
    g.add(m);
  });
}

// Bedroom, fixed behind its partition. Built in world coordinates from room.bedroom.
function bedroom(g, p, st, room) {
  const T = 'F-BEDROOM', b = room.bedroom, bx = b.x0 + 1.12, bz = (b.z0 + b.z1) / 2 + 0.05;
  P(g, B(1.8, 0.012, 2.4), p.rug, bx + 0.7, 0.008, bz, T, { shadow: false });
  if (st === 'japanese') {
    P(g, B(2.2, 0.15, 1.8), p.wood, bx, 0.075, bz, T);
    P(g, B(2.0, 0.14, 1.5), p.linen, bx, 0.22, bz, T);
    P(g, B(1.4, 0.06, 1.52), p.fabric, bx + 0.3, 0.32, bz, T);
    [-0.38, 0.38].forEach(dz => P(g, B(0.35, 0.1, 0.6), p.linen, bx - 0.75, 0.34, bz + dz, T));
  } else {
    const base = st === 'latin' ? p.wood : p.fabric;
    P(g, B(2.1, 0.32, 1.7), base, bx, 0.2, bz, T);
    P(g, B(2.0, 0.22, 1.6), p.linen, bx, 0.47, bz, T);
    P(g, B(1.3, 0.06, 1.64), st === 'latin' ? p.fabric : p.accent, bx + 0.35, 0.6, bz, T);
    P(g, B(0.1, st === 'latin' ? 1.25 : 0.95, 1.8), base, bx - 1.06, st === 'latin' ? 0.62 : 0.48, bz, T);
    [-0.38, 0.38].forEach(dz => P(g, B(0.4, 0.12, 0.62), p.linen, bx - 0.72, 0.63, bz + dz, T));
  }
  [-1.15, 1.15].forEach(dz => {
    P(g, B(0.45, st === 'japanese' ? 0.3 : 0.5, 0.42), p.wood, b.x0 + 0.3, st === 'japanese' ? 0.15 : 0.25, bz + dz, T);
    P(g, C(0.11, 0.14, 0.22, 18), p.paper, b.x0 + 0.3, st === 'japanese' ? 0.42 : 0.62, bz + dz, T);
  });
  P(g, B(2.4, 2.3, 0.6), st === 'scandi' ? p.accent : p.wood, (b.x0 + b.x1) / 2 - 0.4, 1.15, b.z0 + 0.32, T);
  const rects = [[b.x0, b.x0 + 2.25, bz - 0.9, bz + 0.9], [b.x0, b.x0 + 0.55, bz - 1.4, bz - 0.9], [b.x0, b.x0 + 0.55, bz + 0.9, bz + 1.4], [(b.x0 + b.x1) / 2 - 1.6, (b.x0 + b.x1) / 2 + 0.8, b.z0, b.z0 + 0.62]];
  blobs(g, rects);
  rects.forEach(r => built.furnColliders.push(r));
  built.anchors[T] = new THREE.Vector3(bx + 0.5, 1.5, bz);
}

const AREAS = { living, dining, study, nook };
const PIECES = {
  japanese: { living: 'Low platform sofa, low oak table, floor cushions, shoji screen, paper lantern', dining: 'Slim oak table, four light chairs, paper lantern pendant', study: 'Trestle desk, oak chair, ladder shelf', nook: 'Floor cushion, low side table, bonsai, lantern', kitchen: 'Hinoki-tone fronts, pale tops' },
  latin: { living: 'Terracotta sofa with rolled arms, round walnut table, rattan barrel chair, agave in a clay pot, jute rug', dining: 'Rustic walnut table, bench, rattan chairs, woven pendant', study: 'Walnut desk with drawers, leather chair, bookcase', nook: 'Rattan chair, walnut side table, clay planter', kitchen: 'Terracotta fronts, walnut tops' },
  scandi: { living: 'Grey wool sofa on slim legs, oval ash table, floor lamp, fiddle-leaf plant', dining: 'Round ash table, four slim chairs, white dome pendant', study: 'White desk, shell chair, low ash shelf', nook: 'Lounge chair, small white table, plant', kitchen: 'White fronts, ash tops' }
};
const NAMES = { living: 'Living', dining: 'Dining', study: 'Study', nook: 'Nook', kitchen: 'Kitchen' };
const BED = { japanese: 'Low oak platform, futon and linen, paper lamps', latin: 'Walnut bed with tall headboard, terracotta throw', scandi: 'Upholstered grey bed, white bedding, ash bedside tables' };

function kitchen(g, p, st, W) {
  const T = 'F-KITCHEN';
  const front = st === 'latin' ? p.fabric : st === 'japanese' ? p.wood : p.accent;
  const top = st === 'latin' ? p.wood : st === 'japanese' ? p.accent : p.wood;
  const xw = W / 2;
  P(g, B(0.65, 0.88, 4.4), front, xw - 0.33, 0.44, 0, T);
  P(g, B(0.68, 0.04, 4.45), top, xw - 0.34, 0.9, 0, T);
  P(g, B(0.3, 0.04, 2.4), top, xw - 0.15, 1.65, 0, T);
  P(g, B(1.0, 0.9, 2.4), front, 5.4, 0.45, 0, T);
  P(g, B(1.05, 0.05, 2.5), top, 5.4, 0.925, 0, T);
  [-0.7, 0, 0.7].forEach(z => { P(g, C(0.18, 0.18, 0.05, 20), top, 4.6, 0.65, z, T); P(g, C(0.02, 0.02, 0.63, 8), p.dark, 4.6, 0.315, z, T, { edge: false }); });
  const kr = [[xw - 0.7, xw, -2.25, 2.25], [4.85, 5.95, -1.25, 1.25], [4.38, 4.82, -0.92, 0.92]];
  built.furnColliders.push(...kr);
  blobs(g, kr.slice(0, 2));
  built.anchors[T] = new THREE.Vector3(5.4, 1.6, 0);
}

// Build (or rebuild) all furniture for a style and a layout ({ living: 'NW', ... }).
export function buildFurniture(style, layout) {
  const room = S.room;
  if (furnRoot) { scene.remove(furnRoot); furnRoot.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
  furnRoot = new THREE.Group(); scene.add(furnRoot);
  built.furnTargets = []; built.furnColliders = [];
  const p = palette(style);
  S.zones = [];
  for (const area of room.clusters) {
    const spot = room.spots.find(s => s.id === layout[area]);
    const g = new THREE.Group(); g.position.set(spot.x, 0, spot.z);
    const turn = spot.face === 'S'; if (turn) g.rotation.y = Math.PI;
    furnRoot.add(g);
    const tag = 'F-' + area.toUpperCase();
    const rects = AREAS[area](g, p, style, tag);
    blobs(g, rects);
    rects.forEach(([x0, x1, z0, z1]) => built.furnColliders.push(turn ? [spot.x - x1, spot.x - x0, spot.z - z1, spot.z - z0] : [spot.x + x0, spot.x + x1, spot.z + z0, spot.z + z1]));
    built.anchors[tag] = new THREE.Vector3(spot.x, 1.9, spot.z);
    const o = S.objects[tag];
    o.meta = { Style: room.variables.style.options[style].name, Pieces: PIECES[style][area], Location: `${spot.id} spot, facing the ${(S.objects[room.facades[spot.face === 'N' ? 'north' : 'south'].id] || { name: 'windows' }).name.toLowerCase()}` };
    S.zones.push({ id: 'Z-' + area.toUpperCase(), name: NAMES[area], area, spot: spot.id, side: spot.face, x: spot.x, z: spot.z, r: CONFIG.zoneR });
  }
  kitchen(furnRoot, p, style, room.size.w);
  S.objects['F-KITCHEN'].meta = { Style: room.variables.style.options[style].name, Pieces: PIECES[style].kitchen, Location: 'East wall, fixed' };
  const kz = room.kitchen.zone;
  S.zones.push({ id: 'Z-KITCHEN', name: 'Kitchen', area: 'kitchen', spot: 'E', side: null, x: kz.x, z: kz.z, r: kz.r });
  if (room.bedroom && S.objects['F-BEDROOM']) {
    bedroom(furnRoot, p, style, room);
    S.objects['F-BEDROOM'].meta = { Style: room.variables.style.options[style].name, Pieces: BED[style], Location: 'Behind the partition, on the south facade' };
    const bz = room.bedroom.zone;
    S.zones.push({ id: 'Z-BEDROOM', name: 'Bedroom', area: 'bedroom', spot: 'BR', side: 'S', x: bz.x, z: bz.z, r: bz.r });
  }

  // Zone rings (observer only)
  built.zoneGroup = new THREE.Group(); furnRoot.add(built.zoneGroup); built.zoneFills = {};
  S.zones.forEach(z => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(z.r - 0.025, z.r, 96), new THREE.MeshBasicMaterial({ color: 0x3651C9, transparent: true, opacity: 0.6 }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(z.x, 0.02, z.z); built.zoneGroup.add(ring);
    const fill = new THREE.Mesh(new THREE.CircleGeometry(z.r, 96), new THREE.MeshBasicMaterial({ color: 0x3651C9, transparent: true, opacity: 0.03, depthWrite: false }));
    fill.rotation.x = -Math.PI / 2; fill.position.set(z.x, 0.019, z.z); built.zoneGroup.add(fill);
    built.zoneFills[z.id] = fill;
  });
  built.zoneGroup.visible = !S.subject;
  furnRoot.updateMatrixWorld(true);
  attachOverlays(built.furnTargets);
  mergeTargets();
}
