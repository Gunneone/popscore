import { inPageChrome, titleFromUrl } from './extract';

/** How far up from a link we look for the image of its tile. */
const TILE_DEPTH = 4;
const HEADINGS = 'h1,h2,h3,h4,h5,h6';
const PAGE_LEVEL = new Set(['HTML', 'BODY', 'MAIN']);

export type TagPlacement =
  /** In the poster's top-left corner. */
  | { kind: 'poster'; img: Element }
  /** Right after the title text, inside `el`. */
  | { kind: 'title'; el: Element };

function filmLink(a: Element): boolean {
  return titleFromUrl(a.getAttribute('href') ?? '') !== null;
}

/**
 * The link sits in a tile with an image, which carries the tag instead. Climbing stops where the
 * tile must have ended: at a container with links to other films or several images (a list or a
 * row of tiles), or at the page itself.
 */
function inImageTile(link: Element): boolean {
  if (link.querySelector('img')) return true;
  const href = link.getAttribute('href');
  let el = link.parentElement;
  for (let depth = 0; el && depth < TILE_DEPTH; depth++, el = el.parentElement) {
    if (PAGE_LEVEL.has(el.tagName)) return false;
    const others = Array.from(el.querySelectorAll('a[href]')).some(
      (a) => a.getAttribute('href') !== href && filmLink(a),
    );
    if (others) return false;
    const images = el.querySelectorAll('img').length;
    if (images > 1) return false;
    if (images === 1) return true;
  }
  return false;
}

/**
 * Elements that may stand for one movie, without any site-specific selectors: every image outside
 * menus and footers (posters and tiles; the caller skips ones too small once they're laid out),
 * and links to a film's page whose tile has no image (text listings, CSS background posters).
 *
 * Every element looked at goes into `checked` and is skipped next time, so rescanning a page that
 * keeps changing only looks at what's new.
 */
export function findSeeds(root: ParentNode, checked = new WeakSet<Element>()): Element[] {
  const seeds: Element[] = [];
  const fresh = (el: Element) => !checked.has(el) && !!checked.add(el);
  for (const img of Array.from(root.querySelectorAll('img'))) {
    if (fresh(img) && !inPageChrome(img)) seeds.push(img);
  }
  for (const a of Array.from(root.querySelectorAll('a[href]'))) {
    if (fresh(a) && filmLink(a) && !inImageTile(a) && !inPageChrome(a)) seeds.push(a);
  }
  return seeds;
}

/**
 * An SVG file is a logo, icon or badge (a "GRETA" ribbon over a poster), never a poster. Inline
 * `data:` SVGs don't count: lazy loaders use them as placeholders until the poster loads.
 */
export function isSvgFile(img: Element): boolean {
  const src = (img as HTMLImageElement).currentSrc || img.getAttribute('src') || '';
  try {
    const url = new URL(src, location.href);
    return url.protocol.startsWith('http') && /\.svg$/i.test(url.pathname);
  } catch {
    return false;
  }
}

/** Where a seed's tag goes: on the poster, or after the title of a text-only link. */
export function tagPlacement(seed: Element): TagPlacement {
  if (seed.tagName === 'IMG') return { kind: 'poster', img: seed };
  return { kind: 'title', el: seed.querySelector(HEADINGS) ?? seed };
}
