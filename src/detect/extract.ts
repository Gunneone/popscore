import { normalizeTitle } from '../match/normalize';
import type { Candidate } from '../types';
import { cleanSegments, isSeriesText } from './clean';
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

// Film detail links: "/kino-dortmund/film/primetime", "/movies/12345-dune-part-two/tickets".
const FILM_PATH =
  /\/(?:film|filme|films|filmdetails?|movie|movies|kinofilm|kinofilme|spielfilm|spielfilme|title|titles)\/(.+)$/i;
// Show detail links: "/serien/dark", "/series/the-bear-a1b2c3". Not "/show/" or "/tv/": cinemas
// use those for screenings, broadcasters for whole sections.
const SERIES_PATH = /\/(?:serie|serien|series|tv-?shows?|tv-?series)\/(.+)$/i;
// Browse pages under those paths: "/films/year/2010/", "/films/genre/comedy/", "/filme/genre/drama".
const BROWSE_SEGMENT =
  /^(?:years?|decades?|genres?|countr(?:y|ies)|languages?|(?:mini-)?themes?|studios?|tags?|categor(?:y|ies)|kategorien?|jahr|land|sprache)$/i;

/**
 * The film or show a detail link points to, from its URL: "/film/avengers-doomsday-2026" ->
 * "avengers doomsday". Promo banners often carry a tagline as alt text but name the film in the
 * link.
 */
export function titleFromUrl(
  href: string,
  base = location.href,
): { title: string; series: boolean } | null {
  let path: string;
  try {
    path = decodeURIComponent(new URL(href, base).pathname);
  } catch {
    return null;
  }
  const film = FILM_PATH.exec(path);
  const m = film ?? SERIES_PATH.exec(path);
  const segments = m?.[1].split('/').filter(Boolean) ?? [];
  // A browse page, not a film called "Year".
  if (segments.length > 1 && BROWSE_SEGMENT.test(segments[0])) return null;
  // An IMDb id names no title, and what follows is a sub-page: "/title/tt0446029/maindetails".
  if (segments.some((s) => /^tt\d{7,}$/.test(s))) return null;
  const slug = segments
    .find((s) => /\p{L}{3}/u.test(s))
    ?.replace(/\.\w+$/, '')
    .replace(/^\d+[-_]|[-_](?:\d+|(?=[a-z]*\d)[a-z0-9]{8,})$/gi, '')
    .replace(/[-_+.]+/g, ' ')
    .trim();
  return slug && /\p{L}{3}/u.test(slug) ? { title: slug, series: !film } : null;
}

function visibleText(el: Element): string {
  const html = el as HTMLElement;
  return (typeof html.innerText === 'string' ? html.innerText : el.textContent) ?? '';
}

/** Exactly one match inside `el`, else null (several = it's a list, not one movie). */
function single(el: Element, selector: string): Element | null {
  const found = el.querySelectorAll(selector);
  return found.length === 1 ? found[0] : null;
}

/** A heading over a row of tiles ("Neu im Kino", "Entertainment") names the row, not a film. */
function isSectionHeading(h: Element): boolean {
  if (h.closest('a[href]')) return false;
  const tiles = (n: Element | null | undefined) =>
    !!n && n.querySelectorAll('a[href] img, a[href] picture').length >= 3;
  if (tiles(h.nextElementSibling)) return true;
  // A header row holds just the heading and maybe a short "See all" link.
  const row = h.parentElement;
  return (
    !!row &&
    visibleText(row).trim().length <= visibleText(h).trim().length + 30 &&
    tiles(row.nextElementSibling)
  );
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

// Class or id of a menu or site footer, as a whole name or a BEM part ("header__navbar"). Not a
// tile's "card-footer" or a carousel's "swiper-navigation".
const CHROME_NAMES =
  /(?:^|\s|__)(?:(?:site|page|global|main|app)[-_]?)?(?:navbar|nav-bar|navigation|main-?menu|menu-?bar|footer)(?=$|\s|[-_])/i;

/**
 * The site's navigation, banner or footer: menus and link lists, not films. Headers and footers
 * inside an article or section (a film tile's footer, a hero header) don't count, and a header
 * only counts when it holds the navigation.
 */
export function inPageChrome(el: Element): boolean {
  if (el.closest('nav, [role="navigation"], [role="banner"], [role="contentinfo"]')) return true;
  const outside = (e: Element) => !e.parentElement?.closest('article, aside, section');
  const footer = el.closest('footer');
  if (footer && outside(footer)) return true;
  const header = el.closest('header');
  if (header && outside(header) && header.querySelector('nav, [role="navigation"], ul a, ol a'))
    return true;
  // Menus built without those elements: <navigation-bar>, class="header__navbar", "main-menu".
  for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
    if (n.tagName.includes('NAV')) return true;
    const names = `${typeof n.className === 'string' ? n.className : ''} ${n.id}`;
    if (CHROME_NAMES.test(names)) return true;
  }
  return false;
}

/**
 * Finds title-looking text for the element under the pointer, using only generic signals
 * (accessibility labels, image alt text, headings, links), no per-site selectors.
 */
export function extractCandidates(target: Element, opts: Options = {}): ExtractedCandidate[] {
  const found = new Map<string, ExtractedCandidate>();
  /** The tile counts seasons or names an episode somewhere ("3 Staffeln"): it's a show. */
  let seriesTile = false;
  const add = (
    raw: string | null | undefined,
    weight: number,
    source: string,
    anchor: Element,
    series = false,
  ) => {
    if (!raw) return;
    if (isSeriesText(raw)) seriesTile = true;
    cleanSegments(raw).forEach((c, i) => {
      const w = weight - i * 0.15;
      const key = normalizeTitle(c.title);
      if (!key) return;
      const prev = found.get(key);
      if (prev) {
        // Several signals agreeing on the same text make it more likely to be the title.
        prev.weight = Math.max(prev.weight, w) + 0.1;
        prev.year ??= c.year;
        if (series || c.series) prev.series = true;
      } else {
        const cand: ExtractedCandidate = { text: c.title, year: c.year, weight: w, source, anchor };
        if (series || c.series) cand.series = true;
        found.set(key, cand);
      }
    });
  };
  const addUrl = (href: string | null, weight: number, anchor: Element) => {
    const fromUrl = titleFromUrl(href ?? '');
    if (fromUrl) add(fromUrl.title, weight, 'url', anchor, fromUrl.series);
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
      if (link) {
        add(visibleText(link) || link.textContent, base * 0.75, 'link', el);
        addUrl(link.getAttribute('href'), base * 0.8, el);
      }
    }
    if (el.tagName === 'A') addUrl(el.getAttribute('href'), base * 0.8, el);

    if (el.tagName === 'IMG') add(el.getAttribute('alt'), base * 0.95, 'img-alt', el);
    else {
      const img = single(el, 'img[alt]:not([alt=""])');
      if (img) add(img.getAttribute('alt'), base * 0.9, 'img-alt', el);
    }

    if (el.matches(HEADINGS)) {
      if (!isSectionHeading(el)) add(visibleText(el), base * 0.95, 'heading', el);
    } else {
      const h = single(el, HEADINGS);
      if (h && !isSectionHeading(h)) add(visibleText(h), base * 0.9, 'heading', el);
    }

    const hint = single(el, TITLE_HINTS);
    if (hint && hint !== el) {
      add(visibleText(hint), base * 0.85, 'title-hint', el);
    }

    if (el.tagName === 'A' || (depth === 0 && !(el.matches(HEADINGS) && isSectionHeading(el)))) {
      const text = visibleText(el);
      if (text.length <= 120) add(text, base * (el.tagName === 'A' ? 0.75 : 0.7), 'text', el);
    }
  }

  const structured = opts.structured?.titles ?? [];
  for (const c of found.values()) {
    const key = normalizeTitle(c.text);
    const sm = structured.find((m) => normalizeTitle(m.title) === key);
    if (sm) {
      c.weight += 0.2;
      if (sm.series) c.series = true;
      if (c.year === undefined && sm.year !== undefined) {
        c.year = sm.year;
        c.softYear = true;
      }
    }
  }

  if (seriesTile) found.forEach((c) => (c.series = true));
  return [...found.values()].sort((a, b) => b.weight - a.weight).slice(0, 4);
}
