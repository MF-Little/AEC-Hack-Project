// Builds the room shell from its JSON: perimeter walls (cut from shapes so textures tile in metres),
// rectangular windows on the north side and arched windows on the south side, floor, ceiling,
// and, when the room file has them, interior elements: bathroom core, partitions, columns, doors,
// a kitchen bulkhead with downlights. Outside: a garden, terrace and neighbouring buildings.
// Every mesh a viewer can look at is tagged with an object id.
import * as THREE from 'three';
import { scene } from './core.js';
import { M, glassMat } from './materials.js';

let shellRoot = null;
export const built = { targets: [], colliders: [], anchors: {}, shellTargets: [], shellColliders: [], furnTargets: [], furnColliders: [], zoneGroup: null, zoneFills: {} };

// The realistic look draws no outlines; kept as a hook so the model look could return later.
export function edges(mesh) { return mesh; }
export function tagMesh(mesh, id, list, shadow = true) {
  mesh.userData.tag = id; mesh.castShadow = shadow; mesh.receiveShadow = true;
  list.push(mesh); return mesh;
}

function archPath(p, cx, y0, w, h) {
  const r = w / 2, x0 = cx - r, x1 = cx + r, yc = y0 + h - r;
  p.moveTo(x0, y0); p.lineTo(x1, y0); p.lineTo(x1, yc);
  p.absarc(cx, yc, r, 0, Math.PI, false); p.lineTo(x0, y0);
  return p;
}
function rectPath(p, x0, y0, x1, y1) { p.moveTo(x0, y0); p.lineTo(x1, y0); p.lineTo(x1, y1); p.lineTo(x0, y1); p.lineTo(x0, y0); return p; }
function windowPath(P, f, cx, grow = 0) {
  const y0 = f.sill - grow, w = f.w + 2 * grow, h = f.h + 2 * grow;
  return f.shape === 'arch' ? archPath(new P(), cx, y0, w, h) : rectPath(new P(), cx - w / 2, y0, cx + w / 2, y0 + h);
}

function wall(len, H, T, holes, place) {
  const s = rectPath(new THREE.Shape(), -len / 2, 0, len / 2, H);
  holes.forEach(h => s.holes.push(h));
  const g = new THREE.Group(); place(g); shellRoot.add(g);
  const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: T, bevelEnabled: false, curveSegments: 40 }), M.wall);
  g.add(tagMesh(m, 'S-WALL', built.shellTargets));
  return g;
}

function box(w, h, d, mat, x, y, z, id, { shadow = true, collide = false } = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z);
  if (id) tagMesh(m, id, built.shellTargets, shadow); else { m.castShadow = shadow; m.receiveShadow = true; }
  shellRoot.add(m);
  if (collide) built.shellColliders.push([x - w / 2, x + w / 2, z - d / 2, z + d / 2]);
  return m;
}

// A door slab with frame and handle on a wall face. axis 'x' = door faces +/-x, 'z' = faces +/-z.
function door(axis, x, z, w, h, sign) {
  const t = 0.045, f = 0.07;
  if (axis === 'x') {
    box(t, h, w, M.door, x, h / 2, z, 'S-DOOR');
    box(t + 0.02, f, w + 2 * f, M.doorFrame, x, h + f / 2, z, 'S-DOOR');
    [-1, 1].forEach(s => box(t + 0.02, h + f, f, M.doorFrame, x, (h + f) / 2, z + s * (w / 2 + f / 2), 'S-DOOR'));
    box(0.06, 0.02, 0.14, M.handle, x + sign * 0.05, 1.05, z + w / 2 - 0.12, 'S-DOOR');
  } else {
    box(w, h, t, M.door, x, h / 2, z, 'S-DOOR');
    box(w + 2 * f, f, t + 0.02, M.doorFrame, x, h + f / 2, z, 'S-DOOR');
    [-1, 1].forEach(s => box(f, h + f, t + 0.02, M.doorFrame, x + s * (w / 2 + f / 2), (h + f) / 2, z, 'S-DOOR'));
  }
}

function interior(room) {
  const I = room.interior; if (!I) return;
  const { h: H } = room.size;
  if (I.core) {
    const c = I.core, cw = c.x1 - c.x0, cd = c.z1 - c.z0;
    box(cw, H, cd, M.core, (c.x0 + c.x1) / 2, H / 2, (c.z0 + c.z1) / 2, 'S-CORE', { collide: true });
    if (c.door) door('x', c.x1 + 0.025, c.door.z, c.door.w, c.door.h, 1);
    built.anchors['S-CORE'] = new THREE.Vector3(c.x1, 2.4, (c.z0 + c.z1) / 2);
  }
  const t = 0.12;
  (I.walls || []).forEach(w => {
    const alongZ = w.x0 === w.x1, len = alongZ ? w.z1 - w.z0 : w.x1 - w.x0;
    const seg = (a, b, y0, y1) => {
      const l = b - a, mid = (a + b) / 2, hh = y1 - y0;
      if (l <= 0.01) return;
      if (alongZ) box(t, hh, l, M.wall, w.x0, y0 + hh / 2, w.z0 + mid, 'S-WALL', { collide: y0 === 0 });
      else box(l, hh, t, M.wall, w.x0 + mid, y0 + hh / 2, w.z0, 'S-WALL', { collide: y0 === 0 });
    };
    if (w.opening) {
      const o = w.opening;
      seg(0, o.from, 0, H); seg(o.from + o.w, len, 0, H); seg(o.from, o.from + o.w, o.h, H);
      const f = 0.06, oz = w.z0 + o.from + o.w / 2;
      if (alongZ) { [-1, 1].forEach(s => box(t + 0.03, o.h, f, M.doorFrame, w.x0, o.h / 2, oz + s * (o.w / 2 - f / 2), 'S-DOOR')); box(t + 0.03, f, o.w, M.doorFrame, w.x0, o.h - f / 2, oz, 'S-DOOR'); }
    } else seg(0, len, 0, H);
  });
  (I.columns || []).forEach(c => box(0.35, H, 0.35, M.column, c.x, H / 2, c.z, 'S-COLUMN', { collide: true }));
  if (I.frontDoor) {
    const fd = I.frontDoor, W = room.size.w;
    door('x', W / 2 - 0.03, fd.z, fd.w, fd.h, -1);
    built.anchors['S-DOOR'] = new THREE.Vector3(W / 2 - 0.1, fd.h + 0.3, fd.z);
  }
  if (I.bulkhead) {
    const b = I.bulkhead, bh = H - b.h;
    box(b.x1 - b.x0, bh, b.z1 - b.z0, M.ceil, (b.x0 + b.x1) / 2, b.h + bh / 2, (b.z0 + b.z1) / 2, 'S-CEIL');
  }
  (I.downlights || []).forEach(([x, z]) => {
    const b = I.bulkhead, under = b && x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1;
    const d = new THREE.Mesh(new THREE.CircleGeometry(0.055, 20), M.light);
    d.rotation.x = Math.PI / 2; d.position.set(x, (under ? b.h : H) - 0.003, z); shellRoot.add(d);
  });
}

// Unitized curtain wall: floor-to-ceiling modules with mullions, a transom, external caps,
// a dark spandrel band at slab level and a stone plinth, so it reads properly from outside too.
// Each pane carries its module number so attention can be read module by module.
function curtainWall(room) {
  const { w: W, d: D, h: H } = room.size, T = room.wallT, f = room.facades.south;
  const n = f.modules, mw = W / n, m = f.mullion, dep = f.depth, zc = D / 2 + 0.12, tr = f.transom;
  const pane = (x, y0, y1, part) => {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(mw - m, y1 - y0), glassMat);
    g.position.set(x, (y0 + y1) / 2, zc); g.userData.part = part;
    shellRoot.add(tagMesh(g, f.id, built.shellTargets, false));
  };
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + (i + 0.5) * mw, id = String(i + 1).padStart(2, '0');
    pane(x, 0.06, tr - 0.035, `M${id} vision`);
    pane(x, tr + 0.035, H - 0.04, `M${id} high`);
  }
  const part = (mesh, p) => { mesh.userData.part = p; return mesh; };
  for (let i = 0; i <= n; i++) {
    const x = -W / 2 + i * mw;
    part(box(m, H, dep, M.frame, x, H / 2, zc - dep / 2, f.id), 'mullion');
    part(box(0.05, H + 0.45, 0.08, M.frame, x, (H + 0.45) / 2, zc + 0.05, f.id), 'mullion');
  }
  [[0.03, 0.06], [tr, 0.07], [H - 0.02, 0.05]].forEach(([y, h]) => {
    part(box(W, h, dep, M.frame, 0, y, zc - dep / 2, f.id), 'transom');
    part(box(W, 0.045, 0.06, M.frame, 0, y, zc + 0.04, f.id), 'transom');
  });
  part(box(W + 2 * T, 0.45, 0.22, M.spandrel, 0, H + 0.225, zc + 0.02, f.id), 'spandrel');
  box(W + 2 * T + 0.4, 0.14, 0.5, M.paving, 0, -0.05, zc + 0.15, null);
  built.anchors[f.id] = new THREE.Vector3(0, tr + 0.25, D / 2);
}

function outside(room) {
  const { w: W, d: D } = room.size, T = room.wallT;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), M.grass);
  M.grass.map.repeat.set(150, 150);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.12; ground.receiveShadow = true; shellRoot.add(ground);
  box(W + 6, 0.1, 3.4, M.paving, 0, -0.07, D / 2 + T + 1.7, null);            // south garden terrace
  box(W + 6, 0.1, 2.2, M.paving, 0, -0.07, -D / 2 - T - 1.1, null);           // north pavement
  for (const sgn of [-1, 1]) {
    const hz = sgn > 0 ? 21 : 12.5, tz = sgn > 0 ? 24 : 15.5;      // the south garden is deeper, so the facade can be seen whole
    box(60, 1.5, 1.0, M.hedge, 0, 0.65, sgn * hz, null);
    for (let i = 0; i < 26; i++) {
      const x = -30 + i * 2.4 + ((i * 7) % 5) * 0.2, s = 0.85 + ((i * 13) % 7) / 10;
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 2.4 * s, 7), M.trunk); tr.position.set(x, 1.1 * s, sgn * tz); tr.castShadow = true; shellRoot.add(tr);
      const cr = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1 * s, 1), M.leaf); cr.position.set(x, 2.9 * s, sgn * tz); cr.castShadow = true; shellRoot.add(cr);
    }
    for (let x = -66; x <= 66; x += 14) box(10, 7 + ((x / 14) % 3 + 3) % 3 * 2, 9, M.building, x, 3.5, sgn * 34, null, { shadow: false });
  }
}

export function buildShell(room) {
  if (shellRoot) { scene.remove(shellRoot); shellRoot.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
  shellRoot = new THREE.Group(); scene.add(shellRoot);
  built.shellTargets = []; built.shellColliders = []; built.anchors = {};
  const { w: W, d: D, h: H } = room.size, T = room.wallT, N = room.facades.north, Sth = room.facades.south;

  const curtain = Sth.type === 'curtain';
  const north = wall(W + 2 * T, H, T, N.xs.map(x => windowPath(THREE.Path, N, x)), g => g.position.set(0, 0, -D / 2 - T));
  const south = curtain ? null : wall(W + 2 * T, H, T, Sth.xs.map(x => windowPath(THREE.Path, Sth, -x)), g => { g.rotation.y = Math.PI; g.position.set(0, 0, D / 2 + T); });
  if (curtain) curtainWall(room);
  wall(D, H, T, [], g => { g.rotation.y = Math.PI / 2; g.position.set(-W / 2 - T, 0, 0); });
  wall(D, H, T, [], g => { g.rotation.y = -Math.PI / 2; g.position.set(W / 2 + T, 0, 0); });

  // Glass, frames and internal stone sills
  const glaze = (grp, f, xs, innerZ) => xs.forEach((x, i) => {
    const gl = new THREE.Mesh(new THREE.ShapeGeometry(windowPath(THREE.Shape, f, x), 40), glassMat);
    gl.position.z = T * 0.4; grp.add(tagMesh(gl, f.id, built.shellTargets, false));
    const fs = windowPath(THREE.Shape, f, x, 0.045); fs.holes.push(windowPath(THREE.Path, f, x));
    const fr = new THREE.Mesh(new THREE.ExtrudeGeometry(fs, { depth: 0.07, bevelEnabled: false, curveSegments: 40 }), M.frame);
    fr.position.z = T * 0.4 - 0.035; grp.add(tagMesh(fr, f.id, built.shellTargets));
    box(f.w + 0.12, 0.035, 0.26, M.sill, f.xs[i], f.sill - 0.017, innerZ, f.id);   // sill sits in world space
  });
  glaze(north, N, N.xs, -D / 2 + 0.1);
  if (!curtain) { glaze(south, Sth, Sth.xs.map(x => -x), D / 2 - 0.1); built.anchors[Sth.id] = new THREE.Vector3(Sth.xs[1], Sth.sill + Sth.h + 0.22, D / 2); }
  built.anchors[N.id] = new THREE.Vector3(N.xs[1], N.sill + N.h + 0.22, -D / 2);

  // Floor, ceiling, skirting
  M.floor.map.repeat.set((W + 2 * T) / 1.8, (D + 2 * T) / 1.8);
  box(W + 2 * T, 0.1, D + 2 * T, M.floor, 0, -0.05, 0, 'S-FLOOR');
  box(W + 2 * T, 0.15, D + 2 * T, M.ceil, 0, H + 0.075, 0, 'S-CEIL');
  const sk = 0.08, st = 0.015;
  box(W, sk, st, M.skirting, 0, sk / 2, -D / 2 + st / 2, 'S-WALL');
  if (!curtain) box(W, sk, st, M.skirting, 0, sk / 2, D / 2 - st / 2, 'S-WALL');
  box(st, sk, D, M.skirting, -W / 2 + st / 2, sk / 2, 0, 'S-WALL');
  box(st, sk, D, M.skirting, W / 2 - st / 2, sk / 2, 0, 'S-WALL');

  interior(room);
  outside(room);
  shellRoot.updateMatrixWorld(true);
}

export function mergeTargets() {
  built.targets = built.shellTargets.concat(built.furnTargets);
  built.colliders = built.shellColliders.concat(built.furnColliders);
}
