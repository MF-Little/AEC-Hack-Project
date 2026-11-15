// Metadata analysis: what the things that drew attention and good comments have in common.
//   focus   = centre-weighted attention (what the person looked at)
//   visible = every ray counted equally (what was merely in view)
// A trait's lift = focus mean / visible mean - 1: positive means the person sought it out.
import { S } from '../state.js';
import { instInfo } from './instances.js';

const sum = a => a.reduce((x, y) => x + y, 0);
const avg = a => a.length ? sum(a) / a.length : 0;

export const valueOf = (r, id) => id.startsWith('trait:') ? r.traits[id.slice(6)] : r.num[id];

export function pearson(pts) {
  const n = pts.length; if (n < 3) return null;
  const mx = avg(pts.map(p => p[0])), my = avg(pts.map(p => p[1]));
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pts) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  if (sxx === 0 || syy === 0) return null;
  const r = sxy / Math.sqrt(sxx * syy), slope = sxy / sxx;
  return { r, slope, intercept: my - slope * mx };
}

export function correlations(rows, numeric) {
  return numeric.map(nm => {
    const pts = rows.filter(r => r.rate !== null && valueOf(r, nm.id) !== undefined).map(r => [valueOf(r, nm.id), r.rate]);
    const fit = pearson(pts);
    return { ...nm, n: pts.length, r: fit ? fit.r : null };
  }).filter(c => c.r !== null).sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
}

export function analyse() {
  const ses = S.session, traits = S.room.traits || [];
  const rows = Object.entries(ses.inst)
    .filter(([, v]) => v.time > 0.5 || v.attn > 0)
    .map(([key, v]) => ({ ...instInfo(key), ...v, rate: v.time >= 5 ? v.attn / (v.time / 60) : null }));
  const totA = sum(rows.map(r => r.attn)), totV = sum(rows.map(r => r.vis));

  const stats = traits.map(t => {
    const focus = totA ? sum(rows.map(r => r.attn * r.traits[t.id])) / totA : 0;
    const visible = totV ? sum(rows.map(r => r.vis * r.traits[t.id])) / totV : 0;
    let liked = 0, disliked = 0;
    ses.notes.forEach(n => {
      if (!n.inst) return;
      const tv = instInfo(n.inst).traits[t.id] || 0;
      if (n.sentiment > 0) liked += n.sentiment * tv; else if (n.sentiment < 0) disliked -= n.sentiment * tv;
    });
    return { ...t, focus, visible, lift: visible > 0.02 ? focus / visible - 1 : 0, liked, disliked };
  });

  // Preference per element instance: attention, sustained looks and what was said about it
  rows.forEach(r => { r.pref = r.attn + 1.5 * r.captures + 3 * r.pos - 3 * r.neg; });
  rows.sort((a, b) => b.pref - a.pref);
  const maxP = Math.max(0.01, ...rows.map(r => r.pref));
  rows.forEach(r => { r.prefIdx = Math.round(Math.max(0, r.pref) / maxP * 100); });

  // Favourites: the strongest elements that weren't spoken of badly. Shared traits: high on all of them.
  const favs = rows.filter(r => (r.attn >= 0.8 || r.pos > 0) && r.neg <= r.pos && r.kind !== 'surface').slice(0, 4);
  const shared = favs.length >= 2 ? traits.map(t => {
    const vals = favs.map(f => f.traits[t.id]);
    return { ...t, mean: avg(vals), min: Math.min(...vals) };
  }).filter(x => x.mean >= 0.55 && x.min >= 0.35).sort((a, b) => b.mean - a.mean) : [];
  const avoided = rows.filter(r => r.neg > r.pos).slice(0, 3);

  // Every numeric property and every trait, tested against attention per minute on show
  const numeric = (S.room.numeric || []).concat(traits.map(t => ({ id: 'trait:' + t.id, label: `${t.label} (trait score)` })));
  const corr = correlations(rows, numeric);

  // Plain-language findings
  const lines = [];
  if (shared.length) lines.push(`What your strongest elements (${favs.map(f => f.short).join(', ')}) have in common: ${shared.slice(0, 4).map(s => s.label.toLowerCase()).join('; ')}.`);
  const byLift = stats.filter(s => s.visible > 0.05).slice().sort((a, b) => b.lift - a.lift);
  if (byLift.length >= 2) {
    const up = byLift.filter(s => s.lift > 0.08).slice(0, 3), down = byLift.filter(s => s.lift < -0.08).slice(-2).reverse();
    if (up.length) lines.push(`You sought out ${up.map(s => `${s.label.toLowerCase()} (${s.lift > 0 ? '+' : ''}${Math.round(s.lift * 100)}%)`).join(', ')} more than they simply appeared in view.`);
    if (down.length) lines.push(`You looked past ${down.map(s => `${s.label.toLowerCase()} (${Math.round(s.lift * 100)}%)`).join(', ')}.`);
  }
  const likedTop = stats.filter(s => s.liked > 0.3).sort((a, b) => b.liked - a.liked).slice(0, 3);
  const dislikedTop = stats.filter(s => s.disliked > 0.3).sort((a, b) => b.disliked - a.disliked).slice(0, 2);
  if (likedTop.length) lines.push(`Positive remarks clustered on ${likedTop.map(s => s.label.toLowerCase()).join(', ')}.`);
  if (dislikedTop.length) lines.push(`Negative remarks clustered on ${dislikedTop.map(s => s.label.toLowerCase()).join(', ')}.`);
  const strong = corr.filter(c => Math.abs(c.r) >= 0.5 && c.n >= 4).slice(0, 2);
  strong.forEach(c => lines.push(`Attention ${c.r > 0 ? 'rose' : 'fell'} as ${c.label.replace(/ \(.*\)$/, '').toLowerCase()} went up (r = ${c.r.toFixed(2)}, ${c.n} elements).`));
  if (avoided.length) lines.push(`Spoken of badly: ${avoided.map(a => a.short).join(', ')}.`);
  if (!lines.length) lines.push('Not enough looking or remarks yet to find a pattern. Walk for a few minutes, switch options, and say what you notice.');

  return { rows, stats, favs, shared, avoided, numeric, corr, lines, totA, totV };
}

// Element schedule as CSV, for BIM and spreadsheet tools
export function scheduleCSV(an) {
  const propKeys = [...new Set(an.rows.flatMap(r => Object.keys(r.props)))];
  const traitIds = (S.room.traits || []).map(t => t.id);
  const head = ['Element', 'Base element id', 'Option', ...propKeys, ...traitIds.map(t => 'trait_' + t), 'shown_s', 'attention_s', 'attention_per_min', 'in_view_s', 'captures', 'comments', 'sentiment', 'preference_index'];
  const q = v => `"${String(v === undefined || v === null ? '' : v).replace(/"/g, '""')}"`;
  const lines = an.rows.map(r => [r.name, r.id, r.option ? r.option.name : '', ...propKeys.map(k => r.props[k]), ...traitIds.map(t => r.traits[t].toFixed(2)),
    r.time.toFixed(1), r.attn.toFixed(2), r.rate === null ? '' : r.rate.toFixed(2), r.vis.toFixed(2), r.captures, r.notes, r.sentiment, r.prefIdx].map(q).join(','));
  return [head.map(q).join(','), ...lines].join('\n');
}
