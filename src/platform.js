// Voice notes and "Ask Claude". Dictation uses Claude's when the page runs as a Claude artifact, and
// otherwise the browser's own speech recognition (Chrome, Edge, Safari; not Firefox), which keeps
// listening until it's switched off. Chrome sends the audio to Google to transcribe, so voice needs an
// internet connection there. "Ask Claude" still needs the Claude artifact; elsewhere its button stays hidden.
import { $ } from './util.js';
import { toast } from './ui/feed.js';

export const platform = { dict: null, sample: null };
const IDLE = 'Say what you notice… “this feels calm”, “too dark”';

// onFinal(text, context): a finished phrase. context(): where the viewer is and what they're looking at,
// taken when a phrase's first words are heard so the note stays linked to what was in view then.
export function setupPlatform({ onFinal, context }) {
  const mic = $('#mic'), note = $('#note');
  let phrase = null;
  const setOn = on => {
    mic.classList.toggle('on', on); mic.setAttribute('aria-pressed', on);
    mic.querySelector('span').textContent = on ? 'Stop' : 'Speak';
    if (!on) { note.placeholder = IDLE; phrase = null; }
  };
  const show = () => {
    mic.hidden = false;
    const hint = $('.brand span');
    if (hint && !hint.textContent.includes('V to speak')) hint.append(' · V to speak');
  };
  const heard = text => {
    if (!phrase && context) phrase = context();
    note.placeholder = text ? '… ' + text : 'Listening…';
  };
  const said = text => {
    const ctx = phrase; phrase = null;
    if (text && text.trim()) onFinal(text.trim(), ctx);
    if (platform.dict && platform.dict.active()) note.placeholder = 'Listening…';
  };
  const useBrowser = () => {
    if (platform.dict) return;
    const d = browserDictation({ heard, said, setOn });
    if (d) { platform.dict = d; show(); }
  };

  if (window.claude && window.claude.use) {
    window.claude.use('dictation').then(d => {
      if (!d) { useBrowser(); return; }
      platform.dict = d; show();
      d.onPartial(({ text }) => heard(text));
      d.onFinal(({ text }) => said(text));
      d.onState(({ state, reason }) => {
        const on = state !== 'idle';
        setOn(on);
        if (!on && (reason === 'not_granted' || reason === 'unavailable')) mic.hidden = true;
      });
    }).catch(useBrowser);
    window.claude.use('sample').then(s => { platform.sample = s; }).catch(() => {});
  } else {
    useBrowser();
  }

  mic.addEventListener('click', () => {
    mic.blur();
    const d = platform.dict; if (!d) return;
    if (d.active()) { d.stop().catch(() => {}); return; }
    d.start().catch(err => {
      if (err && (err.code === 'not_granted' || err.code === 'unavailable')) mic.hidden = true;
      else if (!err || err.code !== 'stopped') toast('Dictation did not start. Type your note instead.');
    });
  });
}

// The browser's speech recognition, restarted after each silence or time limit until switched off.
function browserDictation({ heard, said, setOn }) {
  const SR = () => window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR()) return null;
  let rec = null, wanted = false, startedAt = 0, quickEnds = 0;
  const fail = msg => { wanted = false; toast(msg); };
  const listen = () => {
    rec = new (SR())();
    rec.lang = navigator.language || 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = e => {
      let partial = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) said(r[0].transcript); else partial += r[0].transcript;
      }
      if (partial.trim()) heard(partial.trim());
    };
    rec.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed')
        fail(location.protocol === 'file:'
          ? 'The browser blocked the microphone for a page opened from disk. Run start.command instead.'
          : 'Microphone access is blocked. Allow it from the icon in the address bar, then press Speak again.');
      else if (e.error === 'audio-capture') fail('No microphone found.');
      else if (e.error === 'network') fail('Speech recognition needs an internet connection. Type your note instead.');
      else if (e.error === 'language-not-supported') fail('Speech recognition does not support this browser language.');
      // 'no-speech' and 'aborted' are routine: onend restarts or tidies up
    };
    rec.onend = () => {
      quickEnds = Date.now() - startedAt < 1000 ? quickEnds + 1 : 0;
      if (wanted && quickEnds >= 3) fail('Dictation keeps stopping. Type your note instead.');
      if (wanted) { startedAt = Date.now(); try { rec.start(); return; } catch (err) { wanted = false; } }
      setOn(false);
    };
    startedAt = Date.now();
    rec.start();
  };
  return {
    active: () => wanted,
    start: () => new Promise((resolve, reject) => {
      try { wanted = true; quickEnds = 0; listen(); setOn(true); $('#note').placeholder = 'Listening…'; resolve(); }
      catch (err) { wanted = false; setOn(false); reject(err); }
    }),
    stop: () => { wanted = false; if (rec) rec.stop(); return Promise.resolve(); }
  };
}
