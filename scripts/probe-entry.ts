// Debug helper: exposes the title detector on `window.worthItProbe` so it can be tried on any site
// from the DevTools console, without API keys. Built by `npm run probe`.
import { extractCandidates, inPageChrome } from '../src/detect/extract';
import { readStructured } from '../src/detect/structured';

function scan(el: Element = document.activeElement ?? document.body) {
  return extractCandidates(el, {
    structured: readStructured(document),
    viewport: { width: innerWidth, height: innerHeight },
  }).map(({ anchor: _anchor, ...c }) => c);
}

/** Logs what the extension would look up for whatever is under the pointer, every time it changes. */
function watch() {
  let last = '';
  document.addEventListener('pointerover', (e) => {
    const top = scan(e.target as Element)[0];
    const text = top ? `${top.text}${top.year ? ` (${top.year})` : ''} ← ${top.source}` : '—';
    if (text !== last) console.log('[Worth It?]', (last = text));
  });
}

Object.assign(window, {
  worthItProbe: { scan, watch, extractCandidates, readStructured, inPageChrome },
});
