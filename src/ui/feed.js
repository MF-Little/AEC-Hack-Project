// Event log and toast messages for the observer.
import { $, clockFmt } from '../util.js';
import { S } from '../state.js';

export function log(type, tag, text) {
  const ev = { t: +S.session.elapsed.toFixed(1), type, tag, text };
  S.session.events.push(ev);
  const feed = $('#feed'); if (!feed) return;
  const empty = feed.querySelector('.empty'); if (empty) empty.remove();
  const li = document.createElement('li'); li.className = type;
  li.innerHTML = `<span class="t">${clockFmt(ev.t)}</span><span class="m"></span>`;
  li.querySelector('.m').textContent = text;
  feed.prepend(li);
  while (feed.children.length > 60) feed.lastChild.remove();
}

let timer;
export function toast(msg) {
  const t = $('#toast'); if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(timer); timer = setTimeout(() => t.classList.remove('show'), 2200);
}

export function resetFeed() {
  const feed = $('#feed');
  if (feed) feed.innerHTML = '<li class="empty">Walk into an area and hold your look for 2 seconds.</li>';
}
