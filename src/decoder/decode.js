// Turns a walk into findings. Four questions:
//   window shape  - rectangular vs arched windows, both always on show (attention share)
//   wall finish, glass, furniture style - options swapped during the walk (attention per minute on show)
// plus where the person spent time, and a check against what they say they prefer.
import { S, CONFIG } from '../state.js';
import { fmt } from '../util.js';
import { topCells } from '../scene/heatmap.js';

const sum = a => a.reduce((x, y) => x + y, 0);

// Test definitions straight from the room file (also used to combine saved walks).
export function testDefs(room) {
  const vars = Object.entries(room.variables).filter(([v]) => S.vars.includes(v)).map(([v, d]) => ({ id: v, name: d.name, question: d.question, kind: 'swap',
    options: Object.entries(d.options).map(([id, o]) => ({ id, label: o.name })) }));
  if (!room.shapeRecs) return vars;
  const shape = { id: 'shape', name: 'Window shape', question: 'Which windows do you prefer?', kind: 'compare',
    options: [{ id: 'W-RECT', label: room.objects['W-RECT'].label }, { id: 'W-CURVE', label: room.objects['W-CURVE'].label }] };
  return [shape, ...vars];
}

function verdict(opts, enough) {
  const total = sum(opts.map(o => o.score));
  opts.forEach(o => { o.share = total ? o.score / total : 0; });
  const ranked = opts.slice().sort((a, b) => b.score - a.score);
  if (!enough || ranked.length < 2) return { ranked, status: 'none', margin: 0, winner: null };
  // How far the top option is ahead of the runner-up, relative to the top score (works for 2 or 4 options)
  const margin = ranked[0].score > 0 ? (ranked[0].score - ranked[1].score) / ranked[0].score : 0;
  const status = margin >= 0.35 ? 'clear' : margin >= 0.12 ? 'leans' : 'split';
  return { ranked, status, margin, winner: status === 'clear' || status === 'leans' ? ranked[0] : null };
}

function shapeTest(room) {
  const opts = ['W-RECT', 'W-CURVE'].map(id => {
    const o = S.objects[id], sent = sum(o.s.notes.map(n => n.sentiment));
    return { id, label: o.label, attn: o.s.attn, gaze: o.s.gaze, captures: o.s.captures, sent, notes: o.s.notes.length,
      lean: room.shapeRecs[id].lean, recs: room.shapeRecs[id].recs, score: Math.max(0.01, o.s.attn + 1.0 * o.s.captures + 4 * sent) };
  });
  const attnTotal = sum(opts.map(o => o.attn));
  return { opts, ...verdict(opts, attnTotal >= 1.5), detail: `${attnTotal.toFixed(1)} s on windows` };
}

function swapTest(room, v) {
  const def = room.variables[v], ex = S.session.exposure[v];
  const opts = Object.entries(def.options).map(([id, o]) => {
    const e = ex[id], eligible = e.time >= CONFIG.minShown;
    const rate = eligible ? (e.attn + 1.2 * e.captures) / (e.time / 60) : null;
    // Each remark point moves the score by 25% (a strong "too dark" can sink a glass that was looked at a lot)
    return { id, label: o.name, lean: o.lean, recs: o.recs, shown: e.time, attn: e.attn, captures: e.captures, sent: e.sentiment, notes: e.notes, rate, eligible,
      score: eligible ? Math.max(0.01, rate * Math.max(0.1, 1 + 0.25 * e.sentiment)) : 0 };
  });
  const el = opts.filter(o => o.eligible);
  return { opts, ...verdict(opts, el.length >= 2 && sum(el.map(o => o.attn)) >= 1), detail: `${el.length} of ${opts.length} shown for ${CONFIG.minShown} s or more` };
}

// What was on show for the tested variables, e.g. "Glass: Fritted dot"
export function onShow(choice) {
  return S.vars.map(v => `${S.room.variables[v].name}: ${S.room.variables[v].options[choice[v]].name}`).join(' · ');
}

export function decode() {
  const room = S.room, ses = S.session;
  const defs = testDefs(room);
  const tests = defs.map(d => {
    const r = d.id === 'shape' ? shapeTest(room) : swapTest(room, d.id);
    const stated = ses.stated[d.id] || null;
    return { ...d, ...r, stated, agree: stated && r.winner ? stated === r.winner.id : null };
  });
  const T = Object.fromEntries(tests.map(t => [t.id, t]));

  // Where time went
  const areas = S.zones.map(z => {
    const st = ses.zones[z.id] || { dwell: 0, visits: 0, firstAt: null };
    const obj = S.objects['F-' + z.area.toUpperCase()];
    return { id: z.id, name: z.name, area: z.area, side: z.side, spot: z.spot, dwell: st.dwell, visits: st.visits, firstAt: st.firstAt, attn: obj ? obj.s.attn : 0 };
  }).sort((a, b) => b.dwell - a.dwell);
  const halves = ses.halves, sideTotal = halves.north + halves.south;

  // Glass to specify: the glass winner, in the winning window shape
  let glass = null;
  if (T.glass.winner) {
    const g = room.variables.glass.options[T.glass.winner.id];
    const shape = T.shape && T.shape.winner ? (T.shape.winner.id === 'W-CURVE' ? 'in arched openings' : 'in rectangular openings') : '';
    const walls = T.walls && T.walls.winner ? `set in ${room.variables.walls.options[T.walls.winner.id].name.toLowerCase()} walls` : '';
    glass = { id: T.glass.winner.id, name: g.name, vlt: g.vlt, full: [g.meta, shape, walls].filter(Boolean).join(', '),
      why: `${g.name} drew ${T.glass.winner.rate.toFixed(0)} attention-seconds per minute on the windows while it was in place${T.glass.winner.sent > 0 ? ', with positive remarks' : ''}.` };
  }

  const decided = tests.filter(t => t.winner);
  const pick = { elements: [], concepts: [], materials: [] };
  decided.slice().sort((a, b) => b.margin - a.margin).forEach(t => {
    for (const k of Object.keys(pick)) (t.winner.recs[k] || []).forEach(x => { if (!pick[k].includes(x)) pick[k].push(x); });
  });
  const profile = decided.map(t => t.winner.lean);

  const why = [];
  const visited = areas.filter(a => a.dwell >= 3);
  why.push({ text: `You walked for ${fmt(ses.elapsed)} and spent at least 3 s in ${visited.length} of ${areas.length} areas. ${decided.length} of ${tests.length} questions have a clear or leaning answer.`, src: `${ses.walked.toFixed(0)} m walked · ${ses.layouts.length} layout${ses.layouts.length === 1 ? '' : 's'} shown` });
  tests.forEach(t => {
    if (t.winner) {
      const r = t.ranked[1];
      let num;
      if (t.kind === 'compare') num = `with ${Math.round(t.winner.share * 100)}% of window attention (${t.winner.attn.toFixed(1)} s against ${r.attn.toFixed(1)} s)`;
      else if ((r.rate || 0) > t.winner.rate && t.winner.sent > r.sent) num = `on remarks: a little less steady looking than ${r.label.toLowerCase()} (${t.winner.rate.toFixed(0)} vs ${(r.rate || 0).toFixed(0)} s/min), but warmer remarks (${t.winner.sent > 0 ? '+' : ''}${t.winner.sent} vs ${r.sent > 0 ? '+' : ''}${r.sent})`;
      else num = `with ${t.winner.rate.toFixed(0)} s of steady looking per minute on show, against ${(r.rate || 0).toFixed(0)} for ${r.label.toLowerCase()}${t.winner.sent ? `, and remarks of ${t.winner.sent > 0 ? '+' : ''}${t.winner.sent}` : ''}`;
      why.push({ text: `${t.name}: ${t.winner.label} came out ahead ${num}. That suggests ${t.winner.lean}.`, src: `${t.status === 'clear' ? 'clear preference' : 'leaning'} · ${t.detail}` });
    } else if (t.status === 'split') why.push({ text: `${t.name}: no clear difference between the options.`, src: t.detail });
    else why.push({ text: `${t.name}: not enough data yet. ${t.kind === 'swap' ? `Show at least two options for ${CONFIG.minShown} s each (use the Design options panel or auto-rotate).` : 'Look at both window walls for a few seconds.'}`, src: t.detail, warn: true });
  });
  if (sideTotal > 10) {
    const south = halves.south / sideTotal;
    const nm = id => (S.objects[id] || { name: 'windows' }).name.toLowerCase();
    why.push({ text: `You spent ${Math.round(south * 100)}% of your time on the ${nm(room.facades.south.id)} side and ${Math.round((1 - south) * 100)}% on the ${nm(room.facades.north.id)} side.`, src: 'time by half of the room' });
  }
  if (areas[0] && areas[0].dwell >= 3) {
    const a = areas[0];
    why.push({ text: `You spent longest in the ${a.name.toLowerCase()} area (${fmt(a.dwell)}), which was ${a.side ? `on the ${(S.objects[room.facades[a.side === 'N' ? 'north' : 'south'].id] || { name: 'window' }).name.toLowerCase()} side` : 'by the kitchen'} in this layout.`, src: `${a.visits} visit${a.visits === 1 ? '' : 's'}` });
  }
  const noteWhy = ses.notes.map(n => {
    const o = n.target ? S.objects[n.target] : null;
    const tone = n.sentiment > 0 ? 'positive' : n.sentiment < 0 ? 'negative' : 'neutral';
    const showing = onShow(n.choice);
    if (!o) return { text: `You said “${n.text}” while not looking at a tagged element. On show: ${showing}.`, src: `${tone} · ${n.source}`, note: true };
    const metaThen = { ...o.meta };
    if (o.kind === 'window' && room.variables.glass && n.choice.glass) metaThen.Glass = room.variables.glass.options[n.choice.glass].meta;
    const facts = Object.entries(metaThen).filter(([k]) => n.cues.includes(k) || (n.cues.includes('Geometry') && k === 'Geometry')).map(([k, v]) => `${k.toLowerCase()}: ${v}`);
    if (!facts.length) facts.push(...Object.entries(metaThen).slice(0, 2).map(([k, v]) => `${k.toLowerCase()}: ${v}`));
    return { text: `You said “${n.text}” while looking at the ${o.name.toLowerCase()}. The app knows its ${facts.join('; ')}.`, src: `${tone} remark · ${n.source} · ${showing}`, note: true };
  });
  const statedN = tests.filter(t => t.agree !== null);
  if (statedN.length) why.push({ text: `Your stated picks matched the decoded preference in ${statedN.filter(t => t.agree).length} of ${statedN.length} questions.`, src: 'stated vs decoded' });

  const evidence = sum(Object.values(S.objects).map(o => o.s.attn)) + 2 * ses.captures.length + 3 * ses.notes.length;
  const confidence = evidence < 15 || decided.length < 2 ? 'low' : evidence < 60 ? 'med' : 'high';
  return { tests, T, areas, halves, glass, pick, profile, why, noteWhy, confidence, decided };
}

export function exportData(d) {
  const ses = S.session;
  return {
    app: 'gaze-decoder', version: 4, room: S.room.id,
    walk: { id: ses.id, participant: ses.participant, started_at: ses.startedAt, seed: ses.seed, duration_s: +ses.elapsed.toFixed(1), walked_m: +ses.walked.toFixed(1), eye_height_m: S.eye, auto_rotate: ses.autoRotate },
    tests: d.tests.map(t => ({ test: t.id, question: t.question, status: t.status, decoded: t.winner ? t.winner.id : null, stated: t.stated, agree: t.agree,
      options: t.opts.map(o => ({ id: o.id, label: o.label, share: +(o.share || 0).toFixed(3), attention: +o.attn.toFixed(2), shown_s: o.shown !== undefined ? +o.shown.toFixed(1) : null, rate: o.rate !== undefined && o.rate !== null ? +o.rate.toFixed(1) : null, sentiment: o.sent })) })),
    areas: d.areas.map(a => ({ area: a.area, spot: a.spot, side: a.side, dwell_s: +a.dwell.toFixed(1), visits: a.visits, attention: +a.attn.toFixed(2) })),
    halves_s: { north: +ses.halves.north.toFixed(1), south: +ses.halves.south.toFixed(1) },
    layouts: ses.layouts,
    glass_preferred: d.glass ? { glass: d.glass.name, vlt: d.glass.vlt } : null,
    objects: Object.fromEntries(Object.entries(S.objects).map(([id, o]) => [id, { name: o.name, attention: +o.s.attn.toFixed(2), gaze_s: +o.s.gaze.toFixed(1), captures: o.s.captures }])),
    notes: ses.notes.map(n => ({ n: n.n, t: n.t, text: n.text, source: n.source, stood_at: n.pos, looking_at: n.target, look_point: n.look, element_as_seen: n.inst, zone: n.zone, on_show: n.choice, sentiment: n.sentiment, cues: n.cues })),
    captures: ses.captures,
    heat: topCells(400).map(c => [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2), +c.w.toFixed(2), c.tag]),
    path: ses.path
  };
}
