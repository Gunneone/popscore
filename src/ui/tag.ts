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
/** A tag only climbs into containers about the size of its poster, so it stays with its tile. */
const TILE_SLACK = 1.25;

const HOST_STYLE: Record<TagPlacement['kind'], Record<string, string>> = {
  // Low z-index: above the poster, but under the site's sticky headers, menus and dialogs.
  poster: { position: 'absolute', left: '0', top: '0', 'z-index': '3', display: 'block' },
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
   * A tag inside the poster's container is drawn in that container's stacking context, so a layer
   * the tile puts over its poster (a rank numeral, a gradient) hides it however high its z-index
   * is. If something is drawn over it, the tag climbs out of the poster's containers one at a time
   * until nothing is, and stays put if no tile-sized container helps. Looks once.
   */
  private lift(): void {
    if (this.settled || !this.attached || this.placement.kind !== 'poster') return;
    this.measure()?.();
    const covered = this.covered();
    if (covered === undefined) return;
    this.settled = true;
    this.visible?.disconnect();
    if (!covered) return;

    const poster = this.placement.img.getBoundingClientRect();
    const home = this.host.parentElement;
    const tileSized = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width <= poster.width * TILE_SLACK && r.height <= poster.height * TILE_SLACK;
    };
    let el = home?.parentElement ?? null;
    for (let depth = 0; el && depth < MAX_LIFT && tileSized(el); depth++, el = el.parentElement) {
      el.append(this.host);
      this.measure()?.();
      if (this.covered() === false) {
        this.lifted = el;
        return;
      }
    }
    home?.append(this.host);
    this.measure()?.();
  }

  /**
   * Whether anything of the page is drawn over the tag, judged by what the browser would hit at a
   * few points of it. Undefined if it can't tell: the tag is off screen or clipped away.
   */
  private covered(): boolean | undefined {
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
        const over = stack
          .slice(0, at)
          .some((el) => !el.contains(this.host) && !el.tagName.startsWith('POPSCORE-'));
        if (over) return true;
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
