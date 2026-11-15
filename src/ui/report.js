// The decoded report sheet, focused on one question: which glass, and why.
// Main page: the answer, the glass comparison against the glass's own specification, the facade
// module by module, and the remarks pinned in place. Everything else sits under "Advanced data".
import { S, CONFIG } from '../state.js';
import { $, esc, fmt } from '../util.js';
import { decode, exportData, testDefs, onShow } from '../decoder/decode.js';
import { saveWalk, groupResults, downloadJSON, importWalks, clearWalks, listWalks, downloadText } from '../storage.js';
import { drawPlan } from './plan.js';
import { drawPlanHeat, drawElevation } from './heatviz.js';
import { platform } from '../platform.js';
import { endFixation } from '../tracking/tracker.js';
import { analyse, scheduleCSV, correlations } from '../decoder/insights.js';
import { dnaHTML, matrixHTML, scatterSVG, scatterControls, drawCommentMap, commentRows, scheduleHTML } from './dataviz.js';

let hooks = {};
export function setupReport(h) { hooks = h; addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#report').hidden) closeReport(); }); }
export function closeReport() { $('#report').hidden = true; document.body.classList.remove('report-open'); }

const STATUS = { clear: ['Clear preference', 'high'], leans: ['Leaning', 'med'], split: ['Split', 'low'], none: ['Not enough data', 'low'] };

function testCard(t) {
  const [label, cls] = STATUS[t.status], none = t.status === 'none';
  const maxShare = Math.max(0.0001, ...t.opts.map(o => o.share || 0));
  const rows = t.opts.map(o => {
    let txt;
    if (t.kind === 'compare') txt = `${none ? '' : Math.round(o.share * 100) + '% · '}${o.attn.toFixed(1)} s`;
    else txt = o.eligible ? `${o.rate.toFixed(1)}/min · shown ${Math.round(o.shown)} s` : `shown ${Math.round(o.shown)} s, needs ${CONFIG.minShown}`;
    if (o.sent) txt += o.sent > 0 ? ` · +${o.sent}` : ` · ${o.sent}`;
    const w = none || (t.kind === 'swap' && !o.eligible) ? 0 : (o.share / maxShare * 100);
    return `<div class="opt${t.winner && t.winner.id === o.id ? ' win' : ''}"><span class="ol">${esc(o.label)}</span><div class="bar sig"><span style="width:${w.toFixed(0)}%"></span></div><span class="mono">${txt}</span></div>`;
  }).join('');
  const picks = t.opts.map(o => `<button class="pick" data-test="${t.id}" data-opt="${o.id}" aria-pressed="${t.stated === o.id}">${esc(o.label)}</button>`).join('');
  const agree = t.stated ? (t.agree === null ? '<span class="agree">No decoded answer to compare</span>' : t.agree ? '<span class="agree yes">Matches the decoded preference</span>' : '<span class="agree no">Differs from the decoded preference</span>') : '';
  return `<div class="baycard"><div class="bh"><div><h3>${esc(t.name)}</h3><p>${esc(t.question)}</p></div><span class="chip ${cls}">${label}</span></div>
    <div class="opts">${rows}</div>
    <div class="stated"><span class="k">Your pick</span>${picks}</div>${agree}
    <div class="bf mono">same windows, only the glass changes · steady looking per minute on show</div></div>`;
}

// The glass options side by side: their own specification, then how this person responded.
function specSheet(t) {
  const room = S.room, opts = room.variables.glass.options, ids = Object.keys(opts);
  const win = t && t.winner ? t.winner.id : null, byId = Object.fromEntries((t ? t.opts : []).map(o => [o.id, o]));
  const keys = [...new Set(ids.flatMap(id => Object.keys(opts[id].props || {})))].filter(k => !['Spec section', 'IFC'].includes(k));
  const th = ids.map(id => `<th class="${id === win ? 'win' : ''}">${esc(opts[id].name)}${id === win ? '<br><span class="chip high">preferred</span>' : ''}</th>`).join('');
  const resp = [
    ['Steady looking on the windows', id => byId[id] && byId[id].eligible ? `${byId[id].rate.toFixed(1)} s/min` : '–'],
    ['Time on show', id => byId[id] ? `${Math.round(byId[id].shown)} s` : '–'],
    ['Remarks', id => byId[id] && byId[id].notes ? `${byId[id].sent > 0 ? '+' : ''}${byId[id].sent} (${byId[id].notes})` : '–'],
    ['Share of preference', id => byId[id] && byId[id].eligible ? `${Math.round(byId[id].share * 100)}%` : '–']
  ].map(([k, f]) => `<tr class="resp"><td>${k}</td>${ids.map(id => `<td class="${id === win ? 'win' : ''}">${f(id)}</td>`).join('')}</tr>`).join('');
  const spec = keys.map(k => `<tr><td>${esc(k)}</td>${ids.map(id => `<td class="${id === win ? 'win' : ''}">${esc((opts[id].props || {})[k] || '–')}</td>`).join('')}</tr>`).join('');
  const nums = [['Cost index', 'cost', v => v.toFixed(2)], ['Embodied carbon', 'carbon', v => v + ' kgCO2e/m2'], ['Lead time', 'lead', v => v + ' weeks']]
    .map(([k, n, f]) => `<tr><td>${k}</td>${ids.map(id => `<td class="${id === win ? 'win' : ''}">${opts[id].num && opts[id].num[n] !== undefined ? f(opts[id].num[n]) : '–'}</td>`).join('')}</tr>`).join('');
  return `<div class="tablewrap"><table class="spec"><thead><tr><th></th>${th}</tr></thead><tbody>
    <tr class="sect"><td colspan="${ids.length + 1}">How this person responded</td></tr>${resp}
    <tr class="sect"><td colspan="${ids.length + 1}">Product specification (from the glass metadata)</td></tr>${spec}${nums}</tbody></table></div>`;
}

// Curtain wall attention module by module, from inside and from outside
function moduleStrip() {
  const f = S.room.facades.south; if (f.type !== 'curtain') return '';
  const P = S.session.parts, n = f.modules, mods = [];
  for (let i = 1; i <= n; i++) {
    const id = 'M' + String(i).padStart(2, '0'), v = P[`${id} vision`] || { in: 0, out: 0 }, h = P[`${id} high`] || { in: 0, out: 0 };
    mods.push({ id, vin: v.in, vout: v.out, hin: h.in, hout: h.out, tot: v.in + v.out + h.in + h.out });
  }
  const max = Math.max(0.1, ...mods.map(m => Math.max(m.vin + m.hin, m.vout + m.hout)));
  const top = mods.slice().sort((a, b) => b.tot - a.tot)[0];
  const inT = mods.reduce((a, m) => a + m.vin + m.hin, 0), outT = mods.reduce((a, m) => a + m.vout + m.hout, 0);
  const hiShare = (mods.reduce((a, m) => a + m.hin + m.hout, 0)) / Math.max(0.01, inT + outT);
  const cols = mods.map(m => `<div class="mod${m === top && m.tot > 0.2 ? ' peak' : ''}" title="${m.id}: inside ${(m.vin + m.hin).toFixed(1)} s, outside ${(m.vout + m.hout).toFixed(1)} s">
      <div class="mb"><span class="in" style="height:${((m.vin + m.hin) / max * 100).toFixed(0)}%"></span><span class="out" style="height:${((m.vout + m.hout) / max * 100).toFixed(0)}%"></span></div><span class="ml">${m.id.slice(1)}</span></div>`).join('');
  const read = inT + outT < 0.5 ? 'The curtain wall has not drawn steady looking yet.'
    : `Most-looked module: ${top.id} (${top.tot.toFixed(1)} s). ${Math.round(hiShare * 100)}% of curtain-wall looking went to the high-light panels above the transom. Seen from inside ${inT.toFixed(1)} s, from outside ${outT.toFixed(1)} s.`;
  return `<p class="lead small">${esc(read)}</p><div class="modstrip">${cols}</div>
    <div class="legend inline"><span><i class="c"></i>from inside</span><span><i class="c u"></i>from outside (Facade view)</span></div>`;
}

function groupSection() {
  const g = groupResults(S.room.id, testDefs(S.room));
  if (!g.n) return '<p class="notice">No saved walks yet. Each decoded walk is saved on this device automatically.</p>';
  const rows = g.tests.map(t => `<tr><td>${esc(t.name)}</td><td>${t.rows.map(r => `${esc(r.label)} <b>${r.decoded}</b>`).join(' · ')}${t.split ? ` · split <b>${t.split}</b>` : ''}</td><td>${t.rows.some(r => r.stated) ? t.rows.map(r => `${esc(r.label)} <b>${r.stated}</b>`).join(' · ') : '–'}</td><td>${t.agreeN ? `${t.agreeY}/${t.agreeN}` : '–'}</td></tr>`).join('');
  return `<p class="lead">${g.n} walk${g.n === 1 ? '' : 's'} saved on this device.${g.agreeN ? ` Decoded and stated preferences matched in <b>${g.agreeY} of ${g.agreeN}</b> answers (${Math.round(g.agreeY / g.agreeN * 100)}%).` : ''}</p>
    <div class="tablewrap"><table class="grp"><thead><tr><th>Question</th><th>Decoded preference (count)</th><th>Stated preference (count)</th><th>Agree</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

const hbar = (label, v, max, txt, sig) => `<div class="hb"><span class="hl">${label}</span><div class="bar${sig ? ' sig' : ''}"><span style="width:${(max ? v / max * 100 : 0).toFixed(0)}%"></span></div><span class="mono">${txt}</span></div>`;

export function openReport() {
  endFixation(); S.gaze = { tag: null, t: 0, captured: false, dist: 0 }; S.keys.clear();
  const d = decode(), data = exportData(d), an = analyse();
  const ses = S.session, room = S.room, T = d.T;
  data.design_dna = { findings: an.lines, shared_traits: an.shared.map(s => s.id), strongest: an.favs.map(f => f.key),
    traits: an.stats.map(s => ({ trait: s.id, focus: +s.focus.toFixed(3), in_view: +s.visible.toFixed(3), lift: +s.lift.toFixed(3), positive: +s.liked.toFixed(2), negative: +s.disliked.toFixed(2) })) };
  data.schedule = an.rows.map(r => ({ element: r.key, name: r.name, props: r.props, traits: r.traits, num: r.num, shown_s: +r.time.toFixed(1), attention: +r.attn.toFixed(2), in_view: +r.vis.toFixed(2), per_min: r.rate === null ? null : +r.rate.toFixed(2), captures: r.captures, remarks: r.notes, sentiment: r.sentiment, preference_index: r.prefIdx }));
  data.looking = { deliberate_s: +ses.look.deliberate.toFixed(1), sweeping_s: +ses.look.passing.toFixed(1), outside_s: +ses.look.outside.toFixed(1) };
  data.curtain_wall_modules = ses.parts;
  const saved = saveWalk(data);

  // Glass explorer: only the windows, so every point is the same geometry with a different glass
  const winRows = an.rows.filter(r => r.kind === 'window');
  const anW = { ...an, rows: winRows, numeric: room.numeric || [], corr: correlations(winRows, room.numeric || []) };
  const attr0 = anW.corr.length ? anW.corr[0].id : 'vlt';
  const gT = T.glass, gw = gT && gT.winner ? room.variables.glass.options[gT.winner.id] : null;
  const looked = ses.look.deliberate + ses.look.passing, steadyPct = looked ? Math.round(ses.look.deliberate / looked * 100) : 0;
  const confLabel = { low: 'Low confidence', med: 'Medium confidence', high: 'High confidence' }[d.confidence];
  const chips = gw ? ['VLT', 'g-value (SHGC)', 'U-value (centre pane)', 'Colour rendering Ra', 'External reflectance', 'Acoustic Rw'].filter(k => gw.props[k]).map(k => `<span class="spchip"><i>${esc(k)}</i>${esc(gw.props[k])}</span>`).join('') : '';
  const whyItems = [...d.why, ...d.noteWhy].map(w => `<li class="${w.note ? 'note' : ''}${w.warn ? ' warn' : ''}">${esc(w.text)}<span class="src">${esc(w.src)}</span></li>`).join('');
  const objs = Object.values(S.objects).filter(o => o.s.attn > 0.05).sort((a, b) => b.s.attn - a.s.attn), maxA = objs.length ? objs[0].s.attn : 0;
  const maxD = Math.max(0, ...d.areas.map(a => a.dwell));
  const list = (title, arr) => `<div class="reclist"><h3>${title}</h3>${arr.length ? `<ul>${arr.slice(0, 6).map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="empty">No clear signal yet.</p>'}</div>`;

  $('#report').innerHTML = `<div class="sheet">
    <div class="rhead">
      <div><h1>Decoded walk</h1><p class="mono">${ses.participant ? esc(ses.participant) + ' · ' : ''}${esc(room.name)} · ${fmt(ses.elapsed)} · steady looking ${steadyPct}% · ${ses.look.outside > 1 ? fmt(ses.look.outside) + ' outside · ' : ''}${ses.notes.length} remarks &nbsp;<span class="chip ${d.confidence}">${confLabel}</span>${saved ? '' : ' <span class="chip low">not saved: browser storage is blocked</span>'}</p></div>
      <div class="controls"><button class="btn" id="r-copy">Copy data</button><button class="btn" id="r-dl">Download JSON</button><button class="btn" id="r-new">New walk</button><button class="btn signal" id="r-heat">Review heatmap in 3D</button><button class="btn primary" id="r-back">Keep walking</button></div>
    </div>

    <div class="rsec"><h2>Glass to specify <small>the answer, taken from the preferred glass's own metadata</small></h2>
      ${gw ? `<div class="answer"><div class="an"><span class="k">Preferred glass</span><span class="spec">${esc(gw.name)}</span><span class="mk">${esc(gw.props['Make-up'] || '')}${gw.props['Coating'] ? ' · ' + esc(gw.props['Coating']) : ''}</span>
        <div class="spchips">${chips}</div>
        <p>${esc(gT.winner.label)} drew ${gT.winner.rate.toFixed(1)} s of steady looking per minute on the windows while it was in place, ${Math.round(gT.winner.share * 100)}% of the preference across the ${gT.opts.filter(o => o.eligible).length} glasses shown long enough to compare${gT.winner.sent > 0 ? ', with positive remarks' : gT.winner.sent < 0 ? ', despite negative remarks' : ''}. Specify as: <b>${esc(gw.props['Make-up'] || gw.name)}</b>, ${esc(room.variables.glass.options[gT.winner.id].props['Spec section'] || '08 81 00 Glass Glazing')}.</p></div>
        <div class="av"><span class="k">VLT</span><span class="vlt">${gw.vlt}%</span><span class="k">g-value</span><span class="vlt sm">${esc(gw.props['g-value (SHGC)'] || '–')}</span></div></div>`
      : `<p class="notice">No glass preference yet. Leave auto-rotate on (or press 1 to 4) so each glass is on show for at least ${CONFIG.minShown} s, and look at the windows with a steady view.</p>`}
    </div>

    <div class="grid2">
      <div class="rsec"><h2>Glass comparison</h2>${gT ? testCard(gT) : ''}</div>
      <div class="rsec"><h2>Why <small>the evidence, with the number behind each line</small></h2><ul class="why">${whyItems}</ul></div>
    </div>

    <div class="rsec"><h2>Glass options side by side <small>how this person responded, against each product's specification</small></h2>${specSheet(gT)}</div>

    <div class="rsec"><h2>Glass explorer <small>each dot is a facade with one glass in place · same geometry, so size doesn't bias it</small></h2>
      <div class="xctl">${scatterControls(anW, attr0)}<span class="legend inline"><span><i class="c"></i>positive remarks</span><span><i class="c n"></i>negative remarks</span><span><i class="c u"></i>none</span></span></div>
      <div id="scatter">${scatterSVG(anW, attr0)}</div></div>

    <div class="rsec"><h2>The facade <small>steady looking only · curtain wall module by module, from inside and outside</small></h2>
      <div class="facade">
        <figure class="planbox"><canvas id="hsouth" class="elev"></canvas><figcaption>South curtain wall, unrolled · module numbers along the top</figcaption></figure>
        ${moduleStrip()}
        <figure class="planbox"><canvas id="hnorth" class="elev"></canvas><figcaption>North windows, unrolled</figcaption></figure>
        <div class="heatkey big"></div><div class="heatlab"><span>glanced</span><span>steady, longest</span></div>
      </div></div>

    <div class="rsec"><h2>Comment map <small>every remark pinned where it was made, with a sightline to the point being looked at</small></h2>
      ${ses.notes.length ? `<div class="cmgrid"><figure class="planbox"><canvas id="cmap"></canvas><figcaption>Numbered pins: where you stood · dashed line: what you were looking at · blue positive, orange negative</figcaption></figure>
      <div class="tablewrap"><table class="ctab"><thead><tr><th>#</th><th>What you said</th><th>Time</th><th>Stood at (m)</th><th>Looking at</th><th>On show</th><th>Tone</th></tr></thead><tbody>${commentRows()}</tbody></table></div></div>` : '<p class="notice">No remarks this walk. Press Enter, type, and press Enter again while looking at something: the note is pinned where you stand, with the glass that was in place.</p>'}</div>

    <div class="rsec"><h2>Group results <small>all walks saved on this device</small></h2><div id="group">${groupSection()}</div>
      <div class="controls left"><button class="btn" id="g-export">Export all walks</button><label class="btn" for="g-import">Import walks</label><input type="file" id="g-import" accept="application/json,.json" hidden><button class="btn" id="g-clear">Clear saved walks</button></div></div>

    <div class="rsec" id="ai-sec"${platform.sample ? '' : ' hidden'}><h2>Claude's read <small>a second opinion on the same data</small></h2>
      <div><button class="btn signal" id="r-ai">Ask Claude to interpret this walk</button></div><div class="ai" id="ai-out" hidden></div></div>

    <details class="adv"><summary>Advanced data <small>design traits, element schedule, plan heat, time by area</small></summary>
      <div class="rsec"><h2>Design DNA <small>traits of what drew steady looking and good remarks</small></h2>${dnaHTML(an)}</div>
      <div class="rsec"><h2>Trait matrix</h2>${matrixHTML(an)}</div>
      <div class="rsec"><h2>Element schedule <small>BIM classification and properties, with attention</small></h2>${scheduleHTML(an)}
        <div class="controls left"><button class="btn" id="s-csv">Download schedule (CSV)</button></div></div>
      <div class="grid2">
        <div class="rsec"><h2>Plan heat</h2><figure class="planbox"><canvas id="hplan"></canvas></figure></div>
        <div class="rsec"><h2>Where time went</h2><div class="hbars">${d.areas.map(a => hbar(`${esc(a.name)} <i>${a.spot}</i>`, a.dwell, maxD, `${fmt(a.dwell)} · ${a.visits} visit${a.visits === 1 ? '' : 's'}`)).join('')}</div>
          <h2 style="margin-top:14px">Attention by element</h2><div class="hbars">${objs.map(o => hbar(esc(o.name), o.s.attn, maxA, `${o.s.attn.toFixed(1)} s`, o.kind === 'window')).join('')}</div>
          <h2 style="margin-top:14px">Path</h2><div class="planbox"><canvas id="rplan"></canvas></div></div>
      </div>
      <div class="rsec"><h2>Suggested direction</h2><div class="grid3">${list('Design elements', d.pick.elements)}${list('Concepts', d.pick.concepts)}${list('Materials', d.pick.materials)}</div></div>
    </details>
    <div class="rsec" id="json-sec" hidden><h2>Session data</h2><textarea id="jsonbox" readonly></textarea></div>
  </div>`;
  const rep = $('#report'); const keep = rep.hidden ? 0 : rep.scrollTop;
  rep.hidden = false; rep.scrollTop = keep;
  document.body.classList.add('report-open');   // hides the room and its floating panels underneath (see styles.css)
  const drawAll = () => { drawElevation($('#hsouth'), 'south'); drawElevation($('#hnorth'), 'north'); if ($('#cmap')) drawCommentMap($('#cmap')); };
  requestAnimationFrame(drawAll);
  $('details.adv').addEventListener('toggle', e => { if (e.target.open) requestAnimationFrame(() => { drawPlanHeat($('#hplan')); drawPlan($('#rplan'), true); }); });

  rep.querySelectorAll('.pick').forEach(b => b.addEventListener('click', () => { ses.stated[b.dataset.test] = b.dataset.opt; openReport(); }));
  $('#xattr').onchange = e => { $('#scatter').innerHTML = scatterSVG(anW, e.target.value); };
  $('#s-csv').onclick = () => downloadText(`${data.walk.id}-element-schedule.csv`, scheduleCSV(an), 'text/csv');
  $('#r-back').onclick = closeReport;
  $('#r-new').onclick = () => { closeReport(); hooks.onNewWalk(); };
  $('#r-heat').onclick = () => { closeReport(); hooks.onReview(); };
  $('#r-dl').onclick = () => downloadJSON(`${data.walk.id}.json`, data);
  $('#r-copy').onclick = () => {
    const txt = JSON.stringify(data, null, 2);
    const show = () => { $('#json-sec').hidden = false; const b = $('#jsonbox'); b.value = txt; b.focus(); b.select(); };
    try { navigator.clipboard.writeText(txt).then(() => { $('#r-copy').textContent = 'Copied'; }, show); } catch (e) { show(); }
  };
  $('#g-export').onclick = () => downloadJSON(`visual-vibes-walks-${new Date().toISOString().slice(0, 10)}.json`, listWalks());
  $('#g-import').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(t => { const n = importWalks(JSON.parse(t)); $('#group').innerHTML = groupSection(); $('#g-export').textContent = `Imported ${n}`; })
      .catch(() => { $('#group').insertAdjacentHTML('afterbegin', '<p class="notice">That file is not a Visual Vibes walk export.</p>'); });
  };
  let armed = false;
  $('#g-clear').onclick = () => {
    if (!armed) { armed = true; $('#g-clear').textContent = `Click again to delete ${listWalks().length} saved walks`; return; }
    clearWalks(); $('#group').innerHTML = groupSection(); $('#g-clear').textContent = 'Cleared'; armed = false;
  };
  const ai = $('#r-ai'); if (ai) ai.onclick = () => askClaude(data);
}

function mdLite(t) {
  const out = []; let inList = false;
  esc(t).split('\n').forEach(line => {
    const l = line.trim();
    if (/^[-*•] /.test(l)) { if (!inList) { out.push('<ul>'); inList = true; } out.push(`<li>${l.slice(2).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</li>`); return; }
    if (inList) { out.push('</ul>'); inList = false; }
    if (/^#{1,4} /.test(l)) out.push(`<h4>${l.replace(/^#+ /, '')}</h4>`);
    else if (l) out.push(`<p>${l.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</p>`);
  });
  if (inList) out.push('</ul>');
  return out.join('');
}

let aiAbort = null;
async function askClaude(data) {
  const out = $('#ai-out'), btn = $('#r-ai');
  out.hidden = false; out.innerHTML = '<p class="empty">Reading the walk…</p>'; btn.disabled = true;
  if (aiAbort) aiAbort.abort(); aiAbort = new AbortController();
  const glass = Object.fromEntries(Object.entries(S.room.variables.glass.options).map(([id, o]) => [id, o.props]));
  const slim = { tests: data.tests, glass_specs: glass, looking: data.looking, curtain_wall_modules: data.curtain_wall_modules, notes: data.notes, walk: data.walk };
  const prompt = `You are a facade consultant and design researcher. A person walked a garden apartment in first person: a unitized aluminium curtain wall (11 modules, transom at 2.7 m) on the sunny south side, punched windows on the north, the same glass on both. The glass was switched between four products during the walk; walls and furniture were fixed. Only steady looking counts as attention (sweeping while walking or turning is excluded). Glass options are compared by steady looking per minute on show, plus remarks; "stated" is what the person said they preferred afterwards. Each note records where the person stood and what was on show.

Data (JSON):
${JSON.stringify(slim)}

Write a short brief for the architect:
## Recommendation
The glass to specify, by name and make-up, with VLT and g-value from its specification.
## Evidence
3 bullets from the behaviour and remarks, citing numbers. Say where stated and decoded preferences disagree.
## Facade
1 to 2 sentences on which curtain-wall modules or panels drew looking, inside versus outside.
## Confidence
One sentence on what a single walk can support.

Use '## ' headings and '- ' bullets only. Under 250 words. Plain, direct language.`;
  try {
    const r = await platform.sample(prompt, { signal: aiAbort.signal, onText: ({ text }) => { out.innerHTML = mdLite(text); } });
    out.innerHTML = mdLite(r.text);
  } catch (err) {
    if (err && err.code === 'not_granted') $('#ai-sec').hidden = true;
    else out.innerHTML = `<p class="err">${esc(err && err.code === 'rate_limited' ? 'Claude is busy right now. Try again in a minute.' : 'Claude could not answer this time. The reading above still stands.')}</p>`;
  } finally { btn.disabled = false; btn.textContent = 'Ask again'; }
}
