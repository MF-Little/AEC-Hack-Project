// Builds the factory from its room file: a Level 1 production hall at night with pallet racking,
// machines, a shift office, two protected stair cores (with real stair flights behind the doors),
// an external escape door with a steel stair, decoy doors (sealed exit, goods lift, office,
// loading shutters), safety signs, emergency luminaires and fire-alarm beacons.
// Every mesh a person can look at carries an object id that points to its metadata.
import * as THREE from 'three';
import { scene } from '../scene/core.js';
import { std } from '../scene/materials.js';
import { rng } from '../util.js';
import { obstacles, dirOf } from './nav.js';
import { drawSign, signMaterial, arrowFor } from './signs.js';

export const B = {
  root: null, targets: [], overlays: [], colliders: [], objects: {}, signs: {}, doors: {}, racks: {},
  highbays: null, emerg: [], emergLights: [], beacons: [], doorLights: []
};

// ---------- textures (tiles in metres) ----------
function canvasTex(px, metres, draw, wpx = px) {
  const cv = document.createElement('canvas'); cv.width = wpx; cv.height = px;
  draw(cv.getContext('2d'), wpx, px);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / metres, 1 / metres); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; return t;
}
const speck = (c, w, h, n, a, s = 1.5) => { for (let i = 0; i < n; i++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${a})`; c.fillRect(Math.random() * w, Math.random() * h, s, s); } };

const floorTex = canvasTex(1024, 6, (c, w, h) => {
  c.fillStyle = '#8D8E89'; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 90; i++) { const x = Math.random() * w, y = Math.random() * h, r = 40 + Math.random() * 140, g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${Math.random() < 0.5 ? '70,72,68' : '170,170,165'},0.10)`); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); }
  speck(c, w, h, 30000, 0.05, 1.6);
  c.strokeStyle = 'rgba(30,30,28,0.25)'; c.lineWidth = 2.5;
  for (let k = 0; k < 7; k++) { c.beginPath(); const y = Math.random() * h; c.moveTo(0, y); c.bezierCurveTo(w * 0.3, y + 60, w * 0.6, y - 60, w, y + 20); c.stroke(); }
  c.fillStyle = 'rgba(25,25,22,0.55)'; c.fillRect(0, 0, w, 3); c.fillRect(0, 0, 3, h);
});
const panelTex = canvasTex(256, 1, (c, w, h) => {
  c.fillStyle = '#C9CCCD'; c.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 64) { c.fillStyle = 'rgba(0,0,0,0.10)'; c.fillRect(x, 0, 6, h); c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(x + 6, 0, 3, h); c.fillStyle = 'rgba(0,0,0,0.05)'; c.fillRect(x + 30, 0, 2, h); }
  speck(c, w, h, 1500, 0.025);
});
const blockTex = canvasTex(256, 1.2, (c, w, h) => {
  c.fillStyle = '#C3C2BC'; c.fillRect(0, 0, w, h);
  const bh = h / 6, bw = w / 3;
  for (let r = 0; r < 6; r++) for (let k = -1; k < 4; k++) { c.strokeStyle = 'rgba(80,78,72,0.35)'; c.lineWidth = 2; c.strokeRect(k * bw + (r % 2) * bw / 2, r * bh, bw, bh); }
  speck(c, w, h, 4000, 0.05);
});
const stripeTex = canvasTex(128, 0.6, (c, w, h) => {
  c.fillStyle = '#F2C230'; c.fillRect(0, 0, w, h); c.fillStyle = '#1C1C1A';
  for (let k = -2; k < 4; k++) { c.beginPath(); c.moveTo(k * 64, 0); c.lineTo(k * 64 + 32, 0); c.lineTo(k * 64 + 32 + h, h); c.lineTo(k * 64 + h, h); c.fill(); }
});
const roofTex = canvasTex(128, 1, (c, w, h) => { c.fillStyle = '#5E6163'; c.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 32) { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x, 0, 8, h); } });
const slatTex = canvasTex(128, 1, (c, w, h) => { c.fillStyle = '#A9AEB1'; c.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 16) { c.fillStyle = 'rgba(0,0,0,0.22)'; c.fillRect(0, y, w, 3); c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(0, y + 3, w, 2); } });
const meshTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d'); c.fillStyle = '#E3B92E'; for (let i = 0; i < 64; i += 8) { c.fillRect(i, 0, 1.5, 64); c.fillRect(0, i, 64, 1.5); } const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 0.4, 1 / 0.4); return t; })();
const asphaltTex = canvasTex(256, 4, (c, w, h) => { c.fillStyle = '#2C2D2E'; c.fillRect(0, 0, w, h); speck(c, w, h, 9000, 0.09, 2); });

// ---------- materials ----------
const MT = {
  floor: std(0xDCDCD8, { map: floorTex, roughness: 0.42, envMapIntensity: 0.45 }),
  wall: std(0xffffff, { map: panelTex, roughness: 0.6, metalness: 0.15 }),
  dado: std(0x6F7372, { roughness: 0.8 }),
  core: std(0xffffff, { map: blockTex, roughness: 0.95 }),
  roof: std(0xffffff, { map: roofTex, roughness: 0.8, side: THREE.DoubleSide }),
  steel: std(0x6E7B86, { roughness: 0.55, metalness: 0.45 }),
  stripe: std(0xffffff, { map: stripeTex, roughness: 0.7 }),
  yellow: std(0xF2C230, { roughness: 0.6 }),
  green: std(0x3E8A5A, { roughness: 0.6 }),
  white: std(0xEDEDEA, { roughness: 0.7 }),
  machine: std(0xD5D9D3, { roughness: 0.55, metalness: 0.1 }),
  machineDark: std(0x47645A, { roughness: 0.5, metalness: 0.15 }),
  glassDark: std(0x1B2530, { roughness: 0.08, metalness: 0.6 }),
  officeGlass: std(0x56626B, { roughness: 0.05, metalness: 0.35, emissive: 0x3A3424, emissiveIntensity: 0.7 }),
  black: std(0x202122, { roughness: 0.6 }),
  rubber: std(0x151515, { roughness: 0.9 }),
  fork: std(0xE9B21C, { roughness: 0.45, metalness: 0.2 }),
  robot: std(0xE0661E, { roughness: 0.45, metalness: 0.2 }),
  fence: new THREE.MeshStandardMaterial({ map: meshTex, alphaMap: meshTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, color: 0xE3B92E, roughness: 0.6 }),
  door: std(0x5D6F66, { roughness: 0.45, metalness: 0.2 }),
  doorOffice: std(0xB9A07A, { roughness: 0.6 }),
  frame: std(0x3B3F42, { roughness: 0.4, metalness: 0.6 }),
  chrome: std(0xC8CCCF, { roughness: 0.2, metalness: 0.9 }),
  liftSteel: std(0xA9AFB3, { roughness: 0.25, metalness: 0.85 }),
  shutter: std(0xffffff, { map: slatTex, roughness: 0.5, metalness: 0.4 }),
  pallet: std(0xB28D5E, { roughness: 0.95 }),
  load: std(0xffffff, { roughness: 0.85 }),
  rackBlue: std(0x2D5BA6, { roughness: 0.5, metalness: 0.35 }),
  rackOrange: std(0xE06A1B, { roughness: 0.5, metalness: 0.2 }),
  night: std(0x0E1726, { roughness: 0.05, metalness: 0.7, emissive: 0x0A1222, emissiveIntensity: 0.4 }),
  asphalt: std(0xffffff, { map: asphaltTex, roughness: 0.95 }),
  concrete: std(0x8C8C88, { roughness: 0.9 }),
  highbay: new THREE.MeshBasicMaterial({ color: 0xF4F6FF }),
  emerg: new THREE.MeshBasicMaterial({ color: 0x9A9A96 }),
  beacon: new THREE.MeshBasicMaterial({ color: 0x5A1010 }),
  lamp: new THREE.MeshBasicMaterial({ color: 0xFFD9A0 })
};
export { MT };
const loadColors = [0xB8946A, 0xC4A177, 0xA9845A, 0xD9D4C8, 0xE6E4DE, 0x6F8FB0, 0x9AA3A8, 0xB8946A, 0xC9A97E].map(c => new THREE.Color(c).convertSRGBToLinear());

// ---------- helpers ----------
function mbox(w, h, d) {          // box whose UVs are in metres, so tiled textures keep their scale
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]); }
  return g;
}
function add(m, tag, { shadow = true, receive = true, heat = false, target = true, parent = null } = {}) {
  if (tag) m.userData.tag = tag;
  m.castShadow = shadow; m.receiveShadow = receive;
  (parent || B.root).add(m);
  if (tag && target) B.targets.push(m);
  if (heat) B.overlays.push(m);
  return m;
}
function box(w, h, d, mat, x, y, z, tag, o) { const m = new THREE.Mesh(mbox(w, h, d), mat); m.position.set(x, y, z); return add(m, tag, o); }
const YAW = { S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 };   // turns a +z-facing plane to face that way

function reg(id, o) { B.objects[id] = { id, ...o }; }

// ---------- the build ----------
export function buildFactory(room) {
  if (B.root) scene.remove(B.root);
  Object.assign(B, { root: new THREE.Group(), targets: [], overlays: [], colliders: [], objects: {}, signs: {}, doors: {}, racks: {}, emerg: [], emergLights: [], beacons: [], doorLights: [] });
  scene.add(B.root);
  scene.traverse(o => { if (o.material && o.material.uniforms && o.material.uniforms.sunPosition) o.visible = false; });   // no daytime sky: it is night
  scene.background = new THREE.Color(0x0A0E15);

  B.colliders = obstacles(room).map(o => o.slice(0, 4));
  registerBase(room);
  shell(room);
  roof(room);
  columns(room);
  racks(room);
  blocks(room);
  office(room);
  room.exits.forEach(e => exitDoor(room, e));
  room.decoys.forEach(d => decoy(room, d));
  outside(room);
  signs(room);
  emergency(room);
  B.root.updateMatrixWorld(true);
  return B;
}

function registerBase(room) {
  reg('WALL', { name: 'External wall', kind: 'wall', props: { Type: 'Insulated metal panel, 120 mm', Fire: 'Not fire-rated', IFC: 'IfcWall · SOLIDWALL' } });
  reg('FLOOR', { name: 'Floor slab', kind: 'floor', props: { Finish: 'Power-floated concrete, sealed', Markings: 'Yellow aisle lines, 75 mm', IFC: 'IfcSlab · FLOOR' } });
  reg('ROOF', { name: 'Roof and frames', kind: 'roof', props: { Structure: 'Steel portal frames at 8 m', IFC: 'IfcRoof' } });
  reg('COL', { name: 'Steel column', kind: 'column', props: { Section: 'UC 305 × 305', Protection: 'Intumescent, 60 min', Impact: 'Yellow-black wrap to 1.2 m', IFC: 'IfcColumn' } });
  reg('CORE', { name: 'Stair core wall', kind: 'wall', props: { Construction: 'Blockwork, 60 min fire-resisting', IFC: 'IfcWall · SHEAR' } });
  for (const r of room.racks) { const [x0, x1, z0, z1] = r.rect; reg(r.id, { name: `Pallet racking ${r.id}`, kind: 'rack', props: { ...room.rackSpec.props, Run: `${(x1 - x0).toFixed(1)} m × ${(z1 - z0).toFixed(1)} m${r.deep === 2 ? ', back to back' : ''}` } }); }
  for (const b of room.blocks) { const [x0, x1, z0, z1] = b.rect; reg(b.id, { name: b.name, kind: b.kind, props: { Footprint: `${(x1 - x0).toFixed(1)} × ${(z1 - z0).toFixed(1)} m`, Height: `${b.h} m`, IFC: b.kind === 'forklift' ? 'IfcTransportElement' : 'IfcBuildingElementProxy · EQUIPMENT' } }); }
  for (const e of room.exits) reg(e.id, { name: e.name, kind: 'exit', props: e.props });
  for (const d of room.decoys) reg(d.id, { name: d.name, kind: 'decoy', props: d.props });
  reg('COLLAPSE', { name: 'Fallen stock', kind: 'hazard', props: { Cause: 'Loads shaken off the racking', Effect: 'Blocks the aisle' } });
  reg(room.office.id, { name: room.office.name, kind: 'office', props: { Construction: 'Glazed partition, 30 min', IFC: 'IfcSpace · OFFICE' } });
  for (const s of room.signs) {
    const it = room.illumTypes[s.illum], h = s.size[1] / 1000;
    reg(s.id, { name: s.name, kind: 'sign', sign: s, props: {
      ...room.signTypes[s.kind], Illumination: it.Illumination, 'Emergency duration': it['Emergency duration'],
      Size: `${s.size[0]} × ${s.size[1]} mm`, Mounting: `${s.mount}, ${s.y.toFixed(2)} m to centre`,
      'Rated viewing distance': `${Math.round(it['Z factor'] * h)} m (Z ${it['Z factor']} × ${s.size[1]} mm)`,
      ...(s.flags ? { Flags: s.flags.join(', ') } : {}), IFC: 'IfcSign (IFC 4.3)' },
      rated: it['Z factor'] * h });
  }
}

function shell(room) {
  const [X0, X1, Z0, Z1] = room.bounds, H = room.size.h;
  // floor with the stair cores cut out (their landings are built separately)
  const s = new THREE.Shape(); s.moveTo(X0 - 0.3, -(Z0 - 0.3)); s.lineTo(X1 + 0.3, -(Z0 - 0.3)); s.lineTo(X1 + 0.3, -(Z1 + 0.3)); s.lineTo(X0 - 0.3, -(Z1 + 0.3)); s.closePath();
  for (const e of room.exits) if (e.core) {
    const [a, b, c, d] = e.core, z0 = e.door.face === 'S' ? c : c + 0.25, z1 = e.door.face === 'S' ? d - 0.25 : d, h = new THREE.Path();
    h.moveTo(a + 0.25, -z0); h.lineTo(b, -z0); h.lineTo(b, -z1); h.lineTo(a + 0.25, -z1); h.closePath(); s.holes.push(h);
  }
  const fg = new THREE.ShapeGeometry(s); fg.rotateX(-Math.PI / 2);
  add(new THREE.Mesh(fg, MT.floor), 'FLOOR', { shadow: false, heat: true });
  // aisle lines either side of every rack run
  const lines = [];
  for (const r of room.racks) { const [x0, x1, z0, z1] = r.rect; for (const z of [z0 - 0.2, z1 + 0.2]) if (z > Z0 + 0.3 && z < Z1 - 0.3) lines.push([x0 - 0.1, x1 + 0.1, z - 0.04, z + 0.04]); }
  for (const b of room.blocks) if (b.kind === 'machine' || b.kind === 'press') { const [x0, x1, z0, z1] = b.rect, o = 0.35; lines.push([x0 - o, x1 + o, z0 - o - 0.05, z0 - o + 0.05], [x0 - o, x1 + o, z1 + o - 0.05, z1 + o + 0.05], [x0 - o - 0.05, x0 - o + 0.05, z0 - o, z1 + o], [x1 + o - 0.05, x1 + o + 0.05, z0 - o, z1 + o]); }
  for (const [a, b, c, d] of lines) { const m = new THREE.Mesh(new THREE.PlaneGeometry(b - a, d - c), MT.yellow); m.rotation.x = -Math.PI / 2; m.position.set((a + b) / 2, 0.004, (c + d) / 2); add(m, 'FLOOR', { shadow: false, target: false }); }
  // perimeter walls (from the shared obstacle list), with a dark dado band and a lintel over openings
  for (const o of obstacles(room)) {
    const [a, b, c, d, tag] = o; if (tag !== 'WALL' && tag !== 'CORE') continue;
    const core = tag === 'CORE', y0 = core ? -5 : -5, hh = H - y0;
    box(b - a, hh, d - c, core ? MT.core : MT.wall, (a + b) / 2, y0 + hh / 2, (c + d) / 2, tag, { heat: true });
  }
  // lintels over the external escape door
  for (const e of room.exits) if (!e.core) { const d = e.door, dh = 2.2; box(d.w + 0.02, H - dh, 0.3, MT.wall, d.x, dh + (H - dh) / 2, d.z - 0.15, 'WALL'); }
  // dado band along the inside of the perimeter
  const band = (len, x, z, yaw) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.1), MT.dado); m.position.set(x, 0.55, z); m.rotation.y = yaw; add(m, 'WALL', { shadow: false, target: false }); };
  band(X1 - X0, 0, Z0 + 0.012, 0); band(X1 - X0, 0, Z1 - 0.012, Math.PI); band(Z1 - Z0, X0 + 0.012, 0, Math.PI / 2); band(Z1 - Z0, X1 - 0.012, 0, -Math.PI / 2);
  // high-level windows: dark at night
  for (let x = X0 + 3; x < X1 - 2; x += 5) for (const [z, yaw] of [[Z0 + 0.02, 0], [Z1 - 0.02, Math.PI]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.1), MT.night); m.position.set(x + 1.5, 6.9, z); m.rotation.y = yaw; add(m, 'WALL', { shadow: false, target: false });
  }
}

function roof(room) {
  const [X0, X1, Z0, Z1] = room.bounds, H = room.size.h;
  const r = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0 + 0.6, Z1 - Z0 + 0.6), MT.roof); r.rotation.x = Math.PI / 2; r.position.set(0, H, 0);
  r.geometry.attributes.uv.array.forEach((v, i, a) => { a[i] = v * (i % 2 ? Z1 - Z0 : X1 - X0); });
  add(r, 'ROOF', { shadow: false, target: true });
  for (const x of room.columns.xs) box(0.3, 0.7, Z1 - Z0, MT.steel, x, H - 0.35, 0, 'ROOF', { shadow: false });
  for (const z of room.columns.zs) box(X1 - X0, 0.5, 0.25, MT.steel, 0, H - 0.25, z, 'ROOF', { shadow: false });
  for (let z = Z0 + 1.5; z < Z1; z += 1.8) box(X1 - X0, 0.16, 0.08, MT.steel, 0, H - 0.08, z, null, { shadow: false, target: false });
  // high-bay LED lines: one instanced mesh so the power cut can switch them all
  const pos = [];
  for (let x = X0 + 2; x < X1; x += 4) for (let z = Z0 + 2.2; z < Z1; z += 4.4) { if (room.exits.some(e => e.core && x > e.core[0] && x < e.core[1] && z > e.core[2] && z < e.core[3])) continue; pos.push([x, z]); }
  const hb = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 0.07, 0.32), MT.highbay, pos.length), mm = new THREE.Matrix4();
  pos.forEach(([x, z], i) => { mm.makeTranslation(x, H - 0.9, z); hb.setMatrixAt(i, mm); });
  B.highbays = hb; add(hb, null, { shadow: false, target: false });
  const housing = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 0.08, 0.4), MT.frame, pos.length);
  pos.forEach(([x, z], i) => { mm.makeTranslation(x, H - 0.85, z); housing.setMatrixAt(i, mm); }); add(housing, null, { shadow: false, target: false });
}

function columns(room) {
  const c = room.columns, H = room.size.h;
  for (const x of c.xs) for (const z of c.zs) {
    box(c.size, H, c.size, MT.steel, x, H / 2, z, 'COL');
    box(c.size + 0.04, 1.2, c.size + 0.04, MT.stripe, x, 0.6, z, 'COL', { heat: true });
  }
}

function inst(list, mat, tag, castShadow = true) {
  const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, list.length), mm = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  list.forEach((b, i) => { p.set(b[0], b[1], b[2]); s.set(b[3], b[4], b[5]); mm.compose(p, q, s); m.setMatrixAt(i, mm); });
  return add(m, tag, { shadow: castShadow, target: false });
}
const hidden = new THREE.MeshBasicMaterial({ visible: false });

function racks(room) {
  const spec = room.rackSpec, H = spec.height, lv = [0, ...spec.beams], r = rng(11), Z0 = room.bounds[2];
  for (const rk of room.racks) {
    const [x0, x1, z0, z1] = rk.rect;
    const rows = rk.deep === 2 ? [[z0, z0 + 1.0, -1], [z1 - 1.0, z1, 1]] : [[z0 + 0.05, z1 - 0.05, Math.abs(z0 - Z0) < 0.1 ? 1 : 0]];
    const n = Math.max(1, Math.round((x1 - x0) / spec.bay)), bw = (x1 - x0) / n;
    const ups = [], beams = [], braces = [], pals = [], loads = [];
    for (const [za, zb, side] of rows) {
      const zc = (za + zb) / 2, dep = zb - za;
      for (let i = 0; i <= n; i++) { const x = x0 + i * bw; ups.push([x, H / 2, za + 0.035, 0.09, H, 0.07], [x, H / 2, zb - 0.035, 0.09, H, 0.07]); for (const y of [0.25, 1.9, 3.5, 5.2]) braces.push([x, y, zc, 0.035, 0.04, dep - 0.1]); }
      for (let i = 0; i < n; i++) {
        const xc = x0 + (i + 0.5) * bw;
        for (const y of spec.beams) beams.push([xc, y, za + 0.03, bw - 0.09, 0.12, 0.05], [xc, y, zb - 0.03, bw - 0.09, 0.12, 0.05]);
        for (let l = 0; l < lv.length; l++) {
          const y0 = l === 0 ? 0 : lv[l] + 0.06, top = l < lv.length - 1 ? lv[l + 1] - 0.08 : H + 0.3;
          for (const f of [0.27, 0.73]) {
            if (r() < 0.12) continue;
            const px = x0 + i * bw + bw * f;
            pals.push([px, y0 + 0.07, zc, 1.0, 0.14, dep + 0.1]);
            const h = Math.min(top - y0 - 0.2, 0.75 + r() * 0.5);
            loads.push({ x: px + (r() - 0.5) * 0.04, y: y0 + 0.14 + h / 2, z: zc + (r() - 0.5) * 0.04, w: 0.95, h, d: dep, c: loadColors[Math.floor(r() * loadColors.length)], side, level: l });
          }
        }
      }
    }
    inst(ups, MT.rackBlue, rk.id); inst(beams, MT.rackOrange, rk.id); inst(braces, MT.rackBlue, rk.id, false); inst(pals, MT.pallet, rk.id);
    const lm = inst(loads.map(b => [b.x, b.y, b.z, b.w, b.h, b.d]), MT.load, rk.id);
    loads.forEach((b, i) => lm.setColorAt(i, b.c)); lm.instanceColor.needsUpdate = true;
    B.racks[rk.id] = { mesh: lm, loads, rect: rk.rect };
    // one invisible box per run stands in for the racking when rays test what is being looked at
    const px = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, H, z1 - z0), hidden); px.position.set((x0 + x1) / 2, H / 2, (z0 + z1) / 2);
    add(px, rk.id, { shadow: false, receive: false, heat: true });
  }
}

function blocks(room) {
  const r = rng(5);
  for (const b of room.blocks) {
    const [x0, x1, z0, z1] = b.rect, w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, h = b.h, id = b.id;
    if (b.kind === 'machine') {
      box(w, h * 0.82, d, MT.machine, cx, h * 0.41, cz, id, { heat: true });
      box(w + 0.02, h * 0.18, d + 0.02, MT.machineDark, cx, h * 0.91, cz, id);
      box(w * 0.5, h * 0.35, 0.02, MT.glassDark, cx - w * 0.1, h * 0.5, z1 + 0.01, id);
      box(w * 0.5, h * 0.35, 0.02, MT.glassDark, cx - w * 0.1, h * 0.5, z0 - 0.01, id);
      box(0.45, 0.6, 0.12, MT.black, x1 + 0.25, 1.4, cz, id); box(0.06, 0.06, 0.5, MT.steel, x1 + 0.1, 1.6, cz, id, { shadow: false });
      const bc = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 12), MT.beacon); bc.position.set(x0 + 0.2, h + 0.08, z0 + 0.2); add(bc, id, { shadow: false }); B.beacons.push({ m: bc, amber: true });
    } else if (b.kind === 'press') {
      box(w, 0.4, d, MT.machineDark, cx, 0.2, cz, id); box(w * 0.7, h - 1.0, d * 0.7, MT.machineDark, cx, 0.4 + (h - 1.0) / 2, cz, id, { heat: true });
      box(w, 0.6, d, MT.machineDark, cx, h - 0.3, cz, id); box(w * 0.3, 0.9, d * 0.3, MT.chrome, cx, 1.4, cz, id);
      box(w + 0.6, 0.02, d + 0.6, MT.stripe, cx, 0.006, cz, 'FLOOR', { shadow: false, target: false });
    } else if (b.kind === 'conveyor') {
      box(w, 0.12, d, MT.steel, cx, h - 0.1, cz, id, { heat: true });
      for (let x = x0 + 0.3; x < x1; x += 1.5) for (const z of [z0 + 0.05, z1 - 0.05]) box(0.06, h - 0.15, 0.06, MT.steel, x, (h - 0.15) / 2, z, id, { shadow: false });
      const rl = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, d - 0.08, 10).rotateX(Math.PI / 2), MT.chrome, Math.floor(w / 0.15)), mm = new THREE.Matrix4();
      for (let i = 0; i < rl.count; i++) { mm.makeTranslation(x0 + 0.08 + i * 0.15, h - 0.02, cz); rl.setMatrixAt(i, mm); } add(rl, id, { shadow: false });
      for (let x = x0 + 1; x < x1 - 0.6; x += 2.3 + r()) box(0.55, 0.35, 0.45, MT.load, x, h + 0.18, cz, id).material = std(loadColors[0].clone().convertLinearToSRGB().getHex());
    } else if (b.kind === 'fence') {
      const posts = [];
      for (let x = x0; x <= x1 + 0.01; x += w / 4) posts.push([x, z0], [x, z1]);
      for (let z = z0 + d / 3; z < z1 - 0.01; z += d / 3) posts.push([x0, z], [x1, z]);
      posts.forEach(([x, z]) => box(0.06, h, 0.06, MT.yellow, x, h / 2, z, id, { shadow: false }));
      const panel = (len, x, z, yaw) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(len, h - 0.2), MT.fence); m.position.set(x, (h - 0.2) / 2 + 0.15, z); m.rotation.y = yaw; m.geometry.attributes.uv.array.forEach((v, i, a) => { a[i] = v * (i % 2 ? h - 0.2 : len); }); add(m, id, { shadow: false }); };
      panel(w, cx, z0, 0); panel(w, cx, z1, 0); panel(d, x0, cz, Math.PI / 2); panel(d, x1, cz, Math.PI / 2);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.6, 20), MT.robot); base.position.set(cx, 0.3, cz); add(base, id);
      box(0.3, 1.3, 0.3, MT.robot, cx, 1.2, cz, id); const arm = box(1.6, 0.25, 0.25, MT.robot, cx + 0.7, 1.9, cz, id); arm.rotation.z = -0.35;
      box(1.4, 0.8, 0.9, MT.steel, cx - 1.4, 0.4, cz + 0.6, id);
    } else if (b.kind === 'forklift') {
      box(w, 0.9, d * 0.62, MT.fork, cx, 0.75, z1 - d * 0.31, id, { heat: true });
      box(w, 0.6, 0.45, MT.black, cx, 0.75, z1 - 0.22, id);
      for (const sx of [-1, 1]) for (const sz of [z0 + 0.75, z1 - 0.45]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.22, 16).rotateZ(Math.PI / 2), MT.rubber); wh.position.set(cx + sx * (w / 2 - 0.08), 0.3, sz); add(wh, id); }
      for (const sx of [-1, 1]) { box(0.06, 1.2, 0.06, MT.black, cx + sx * (w / 2 - 0.05), 1.8, z0 + 0.95, id, { shadow: false }); box(0.06, 1.2, 0.06, MT.black, cx + sx * (w / 2 - 0.05), 1.8, z1 - 0.35, id, { shadow: false }); }
      box(w, 0.05, d * 0.55, MT.black, cx, 2.42, z1 - d * 0.36, id);
      box(w * 0.7, 2.3, 0.12, MT.black, cx, 1.15, z0 + 0.55, id);
      for (const sx of [-0.25, 0.25]) box(0.1, 0.05, 1.1, MT.steel, cx + sx, 0.08, z0 - 0.05 + 0.5, id);
      box(0.4, 0.5, 0.4, MT.black, cx, 1.35, z1 - 0.9, id);
    } else if (b.kind === 'pallets') {
      const n = Math.max(1, Math.round(h / 0.95));
      for (let k = 0; k < n; k++) {
        const y = k * (h / n); box(w * 0.98, 0.14, d * 0.98, MT.pallet, cx, y + 0.07, cz, id);
        const lh = h / n - 0.16; const m = box(w * 0.94, lh, d * 0.92, MT.load, cx + (r() - 0.5) * 0.05, y + 0.14 + lh / 2, cz, id, { heat: true });
        m.material = std(loadColors[Math.floor(r() * loadColors.length)].clone().convertLinearToSRGB().getHex(), { roughness: 0.85 });
      }
    }
  }
}

function office(room) {
  const o = room.office, [x0, x1, z0, z1] = o.rect, h = o.h, id = o.id;
  box(x1 - x0, 0.15, z1 - z0, MT.white, (x0 + x1) / 2, h + 0.075, (z0 + z1) / 2, id);
  // north and east faces: solid dado, glazing, head band
  const face = (len, cx, cz, alongX) => {
    const W = alongX ? [len, 0.12] : [0.12, len];
    box(W[0], 1.0, W[1], MT.white, cx, 0.5, cz, id, { heat: true });
    box(alongX ? len : 0.04, 1.5, alongX ? 0.04 : len, MT.officeGlass, cx, 1.75, cz, id, { heat: true });
    box(W[0], h - 2.5, W[1], MT.white, cx, 2.5 + (h - 2.5) / 2, cz, id);
    for (let k = 0; k <= Math.floor(len / 1.5); k++) { const t = -len / 2 + k * (len / Math.floor(len / 1.5)); box(alongX ? 0.05 : 0.14, 1.5, alongX ? 0.14 : 0.05, MT.frame, alongX ? cx + t : cx, 1.75, alongX ? cz : cz + t, id, { shadow: false }); }
  };
  face(x1 - x0, (x0 + x1) / 2, z0 + 0.06, true);
  face(z1 - z0, x1 - 0.06, (z0 + z1) / 2, false);
  // interior light glow seen through the glass (a lamp left on)
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.4), MT.lamp); glow.position.set(-16, 2.9, z0 + 1.2); glow.rotation.x = Math.PI / 2; B.root.add(glow);
}

// Fire doors on stair cores swing into the stair; the external door swings out. All open on approach.
function exitDoor(room, e) {
  const d = e.door, n = dirOf(d.face), H = room.size.h, t = 0.055, dh = 2.15;
  const inward = [-n[0], -n[1]];
  if (e.core) {
    // lintel over the door in the core wall
    box(d.w + 0.02, H - dh, 0.25, MT.core, d.x, dh + (H - dh) / 2, d.z + inward[1] * 0.125, 'CORE');
    coreStair(room, e);
  }
  // frame
  const fz = d.z + inward[1] * 0.02;
  box(d.w + 0.16, 0.08, 0.1, MT.frame, d.x, dh + 0.04, fz, e.id);
  for (const s of [-1, 1]) box(0.08, dh, 0.1, MT.frame, d.x + s * (d.w / 2 + 0.04), dh / 2, fz, e.id);
  // leaf on a hinge pivot
  const pivot = new THREE.Group(), hx = d.x - d.w / 2; pivot.position.set(hx, 0, d.z + inward[1] * 0.06); B.root.add(pivot);
  const leaf = new THREE.Mesh(mbox(d.w - 0.02, dh - 0.02, t), MT.door); leaf.position.set(d.w / 2, dh / 2, 0); add(leaf, e.id, { parent: pivot, heat: true });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(d.w * 0.75, 0.05, 0.05), MT.chrome); bar.position.set(d.w / 2 + 0.05, 1.0, n[1] * 0.07); add(bar, e.id, { parent: pivot, shadow: false });
  const vp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, t + 0.01), MT.glassDark); vp.position.set(d.w / 2, 1.5, 0); add(vp, e.id, { parent: pivot, shadow: false });
  // swing direction: into the stair (cores) or out to the yard (external)
  B.doors[e.id] = { pivot, open: 0, sign: n[1] > 0 ? 1 : -1, def: e };
}

function coreStair(room, e) {
  const [a, b, c, dd] = e.core, face = e.door.face, inward = face === 'S' ? -1 : 1, T = 0.25;
  const edge = face === 'S' ? dd - T : c + T, far = face === 'S' ? c : dd, depth = Math.abs(far - edge);
  const xa = a + T, xb = b, mid = (xa + xb) / 2, land = 1.75, rise = 0.17, tread = 0.28, half = 1.1;
  const n = Math.floor((depth - land - half) / tread), run = n * tread;
  const zAt = k => edge + inward * k;
  const slab = (x0, x1, k0, k1, y) => box(x1 - x0, 0.2, Math.abs(k1 - k0) + 0.01, MT.concrete, (x0 + x1) / 2, y - 0.1, zAt((k0 + k1) / 2), 'CORE');
  // looking in through the door, the down flight is on the right and the return flight on the left
  const R = face === 'S' ? [mid + 0.04, xb] : [xa, mid - 0.04], L = face === 'S' ? [xa, mid - 0.04] : [mid + 0.04, xb];
  slab(xa, xb, 0, land, 0);
  for (let k = 0; k < n; k++) slab(R[0], R[1], land + k * tread, land + (k + 1) * tread, -(k + 1) * rise);
  const yMid = -n * rise; slab(xa, xb, land + run, depth, yMid);
  for (let k = 0; k < n; k++) slab(L[0], L[1], land + run - (k + 1) * tread, land + run - k * tread, yMid - (k + 1) * rise);
  slab(xa, xb, 0, land, 2 * yMid);
  // well wall between the flights, and a guard rail along the open edge of the landing
  box(0.04, 1.0 - 2 * yMid, run, MT.steel, mid, (1.0 + 2 * yMid) / 2, zAt(land + run / 2), 'CORE', { shadow: false });
  box(L[1] - L[0], 0.05, 0.05, MT.chrome, (L[0] + L[1]) / 2, 1.0, zAt(land + 0.02), 'CORE', { shadow: false });
  box(0.04, 1.0, 0.04, MT.chrome, L[0] + 0.05, 0.5, zAt(land + 0.02), 'CORE', { shadow: false });
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.12), MT.lamp); lamp.position.set(face === 'S' ? xb - 0.3 : xa + 0.3, 2.6, zAt(land * 0.5)); B.root.add(lamp);
  const pl = new THREE.PointLight(0xFFE2B8, 6, 8, 2); pl.position.set(mid, 2.2, zAt(land * 0.8)); B.root.add(pl); B.doorLights.push(pl);
}

function decoy(room, dc) {
  const d = dc.door, n = dirOf(d.face), H = d.h || 2.1, yaw = YAW[d.face], id = dc.id;
  const at = (off, y) => [d.x + n[0] * off, y, d.z + n[1] * off];
  const slab = (w, h, mat, off, y) => { const m = new THREE.Mesh(mbox(w, h, 0.05), mat); m.position.set(...at(off, y)); m.rotation.y = yaw; return add(m, id, { heat: true }); };
  if (dc.kind === 'shutter') {
    const m = slab(d.w, H, MT.shutter, 0.04, H / 2); m.geometry.attributes.uv.array.forEach((v, i, a) => { a[i] = v * (i % 2 ? H : d.w); });
    const hs = slab(d.w + 0.4, 0.6, MT.steel, 0.25, H + 0.3); hs.scale.z = 9;
    for (const s of [-1, 1]) { const g = new THREE.Mesh(new THREE.BoxGeometry(0.12, H, 0.12), MT.yellow); g.position.set(d.x + (n[1] ? s * (d.w / 2 + 0.06) : 0), H / 2, d.z + n[1] * 0.08); add(g, id, { shadow: false }); }
    box(d.w, 0.02, 1.2, MT.stripe, d.x, 0.006, d.z + n[1] * 0.7, 'FLOOR', { shadow: false, target: false });
  } else if (dc.kind === 'lift') {
    for (const s of [-1, 1]) { const m = new THREE.Mesh(mbox(d.w / 2 - 0.01, H, 0.04), MT.liftSteel); m.position.set(d.x + s * d.w / 4, H / 2, d.z + n[1] * 0.04); add(m, id, { heat: true }); }
    const fr = new THREE.Mesh(mbox(d.w + 0.3, H + 0.15, 0.03), MT.frame); fr.position.set(d.x, (H + 0.15) / 2, d.z + n[1] * 0.02); add(fr, id);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.36, 0.04), MT.chrome); panel.position.set(d.x + d.w / 2 + 0.35, 1.2, d.z + n[1] * 0.03); add(panel, id, { shadow: false });
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.12), new THREE.MeshBasicMaterial({ color: 0xFF3B2E, toneMapped: false })); disp.position.set(d.x, H + 0.3, d.z + n[1] * 0.04); disp.rotation.y = yaw; add(disp, id, { shadow: false });
  } else {
    slab(d.w, H, dc.kind === 'office' ? MT.doorOffice : MT.door, 0.03, H / 2);
    const fr = slab(d.w + 0.14, H + 0.07, MT.frame, 0.015, (H + 0.07) / 2); fr.scale.z = 0.4;
    const hd = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.06), MT.chrome); hd.position.set(...at(0.08, 1.05)); hd.rotation.y = yaw; hd.translateX(d.w / 2 - 0.12); add(hd, id, { shadow: false });
    if (dc.kind === 'sealed') {
      for (const y of [0.9, 1.3]) { const bar = new THREE.Mesh(new THREE.BoxGeometry(d.w + 0.4, 0.09, 0.05), MT.steel); bar.position.set(...at(0.09, y)); bar.rotation.y = yaw; add(bar, id); }
      const lock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.05), MT.chrome); lock.position.set(...at(0.13, 1.05)); add(lock, id, { shadow: false });
    }
  }
}

function outside(room) {
  const g = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), MT.asphalt); g.rotation.x = -Math.PI / 2; g.position.y = -5;
  g.geometry.attributes.uv.array.forEach((v, i, a) => { a[i] = v * 160; }); B.root.add(g); g.receiveShadow = true;
  // the external escape stair: landing, flight down, railings, a yard light
  for (const e of room.exits) if (!e.core) {
    const d = e.door, zl = d.z - 0.3;
    box(4.2, 0.12, 1.8, MT.steel, d.x - 0.6, -0.06, zl - 0.9, e.id);
    for (let k = 0; k < 28; k++) box(0.04 + 1.1, 0.04, 0.26, MT.steel, d.x - 2.7 - k * 0.27 + 0.55, -0.17 * (k + 1), zl - 1.25, e.id, { shadow: false }).rotation.y = Math.PI / 2;
    box(4.2, 1.0, 0.04, MT.fence, d.x - 0.6, 0.5, zl - 1.8, e.id, { shadow: false });
    const pole = box(0.1, 6, 0.1, MT.steel, d.x + 3, -2, zl - 6, null, { target: false });
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.25), MT.lamp); lamp.position.set(d.x + 3, 1, zl - 6); B.root.add(lamp);
    const pl = new THREE.PointLight(0xFFCF8A, 40, 26, 2); pl.position.set(d.x + 3, 0.9, zl - 6); B.root.add(pl);
  }
}

function signs(room) {
  for (const s of room.signs) {
    const faces = s.face.length === 2 ? s.face.split('') : [s.face];
    const w = s.size[0] / 1000, h = s.size[1] / 1000, grp = new THREE.Group(); grp.position.set(s.x, s.y, s.z); B.root.add(grp);
    const along = faces[0] === 'E' || faces[0] === 'W' ? 'z' : 'x';
    const housing = new THREE.Mesh(new THREE.BoxGeometry(along === 'x' ? w + 0.04 : 0.06, h + 0.04, along === 'x' ? 0.06 : w + 0.04), MT.frame);
    add(housing, s.id, { parent: grp, shadow: false });
    const mats = [];
    for (const f of faces) {
      const tex = drawSign(s.kind, arrowFor(f, s.points), s.size), mat = signMaterial(tex, s.illum), m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      const n = dirOf(f); m.position.set(n[0] * 0.032, 0, n[1] * 0.032); m.rotation.y = YAW[f]; add(m, s.id, { parent: grp, shadow: false, heat: true }); mats.push(mat);
    }
    if (s.mount === 'hanging') for (const k of [-0.35, 0.35]) { const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, room.size.h - s.y - h / 2), MT.steel); rod.position.set(along === 'x' ? k * w : 0, (room.size.h - s.y + h / 2) / 2, along === 'z' ? k * w : 0); grp.add(rod); }
    if (s.mount === 'column') { const br = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.3), MT.steel); br.position.set(0, -h / 2 - 0.03, -0.15); grp.add(br); }
    B.signs[s.id] = { def: s, pos: new THREE.Vector3(s.x, s.y, s.z), normals: faces.map(f => dirOf(f)), mats, w, h };
  }
}

// Emergency luminaires (dark until the power fails), their lights, and red fire-alarm beacons
function emergency(room) {
  const spots = [];
  for (const e of room.exits) { const n = dirOf(e.door.face); spots.push([e.door.x + 0.9, 2.9, e.door.z + n[1] * 0.08, e.door.face]); }
  for (const x of room.columns.xs) for (const z of room.columns.zs) spots.push([x, 3.2, z + 0.22, 'S']);
  for (const [x, z, f] of [[-19.9, -6, 'E'], [-19.9, 6, 'E'], [-8, 12.9, 'N'], [4, 12.9, 'N'], [-8, -12.9, 'S'], [8, -12.9, 'S'], [19.9, 0, 'W']]) spots.push([x, 3.0, z, f]);
  for (const [x, y, z] of spots) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.12), MT.emerg); m.position.set(x, y, z); B.root.add(m); B.emerg.push(m);
  }
  // a subset carry real lights (point lights are costly)
  [0, 1, 2, 3, 5, 8, 10, 12, 14].forEach(i => { const s = spots[i]; if (!s) return; const pl = new THREE.PointLight(0xEEF2FF, 0, 15, 2); pl.position.set(s[0], s[1] - 0.2, s[2]); B.root.add(pl); B.emergLights.push(pl); });
  for (const [x, z, f] of [[-19.9, -10, 'E'], [-19.9, 10, 'E'], [0, 12.9, 'N'], [19.9, -4, 'W'], [10, -12.9, 'S'], [-10, -12.9, 'S']]) {
    const n = dirOf(f), m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 14), MT.beacon); m.position.set(x, 3.4, z); m.rotation.x = n[1] ? Math.PI / 2 : 0; m.rotation.z = n[0] ? Math.PI / 2 : 0; B.root.add(m); B.beacons.push({ m });
  }
}

// ---------- runtime helpers ----------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
export function setLoadVisible(rackId, i, vis) {
  const R = B.racks[rackId], b = R.loads[i];
  _p.set(b.x, b.y, b.z); _s.set(vis ? b.w : 0, vis ? b.h : 0, vis ? b.d : 0); _m.compose(_p, _q, _s); R.mesh.setMatrixAt(i, _m); R.mesh.instanceMatrix.needsUpdate = true;
}
export function restoreLoads() { for (const id in B.racks) B.racks[id].loads.forEach((b, i) => setLoadVisible(id, i, true)); }

export function tickDoors(dt, px, pz) {
  for (const id in B.doors) {
    const D = B.doors[id], d = D.def.door, near = Math.hypot(px - d.x, pz - d.z) < 2.0 ? 1 : 0;
    D.open += (near - D.open) * Math.min(1, dt * 4);
    D.pivot.rotation.y = D.sign * D.open * 1.45;
  }
}
export function closeDoors() { for (const id in B.doors) { B.doors[id].open = 0; B.doors[id].pivot.rotation.y = 0; } }
