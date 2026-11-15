// Element instances: an element as it looked at a moment, e.g. "Arched windows with fritted glass".
// Windows combine their own data with the glass on show, walls take the wall finish on show,
// furniture areas combine their own data with the furniture style on show.
import { S } from '../state.js';

const VAR_FOR = { window: 'glass', wall: 'walls', furniture: 'style' };

export function instKey(id, choice = S.choice) {
  const o = S.objects[id]; if (!o) return id;
  const v = VAR_FOR[o.kind];
  return v ? `${id}|${v}:${choice[v]}` : id;
}

export function blankInst() { return { time: 0, attn: 0, vis: 0, gaze: 0, captures: 0, notes: 0, sentiment: 0, pos: 0, neg: 0 }; }

// Every element instance present right now (used to clock how long each was on show).
export function activeKeys() { return Object.keys(S.objects).map(id => instKey(id)); }

const cache = {};
export function instInfo(key) {
  if (cache[key]) return cache[key];
  const [id, opt] = key.split('|');
  const o = S.objects[id] || { name: id, props: {}, traits: {}, num: {} };
  let option = null, def = null;
  if (opt) { const [v, oid] = opt.split(':'); def = S.room.variables[v]; option = { v, id: oid, ...def.options[oid] }; }
  // Traits: element and option blended (furniture leans on the style, windows split evenly).
  const wEl = o.kind === 'furniture' ? 0.35 : 0.5;
  const traits = {};
  for (const t of S.room.traits || []) {
    const a = (o.traits || {})[t.id], b = option ? (option.traits || {})[t.id] : undefined;
    traits[t.id] = a !== undefined && b !== undefined ? a * wEl + b * (1 - wEl) : (a !== undefined ? a : (b !== undefined ? b : 0));
  }
  // Option properties first (the glass, finish or style on show), then the element's own
  const props = { ...(option ? option.props || {} : {}), ...(o.props || {}) };
  const num = { ...(o.num || {}), ...(option ? option.num || {} : {}) };
  const name = option ? `${o.name} · ${option.name}` : o.name;
  return (cache[key] = { key, id, kind: o.kind, name, short: option ? `${o.label || o.name} · ${option.short || option.name}` : (o.label || o.name), option, traits, props, num });
}
