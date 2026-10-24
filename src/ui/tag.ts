import type { TagPlacement } from '../detect/scan';
import type { TagScore } from '../types';
import { verdict } from './format';
import { applyStyles } from './host';
import tagCss from './tag.css?inline';

export const TAG_ELEMENT = 'popscore-tag';

/** Gap between the poster's corner and the tag. */
const INSET = 6;
/** A page that keeps throwing the tag out (re-rendering its tiles) gets it back this many times. */
const MAX_ATTACHES = 4;
/** How many levels above the poster's own container a tag may climb to get out from under a layer. */
const MAX_LIFT = 3;
/** How high a tag may raise its z-index to get above a layer, at each level. */
const MAX_Z = 3;
/**
 * A tag only climbs into containers about the size of its poster, so it stays with its tile, and
 * only gets above layers about that size, so it stays under the page's headers and menus.
 */
const TILE_SLACK = 1.25;

const HOST_STYLE: Record<TagPlacement['kind'], Record<string, string>> = {
  // Above the poster, but under anything of the page with a z-index (headers, menus, dialogs).
  // `lift` raises it if a layer of the tile itself covers it.
  poster: { position: 'absolute', left: '0', top: '0', 'z-index': '0', display: 'block' },
  title: {
    position: 'static',
    display: 'inline-block',
    'margin-left': '0.4em',
    'vertical-align': 'middle',
  },
};

/**
 * A score on a traffic-light background, inside the page next to the poster (or title) it belongs
 * to, so it scrolls, slides and gets clipped along with it. Closed shadow root like the card;
 * pointer events pass through to the tile, so the hover card still opens.
 */
export class ScoreTag {
  readonly host: HTMLElement;
  private readonly label: HTMLElement;
  private attaches = 0;
  private offset = { left: 0, top: 0 };
  /** Where `lift` moved the tag, and whether it has looked yet. */
  private lifted: Element | null = null;
  private settled = false;
  private visible: IntersectionObserver | undefined;

  constructor(
    readonly score: TagScore,
    readonly placement: TagPlacement,
  ) {
    this.host = document.createElement(TAG_ELEMENT);
    this.host.setAttribute('aria-hidden', 'true');
    this.host.dataset.kind = score.kind;
    this.host.dataset.tmdb = String(score.tmdbId);
    this.host.dataset.score = score.value.toFixed(1);
    // Page CSS could match the element (`li > *`); inline !important wins over it.
    const style = { all: 'initial', 'pointer-events': 'none', ...HOST_STYLE[placement.kind] };
    for (const [prop, value] of Object.entries(style)) {
      this.host.style.setProperty(prop, value, 'important');
    }

    const shadow = this.host.attachShadow({ mode: 'closed' });
    applyStyles(shadow, tagCss);
    this.label = document.createElement('span');
    this.label.className = 'tag';
    this.label.textContent = score.value.toFixed(1);
    shadow.append(this.label);
  }

  get attached(): boolean {
    return this.host.isConnected;
  }

  /** Puts the tag into the page; false once the page has thrown it out too often. */
  attach(): boolean {
    if (this.attached) return true;
    if (this.attaches >= MAX_ATTACHES) return false;
    if (this.lifted && !this.lifted.isConnected) {
      // The page re-rendered the tile: start over with whatever it drew now.
      this.lifted = null;
      this.settled = false;
      this.raise(0);
    }
    const parent = this.lifted ?? this.home();
    if (!parent) return false;
    parent.append(this.host);
    this.attaches++;
    if (!this.settled) this.watch();
    return true;
  }

  /** The poster's container, or the title's element: where a tag goes unless something covers it. */
  private home(): Element | null {
    const p = this.placement;
    let parent: Element | null = p.kind === 'title' ? p.el : p.img.parentElement;
    if (parent?.tagName === 'PICTURE') parent = parent.parentElement;
    return parent;
  }

  /** Looks for layers over the tag once it's on screen: hit testing only works inside the viewport. */
  private watch(): void {
    if (this.placement.kind !== 'poster') return;
    this.visible ??= new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) this.lift();
    });
    this.visible.observe(this.host);
  }

  /**
   * A layer the tile puts over its poster (a rank numeral, a gradient) may have a higher z-index
   * than the tag, or sit outside the stacking context of the poster's container, where no z-index
   * of the tag helps. If one is drawn over it, the tag raises its z-index a step at a time, then
   * climbs out of the poster's containers one at a time, until nothing is; it stays put if no
   * tile-sized container helps. Looks once.
   */
  private lift(): void {
    if (this.settled || !this.attached || this.placement.kind !== 'poster') return;
    this.measure()?.();
    const covered = this.covered();
    if (covered === undefined) return;
    this.settled = true;
    this.visible?.disconnect();
    const home = this.host.parentElement;
    if (!covered || !home) return;

    const poster = this.placement.img.getBoundingClientRect();
    const tileSized = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width <= poster.width * TILE_SLACK && r.height <= poster.height * TILE_SLACK;
    };
    const levels = [home];
    let el = home.parentElement;
    for (let depth = 0; el && depth < MAX_LIFT && tileSized(el); depth++, el = el.parentElement) {
      levels.push(el);
    }
    for (const level of levels) {
      if (level !== home) level.append(this.host);
      for (let z = level === home ? 1 : 0; z <= MAX_Z; z++) {
        this.raise(z);
        this.measure()?.();
        if (this.covered() === false) {
          if (level !== home) this.lifted = level;
          return;
        }
      }
    }
    home.append(this.host);
    this.measure()?.();
  }

  private raise(z: number): void {
    this.host.style.setProperty('z-index', String(z), 'important');
  }

  /**
   * Whether a layer over just the poster is drawn over the tag, judged by what the browser would
   * hit at a few points of it. Headers, menus and dialogs over it don't count: the tag belongs
   * under those. Undefined if it can't tell: the tag is off screen or clipped away.
   */
  private covered(): boolean | undefined {
    if (this.placement.kind !== 'poster') return undefined;
    const img = this.placement.img;
    const poster = img.getBoundingClientRect();
    const slackX = poster.width * (TILE_SLACK - 1);
    const slackY = poster.height * (TILE_SLACK - 1);
    const overPoster = (el: Element) => {
      if (el.contains(this.host) || el.tagName.startsWith('POPSCORE-')) return false;
      const r = el.getBoundingClientRect();
      if (
        r.left < poster.left - slackX ||
        r.right > poster.right + slackX ||
        r.top < poster.top - slackY ||
        r.bottom > poster.bottom + slackY
      ) {
        return false;
      }
      // A logo or button of a fixed header can be poster-sized too.
      for (let a: Element | null = el; a && !a.contains(img); a = a.parentElement) {
        const { position } = getComputedStyle(a);
        if (position === 'fixed' || position === 'sticky') return false;
      }
      return true;
    };
    const r = this.host.getBoundingClientRect();
    const probes = [
      [0.5, 0.5],
      [0.1, 0.15],
      [0.9, 0.15],
      [0.1, 0.85],
      [0.9, 0.85],
    ];
    // The tag lets pointer events through, which also keeps it out of hit testing.
    this.host.style.setProperty('pointer-events', 'auto', 'important');
    try {
      let seen = false;
      for (const [fx, fy] of probes) {
        const stack = document.elementsFromPoint(r.left + r.width * fx, r.top + r.height * fy);
        const at = stack.indexOf(this.host);
        if (at < 0) continue;
        seen = true;
        if (stack.slice(0, at).some(overPoster)) return true;
      }
      return seen ? false : undefined;
    } finally {
      this.host.style.setProperty('pointer-events', 'none', 'important');
    }
  }

  paint(greenAt: number, amberAt: number): void {
    const v = verdict(this.score.value, greenAt, amberAt);
    this.label.className = `tag ${v}`;
    this.host.dataset.verdict = v;
  }

  /**
   * Reads where a poster tag belongs and returns the write that moves it there, so all tags share
   * one layout pass. Works out the offset from where the tag is now, so it doesn't matter which
   * ancestor it's positioned against, or whether a tile is scaled up on hover.
   */
  measure(): (() => void) | null {
    if (this.placement.kind !== 'poster' || !this.attached) return null;
    const poster = this.placement.img.getBoundingClientRect();
    const own = this.host.getBoundingClientRect();
    if (!poster.width || !own.width) return null;
    const scale = this.host.offsetWidth ? own.width / this.host.offsetWidth : 1;
    const left = Math.round((poster.right - own.right) / scale + this.offset.left - INSET);
    const top = Math.round((poster.top - own.top) / scale + this.offset.top + INSET);
    if (left === this.offset.left && top === this.offset.top) return null;
    return () => {
      this.offset = { left, top };
      this.host.style.setProperty('left', `${left}px`, 'important');
      this.host.style.setProperty('top', `${top}px`, 'important');
    };
  }

  remove(): void {
    this.visible?.disconnect();
    this.host.remove();
  }
}
