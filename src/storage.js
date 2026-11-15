// Saved walks on this device, so a facilitator can run several people and compare them.
import { store } from './util.js';

const KEY = 'gaze-decoder:walks:v4';

export const listWalks = () => store.get(KEY, []);
export function saveWalk(data) {
  const all = listWalks().filter(w => w.walk.id !== data.walk.id);
  all.push(data);
  return store.set(KEY, all);
}
export const clearWalks = () => store.set(KEY, []);
export function importWalks(arr) {
  const ok = (Array.isArray(arr) ? arr : [arr]).filter(w => w && w.app === 'gaze-decoder' && w.walk && Array.isArray(w.tests));
  const ids = new Set(ok.map(w => w.walk.id));
  store.set(KEY, listWalks().filter(w => !ids.has(w.walk.id)).concat(ok));
  return ok.length;
}

// Combine walks: per question, how often each option was the decoded and the stated preference.
export function groupResults(roomId, defs) {
  const walks = listWalks().filter(w => w.room === roomId);
  const tests = defs.map(d => {
    const rows = d.options.map(o => ({ id: o.id, label: o.label, decoded: 0, stated: 0 }));
    let agreeN = 0, agreeY = 0, split = 0;
    walks.forEach(w => {
      const r = w.tests.find(x => x.test === d.id); if (!r) return;
      const dec = rows.find(x => x.id === r.decoded); if (dec) dec.decoded++; else if (r.status === 'split') split++;
      const st = rows.find(x => x.id === r.stated); if (st) st.stated++;
      if (r.agree === true || r.agree === false) { agreeN++; if (r.agree) agreeY++; }
    });
    return { id: d.id, name: d.name, rows, split, agreeN, agreeY };
  });
  return { n: walks.length, tests, agreeN: tests.reduce((a, t) => a + t.agreeN, 0), agreeY: tests.reduce((a, t) => a + t.agreeY, 0) };
}

export function downloadJSON(name, data) { return downloadText(name, JSON.stringify(data, null, 2), 'application/json'); }
export function downloadText(name, text, type = 'text/plain') {
  try {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch (e) { return false; }
}
