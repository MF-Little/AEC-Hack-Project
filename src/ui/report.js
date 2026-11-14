// The decoded report sheet.
import { S, CONFIG } from '../state.js';
import { $, esc, fmt, clockFmt } from '../util.js';
import { decode, exportData, testDefs } from '../decoder/decode.js';
import { saveWalk, groupResults, downloadJSON, importWalks, clearWalks, listWalks } from '../storage.js';
import { drawPlan } from './plan.js';
import { drawPlanHeat, drawElevation } from './heatviz.js';
import { platform } from '../platform.js';
import { endFixation } from '../tracking/tracker.js';

let hooks = {};
export function setupReport(h) { hooks = h; addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#report').hidden) closeReport(); }); }
export function closeReport() { $('#report').hidden = true; }

const STATUS = { clear: ['Clear preference', 'high'], leans: ['Leaning', 'med'], split: ['Split', 'low'], none: ['Not enough data', 'low'] };

function testCard(t) {
  const [label, cls] = STATUS[t.status], none = t.status === 'none';
  const maxShare = Math.max(0.0001, ...t.opts.map(o => o.share || 0));
  const rows = t.opts.map(o => {
    let txt;
    if (t.kind === 'compare') txt = `${none ? '' : Math.round(o.share * 100) + '% · '}${o.attn.toFixed(1)} s`;
    else txt = o.eligible ? `${o.rate.toFixed(0)}/min · shown ${Math.round(o.shown)} s` : `shown ${Math.round(o.shown)} s, needs ${CONFIG.minShown}`;
    if (o.sent) txt += o.sent > 0 ? ` · +${o.sent}` : ` · ${o.sent}`;
    const w = none || (t.kind === 'swap' && !o.eligible) ? 0 : (o.share / maxShare * 100);
    return `<div class="opt${t.winner && t.winner.id === o.id ? ' win' : ''}"><span class="ol">${esc(o.label)}</span><div class="bar sig"><span style="width:${w.toFixed(0)}%"></span></div><span class="mono">${txt}</span></div>`;
  }).join('');
  const picks = t.opts.map(o => `<button class="pick" data-test="${t.id}" data-opt="${o.id}" aria-pressed="${t.stated === o.id}">${esc(o.label)}</button>`).join('');
  const agree = t.stated ? (t.agree === null ? '<span class="agree">No decoded answer to compare</span>' : t.agree ? '<span class="agree yes">Matches the decoded preference</span>' : '<span class="agree no">Differs from the decoded preference</span>') : '';
  return `<div class="baycard"><div class="bh"><div><h3>${esc(t.name)}</h3><p>${esc(t.question)}</p></div><span class="chip ${cls}">${label}</span></div>
    <div class="opts">${rows}</div>
    <div class="stated"><span class="k">Your pick</span>${picks}</div>${agree}
    <div class="bf mono">${t.kind === 'compare' ? 'both always on show · attention share' : 'swapped during the walk · attention per minute on show'}</div></div>`;
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
  const d = decode(), data = exportData(d);
  const saved = saveWalk(data);
  const ses = S.session, room = S.room;
  const confLabel = { low: 'Low confidence', med: 'Medium confidence', high: 'High confidence' }[d.confidence];
  const list = (title, arr) => `<div class="reclist"><h3>${title}</h3>${arr.length ? `<ul>${arr.slice(0, 6).map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="empty">No clear signal yet.</p>'}</div>`;
  const whyItems = [...d.why, ...d.noteWhy].map(w => `<li class="${w.note ? 'note' : ''}${w.warn ? ' warn' : ''}">${esc(w.text)}<span class="src">${esc(w.src)}</span></li>`).join('');
  const objs = Object.values(S.objects).filter(o => o.s.attn > 0.05).sort((a, b) => b.s.attn - a.s.attn);
  const maxA = objs.length ? objs[0].s.attn : 0;
  const elemBars = objs.map(o => hbar(esc(o.name), o.s.attn, maxA, `${o.s.attn.toFixed(1)} s · ${o.s.captures} capt.`, o.kind === 'window')).join('') || '<p class="empty">No attention recorded yet.</p>';
  const maxD = Math.max(0, ...d.areas.map(a => a.dwell));
  const areaBars = d.areas.map(a => hbar(`${esc(a.name)} <i>${a.spot}</i>`, a.dwell, maxD, `${fmt(a.dwell)} · ${a.visits} visit${a.visits === 1 ? '' : 's'}`)).join('');
  const sideT = ses.halves.north + ses.halves.south, south = sideT ? ses.halves.south / sideT : 0;
  const noteRows = ses.notes.map(n => `<tr><td class="q">“${esc(n.text)}”</td><td>${clockFmt(n.t)}</td><td>${n.target ? esc(S.objects[n.target].name) : 'room'}</td><td>${esc(room.variables.walls.options[n.choice.walls].name)} · ${esc(room.variables.glass.options[n.choice.glass].name)} · ${esc(room.variables.style.options[n.choice.style].name)}</td><td>${n.sentiment > 0 ? '+' + n.sentiment : n.sentiment}</td></tr>`).join('');

  $('#report').innerHTML = `<div class="sheet">
    <div class="rhead">
      <div><h1>Decoded walk</h1><p class="mono">${ses.participant ? esc(ses.participant) + ' · ' : ''}${esc(room.name)} · ${fmt(ses.elapsed)} · ${ses.walked.toFixed(0)} m · ${ses.captures.length} captures · ${ses.notes.length} notes &nbsp;<span class="chip ${d.confidence}">${confLabel}</span>${saved ? '' : ' <span class="chip low">not saved: browser storage is blocked</span>'}</p></div>
      <div class="controls"><button class="btn" id="r-copy">Copy data</button><button class="btn" id="r-dl">Download JSON</button><button class="btn" id="r-new">New walk</button><button class="btn signal" id="r-heat">Review heatmap in 3D</button><button class="btn primary" id="r-back">Keep walking</button></div>
    </div>

    <div class="rsec"><h2>Profile <small>what this walk leans toward</small></h2>
      <p class="lead">${d.profile.length ? 'This walk leans toward ' + esc(d.profile.length > 1 ? d.profile.slice(0, -1).join('; ') + '; and ' + d.profile.slice(-1) : d.profile[0]) + '.' : 'No question has a clear or leaning answer yet. Look at both window walls, and show each wall, glass and furniture option for at least 10 seconds.'}</p>
      <div class="glass"><span class="k">Glass to specify</span><span class="k" style="text-align:right">Target VLT</span>
        <span class="spec">${d.glass ? esc(d.glass.full) : 'No glass preference yet'}</span><span class="vlt">${d.glass ? d.glass.vlt + '%' : '–'}</span>
        <p>${d.glass ? esc(d.glass.why) : 'Show at least two glass options for 10 seconds each (keys 1, 2, 3 or auto-rotate) while looking around.'}</p></div>
    </div>

    <div class="rsec"><h2>Four questions <small>tap your own pick to check the decoder</small></h2>
      <div class="baygrid four">${d.tests.map(testCard).join('')}</div></div>

    <div class="rsec"><h2>Attention heat <small>recorded on a hidden layer during the walk · blue glanced, red looked at longest</small></h2>
      <div class="heatgrid">
        <figure class="planbox"><canvas id="hplan"></canvas><figcaption>Plan · all heights, seen from above</figcaption></figure>
        <div class="elevs">
          <figure class="planbox"><canvas id="hnorth" class="elev"></canvas><figcaption>North wall · rectangular windows, unrolled</figcaption></figure>
          <figure class="planbox"><canvas id="hsouth" class="elev"></canvas><figcaption>South wall · arched windows, unrolled</figcaption></figure>
          <div class="heatkey big"></div><div class="heatlab"><span>glanced</span><span>centre of view, longest</span></div>
        </div>
      </div></div>

    <div class="grid2">
      <div class="rsec"><h2>Where time went</h2>
        <div class="hbars">${areaBars}</div>
        <div class="sidebar"><span style="flex:${1 - south}">Rectangular side ${Math.round((1 - south) * 100)}%</span><span style="flex:${south}">Arched side ${Math.round(south * 100)}%</span></div>
        <h2 style="margin-top:14px">Path <small>zones and capture points</small></h2>
        <div class="planbox"><canvas id="rplan"></canvas></div></div>
      <div class="rsec"><h2>Attention by element <small>centre-weighted seconds</small></h2><div class="hbars">${elemBars}</div></div>
    </div>

    <div class="rsec"><h2>The reading <small>why, with the number behind each line</small></h2><ul class="why">${whyItems}</ul></div>

    <div class="rsec"><h2>Suggested direction</h2><div class="grid3">${list('Design elements', d.pick.elements)}${list('Concepts', d.pick.concepts)}${list('Materials', d.pick.materials)}</div></div>

    <div class="rsec"><h2>Your notes <small>${ses.notes.length} recorded, each with what was on show</small></h2>
      ${ses.notes.length ? `<div class="tablewrap"><table><thead><tr><th>What you said</th><th>Time</th><th>Looking at</th><th>On show</th><th>Tone</th></tr></thead><tbody>${noteRows}</tbody></table></div>` : '<p class="notice">No notes this walk. Press Enter, type, and press Enter again while looking at something.</p>'}</div>

    <div class="rsec"><h2>Group results <small>all walks saved on this device</small></h2><div id="group">${groupSection()}</div>
      <div class="controls left"><button class="btn" id="g-export">Export all walks</button><label class="btn" for="g-import">Import walks</label><input type="file" id="g-import" accept="application/json,.json" hidden><button class="btn" id="g-clear">Clear saved walks</button></div></div>

    <div class="rsec" id="ai-sec"${platform.sample ? '' : ' hidden'}><h2>Claude's read <small>a second opinion on the same data</small></h2>
      <div><button class="btn signal" id="r-ai">Ask Claude to interpret this walk</button></div><div class="ai" id="ai-out" hidden></div></div>
    <div class="rsec" id="json-sec" hidden><h2>Session data</h2><textarea id="jsonbox" readonly></textarea></div>
  </div>`;
  const rep = $('#report'); const keep = rep.hidden ? 0 : rep.scrollTop;
  rep.hidden = false; rep.scrollTop = keep;
  requestAnimationFrame(() => { drawPlanHeat($('#hplan')); drawElevation($('#hnorth'), 'north'); drawElevation($('#hsouth'), 'south'); drawPlan($('#rplan'), true); });

  rep.querySelectorAll('.pick').forEach(b => b.addEventListener('click', () => { ses.stated[b.dataset.test] = b.dataset.opt; openReport(); }));
  $('#r-back').onclick = closeReport;
  $('#r-new').onclick = () => { closeReport(); hooks.onNewWalk(); };
  $('#r-heat').onclick = () => { closeReport(); hooks.onReview(); };
  $('#r-dl').onclick = () => downloadJSON(`${data.walk.id}.json`, data);
  $('#r-copy').onclick = () => {
    const txt = JSON.stringify(data, null, 2);
    const show = () => { $('#json-sec').hidden = false; const b = $('#jsonbox'); b.value = txt; b.focus(); b.select(); };
    try { navigator.clipboard.writeText(txt).then(() => { $('#r-copy').textContent = 'Copied'; }, show); } catch (e) { show(); }
  };
  $('#g-export').onclick = () => downloadJSON(`gaze-decoder-walks-${new Date().toISOString().slice(0, 10)}.json`, listWalks());
  $('#g-import').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(t => { const n = importWalks(JSON.parse(t)); $('#group').innerHTML = groupSection(); $('#g-export').textContent = `Imported ${n}`; })
      .catch(() => { $('#group').insertAdjacentHTML('afterbegin', '<p class="notice">That file is not a Gaze Decoder walk export.</p>'); });
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
  const slim = { ...data, path: undefined, heat: data.heat.slice(0, 40), captures: data.captures.length };
  const prompt = `You are a design researcher decoding spatial preference from behaviour, the way an ad platform decodes interest from browsing, but the output is design direction for an architect.

A person walked an open-plan home (16 x 11 m, 3.4 m ceiling) in first person. The north side has four rectangular windows; the south side has four arched windows of the same glass area, frame and view. During the walk the wall finish (lime plaster, oak panelling, board-formed concrete), the glass (clear VLT 91%, fritted 58%, bronze 35%) and the furniture style (Japanese, Latin, Scandinavian) were switched, and the furniture areas (living, dining, study, nook) may have been moved between four spots. "attention" is centre-weighted seconds; swapped options are compared by attention per minute on show; a "capture" is a 2 s look inside an area zone; "stated" is what the person said they preferred afterwards; "heat" lists the strongest attention points [x, y, z, weight, element].

Session data (JSON):
${JSON.stringify(slim)}

Write a short interpretation for the architect:
## Reading
2 to 3 sentences on where attention went, citing numbers.
## Why
3 to 4 bullets linking behaviour and remarks to specific hidden attributes. Separate strong evidence from guesses, and mention where stated and decoded preferences disagree.
## Suggestions
Bullets under three bold labels: **Elements**, **Concepts**, **Materials** (name a glass make-up with VLT, a wall finish and a furniture direction).
## Confidence
One sentence on what this single walk can support, and what to test next.

Use '## ' headings and '- ' bullets only. Under 330 words. Plain, direct language.`;
  try {
    const r = await platform.sample(prompt, { signal: aiAbort.signal, onText: ({ text }) => { out.innerHTML = mdLite(text); } });
    out.innerHTML = mdLite(r.text);
  } catch (err) {
    if (err && err.code === 'not_granted') $('#ai-sec').hidden = true;
    else out.innerHTML = `<p class="err">${esc(err && err.code === 'rate_limited' ? 'Claude is busy right now. Try again in a minute.' : 'Claude could not answer this time. The reading above still stands.')}</p>`;
  } finally { btn.disabled = false; btn.textContent = 'Ask again'; }
}
