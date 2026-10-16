import { normalizeTitle } from '../match/normalize';
import type { Candidate } from '../types';
import { cleanSegments } from './clean';
import type { StructuredInfo } from './structured';

export interface ExtractedCandidate extends Candidate {
  /** Element the card should point at. */
  anchor: Element;
}

interface Options {
  structured?: StructuredInfo;
  /** Ancestors larger than this share of the viewport are page sections, not a movie. */
  maxAreaRatio?: number;
  viewport?: { width: number; height: number };
}

const MAX_DEPTH = 6;
const HEADINGS = 'h1,h2,h3,h4';
const TITLE_HINTS = '[itemprop="name"],[class*="title" i],[data-title],[data-name]';
const IGNORED_TAGS = new Set(['HTML', 'BODY', 'MAIN', 'NAV', 'HEADER', 'FOOTER', 'FORM']);

function visibleText(el: Element): string {
  const html = el as HTMLElement;
  return (typeof html.innerText === 'string' ? html.innerText : el.textContent) ?? '';
}

/** Exactly one match inside `el`, else null (several = it's a list, not one movie). */
function single(el: Element, selector: string): Element | null {
  const found = el.querySelectorAll(selector);
  return found.length === 1 ? found[0] : null;
}

function isTooBig(el: Element, depth: number, opts: Options): boolean {
  if (IGNORED_TAGS.has(el.tagName)) return true;
  if (el.querySelectorAll('img').length > 5) return true;
  if (el.querySelectorAll(HEADINGS).length > 2) return true;
  const vp = opts.viewport;
  // The hovered element itself may be big (a hero poster); only ancestors are checked for size.
  if (depth > 0 && vp && vp.width > 0 && vp.height > 0) {
    const r = el.getBoundingClientRect();
    if (r.width * r.height > (opts.maxAreaRatio ?? 0.6) * vp.width * vp.height) return true;
  }
  return false;
}

/**
 * Finds title-looking text for the element under the pointer, using only generic signals
 * (accessibility labels, image alt text, headings, links), no per-site selectors.
 */
export function extractCandidates(target: Element, opts: Options = {}): ExtractedCandidate[] {
  const found = new Map<string, ExtractedCandidate>();
  const add = (raw: string | null | undefined, weight: number, source: string, anchor: Element) => {
    if (!raw) return;
    cleanSegments(raw).forEach((c, i) => {
      const w = weight - i * 0.15;
      const key = normalizeTitle(c.title);
      if (!key) return;
      const prev = found.get(key);
      if (prev) {
        // Several signals agreeing on the same text make it more likely to be the title.
        prev.weight = Math.max(prev.weight, w) + 0.1;
        prev.year ??= c.year;
      } else {
        found.set(key, { text: c.title, year: c.year, weight: w, source, anchor });
      }
    });
  };

  let el: Element | null = target;
  for (let depth = 0; el && depth < MAX_DEPTH; depth++, el = el.parentElement) {
    if (isTooBig(el, depth, opts)) break;
    const base = 1 - depth * 0.1;

    add(el.getAttribute('aria-label'), base * 1.0, 'aria-label', el);
    add(el.getAttribute('title'), base * 0.8, 'title', el);
    // data-title, data-card-title, data-movie-title, ...
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith('data-') && /title/i.test(attr.name)) {
        add(attr.value, base * 0.9, 'data-title', el);
      }
    }

    if (depth > 0) {
      // Tiles often keep the title on a sibling of the image: an overlay button or a hidden link.
      const labelled = single(el, '[aria-label]');
      if (labelled) add(labelled.getAttribute('aria-label'), base * 0.85, 'aria-label', el);
      const link = single(el, 'a[href]');
      if (link) add(visibleText(link) || link.textContent, base * 0.75, 'link', el);
    }

    if (el.tagName === 'IMG') add(el.getAttribute('alt'), base * 0.95, 'img-alt', el);
    else {
      const img = single(el, 'img[alt]:not([alt=""])');
      if (img) add(img.getAttribute('alt'), base * 0.9, 'img-alt', el);
    }

    if (el.matches(HEADINGS)) add(visibleText(el), base * 0.95, 'heading', el);
    else {
      const h = single(el, HEADINGS);
      if (h) add(visibleText(h), base * 0.9, 'heading', el);
    }

    const hint = single(el, TITLE_HINTS);
    if (hint && hint !== el) {
      add(visibleText(hint), base * 0.85, 'title-hint', el);
    }

    if (el.tagName === 'A' || depth === 0) {
      const text = visibleText(el);
      if (text.length <= 120) add(text, base * (el.tagName === 'A' ? 0.75 : 0.7), 'text', el);
    }
  }

  const structured = opts.structured?.movies ?? [];
  for (const c of found.values()) {
    const key = normalizeTitle(c.text);
    const sm = structured.find((m) => normalizeTitle(m.title) === key);
    if (sm) {
      c.weight += 0.2;
      c.year ??= sm.year;
    }
  }

  return [...found.values()].sort((a, b) => b.weight - a.weight).slice(0, 4);
}
