// Typed or spoken notes: linked to what the viewer is looking at, scored for tone,
// scanned for attribute words, and stamped with the options on show at that moment.
import { S } from '../state.js';
import { $, esc, clockFmt } from '../util.js';
import { log, toast } from '../ui/feed.js';
import { currentZone, varOf } from './tracker.js';
import { camera } from '../scene/core.js';
import { instKey, blankInst } from '../decoder/instances.js';

const POS = 'love like likes liked nice beautiful great good calm cozy cosy soft warm amazing wow pretty elegant peaceful favorite favourite prefer gorgeous lovely bright airy open interesting cool quiet private comfortable relaxing homely inviting'.split(' ');
const NEG = 'hate dislike ugly cold harsh dark gloomy cramped heavy boring bad dull busy weird closed strange awkward noisy exposed sterile cluttered fussy distracting glare glary glaring dazzling hot stuffy murky dim'.split(' ');
const FLIP = new Set(['not', "don't", 'dont', 'never', 'no', "isn't", 'isnt', "doesn't", 'doesnt']);
const CUES = [
  { re: /\b(dark|dim|gloomy|bright|light|airy|sunny|glare|tint\w*|frit|dots?|bronze|clear|glass)\b/, attr: 'Glass' },
  { re: /\b(curv\w*|round\w*|arch\w*|soft|organic|sharp|clean|crisp|straight|square|angular|shape|window\w*)\b/, attr: 'Geometry' },
  { re: /\b(frame\w*|thin|thick)\b/, attr: 'Frame' },
  { re: /\b(oak|timber|wood\w*|plaster|concrete|wall\w*|texture|material|finish|raw)\b/, attr: 'Finish' },
  { re: /\b(sofa|couch|table|chair\w*|rug|lamp|furniture|cushion\w*|rattan|plant\w*|japanese|latin|scandi\w*|style)\b/, attr: 'Pieces' },
  { re: /\b(corner|spot|near|place|area|layout|here|space)\b/, attr: 'Location' }
];

export function analyseNote(text) {
  const toks = text.toLowerCase().replace(/[^a-z'\s]/g, ' ').split(/\s+/).filter(Boolean);
  let sent = 0;
  toks.forEach((w, i) => {
    const flip = FLIP.has(toks[i - 1]) || FLIP.has(toks[i - 2]);
    if (POS.includes(w)) sent += flip ? -1 : 1;
    else if (NEG.includes(w)) sent += flip ? 1 : -1;
  });
  const low = toks.join(' ');
  return { sentiment: Math.max(-2, Math.min(2, sent)), cues: [...new Set(CUES.filter(c => c.re.test(low)).map(c => c.attr))] };
}

export function addNote(text, source) {
  text = text.trim(); if (!text) return;
  const zone = currentZone();
  const target = S.gaze.tag || null;
  const a = analyseNote(text);
  // Where the person stood, which way they faced, and the exact point they were looking at
  const p = camera.position;
  const pos = { x: +p.x.toFixed(2), z: +p.z.toFixed(2), eye: S.eye, heading: Math.round(((-S.yaw * 180 / Math.PI) % 360 + 360) % 360) };   // compass: 0 = north (rectangular windows), 90 = east
  const look = target && S.gaze.point ? { ...S.gaze.point, dist: +S.gaze.dist.toFixed(2) } : null;
  const ikey = target ? instKey(target) : null;
  const note = { n: S.session.notes.length + 1, t: +S.session.elapsed.toFixed(1), text, source, target, inst: ikey, pos, look, zone: zone ? zone.id : null, choice: { ...S.choice }, sentiment: a.sentiment, cues: a.cues };
  S.session.notes.push(note);
  if (target) {
    const o = S.objects[target]; o.s.notes.push(note);
    const v = varOf(o); if (v) { const ex = S.session.exposure[v][S.choice[v]]; ex.notes++; ex.sentiment += a.sentiment; }
    const I = S.session.inst[ikey] || (S.session.inst[ikey] = blankInst());
    I.notes++; I.sentiment += a.sentiment; if (a.sentiment > 0) I.pos += a.sentiment; if (a.sentiment < 0) I.neg -= a.sentiment;
  }
  const where = target ? S.objects[target].name : zone ? zone.name.toLowerCase() + ' area' : 'the room';
  log('note', target, `“${text}” → ${where}`);
  if (!S.subject) toast(`Note linked to ${where}`);
  renderNotes();
}

export function renderNotes() {
  const ul = $('#notes'); if (!ul) return;
  const n = S.session.notes;
  const btn = $('#notebtn'); if (btn) btn.innerHTML = n.length ? `<span class="ncount">${n.length}</span>Note` : 'Note';
  if (!n.length) { ul.innerHTML = '<li class="empty">No notes yet. Type below or press Speak.</li>'; return; }
  ul.innerHTML = n.slice().reverse().map(x => {
    const tone = x.sentiment > 0 ? '<span class="pos">positive</span>' : x.sentiment < 0 ? '<span class="neg">negative</span>' : 'neutral';
    const where = x.target ? esc(S.objects[x.target].name) : 'room';
    return `<li><span class="q"><b class="pin">${x.n}</b> “${esc(x.text)}”</span><span class="w">${clockFmt(x.t)} · stood at x ${x.pos.x}, z ${x.pos.z} · ${where}${x.look ? ` (${x.look.dist} m)` : ''} · ${tone} · ${x.source}</span></li>`;
  }).join('');
}
