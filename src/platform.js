// Features that only exist when the page runs as a Claude artifact: voice dictation and
// "Ask Claude". Everywhere else these resolve to null and their buttons stay hidden.
import { $ } from './util.js';
import { toast } from './ui/feed.js';

export const platform = { dict: null, sample: null };

export function setupPlatform({ onFinal }) {
  const mic = $('#mic');
  if (window.claude && window.claude.use) {
    window.claude.use('dictation').then(d => {
      if (!d) return; platform.dict = d; mic.hidden = false;
      let buf = '';
      d.onPartial(({ text }) => { $('#note').placeholder = text ? '… ' + text : 'Listening…'; });
      d.onFinal(({ text }) => { buf += text; const t = buf.trim(); if (t) { onFinal(t); buf = ''; } });
      d.onState(({ state, reason }) => {
        const on = state !== 'idle';
        mic.classList.toggle('on', on); mic.setAttribute('aria-pressed', on);
        mic.querySelector('span').textContent = on ? 'Stop' : 'Speak';
        if (!on) $('#note').placeholder = 'Say what you notice… “this feels calm”, “too dark”';
        if (!on && (reason === 'not_granted' || reason === 'unavailable')) mic.hidden = true;
      });
    }).catch(() => {});
    window.claude.use('sample').then(s => { platform.sample = s; }).catch(() => {});
  }
  mic.addEventListener('click', () => {
    const d = platform.dict; if (!d) return;
    if (d.active()) { d.stop().catch(() => {}); return; }
    d.start().catch(err => {
      if (err && (err.code === 'not_granted' || err.code === 'unavailable')) mic.hidden = true;
      else if (err && err.code !== 'stopped') toast('Dictation did not start. Type your note instead.');
    });
  });
}
