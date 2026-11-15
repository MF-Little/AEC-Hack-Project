// Report visualisations built on element metadata: Design DNA, trait matrix,
// attribute explorer (scatter), comment map and the element schedule.
import { S } from '../state.js';
import { esc, clockFmt } from '../util.js';
import { valueOf, pearson } from '../decoder/insights.js';
import { planFrame, drawWalls, drawFurniture } from './plan.js';
import { onShow } from '../decoder/decode.js';

const pct = v => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;

/* ---------- 1. Design DNA: focus vs in view, and what comments clustered on ---------- */
export function dnaHTML(an) {
  const maxL = Math.max(0.15, ...an.stats.map(s => Math.abs(s.lift)));
  const maxC = Math.max(0.5, ...an.stats.map(s => Math.max(s.liked, s.disliked)));
  const rows = an.stats.slice().sort((a, b) => b.lift - a.lift).map(s => {
    const w = Math.abs(s.lift) / maxL * 50, left = s.lift >= 0 ? 50 : 50 - w;
    const shared = an.shared.some(x => x.id === s.id);
    return `<div class="dna${shared ? ' shared' : ''}"><span class="dl">${esc(s.label)}${shared ? ' <b class="tag2">shared</b>' : ''}</span>
      <div class="dbar" title="focus ${s.focus.toFixed(2)} vs in view ${s.visible.toFixed(2)}"><i class="axis"></i><span class="${s.lift >= 0 ? 'up' : 'down'}" style="left:${left.toFixed(1)}%;width:${w.toFixed(1)}%"></span></div>
      <span class="mono dv">${s.visible > 0.02 ? pct(s.lift) : '–'}</span>
      <div class="dcom"><span class="pos" style="width:${(s.liked / maxC * 100).toFixed(0)}%"></span></div><span class="mono dv">${s.liked ? '+' + s.liked.toFixed(1) : ''}</span>
      <div class="dcom"><span class="neg" style="width:${(s.disliked / maxC * 100).toFixed(0)}%"></span></div><span class="mono dv">${s.disliked ? '−' + s.disliked.toFixed(1) : ''}</span></div>`;
  }).join('');
  return `<ul class="findings">${an.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
    <div class="dnagrid"><div class="dna head"><span class="dl">Trait</span><span class="mono">sought out vs in view</span><span></span><span class="mono">positive remarks</span><span></span><span class="mono">negative remarks</span><span></span></div>${rows}</div>
    <p class="cap">Bars right of the centre line: you centred your view on this trait more than it appeared around you. Remark bars weight each comment by how strongly the element you were looking at carries the trait.</p>`;
}

/* ---------- 2. Trait matrix: elements x traits ---------- */
export function matrixHTML(an) {
  const traits = S.room.traits || [];
  const top = an.rows.filter(r => r.attn > 0.05 || r.notes).slice(0, 14);
  if (!top.length) return '<p class="notice">No element has drawn attention yet.</p>';
  const maxA = Math.max(...top.map(r => r.attn));
  const head = `<tr><th>Element as seen</th><th>Attention</th><th>Remarks</th>${traits.map(t => `<th class="vt"><span>${esc(t.label)}</span></th>`).join('')}</tr>`;
  const body = top.map(r => `<tr${an.favs.includes(r) ? ' class="fav"' : ''}><td>${esc(r.short)}</td>
    <td><div class="bar sig mini"><span style="width:${(r.attn / maxA * 100).toFixed(0)}%"></span></div><span class="mono">${r.attn.toFixed(1)}</span></td>
    <td class="mono">${r.notes ? `<span class="${r.sentiment > 0 ? 'pos' : r.sentiment < 0 ? 'neg' : ''}">${r.sentiment > 0 ? '+' : ''}${r.sentiment}</span> (${r.notes})` : '–'}</td>
    ${traits.map(t => { const v = r.traits[t.id]; return `<td class="cell" style="--v:${v.toFixed(2)}" title="${esc(t.label)}: ${v.toFixed(2)}"></td>`; }).join('')}</tr>`).join('');
  const sharedRow = an.shared.length ? `<tr class="sharedrow"><td colspan="3">Shared by your strongest elements</td>${traits.map(t => `<td class="mono">${an.shared.some(s => s.id === t.id) ? '●' : ''}</td>`).join('')}</tr>` : '';
  return `<div class="tablewrap"><table class="matrix"><thead>${head}</thead><tbody>${body}${sharedRow}</tbody></table></div>
    <p class="cap">Darker cells mean the element carries more of that trait. Rows are sorted by preference (attention, sustained looks and remarks). Highlighted rows are your strongest elements.</p>`;
}

/* ---------- 3. Attribute explorer: any property vs attention per minute on show ---------- */
export function scatterSVG(an, attrId) {
  const meta = an.numeric.find(n => n.id === attrId);
  const pts = an.rows.filter(r => r.rate !== null && valueOf(r, attrId) !== undefined).map(r => ({ r, x: valueOf(r, attrId), y: r.rate }));
  if (pts.length < 2) return `<p class="notice">Too few elements with “${esc(meta ? meta.label : attrId)}” and at least 5 s on show to plot.</p>`;
  const W = 680, H = 360, ml = 56, mr = 24, mt = 22, mb = 48;
  let x0 = Math.min(...pts.map(p => p.x)), x1 = Math.max(...pts.map(p => p.x));
  if (x0 === x1) { x0 -= 1; x1 += 1; }
  const padx = (x1 - x0) * 0.08; x0 -= padx; x1 += padx;
  const y1 = Math.max(...pts.map(p => p.y)) * 1.15 || 1;
  const X = v => ml + (v - x0) / (x1 - x0) * (W - ml - mr), Y = v => H - mb - v / y1 * (H - mt - mb);
  const nice = (a, b, n = 5) => { const st = Math.pow(10, Math.floor(Math.log10((b - a) / n))); const s = [1, 2, 5, 10].map(k => k * st).find(k => (b - a) / k <= n) || st * 10; const out = []; for (let v = Math.ceil(a / s) * s; v <= b + 1e-9; v += s) out.push(+v.toFixed(6)); return out; };
  const xt = nice(x0, x1), yt = nice(0, y1);
  const fit = pearson(pts.map(p => [p.x, p.y]));
  const trend = fit ? `<line x1="${X(x0)}" y1="${Y(fit.intercept + fit.slope * x0)}" x2="${X(x1)}" y2="${Y(fit.intercept + fit.slope * x1)}" class="trend"/>` : '';
  const labelled = pts.slice().sort((a, b) => b.y - a.y).slice(0, 7);
  const dots = pts.map(p => {
    const rr = Math.min(16, 5 + p.r.captures * 2 + p.r.notes * 2);
    const cls = p.r.sentiment > 0 ? 'pos' : p.r.sentiment < 0 ? 'neg' : 'neu';
    return `<circle cx="${X(p.x).toFixed(1)}" cy="${Math.max(mt, Y(p.y)).toFixed(1)}" r="${rr}" class="pt ${cls}"><title>${esc(p.r.name)}: ${p.x} · ${p.y.toFixed(1)} attention-s/min · ${p.r.captures} captures · ${p.r.notes} remarks</title></circle>`;
  }).join('');
  const labels = labelled.map(p => { const right = X(p.x) > W - 150; return `<text x="${(X(p.x) + (right ? -9 : 9)).toFixed(1)}" y="${(Math.max(mt + 12, Y(p.y)) - 8).toFixed(1)}" class="pl" text-anchor="${right ? 'end' : 'start'}">${esc(p.r.short)}</text>`; }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="scatter" role="img" aria-label="${esc(meta ? meta.label : attrId)} against attention per minute">
    ${yt.map(v => `<line x1="${ml}" x2="${W - mr}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${ml - 8}" y="${Y(v) + 4}" class="tk" text-anchor="end">${v}</text>`).join('')}
    ${xt.map(v => `<line x1="${X(v)}" x2="${X(v)}" y1="${H - mb}" y2="${H - mb + 5}" class="ax"/><text x="${X(v)}" y="${H - mb + 18}" class="tk" text-anchor="middle">${v}</text>`).join('')}
    <line x1="${ml}" x2="${W - mr}" y1="${H - mb}" y2="${H - mb}" class="ax"/><line x1="${ml}" x2="${ml}" y1="${mt}" y2="${H - mb}" class="ax"/>
    ${trend}${dots}${labels}
    <text x="${(ml + W - mr) / 2}" y="${H - 8}" class="tl" text-anchor="middle">${esc(meta ? meta.label : attrId)}</text>
    <text x="14" y="${(mt + H - mb) / 2}" class="tl" text-anchor="middle" transform="rotate(-90 14 ${(mt + H - mb) / 2})">Attention-seconds per minute on show</text>
    ${fit ? `<text x="${W - mr}" y="${mt + 2}" class="rv" text-anchor="end">r = ${fit.r.toFixed(2)} · ${pts.length} elements</text>` : ''}
  </svg>
  <p class="cap">r runs from −1 to 1; beyond ±0.5 with five or more elements is worth a look. Large surfaces such as walls and floor take up more of the view, so compare like with like, and treat a single walk as a lead to test, not a result.</p>`;
}
export function scatterControls(an, current) {
  return `<label for="xattr" class="k">Compare attention with</label> <select id="xattr">${an.numeric.map(n => {
    const c = an.corr.find(x => x.id === n.id);
    return `<option value="${n.id}"${n.id === current ? ' selected' : ''}>${esc(n.label)}${c ? `  (r ${c.r.toFixed(2)})` : ''}</option>`;
  }).join('')}</select>`;
}

/* ---------- 4. Comment map: where each remark was made, and the sightline to what was seen ---------- */
export function drawCommentMap(cv) {
  const f = planFrame(cv, true); if (!f) return;
  const { c, X, Z, sc, ink, sig, mute } = f;
  drawFurniture(f); drawWalls(f);
  const warm = getComputedStyle(document.documentElement).getPropertyValue('--warm').trim();
  const pts = S.session.path;
  if (pts.length > 1) { c.strokeStyle = mute; c.globalAlpha = 0.35; c.beginPath(); pts.forEach(([x, z], i) => i ? c.lineTo(X(x), Z(z)) : c.moveTo(X(x), Z(z))); c.stroke(); c.globalAlpha = 1; }
  S.session.notes.forEach(n => {
    const col = n.sentiment > 0 ? sig : n.sentiment < 0 ? warm : ink;
    if (n.look) {
      c.strokeStyle = col; c.setLineDash([4, 3]); c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(X(n.pos.x), Z(n.pos.z)); c.lineTo(X(n.look.x), Z(n.look.z)); c.stroke(); c.setLineDash([]);
      c.fillStyle = col; c.beginPath(); c.arc(X(n.look.x), Z(n.look.z), 3, 0, 7); c.fill();
    }
    c.fillStyle = col; c.beginPath(); c.arc(X(n.pos.x), Z(n.pos.z), 10, 0, 7); c.fill();
    c.fillStyle = '#fff'; c.font = '600 11px "IBM Plex Mono", monospace'; c.textAlign = 'center'; c.fillText(String(n.n), X(n.pos.x), Z(n.pos.z) + 4);
  });
  c.lineWidth = 1;
}
export function commentRows() {
  const room = S.room;
  return S.session.notes.map(n => `<tr><td class="mono"><b class="pin ${n.sentiment > 0 ? 'p' : n.sentiment < 0 ? 'n' : ''}">${n.n}</b></td><td class="q">“${esc(n.text)}”</td><td>${clockFmt(n.t)}</td>
    <td>x ${n.pos.x}, z ${n.pos.z}<br><span class="sub">heading ${n.pos.heading}°, eye ${n.pos.eye} m</span></td>
    <td>${n.target ? esc(S.objects[n.target].name) : 'nothing tagged'}${n.look ? `<br><span class="sub">point ${n.look.x}, ${n.look.y}, ${n.look.z} · ${n.look.dist} m away</span>` : ''}</td>
    <td>${esc(onShow(n.choice))}</td>
    <td>${n.sentiment > 0 ? '+' + n.sentiment : n.sentiment}</td></tr>`).join('');
}

/* ---------- 5. Element schedule ---------- */
export function scheduleHTML(an) {
  const rows = an.rows.map(r => {
    const keys = Object.entries(r.props).filter(([k]) => !['IFC class', 'Classification', 'Spec section'].includes(k)).slice(0, 6);
    return `<tr><td><b>${esc(r.name)}</b></td><td class="mono sm">${esc(r.props['IFC class'] || '–')}</td><td class="sm">${esc(r.props['Classification'] || '–')}<br><span class="sub">${esc(r.props['Spec section'] || '')}</span></td>
      <td class="sm">${keys.map(([k, v]) => `<span class="kv"><i>${esc(k)}</i> ${esc(v)}</span>`).join('')}</td>
      <td class="mono">${Math.round(r.time)}</td><td class="mono">${r.attn.toFixed(1)}</td><td class="mono">${r.rate === null ? '–' : r.rate.toFixed(1)}</td><td class="mono">${r.captures}</td>
      <td class="mono">${r.notes ? (r.sentiment > 0 ? '+' : '') + r.sentiment : '–'}</td><td><div class="bar sig mini"><span style="width:${r.prefIdx}%"></span></div><span class="mono">${r.prefIdx}</span></td></tr>`;
  }).join('');
  return `<div class="tablewrap"><table class="sched"><thead><tr><th>Element as seen</th><th>IFC class</th><th>Classification · spec</th><th>Key properties</th><th>Shown s</th><th>Attention s</th><th>Per min</th><th>Capt.</th><th>Remarks</th><th>Preference</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
