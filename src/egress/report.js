// The egress report: how the person got out (or didn't), the route against the shortest one,
// every exit sign judged by what the person did with it, the decision points, and the same
// numbers across every saved run.
import { $, $$, esc, clockFmt, store } from '../util.js';
import { E, EC } from './state.js';
import { B } from './build.js';
import { makeGrid, field, routeDir, dirOf, pathLength } from './nav.js';

const KEY = 'visual-vibes:egress:v1';
let hooks = {};
export function setupReport(h) { hooks = h; addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#report').hidden) $('#report').hidden = true; }); }

// ---------- notes ----------
const POS = 'clear clearly easy obvious visible found safe good great bright simple quick helpful helped'.split(' ');
const NEG = "lost confused confusing cant can't cannot hidden dark blocked stuck scared unclear small missed hard nowhere panic trapped wrong locked help dead tiny hopeless".split(' ');
const FLIP = new Set(['not', "don't", 'dont', 'never', 'no', "isn't", 'isnt', "wasn't", 'wasnt']);
const CUES = [
  { re: /\b(sign\w*|exit\w*|arrow\w*|green|running)\b/, k: 'Signage' },
  { re: /\b(aisle\w*|way|route|path|turn\w*|left|right|corridor|dead|end|blocked|rack\w*)\b/, k: 'Route' },
  { re: /\b(dark|light\w*|see|bright|dim|smoke|smoky)\b/, k: 'Visibility' },
  { re: /\b(door\w*|lift|elevator|stair\w*|shutter\w*|locked)\b/, k: 'Doors' }
];
export function analyseNote(text) {
  const t = text.toLowerCase().replace(/[^a-z'\s]/g, ' ').split(/\s+/).filter(Boolean); let s = 0;
  t.forEach((w, i) => { const f = FLIP.has(t[i - 1]) || FLIP.has(t[i - 2]); if (POS.includes(w)) s += f ? -1 : 1; else if (NEG.includes(w)) s += f ? 1 : -1; });
  const low = t.join(' ');
  return { sentiment: Math.max(-2, Math.min(2, s)), cues: CUES.filter(c => c.re.test(low)).map(c => c.k) };
}

// ---------- storage ----------
export function saveRun(r) {
  const runs = store.get(KEY, []).filter(x => x.id !== r.id);
  const { openHes, openWrong, still, best, ...keep } = r;
  runs.push(keep); while (runs.length > 40) runs.shift(); store.set(KEY, runs);
}
const listRuns = () => store.get(KEY, []);

// ---------- helpers ----------
const COMPASS = (dx, dz) => ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'][Math.round(((Math.atan2(dz, dx) * 180 / Math.PI) + 360) % 360 / 45) % 8];
let audit = null;
function arrowAudit() {
  if (audit) return audit;
  audit = {};
  for (const s of E.room.signs) {
    if (!s.points) { audit[s.id] = null; continue; }
    let x = s.x, z = s.z;
    if (s.mount !== 'hanging') { const n = dirOf(s.face[0]); x += n[0] * 1.2; z += n[1] * 1.2; }
    const d = routeDir(E.grid0, E.F0, x, z), p = dirOf(s.points);
    audit[s.id] = d ? { ok: d[0] * p[0] + d[1] * p[1] > 0.5, route: COMPASS(d[0], d[1]), points: s.points } : null;
  }
  return audit;
}
function verdict(st, a) {
  if (st.attn >= EC.firstLook) {
    if (st.followed === 'yes') return a && !a.ok ? ['bad', 'Followed a misleading arrow'] : ['ok', 'Looked at, followed'];
    if (st.followed === 'no') return a && !a.ok ? ['seen', 'Misleading, rightly ignored'] : ['seen', 'Looked at, not followed'];
    if (st.followed === 'stood') return ['seen', 'Looked at, then stopped'];
    return ['ok', 'Looked at'];
  }
  if (st.legible > 0.5) return ['miss', 'Readable, never looked at'];
  if (st.vis > 0) return ['none', 'Only seen from too far'];
  return ['none', 'Never in view'];
}
function nearestThing(x, z) {
  const room = E.room, cands = [];
  const d2 = ([a, b, c, d]) => Math.hypot(Math.max(a - x, 0, x - b), Math.max(c - z, 0, z - d));
  room.racks.forEach(r => cands.push([d2(r.rect), `racking ${r.id}`]));
  room.blocks.forEach(b => cands.push([d2(b.rect), lc1(b.name)]));
  room.decoys.forEach(d => cands.push([Math.hypot(d.door.x - x, d.door.z - z), lc1(d.name)]));
  room.exits.forEach(e => cands.push([Math.hypot(e.door.x - x, e.door.z - z), lc1(e.name)]));
  cands.push([d2(room.office.rect), 'the shift office']);
  cands.sort((a, b) => a[0] - b[0]);
  return `${cands[0][0] < 0.8 ? 'beside' : 'near'} ${cands[0][1]}`;
}
const name = id => (B.objects[id] ? B.objects[id].name : id);
const collapsesOf = r => r.collapses || (r.collapse ? [r.collapse] : []);
const lc1 = s => /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;   // 'Stair B' stays, 'Hanging sign' becomes 'hanging sign'

// ---------- route map ----------
export function drawRoute(cv, r, o = {}) {
  const dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight || W * 27 / 41;
  if (!W) return;
  cv.width = W * dpr; cv.height = H * dpr; const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const room = E.room, [X0, X1, Z0, Z1] = room.bounds, pad = o.live ? 6 : 14;
  const s = Math.min((W - 2 * pad) / (X1 - X0 + 1), (H - 2 * pad) / (Z1 - Z0 + 2.4));
  const ox = W / 2 - (X0 + X1) / 2 * s, oz = H / 2 - ((Z0 - 1.6) + Z1) / 2 * s;
  const P = (x, z) => [ox + x * s, oz + z * s];
  const rect = ([a, b, cc, d], fill, stroke) => { const [x, y] = P(a, cc); c.fillStyle = fill; c.fillRect(x, y, (b - a) * s, (d - cc) * s); if (stroke) { c.strokeStyle = stroke; c.lineWidth = 0.75; c.strokeRect(x, y, (b - a) * s, (d - cc) * s); } };
  c.fillStyle = '#F6F5F2'; c.fillRect(0, 0, W, H);
  rect([X0, X1, Z0, Z1], '#EFEDE8');
  room.racks.forEach(rk => rect(rk.rect, '#C7CEDB', '#8D97AA'));
  room.blocks.forEach(b => rect(b.rect, '#D9D5CC', '#A9A49A'));
  rect(room.office.rect, '#E2DED6', '#A9A49A');
  const cc = room.columns; cc.xs.forEach(x => cc.zs.forEach(z => rect([x - 0.25, x + 0.25, z - 0.25, z + 0.25], '#6F7B86')));
  room.exits.forEach(e => { if (e.core) rect(e.core, '#D6EBDD', '#0B7A43'); });
  // walls
  c.strokeStyle = '#1D1E1C'; c.lineWidth = o.live ? 2 : 3; { const [x, y] = P(X0, Z0); c.strokeRect(x, y, (X1 - X0) * s, (Z1 - Z0) * s); }
  // doors: exits green, decoys red
  const door = (d, col, lw) => { const n = dirOf(d.face), a = n[0] ? [d.x, d.z - d.w / 2, d.x, d.z + d.w / 2] : [d.x - d.w / 2, d.z, d.x + d.w / 2, d.z]; c.strokeStyle = col; c.lineWidth = lw; c.beginPath(); c.moveTo(...P(a[0], a[1])); c.lineTo(...P(a[2], a[3])); c.stroke(); };
  room.decoys.forEach(d => door(d.door, '#B3261E', o.live ? 3 : 4));
  room.exits.forEach(e => door(e.door, '#0B7A43', o.live ? 4 : 6));
  if (!o.live) {
    c.font = '600 10px Archivo, sans-serif'; c.textAlign = 'center';
    room.exits.forEach(e => { const n = dirOf(e.door.face), [x, y] = P(e.door.x - n[0] * 1.3, e.door.z - n[1] * 1.3 + (e.core ? 0 : -0.2)); c.fillStyle = '#0B7A43'; c.fillText(e.id, x, y + 3); });
    c.fillStyle = '#B3261E'; c.font = '10px "IBM Plex Mono", monospace';
    room.decoys.forEach(d => { const n = dirOf(d.door.face), [x, y] = P(d.door.x + n[0] * 1.1, d.door.z + n[1] * 1.1); c.fillText(d.id === 'D-OLD' ? 'sealed' : d.kind, x, y + 3); });
    c.fillStyle = '#6E6D67'; c.fillText('office', ...P(-16, 10)); room.racks.forEach(rk => { const [a, b, cz, d] = rk.rect; c.fillText(rk.id, ...P((a + b) / 2, (cz + d) / 2 + 0.25)); });
  }
  const runs = o.group || (r ? [r] : []);
  // collapse blocks
  runs.forEach(rr => collapsesOf(rr).forEach(cl => { const [a, b, cz, d] = cl.rect, [x, y] = P(a, cz); c.save(); c.beginPath(); c.rect(x, y, (b - a) * s, (d - cz) * s); c.clip(); c.strokeStyle = '#9A5B2E'; c.lineWidth = 1.5; for (let k = -40; k < 40; k++) { c.beginPath(); c.moveTo(x + k * 4, y); c.lineTo(x + k * 4 + 40, y + 40); c.stroke(); } c.restore(); }));
  const line = (pts, col, lw, dash) => { if (pts.length < 2) return; c.strokeStyle = col; c.lineWidth = lw; c.setLineDash(dash || []); c.beginPath(); pts.forEach((p, i) => { const [x, y] = P(p[0], p[1]); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke(); c.setLineDash([]); };
  if (!o.group && r) {
    line(r.route0, '#0B9A55', o.live ? 1.5 : 2, [6, 4]);
    collapsesOf(r).forEach(cl => line(cl.route, '#0B9A55', o.live ? 1.5 : 2, [2, 3]));
  }
  runs.forEach(rr => line(rr.path.map(p => [p[1], p[2]]), o.group ? 'rgba(54,81,201,.45)' : '#3651C9', o.group ? 1.5 : (o.live ? 2 : 2.6)));
  // signs
  const au = arrowAudit();
  room.signs.forEach(sg => {
    const [x, y] = P(sg.x, sg.z), st = r && !o.group ? r.signs[sg.id] : null;
    let col = '#A8A59D';
    if (st) col = st.attn >= EC.firstLook ? '#3651C9' : st.legible > 0.5 ? '#9A5B2E' : '#A8A59D';
    if (o.group) { const looked = runs.filter(rr => rr.signs[sg.id] && rr.signs[sg.id].attn >= EC.firstLook).length / Math.max(1, runs.length); col = `rgba(54,81,201,${0.25 + 0.75 * looked})`; }
    const k = o.live ? 4 : 6; c.fillStyle = col; c.beginPath(); c.moveTo(x, y - k); c.lineTo(x + k, y + k * 0.8); c.lineTo(x - k, y + k * 0.8); c.closePath(); c.fill();
    if (sg.points && !o.live) { const p = dirOf(sg.points); c.strokeStyle = col; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y); c.lineTo(x + p[0] * 14, y + p[1] * 14); c.stroke(); }
    if (!o.live) { c.fillStyle = '#1D1E1C'; c.font = '9px "IBM Plex Mono", monospace'; c.textAlign = 'left'; c.fillText(sg.id.slice(3), x + 7, y - 3); if (au[sg.id] && !au[sg.id].ok) { c.fillStyle = '#B3261E'; c.fillText('!', x - 10, y - 3); } }
  });
  runs.forEach(rr => {
    rr.hes.forEach(h => { const [x, y] = P(h.x, h.z); c.fillStyle = 'rgba(227,162,59,.55)'; c.beginPath(); c.arc(x, y, (o.live ? 2 : 3) + Math.min(10, h.dur * 1.2), 0, 7); c.fill(); });
    rr.wrong.forEach(w => { const [x, y] = P(w.x, w.z), k = o.live ? 3 : 5; c.strokeStyle = '#9A5B2E'; c.lineWidth = 2; c.beginPath(); c.moveTo(x - k, y - k); c.lineTo(x + k, y + k); c.moveTo(x + k, y - k); c.lineTo(x - k, y + k); c.stroke(); });
    const [sx, sy] = P(rr.spawn.x, rr.spawn.z); c.strokeStyle = '#1D1E1C'; c.lineWidth = 2; c.fillStyle = '#fff'; c.beginPath(); c.arc(sx, sy, o.live ? 3.5 : 5, 0, 7); c.fill(); c.stroke();
    if (!o.group) (rr.notes || []).forEach(n => { const [x, y] = P(n.x, n.z); c.fillStyle = '#1D1E1C'; c.beginPath(); c.arc(x, y - 9, 7, 0, 7); c.fill(); c.fillStyle = '#fff'; c.font = '600 9px "IBM Plex Mono", monospace'; c.textAlign = 'center'; c.fillText(n.n, x, y - 6); });
  });
  if (o.live && o.pos) { const [x, y] = P(o.pos.x, o.pos.z); c.fillStyle = '#3651C9'; c.beginPath(); c.moveTo(x - Math.sin(o.yaw) * 9, y - Math.cos(o.yaw) * 9); c.arc(x, y, 4, 0, 7); c.fill(); }
}

// ---------- report ----------
export function openReport() {
  const r = E.run; if (!r) return;
  const rep = $('#report'), room = E.room, au = arrowAudit();
  const exit = r.exit ? room.exits.find(e => e.id === r.exit.id) : null;
  const signsLooked = room.signs.filter(s => r.signs[s.id].attn >= EC.firstLook).length;
  const signsSeen = room.signs.filter(s => r.signs[s.id].vis > 0).length;
  const hesT = r.hes.reduce((a, h) => a + h.dur, 0), detour = r.wrong.reduce((a, w) => a + w.detour, 0);
  const decoys = Object.keys(r.decoys);
  const title = r.result === 'exit' ? `Out in ${clockFmt(r.duration)} by ${exit.name.split(' (')[0]}` : r.result === 'time' ? `Still inside after ${clockFmt(r.duration)}` : `Run ended at ${clockFmt(r.duration)}`;
  const chips = [r.opts.collapse && 'falling stock', r.opts.power && 'power cut', r.opts.smoke && 'smoke', r.opts.shake && 'shake'].filter(Boolean);

  const stat = (k, v, p, cls = '') => `<div class="est ${cls}"><span class="k">${k}</span><span class="v">${v}</span><p>${p}</p></div>`;
  const stats = [
    stat('Time to get out', r.result === 'exit' ? clockFmt(r.duration) : '–', r.result === 'exit' ? `${exit.id}, ${exit.kind === 'stair' ? 'protected stair' : 'external door'}` : 'did not reach an exit', r.result === 'exit' ? 'sig' : 'warm'),
    stat('Route efficiency', `${Math.round(r.efficiency * 100)}%`, `walked ${r.walked} m; shortest possible ${r.best_possible} m${collapsesOf(r).length ? (collapsesOf(r).length > 1 ? ' (after the last blockage)' : ' (after the blockage)') : ''}`, r.efficiency > 0.8 ? 'sig' : 'warm'),
    stat('Before first move', `${r.orientT !== null ? r.orientT.toFixed(1) : '–'} s`, 'standing at the spawn, getting bearings'),
    stat('Hesitations', `${r.hes.length} · ${hesT.toFixed(0)} s`, 'stops of 1 s or more after the first move', r.hes.length > 2 ? 'warm' : ''),
    stat('Wrong turns', `${r.wrong.length}`, r.wrong.length ? `${detour.toFixed(0)} m walked on detours` : 'never headed away from the exit', r.wrong.length ? 'warm' : ''),
    stat('Signs looked at', `${signsLooked} of ${signsSeen}`, `looked at, of those that came into view (${room.signs.length} in the hall)`, 'sig'),
    stat('Wrong doors tried', `${decoys.length}`, decoys.length ? decoys.map(id => name(id)).join(', ') : 'no lift, shutter or sealed door', decoys.length ? 'warm' : ''),
    stat('Looking steady', `${Math.round(r.look.steady / Math.max(0.1, r.look.steady + r.look.sweeping) * 100)}%`, 'of the time; the rest was quick turning')
  ].join('');

  const signRows = room.signs.map(s => {
    const st = r.signs[s.id], a = au[s.id], [cls, txt] = verdict(st, a), rated = Math.round(B.objects[s.id].rated);
    const ill = { internal: 'lit', photolum: 'photolum.', none: 'unlit' }[s.illum];
    const arrow = a ? (a.ok ? `${s.points} ✓` : `<span style="color:#B3261E">${s.points} ✗ route ${a.route}</span>`) : '–';
    return `<tr><td><i>${s.id}</i>${esc(s.name)}</td><td class="l">${ill} · ${s.mount} ${s.y.toFixed(1)} m</td><td>${rated} m</td><td>${st.vis.toFixed(1)} s</td><td>${st.legible.toFixed(1)} s</td><td>${st.attn.toFixed(1)} s</td><td>${st.firstLook ? st.firstLook.dist + ' m' : '–'}</td><td>${st.followed && st.attn >= EC.firstLook ? st.followed : '–'}</td><td>${arrow}</td><td><span class="vd ${cls}">${txt}</span></td></tr>`;
  }).join('');

  const decs = [
    ...r.hes.map(h => ({ t: h.t, w: false, html: `Stopped <b>${h.dur.toFixed(1)} s</b> ${esc(nearestThing(h.x, h.z))}, turning ${h.turnedDeg}°. ${h.signs.length ? 'Signs in view: ' + h.signs.join(', ') + '.' : '<b>No exit sign in view.</b>'}${h.looked.length ? ' Looked at: ' + h.looked.map(([id, sec]) => `${esc(name(id))} ${sec} s`).join(', ') + '.' : ''}`, src: `${clockFmt(h.t)} · x ${h.x}, z ${h.z} · ${h.D !== null ? h.D + ' m from an exit' : ''}` })),
    ...r.wrong.map(w => ({ t: w.t, w: true, html: `Turned away from the nearest exit ${esc(nearestThing(w.x, w.z))}: up to <b>${w.peak} m</b> farther, <b>${w.detour} m</b> walked before getting back on track. ${w.signs.length ? 'Signs in view at the turn: ' + w.signs.join(', ') + '.' : 'No exit sign in view at the turn.'}`, src: `${clockFmt(w.t)} · x ${w.x}, z ${w.z}` }))
  ].sort((a, b) => a.t - b.t);

  const notes = r.notes.map(n => `<li><b class="pin">${n.n}</b> “${esc(n.text)}”<span class="src">${clockFmt(n.t)} · stood at x ${n.x}, z ${n.z}, facing ${n.heading}° · ${n.target ? esc(name(n.target)) + (n.dist ? ` (${n.dist} m)` : '') : 'nothing tagged'} · ${n.sentiment > 0 ? 'positive' : n.sentiment < 0 ? 'negative' : 'neutral'}${n.cues.length ? ' · ' + n.cues.join(', ') : ''}${n.inView.length ? ' · signs in view: ' + n.inView.join(', ') : ''}</span></li>`).join('');

  const runs = listRuns();
  rep.innerHTML = `<div class="sheet">
    <div class="rhead"><div><h1>${esc(title)}</h1><p>Factory Egress · ${r.participant ? esc(r.participant) + ' · ' : ''}spawned ${r.spawn.d} m from the nearest exit on foot · ${chips.length ? chips.join(', ') : 'alarm only'} · ${new Date(r.startedAt).toLocaleString()}</p></div>
      <div class="controls"><button class="btn" id="r-review">Review in 3D</button><button class="btn" id="r-export">Export JSON</button><button class="btn primary" id="r-new">New run</button></div></div>
    <div class="estats">${stats}</div>
    <div class="rsec"><h2>The route <small>blue: walked · green dashed: shortest from the spawn${collapsesOf(r).length ? ' and, dotted, after each blockage' : ''} · amber: hesitations · ×: wrong turns · triangles: signs</small></h2>
      <div class="routebox"><canvas id="rplan"></canvas>
      <div class="legend"><span><i></i>route walked</span><span><i class="g"></i>shortest route</span><span><i class="h"></i>hesitation (size = time)</span><span><i class="x"></i>wrong turn</span><span><i class="sg"></i>sign looked at</span><span><i class="sm"></i>readable, not looked at</span><span><i class="sn"></i>never readable</span>${r.collapse ? '<span><i class="cl"></i>fallen stock</span>' : ''}<span style="color:#B3261E">! arrow disagrees with the shortest route</span></div></div></div>
    <div class="rsec"><h2>What it means</h2><ul class="find">${findings(r, au)}</ul></div>
    <div class="rsec"><h2>Exit signs <small>each sign's metadata against what this person did with it</small></h2>
      <div class="tablewrap"><table><thead><tr><th>Sign</th><th class="l">Type · mount</th><th>Rated</th><th>In view</th><th>Readable</th><th>Looked</th><th>First look</th><th>Followed</th><th>Arrow</th><th>Verdict</th></tr></thead><tbody>${signRows}</tbody></table></div></div>
    <div class="rsec"><h2>Decision points <small>where the person stopped or turned the wrong way, and what they could see</small></h2>${decs.length ? `<ul class="dec">${decs.map(d => `<li class="${d.w ? 'w' : ''}">${d.html}<span class="src">${d.src}</span></li>`).join('')}</ul>` : '<p class="notice">No hesitations or wrong turns in this run.</p>'}</div>
    ${notes ? `<div class="rsec"><h2>Remarks <small>pinned where they were said</small></h2><ul class="dec">${notes}</ul></div>` : ''}
    <div class="rsec"><h2>All saved runs <small>${runs.length} on this device</small></h2>${groupHTML(runs)}</div>
    <details class="adv"><summary>How it is measured</summary><div class="ai">
      <p><b>Spawn.</b> A 0.25 m floor grid gives the walking distance from every point to the nearest exit (Dijkstra, 30 cm body clearance). Each run starts at one of the farthest points, facing a random open direction.</p>
      <p><b>In view.</b> On screen, sign face turned towards you, nothing solid in between, and smoke and darkness thin enough for its illumination. <b>Readable</b> adds: within its rated viewing distance (Z factor × sign height: 200 for internally lit signs, 100 otherwise).</p>
      <p><b>Looked at.</b> Fixation time: seconds the sign sits within about 3° of the centre of view while the view is steady (turning slower than 0.5 rad/s; walking is allowed). ${EC.firstLook} s counts as having looked. The heat layer uses the same centre-weighted rays as the glazing study.</p>
      <p><b>Followed.</b> In the ${EC.followWindow} s after first looking, the person moved at least 1.2 m within 60° of the direction the sign points.</p>
      <p><b>Hesitation.</b> Moving slower than ${EC.hesitateSpeed} m/s for ${EC.hesitateMin} s or more after the first move. <b>Wrong turn.</b> Getting ${EC.wrongTurn} m farther from the nearest exit than your best so far; the detour is the distance walked until you are back.</p>
      <p><b>Arrow audit.</b> For each directional sign, the grid's shortest route from the sign's position is compared with the arrow; more than 60° apart is flagged.</p>
      <p><b>Falling stock.</b> Placed on the walker's own shortest route, 3.5 to 14 m ahead and in view where possible, only where another way out remains. Up to three per run, at least 13 s apart, never on the same site twice. Efficiency then compares the distance walked with the best possible: walked until the last collapse plus the new shortest route from there.</p>
      <p>This is a behavioural test of wayfinding, not a code compliance check. It complements travel-distance checks and evacuation modelling.</p></div></details>
  </div>`;
  rep.hidden = false; rep.scrollTop = 0;
  requestAnimationFrame(() => { drawRoute($('#rplan'), r, {}); const g = $('#gplan'); if (g) drawRoute(g, null, { group: runs }); });
  $('#r-new').onclick = () => hooks.onNewRun && hooks.onNewRun();
  $('#r-review').onclick = () => hooks.onReview && hooks.onReview();
  $('#r-export').onclick = () => download(`visual-vibes-egress-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ room: room.id, current: r.id, runs: listRuns() }, null, 1));
  const clr = $('#r-clear'); if (clr) clr.onclick = () => { if (confirm('Delete every saved egress run on this device? This cannot be undone.')) { store.set(KEY, []); openReport(); } };
}

function findings(r, au) {
  const room = E.room, out = [], S = r.signs;
  if (r.result === 'exit') {
    const e = room.exits.find(x => x.id === r.exit.id);
    out.push(['good', `Got out by ${lc1(e.name)} in ${clockFmt(r.duration)}, walking ${r.walked} m against a best possible ${r.best_possible} m (${Math.round(r.efficiency * 100)}% efficient).`, 'exit and route']);
  } else out.push(['risk', `Did not reach an exit in ${clockFmt(r.duration)}.`, 'exit']);
  const atSpawn = room.signs.filter(s => S[s.id].firstVis && S[s.id].firstVis.t <= (r.orientT ?? r.duration) + 0.5);
  if (r.orientT !== null) out.push([r.orientT > 6 ? 'risk' : '', `Spent ${r.orientT.toFixed(1)} s at the spawn before moving. ${atSpawn.length ? `Signs in view from there: ${atSpawn.map(s => s.id).join(', ')}.` : 'No exit sign was in view from the spawn point.'}`, `spawn x ${r.spawn.x}, z ${r.spawn.z}`]);
  const worked = room.signs.filter(s => S[s.id].followed === 'yes');
  if (worked.length) out.push(['good', `Signs that changed the route: ${worked.map(s => `${s.id} (${lc1(s.name)}, ${s.illum === 'internal' ? 'lit' : s.illum === 'photolum' ? 'photoluminescent' : 'unlit'})`).join('; ')}.`, 'looked at, then moved the way the arrow points']);
  const missed = room.signs.filter(s => S[s.id].legible > 1 && S[s.id].attn < EC.firstLook).sort((a, b) => S[b.id].legible - S[a.id].legible);
  for (const s of missed.slice(0, 3)) {
    const why = s.y > 4 ? `mounted at ${s.y} m, above the usual field of view` : s.mount === 'low' ? 'mounted low, at 0.45 m' : s.illum !== 'internal' ? 'not internally lit' : 'competing with the racking and machines around it';
    out.push(['risk', `${s.id} (${lc1(s.name)}) was readable for ${S[s.id].legible.toFixed(0)} s but never looked at: ${why}.`, (B.objects[s.id].props.Mounting || '') + ' · rated ' + Math.round(B.objects[s.id].rated) + ' m']);
  }
  for (const s of room.signs) if (au[s.id] && !au[s.id].ok && (S[s.id].attn >= EC.firstLook || S[s.id].vis > 2)) {
    const tried = s.id === 'SG-09' && r.decoys['D-OLD'];
    out.push(['risk', `${s.id} points ${s.points} but the shortest route from it heads ${au[s.id].route}.${s.flags ? ' Flags: ' + s.flags.join(', ') + '.' : ''}${tried ? ' The person then tried the sealed door it points to.' : S[s.id].followed === 'yes' ? ' The person followed it.' : ''}`, 'arrow audit against the floor grid']);
  }
  if (r.decoys.LIFT) out.push(['risk', `Tried the goods lift at ${clockFmt(r.decoys.LIFT.t)}. The “do not use lift” sign SG-10 was ${S['SG-10'].attn >= EC.firstLook ? 'looked at' : S['SG-10'].vis ? 'in view but not looked at' : 'never in view'}.`, 'decoy door']);
  for (const id of Object.keys(r.decoys)) if (id !== 'LIFT') out.push(['risk', `Tried ${lc1(name(id))} at ${clockFmt(r.decoys[id].t)}.`, 'decoy door']);
  const cs = collapsesOf(r);
  cs.forEach((c, i) => {
    const until = cs[i + 1] ? cs[i + 1].t : Infinity;
    const after = r.path.find(p => p[0] > c.t && p[0] < until && p[3] !== null && p[3] < c.after - 3);
    out.push(['', `${cs.length > 1 ? `Collapse ${i + 1} of ${cs.length}: ${c.from === 'roof' ? 'roof debris' : 'stock from the racking'}` : (c.from === 'roof' ? 'Roof debris' : 'Stock from the racking')} fell ${c.ahead} m ahead at ${clockFmt(c.t)} and blocked the way; the way out grew from ${c.before} m to ${c.after} m. ${after ? `Back on a working route ${(after[0] - c.t).toFixed(0)} s later.` : cs[i + 1] ? 'Still searching when the next collapse came.' : 'The person did not find a working route before the run ended.'}`, `site ${c.site}`]);
  });
  const pe = r.powerEvents || [];
  if (pe.length > 1) out.push(['', `The lights changed ${pe.length} times: ${pe.map(([t, on]) => `${on ? 'on' : 'off'} at ${clockFmt(t)}`).join(', ')}. Lit signs stayed readable throughout; unlit and photoluminescent ones came and went.`, 'power events']);
  if (r.powerCutAt !== null) {
    const darkLooks = room.signs.filter(s => S[s.id].firstLook && S[s.id].firstLook.t >= r.powerCutAt);
    out.push(['', `After the power cut at ${clockFmt(r.powerCutAt)}, ${darkLooks.length ? `signs first looked at: ${darkLooks.map(s => `${s.id} (${s.illum === 'internal' ? 'lit' : s.illum === 'photolum' ? 'photoluminescent' : 'unlit'})`).join(', ')}` : 'no new sign was looked at'}.`, 'emergency lighting only']);
  }
  const blind = r.hes.filter(h => !h.signs.length && h.dur >= 2).sort((a, b) => b.dur - a.dur)[0];
  if (blind) out.push(['risk', `The longest stop with no exit sign in view was ${blind.dur.toFixed(1)} s ${nearestThing(blind.x, blind.z)}. A sign visible from x ${blind.x}, z ${blind.z} would help.`, 'decision point']);
  for (const de of room.deadEnds) if (r.deadEnds[de.id] && r.deadEnds[de.id].entries) out.push(['risk', `Walked into a dead end (${lc1(de.name)}) ${r.deadEnds[de.id].entries}×, ${r.deadEnds[de.id].time.toFixed(0)} s inside.`, de.id]);
  return out.map(([cls, t, src]) => `<li class="${cls}">${esc(t)}<span class="src">${esc(src)}</span></li>`).join('');
}

function groupHTML(runs) {
  if (!runs.length) return '<p class="notice">No saved runs yet.</p>';
  const out = runs.filter(r => r.result === 'exit'), times = out.map(r => r.duration).sort((a, b) => a - b);
  const med = times.length ? times[Math.floor(times.length / 2)] : null, eff = runs.reduce((a, r) => a + (r.efficiency || 0), 0) / runs.length;
  const pct = n => Math.round(n / runs.length * 100) + '%';
  const rows = E.room.signs.map(s => {
    const looked = runs.filter(r => r.signs[s.id] && r.signs[s.id].attn >= EC.firstLook).length, readable = runs.filter(r => r.signs[s.id] && r.signs[s.id].legible > 0.5).length;
    const missed = runs.filter(r => r.signs[s.id] && r.signs[s.id].legible > 1 && r.signs[s.id].attn < EC.firstLook).length, followed = runs.filter(r => r.signs[s.id] && r.signs[s.id].followed === 'yes').length;
    return `<tr><td><i>${s.id}</i>${esc(s.name)}</td><td>${pct(readable)}</td><td>${pct(looked)}</td><td>${pct(followed)}</td><td>${missed ? `<span style="color:var(--warm)">${pct(missed)}</span>` : '0%'}</td></tr>`;
  }).join('');
  const dec = E.room.decoys.map(d => `${d.name}: ${pct(runs.filter(r => r.decoys && r.decoys[d.id]).length)}`).join(' · ');
  return `<div class="estats">
      <div class="est"><span class="k">Runs</span><span class="v">${runs.length}</span><p>${out.length} got out</p></div>
      <div class="est sig"><span class="k">Median time out</span><span class="v">${med !== null ? clockFmt(med) : '–'}</span><p>of the runs that got out</p></div>
      <div class="est"><span class="k">Mean route efficiency</span><span class="v">${Math.round(eff * 100)}%</span><p>walked against the best possible</p></div>
      <div class="est warm"><span class="k">Wrong doors tried</span><span class="v">${pct(runs.filter(r => r.decoys && Object.keys(r.decoys).length).length)}</span><p>of runs</p></div></div>
    <div class="grid2" style="margin-top:14px"><div><canvas id="gplan" class="minimap"></canvas><p class="hint" style="font-size:11px;color:var(--mute)">Every saved route; darker sign triangles were looked at in more runs.</p></div>
    <div class="tablewrap"><table><thead><tr><th>Sign</th><th>Readable</th><th>Looked</th><th>Followed</th><th>Missed</th></tr></thead><tbody>${rows}</tbody></table></div></div>
    <p class="hint" style="font-size:12px;color:var(--mute)">Doors tried: ${esc(dec)}</p>
    <div class="controls" style="display:flex;gap:8px"><button class="btn" id="r-clear">Delete saved runs</button></div>`;
}

function download(fn, text) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = fn; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
