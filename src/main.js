// Entry point: load a room file, build it, run the walk loop.
import { S, CONFIG, VARS, registerObjects, newSession } from './state.js';
import { $, $$, esc, rng } from './util.js';
import { renderer, scene, camera, configureSun, resize } from './scene/core.js';
import { buildShell, built } from './scene/builder.js';
import { buildFurniture } from './scene/furniture.js';
import { attachOverlays, clearHeat, pushHeat, setHeatVisible } from './scene/heatmap.js';
import { applyOption, setLayout, randomLayout, startAutoRotate, stopAutoRotate, tickAutoRotate } from './scene/options.js';
import { setupControls, move, placeAtStart } from './tracking/controls.js';
import { track } from './tracking/tracker.js';
import { addNote, renderNotes } from './tracking/notes.js';
import { renderPanel, updateLabels, buildLabels } from './ui/panel.js';
import { resetFeed, log } from './ui/feed.js';
import { setupReport, openReport } from './ui/report.js';
import { setupPlatform } from './platform.js';

const params = new URLSearchParams(location.search);
const roomId = (params.get('room') || 'open-loft').replace(/[^a-z0-9-]/gi, '');
// ?debug=1 keeps the loop ticking in a hidden tab (for automated test walks) and exposes state.
const DEBUG = params.get('debug') === '1';
const nextFrame = DEBUG
  ? f => { const t0 = performance.now(), ch = new MessageChannel(); ch.port1.onmessage = () => { if (performance.now() - t0 < 15) ch.port2.postMessage(0); else f(performance.now()); }; ch.port2.postMessage(0); }
  : f => requestAnimationFrame(f);
if (DEBUG) { window.__gd = S; window.__cam = camera; }

function setSubject(sub) {
  S.subject = sub;
  document.body.classList.toggle('subject', sub);
  $('#m-sub').setAttribute('aria-pressed', sub); $('#m-obs').setAttribute('aria-pressed', !sub);
  if (built.zoneGroup) built.zoneGroup.visible = !sub;
}

// The heatmap records all the time on its own layer; it is only painted in review mode.
function enterReview() {
  S.review = true;
  document.body.classList.add('reviewing');
  if (built.zoneGroup) built.zoneGroup.visible = false;
  pushHeat(); setHeatVisible(true);
}
function exitReview() {
  S.review = false;
  document.body.classList.remove('reviewing');
  setHeatVisible(false);
  if (built.zoneGroup) built.zoneGroup.visible = !S.subject;
  openReport();
}

function startWalk({ participant = '', eye = 1.6, styleMode = 'random', layoutMode = 'random', autoRotate = false } = {}, preview = false) {
  const room = S.room, seed = Math.floor(Math.random() * 1e9), r = rng(seed);
  const styles = Object.keys(room.variables.style.options);
  const style = styleMode === 'random' ? styles[Math.floor(r() * styles.length)] : styleMode;
  S.eye = eye;
  newSession({ participant, seed, autoRotate, styleMode });
  S.choice = { walls: room.variables.walls.default, glass: room.variables.glass.default, style };
  applyOption('walls', S.choice.walls, { silent: true });
  applyOption('glass', S.choice.glass, { silent: true });
  setLayout(layoutMode === 'random' ? randomLayout(r) : room.defaultLayout, { silent: true });
  $$('.obtn').forEach(b => b.setAttribute('aria-pressed', S.choice[b.dataset.v] === b.dataset.o));
  buildLabels();
  clearHeat(); setHeatVisible(false); resetFeed(); renderNotes();
  placeAtStart();
  S.review = false; document.body.classList.remove('reviewing');
  setSubject(S.subject);
  if (autoRotate && !preview) startAutoRotate(r); else stopAutoRotate();
  S.started = !preview;
  if (!preview) log('start', null, `Walk started${participant ? ' · ' + participant : ''} · ${room.variables.style.options[style].name} style · layout ${layoutMode}${autoRotate ? ' · auto-rotate on' : ''}`);
}

function showStart() { S.started = false; stopAutoRotate(); $('#start').hidden = false; setTimeout(() => $('#pcode').focus(), 50); }

function buildWidget(room) {
  let n = 0;
  for (const v of VARS) {
    const d = room.variables[v];
    $(`#o-${v}`).innerHTML = Object.entries(d.options).map(([id, o]) => { n++; return `<button class="obtn" data-v="${v}" data-o="${id}" aria-pressed="false" title="${esc(o.name)} (key ${n})"><span>${esc(o.short || o.name)}</span>${o.vlt ? `<i>${o.vlt}%</i>` : ''}<kbd>${n}</kbd></button>`; }).join('');
  }
  $('#stylesel').innerHTML = '<option value="random">Random</option>' + Object.entries(room.variables.style.options).map(([id, o]) => `<option value="${id}">${esc(o.name)}</option>`).join('');
}

async function boot() {
  let room;
  try {
    const res = await fetch(`rooms/${roomId}.json`);
    if (!res.ok) throw new Error(res.status);
    room = await res.json();
  } catch (e) {
    $('#start').hidden = true; $('#fatal').hidden = false;
    $('#fatal').innerHTML = `<h1>Room file not found</h1><p>Could not load <code>rooms/${esc(roomId)}.json</code>. Open this page through a local server (for example <code>python3 -m http.server</code>) rather than as a file, and check the room name in the address.</p>`;
    return;
  }
  S.room = room;
  registerObjects(room);
  configureSun(room.sun);
  buildShell(room);
  attachOverlays(built.shellTargets);
  buildWidget(room);
  $('#roomname').textContent = room.name;
  $('#task').textContent = room.task;
  $('#startmeta').textContent = `${room.name} · ${room.summary}`;

  startWalk({ styleMode: room.variables.style.default, layoutMode: 'default' }, true);   // still preview behind the start screen
  showStart();
  nextFrame(frame);

  setupControls({ onNoteKey: () => $('#note').focus() });
  setupPlatform({ onFinal: t => { if (S.started && !S.review) addNote(t, 'voice'); } });
  setupReport({ onNewWalk: showStart, onReview: enterReview });
  $('#m-obs').onclick = () => setSubject(false);
  $('#m-sub').onclick = () => setSubject(true);
  $('#logbtn').onclick = () => document.body.classList.toggle('show-log');
  $('#decode').onclick = () => { if (S.started) openReport(); };
  $('#backreport').onclick = exitReview;
  $('#notebar').addEventListener('submit', e => { e.preventDefault(); const i = $('#note'); if (S.started && !S.review) addNote(i.value, 'typed'); i.value = ''; i.blur(); });
  $('#note').addEventListener('keydown', e => { if (e.key === 'Escape') e.target.blur(); });
  $$('.obtn').forEach(b => b.addEventListener('click', () => { if (S.started && S.choice[b.dataset.v] !== b.dataset.o) applyOption(b.dataset.v, b.dataset.o); b.blur(); }));
  $('#shuf').onclick = e => { if (S.started) setLayout(randomLayout()); e.target.blur(); };
  $('#randstyle').onclick = e => {
    if (!S.started) return;
    const others = Object.keys(room.variables.style.options).filter(s => s !== S.choice.style);
    applyOption('style', others[Math.floor(Math.random() * others.length)]); e.target.blur();
  };
  const keyOpts = VARS.flatMap(v => Object.keys(room.variables[v].options).map(o => [v, o]));
  addEventListener('keydown', e => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || !$('#report').hidden) return;
    if (S.review) { if (e.key === 'Escape') exitReview(); return; }
    if (!S.started) return;
    const n = +e.key;
    if (n >= 1 && n <= keyOpts.length) { const [v, o] = keyOpts[n - 1]; if (S.choice[v] !== o) applyOption(v, o); }
    if (e.key === 'l' || e.key === 'L') setLayout(randomLayout());
  });
  $('#startform').addEventListener('submit', e => {
    e.preventDefault();
    if (!$('#consent').checked) { $('#consent').focus(); return; }
    $('#start').hidden = true;
    startWalk({
      participant: $('#pcode').value.trim().slice(0, 24),
      eye: +document.querySelector('input[name="eye"]:checked').value,
      styleMode: $('#stylesel').value,
      layoutMode: document.querySelector('input[name="layout"]:checked').value,
      autoRotate: $('#autorot').checked
    });
  });
}

addEventListener('resize', resize); resize();
let last = performance.now(), uiTimer = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if ($('#report').hidden) {
    if (S.review) move(dt);
    else if (S.started) {
      move(dt); track(dt); tickAutoRotate(dt, CONFIG.rotateEvery);
      uiTimer += dt;
      if (uiTimer > 0.2) { uiTimer = 0; if (!S.subject) renderPanel(); }
    }
    updateLabels();
  }
  renderer.render(scene, camera);
  nextFrame(frame);
}

boot();
