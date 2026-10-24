import type { TagPlacement } from '../detect/scan';
import type { TagScore } from '../types';
import { verdict } from './format';
import { applyStyles } from './host';
import tagCss from './tag.css?inline';

export const TAG_ELEMENT = 'worth-it-tag';

/** Gap between the poster's corner and the tag. */
const INSET = 6;
/** A page that keeps throwing the tag out (re-rendering its tiles) gets it back this many times. */
const MAX_ATTACHES = 4;

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

  constructor(
    readonly score: TagScore,
    readonly placement: TagPlacement,
  ) {
    this.host = document.createElement(TAG_ELEMENT);
    this.host.setAttribute('aria-hidden', 'true');
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
    const p = this.placement;
    let parent: Element | null = p.kind === 'title' ? p.el : p.img.parentElement;
    if (parent?.tagName === 'PICTURE') parent = parent.parentElement;
    if (!parent) return false;
    parent.append(this.host);
    this.attaches++;
    return true;
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
    const left = Math.round((poster.left - own.left) / scale + this.offset.left + INSET);
    const top = Math.round((poster.top - own.top) / scale + this.offset.top + INSET);
    if (left === this.offset.left && top === this.offset.top) return null;
    return () => {
      this.offset = { left, top };
      this.host.style.setProperty('left', `${left}px`, 'important');
      this.host.style.setProperty('top', `${top}px`, 'important');
    };
  }

  remove(): void {
    this.host.remove();
  }
}
