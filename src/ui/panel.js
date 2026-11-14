// Live observer panel and the floating tags over tagged elements.
import * as THREE from 'three';
import { S } from '../state.js';
import { $, esc, clockFmt } from '../util.js';
import { camera } from '../scene/core.js';
import { built } from '../scene/builder.js';
import { drawPlan } from './plan.js';
import { currentZone } from '../tracking/tracker.js';

const labelEls = {};
const v3 = new THREE.Vector3();
const occl = new THREE.Raycaster(), dir = new THREE.Vector3();
const hidden = {};
let tick = 0;

function occluded(id, a, p) {
  dir.copy(a).sub(p); const d = dir.length(); dir.normalize();
  occl.set(p, dir); occl.far = d - 0.2;
  const h = occl.intersectObjects(built.targets, false)[0];
  return !!h && h.object.userData.tag !== id;
}

export function buildLabels() {
  const host = $('#labels'); host.innerHTML = '';
  for (const k of Object.keys(labelEls)) delete labelEls[k];
  for (const id of Object.keys(built.anchors)) { const el = document.createElement('div'); el.className = 'tag'; host.appendChild(el); labelEls[id] = el; }
}

export function updateLabels() {
  const off = S.subject || S.review;
  const W = innerWidth, H = innerHeight, p = camera.position;
  const recheck = (tick++ % 8) === 0;
  for (const [id, el] of Object.entries(labelEls)) {
    const a = built.anchors[id], o = S.objects[id];
    if (off || !a || a.distanceTo(p) > 9) { el.style.display = 'none'; continue; }
    if (recheck) hidden[id] = occluded(id, a, p);
    if (hidden[id]) { el.style.display = 'none'; continue; }
    v3.copy(a).project(camera);
    if (v3.z > 1 || Math.abs(v3.x) > 1.1 || Math.abs(v3.y) > 1.1) { el.style.display = 'none'; continue; }
    el.style.display = '';
    el.style.left = ((v3.x + 1) / 2 * W) + 'px';
    el.style.top = ((1 - v3.y) / 2 * H - 6) + 'px';
    el.classList.toggle('hot', S.gaze.tag === id);
    el.innerHTML = `<b>${esc(o.label || o.name)}</b> ${o.s.attn.toFixed(1)} s`;
  }
}

export function renderPanel() {
  const ses = S.session, room = S.room;
  $('#clock').textContent = clockFmt(ses.elapsed);
  const zone = currentZone();
  const now = $('#now'), nm = $('#nowmeta'), g = S.gaze;
  if (g.tag) {
    const o = S.objects[g.tag];
    now.innerHTML = `<span><b>${esc(o.name)}</b></span><span class="k">${g.dist.toFixed(1)} m · ${g.t.toFixed(1)} s this look · ${zone ? zone.name.toLowerCase() + ' area' : 'between areas'}</span>`;
    const key = g.tag + JSON.stringify(S.choice);
    if (nm.dataset.key !== key) { nm.dataset.key = key; nm.innerHTML = Object.entries(o.meta).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join(''); }
  } else { now.innerHTML = `<span class="k">nothing tagged · ${zone ? zone.name.toLowerCase() + ' area' : 'between areas'}</span>`; nm.dataset.key = ''; nm.innerHTML = ''; }

  $('#onshow').innerHTML = Object.entries(room.variables).map(([v, d]) => {
    const ex = ses.exposure[v];
    const cells = Object.entries(d.options).map(([id, o]) => `<span class="${S.choice[v] === id ? 'cur' : ''}" title="${esc(o.name)}">${Math.round(ex[id].time)}s</span>`).join('');
    return `<div class="shrow"><span class="n">${esc(d.name)}</span><span class="v">${esc(d.options[S.choice[v]].name)}</span><span class="ex">${cells}</span></div>`;
  }).join('');

  $('#areas').innerHTML = S.zones.map(z => {
    const st = ses.zones[z.id] || { dwell: 0 };
    return `<div class="arow${st.inZone ? ' in' : ''}"><span class="n">${esc(z.name)}</span><span class="mono">${z.spot} · ${st.dwell.toFixed(0)} s</span></div>`;
  }).join('');
  drawPlan($('#plan'), false);
}
