// Switching the three variables (walls, glass, furniture style) and shuffling the layout.
import { S } from '../state.js';
import { $$, hex, shuffle } from '../util.js';
import { setDaylight } from './core.js';
import { setWallFinish, setGlass } from './materials.js';
import { buildFurniture } from './furniture.js';
import { log, toast } from '../ui/feed.js';

export function applyOption(v, id, { silent = false } = {}) {
  const def = S.room.variables[v], opt = def && def.options[id]; if (!opt) return;
  S.choice[v] = id;
  if (v === 'walls') {
    setWallFinish(id);
    S.objects['S-WALL'].meta.Finish = opt.meta;
  } else if (v === 'glass') {
    setGlass(opt);
    setDaylight(opt.vlt, hex(opt.sun));
    for (const o of Object.values(S.objects)) if (o.kind === 'window') o.meta.Glass = opt.meta;
  } else if (v === 'style') {
    buildFurniture(id, S.layout);
  }
  $$(`.obtn[data-v="${v}"]`).forEach(b => b.setAttribute('aria-pressed', b.dataset.o === id));
  if (!silent && S.session) { log('swap', null, `${def.name} → ${opt.name}`); if (!S.subject) toast(`${def.name}: ${opt.name}`); }
}

export function setLayout(layout, { silent = false } = {}) {
  S.layout = { ...layout };
  buildFurniture(S.choice.style, S.layout);
  if (S.session) S.session.layouts.push({ t: +S.session.elapsed.toFixed(1), layout: { ...S.layout } });
  if (!silent && S.session) { log('swap', null, `Layout shuffled: ${Object.entries(S.layout).map(([a, s]) => `${a} ${s}`).join(', ')}`); if (!S.subject) toast('Furniture layout shuffled'); }
}

// Random placement of each area on a spot, respecting any spot's "allow" list.
export function randomLayout(rand = Math.random) {
  const spots = S.room.spots, areas = S.room.clusters;
  for (let tries = 0; tries < 200; tries++) {
    const order = shuffle(spots.map(s => s.id), rand);
    const layout = Object.fromEntries(areas.map((a, i) => [a, order[i]]));
    const ok = areas.every(a => { const s = spots.find(x => x.id === layout[a]); return !s.allow || s.allow.includes(a); });
    if (ok && JSON.stringify(layout) !== JSON.stringify(S.layout)) return layout;
  }
  return { ...S.room.defaultLayout };
}

// Auto-rotate: change one variable at a time, in turn, so each option gets similar time on show.
let rot = null;
export function startAutoRotate(rand = Math.random) {
  rot = { t: 0, k: 0, queues: Object.fromEntries(S.vars.map(v => [v, shuffle(Object.keys(S.room.variables[v].options), rand)])) };
}
export function stopAutoRotate() { rot = null; }
export function tickAutoRotate(dt, every) {
  if (!rot) return;
  rot.t += dt; if (rot.t < every) return;
  rot.t = 0;
  if (!S.vars.length) return;
  const v = S.vars[rot.k % S.vars.length]; rot.k++;
  const q = rot.queues[v], i = (q.indexOf(S.choice[v]) + 1) % q.length;
  applyOption(v, q[i]);
}
