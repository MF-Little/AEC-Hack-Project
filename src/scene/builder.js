// Builds the room shell from its JSON: four walls (cut from shapes so textures tile in metres),
// rectangular windows on the north side, arched windows on the south side, floor, ceiling, outside.
// Every mesh a viewer can look at is tagged with an object id.
import * as THREE from 'three';
import { scene } from './core.js';
import { M, edgeMat, glassMat } from './materials.js';

let shellRoot = null;
export const built = { targets: [], colliders: [], anchors: {}, shellTargets: [], shellColliders: [], furnTargets: [], furnColliders: [], zoneGroup: null, zoneFills: {} };

export function edges(mesh, angle = 25) { mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, angle), edgeMat)); return mesh; }
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

// A wall in its own frame: x along the wall, y up, extruded T outward. Holes cut for windows.
function wall(len, H, T, holes, place) {
  const s = rectPath(new THREE.Shape(), -len / 2, 0, len / 2, H);
  holes.forEach(h => s.holes.push(h));
  const g = new THREE.Group(); place(g); shellRoot.add(g);
  const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: T, bevelEnabled: false, curveSegments: 40 }), M.wall);
  g.add(edges(tagMesh(m, 'S-WALL', built.shellTargets)));
  return g;
}

export function buildShell(room) {
  if (shellRoot) { scene.remove(shellRoot); shellRoot.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
  shellRoot = new THREE.Group(); scene.add(shellRoot);
  built.shellTargets = []; built.shellColliders = []; built.anchors = {};
  const { w: W, d: D, h: H } = room.size, T = room.wallT, N = room.facades.north, Sth = room.facades.south;

  // North wall (local x = world x). South wall is turned 180 degrees, so its local x = -world x.
  const north = wall(W + 2 * T, H, T, N.xs.map(x => windowPath(THREE.Path, N, x)), g => g.position.set(0, 0, -D / 2 - T));
  const south = wall(W + 2 * T, H, T, Sth.xs.map(x => windowPath(THREE.Path, Sth, -x)), g => { g.rotation.y = Math.PI; g.position.set(0, 0, D / 2 + T); });
  wall(D, H, T, [], g => { g.rotation.y = Math.PI / 2; g.position.set(-W / 2 - T, 0, 0); });
  wall(D, H, T, [], g => { g.rotation.y = -Math.PI / 2; g.position.set(W / 2 + T, 0, 0); });

  // Glass and frames
  const glaze = (grp, f, xs) => xs.forEach(x => {
    const gl = new THREE.Mesh(new THREE.ShapeGeometry(windowPath(THREE.Shape, f, x), 40), glassMat);
    gl.position.z = T * 0.5; grp.add(tagMesh(gl, f.id, built.shellTargets, false));
    const fs = windowPath(THREE.Shape, f, x, 0.045); fs.holes.push(windowPath(THREE.Path, f, x));
    const fr = new THREE.Mesh(new THREE.ExtrudeGeometry(fs, { depth: 0.06, bevelEnabled: false, curveSegments: 40 }), M.frame);
    fr.position.z = T * 0.5 - 0.03; grp.add(edges(tagMesh(fr, f.id, built.shellTargets)));
  });
  glaze(north, N, N.xs);
  glaze(south, Sth, Sth.xs.map(x => -x));
  built.anchors[N.id] = new THREE.Vector3(N.xs[1], N.sill + N.h + 0.22, -D / 2);
  built.anchors[Sth.id] = new THREE.Vector3(Sth.xs[1], Sth.sill + Sth.h + 0.22, D / 2);

  // Floor and ceiling
  const box = (w, h, d, mat, x, y, z, id) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); shellRoot.add(edges(tagMesh(m, id, built.shellTargets))); return m; };
  box(W + 2 * T, 0.1, D + 2 * T, M.floor, 0, -0.05, 0, 'S-FLOOR');
  box(W + 2 * T, 0.15, D + 2 * T, M.ceil, 0, H + 0.075, 0, 'S-CEIL');

  // Outside: the same tree line and hedge beyond both window walls
  const gr = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), M.ground); gr.rotation.x = -Math.PI / 2; gr.position.y = -0.12; shellRoot.add(gr);
  for (const sgn of [-1, 1]) {
    const hedge = new THREE.Mesh(new THREE.BoxGeometry(90, 1.6, 1.2), M.outside); hedge.position.set(0, 0.7, sgn * 21); shellRoot.add(edges(hedge));
    for (let x = -30; x <= 30; x += 2.4) {
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 2.2, 6), M.outside); tr.position.set(x, 1.0, sgn * 15); shellRoot.add(tr);
      const cr = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 1), M.leaf); cr.position.set(x, 2.9, sgn * 15); shellRoot.add(edges(cr, 10));
    }
    for (let x = -60; x <= 60; x += 12) { const b = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 6), M.outside); b.position.set(x, 2.4, sgn * 42); shellRoot.add(edges(b)); }
  }
  shellRoot.updateMatrixWorld(true);
}

// Combine shell and furniture after either changes.
export function mergeTargets() {
  built.targets = built.shellTargets.concat(built.furnTargets);
  built.colliders = built.shellColliders.concat(built.furnColliders);
}
