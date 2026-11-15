// Walking-distance field on a 0.25 m floor grid. Pure JS (no three.js) so it can be tested on its own.
// Every obstacle is a rectangle [x0, x1, z0, z1]; the grid inflates them by the walker's clearance,
// then runs Dijkstra outward from every exit door. D[cell] = metres to the nearest exit on foot.

export const CS = 0.25;      // cell size, m
export const CLEAR = 0.3;    // body clearance kept from obstacles, m

const FACE = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
export const dirOf = k => FACE[k] || null;

// The solid parts of the hall, shared by collision and the grid. With { nav: true } the stair-core
// interiors count as solid too (the run ends at the door, so the grid stops there).
export function obstacles(room, { nav = false } = {}) {
  const [X0, X1, Z0, Z1] = room.bounds, T = 0.3, out = [];
  const gapsOn = side => room.exits.filter(e => !e.core && wallSide(room, e.door) === side).map(e => [e.door[side === 'N' || side === 'S' ? 'x' : 'z'], e.door.w]);
  const runWall = (a0, a1, gaps, mk) => {
    let a = a0;
    for (const [c, w] of gaps.sort((p, q) => p[0] - q[0])) { if (c - w / 2 > a) out.push(mk(a, c - w / 2)); a = c + w / 2; }
    if (a < a1) out.push(mk(a, a1));
  };
  runWall(X0 - T, X1 + T, gapsOn('N'), (a, b) => [a, b, Z0 - T, Z0, 'WALL']);
  runWall(X0 - T, X1 + T, gapsOn('S'), (a, b) => [a, b, Z1, Z1 + T, 'WALL']);
  runWall(Z0, Z1, gapsOn('W'), (a, b) => [X0 - T, X0, a, b, 'WALL']);
  runWall(Z0, Z1, gapsOn('E'), (a, b) => [X1, X1 + T, a, b, 'WALL']);
  for (const e of room.exits) {
    if (!e.core) continue;
    const [x0, x1, z0, z1] = e.core, d = e.door, t = 0.25;
    // the wall that holds the door, split around it; the other inner wall is solid
    if (d.face === 'S') { out.push([x0, d.x - d.w / 2, z1 - t, z1, 'CORE'], [d.x + d.w / 2, x1, z1 - t, z1, 'CORE']); }
    if (d.face === 'N') { out.push([x0, d.x - d.w / 2, z0, z0 + t, 'CORE'], [d.x + d.w / 2, x1, z0, z0 + t, 'CORE']); }
    if (x0 > X0) out.push([x0, x0 + t, z0, z1, 'CORE']);
    if (x1 < X1) out.push([x1 - t, x1, z0, z1, 'CORE']);
    if (nav) out.push([x0, x1, z0, z1, e.id]);
  }
  if (room.office) out.push([...room.office.rect, room.office.id]);
  for (const r of room.racks) out.push([...r.rect, r.id]);
  for (const b of room.blocks) out.push([...b.rect, b.id]);
  const c = room.columns, h = c.size / 2;
  for (const x of c.xs) for (const z of c.zs) out.push([x - h, x + h, z - h, z + h, 'COL']);
  return out;
}

// Which perimeter wall a door sits in (null if it is inside the hall)
export function wallSide(room, d) {
  const [X0, X1, Z0, Z1] = room.bounds, e = 0.05;
  if (Math.abs(d.z - Z0) < e) return 'N'; if (Math.abs(d.z - Z1) < e) return 'S';
  if (Math.abs(d.x - X0) < e) return 'W'; if (Math.abs(d.x - X1) < e) return 'E';
  return null;
}

// The patch of floor just in front of a door, on the hall side
export function doorFront(d, depth = 0.6) {
  const [nx, nz] = FACE[d.face], hw = d.w / 2;
  if (nx === 0) return [d.x - hw, d.x + hw, Math.min(d.z, d.z + nz * depth), Math.max(d.z, d.z + nz * depth)];
  return [Math.min(d.x, d.x + nx * depth), Math.max(d.x, d.x + nx * depth), d.z - hw, d.z + hw];
}

export function makeGrid(room, extra = []) {
  const [X0, X1, Z0, Z1] = room.bounds;
  const nx = Math.round((X1 - X0) / CS), nz = Math.round((Z1 - Z0) / CS);
  const g = { room, nx, nz, x0: X0, z0: Z0, free: new Uint8Array(nx * nz).fill(1), goal: new Int8Array(nx * nz).fill(-1) };
  const mark = ([a, b, c, d], v) => {
    const i0 = Math.max(0, Math.floor((a - CLEAR - X0) / CS)), i1 = Math.min(nx - 1, Math.floor((b + CLEAR - X0) / CS));
    const j0 = Math.max(0, Math.floor((c - CLEAR - Z0) / CS)), j1 = Math.min(nz - 1, Math.floor((d + CLEAR - Z0) / CS));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = X0 + (i + 0.5) * CS, z = Z0 + (j + 0.5) * CS;
      if (x > a - CLEAR && x < b + CLEAR && z > c - CLEAR && z < d + CLEAR) g.free[j * nx + i] = v;
    }
  };
  for (const o of obstacles(room, { nav: true })) mark(o, 0);
  for (const o of extra) mark(o, 0);
  // keep clear of the perimeter too
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = X0 + (i + 0.5) * CS, z = Z0 + (j + 0.5) * CS;
    if (x < X0 + CLEAR || x > X1 - CLEAR || z < Z0 + CLEAR || z > Z1 - CLEAR) g.free[j * nx + i] = 0;
  }
  room.exits.forEach((e, k) => {
    const [a, b, c, d] = doorFront(e.door, 0.75);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = X0 + (i + 0.5) * CS, z = Z0 + (j + 0.5) * CS;
      if (x > a && x < b && z > c && z < d) { g.free[j * nx + i] = 1; g.goal[j * nx + i] = k; }
    }
  });
  return g;
}

// Multi-source Dijkstra from every exit. Also records which exit each cell drains to.
export function field(g) {
  const N = g.nx * g.nz, D = new Float64Array(N).fill(Infinity), via = new Int8Array(N).fill(-1);
  const heap = [], push = (d, i) => { heap.push([d, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  for (let i = 0; i < N; i++) if (g.goal[i] >= 0) { D[i] = 0; via[i] = g.goal[i]; push(0, i); }
  const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  while (heap.length) {
    const [d, i] = pop(); if (d > D[i]) continue;
    const ci = i % g.nx, cj = (i / g.nx) | 0;
    for (const [di, dj, w] of nb) {
      const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= g.nx || nj >= g.nz) continue;
      const k = nj * g.nx + ni; if (!g.free[k]) continue;
      if (di && dj && (!g.free[cj * g.nx + ni] || !g.free[nj * g.nx + ci])) continue;   // no corner cutting
      const nd = d + w * CS; if (nd < D[k]) { D[k] = nd; via[k] = via[i]; push(nd, k); }
    }
  }
  return { D, via };
}

export const cellAt = (g, x, z) => {
  const i = Math.floor((x - g.x0) / CS), j = Math.floor((z - g.z0) / CS);
  return i < 0 || j < 0 || i >= g.nx || j >= g.nz ? -1 : j * g.nx + i;
};
export const cellPos = (g, k) => [g.x0 + ((k % g.nx) + 0.5) * CS, g.z0 + (((k / g.nx) | 0) + 0.5) * CS];

// Nearest reachable cell to a point (the walker can stand closer to things than the clearance)
export function nearCell(g, F, x, z, maxR = 6) {
  const k0 = cellAt(g, x, z);
  if (k0 >= 0 && isFinite(F.D[k0])) return k0;
  let best = -1, bd = Infinity;
  const ci = Math.floor((x - g.x0) / CS), cj = Math.floor((z - g.z0) / CS);
  for (let dj = -maxR; dj <= maxR; dj++) for (let di = -maxR; di <= maxR; di++) {
    const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= g.nx || j >= g.nz) continue;
    const k = j * g.nx + i; if (!isFinite(F.D[k])) continue;
    const d = di * di + dj * dj; if (d < bd) { bd = d; best = k; }
  }
  return best;
}

// Metres to the nearest exit from a point, adding the short hop to the nearest grid cell
export function distAt(g, F, x, z) {
  const k = nearCell(g, F, x, z); if (k < 0) return Infinity;
  const [cx, cz] = cellPos(g, k);
  return F.D[k] + Math.hypot(cx - x, cz - z);
}

// The shortest route from a point: steepest descent through the field, then thinned to a polyline
export function pathFrom(g, F, x, z) {
  let k = nearCell(g, F, x, z); if (k < 0) return [];
  const pts = [[x, z]], seen = new Set();
  while (k >= 0 && F.D[k] > 0 && !seen.has(k)) {
    seen.add(k);
    const ci = k % g.nx, cj = (k / g.nx) | 0; let best = -1, bd = F.D[k];
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue; const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= g.nx || j >= g.nz) continue;
      const n = j * g.nx + i; if (F.D[n] < bd) { bd = F.D[n]; best = n; }
    }
    k = best; if (k >= 0) pts.push(cellPos(g, k));
  }
  return simplify(pts, 0.12);
}
function simplify(p, eps) {
  if (p.length < 3) return p;
  const [ax, az] = p[0], [bx, bz] = p[p.length - 1], L = Math.hypot(bx - ax, bz - az) || 1;
  let im = 0, dm = 0;
  for (let i = 1; i < p.length - 1; i++) { const d = Math.abs((bx - ax) * (az - p[i][1]) - (ax - p[i][0]) * (bz - az)) / L; if (d > dm) { dm = d; im = i; } }
  if (dm < eps) return [p[0], p[p.length - 1]];
  return simplify(p.slice(0, im + 1), eps).slice(0, -1).concat(simplify(p.slice(im), eps));
}
export const pathLength = p => p.reduce((a, q, i) => i ? a + Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) : 0, 0);

// Direction of the shortest route at a point, looking a few metres ahead (for the sign arrow audit)
export function routeDir(g, F, x, z, ahead = 3) {
  const p = pathFrom(g, F, x, z); let acc = 0;
  for (let i = 1; i < p.length; i++) {
    const s = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    if (acc + s >= ahead || i === p.length - 1) {
      const t = Math.min(1, (ahead - acc) / (s || 1)), ex = p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t, ez = p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t;
      const L = Math.hypot(ex - x, ez - z) || 1; return [(ex - x) / L, (ez - z) / L];
    }
    acc += s;
  }
  return null;
}

// The farthest points from every exit by walking distance; picks one at random among the local
// maxima within 8% of the overall maximum, so each run spawns somewhere a little different.
export function farthest(g, F, rand = Math.random, sep = 5) {
  const N = g.nx * g.nz; let max = 0;
  for (let i = 0; i < N; i++) if (isFinite(F.D[i]) && F.D[i] > max) max = F.D[i];
  const cand = [];
  // only open spots: every cell within 0.75 m is walkable, so nobody starts pressed against a wall
  const open = k => { const ci = k % g.nx, cj = (k / g.nx) | 0; for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) { const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= g.nx || j >= g.nz || !g.free[j * g.nx + i]) return false; } return true; };
  for (let i = 0; i < N; i++) if (isFinite(F.D[i]) && F.D[i] >= max * 0.9 && open(i)) cand.push(i);
  cand.sort((a, b) => F.D[b] - F.D[a]);
  const picks = [];
  for (const k of cand) {
    const [x, z] = cellPos(g, k);
    if (picks.every(p => Math.hypot(p.x - x, p.z - z) > sep)) picks.push({ x, z, d: F.D[k] });
  }
  return { pick: picks[Math.floor(rand() * picks.length)], picks, max };
}

// Ray march on the grid: how far you can see/walk in a direction before hitting something
export function freeRun(g, x, z, dx, dz, max = 12) {
  for (let s = 0; s < max; s += CS) { const k = cellAt(g, x + dx * s, z + dz * s); if (k < 0 || !g.free[k]) return s; }
  return max;
}
