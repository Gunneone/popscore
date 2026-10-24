import { render, type VNode } from 'preact';
import cardCss from './card.css?inline';
import { placeCard, type Rect } from './position';

// Stop page shortcuts and click-outside handlers from reacting to what happens inside the card.
const ISOLATED_EVENTS = [
  'click',
  'pointerdown',
  'pointerup',
  'mousedown',
  'mouseup',
  'keydown',
  'keyup',
  'keypress',
];

/** A shadow-DOM container for the card, so page CSS can't touch it and ours can't leak out. */
export class CardHost {
  private readonly host: HTMLElement;
  private readonly mount: HTMLElement;
  private readonly resize: ResizeObserver;
  private anchor: Rect | null = null;
  visible = false;

  constructor() {
    this.host = document.createElement('popscore-card');
    const shadow = this.host.attachShadow({ mode: 'closed' });
    applyStyles(shadow, cardCss);
    this.mount = document.createElement('div');
    shadow.append(this.mount);
    for (const type of ISOLATED_EVENTS)
      this.host.addEventListener(type, (e) => e.stopPropagation());
    this.resize = new ResizeObserver(() => this.anchor && this.position(this.anchor));
  }

  /** Events from inside a shadow root reach document listeners retargeted to the host element. */
  owns(node: EventTarget | null): boolean {
    return node === this.host;
  }

  /** `state` is mirrored on the host element (e.g. "match", "error:offline") for e2e tests. */
  show(card: VNode, anchor: Rect, state = ''): void {
    if (!this.host.isConnected) document.documentElement.append(this.host);
    this.host.dataset.state = state;
    render(card, this.mount);
    this.visible = true;
    this.position(anchor);
    const el = this.cardElement();
    if (el) this.resize.observe(el);
  }

  position(anchor: Rect): void {
    this.anchor = anchor;
    const el = this.cardElement();
    if (!el) return;
    const { left, top } = placeCard(
      anchor,
      { width: el.offsetWidth, height: el.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
    );
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
  }

  hide(): void {
    if (!this.visible) return;
    this.resize.disconnect();
    render(null, this.mount);
    delete this.host.dataset.state;
    this.visible = false;
    this.anchor = null;
  }

  destroy(): void {
    this.hide();
    this.host.remove();
  }

  private cardElement(): HTMLElement | null {
    return this.mount.querySelector<HTMLElement>('.card');
  }
}

const sheets = new Map<string, CSSStyleSheet>();

/**
 * Constructable stylesheets aren't subject to the page's style-src CSP; fall back to <style>. One
 * sheet per stylesheet text, shared by every shadow root that uses it (there's a tag per movie).
 */
export function applyStyles(shadow: ShadowRoot, css: string): void {
  try {
    let sheet = sheets.get(css);
    if (!sheet) {
      sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      sheets.set(css, sheet);
    }
    shadow.adoptedStyleSheets = [sheet];
    if (shadow.adoptedStyleSheets.length === 1) return;
  } catch {
    // Firefox content scripts can't always hand a sheet across compartments.
  }
  const style = document.createElement('style');
  style.textContent = css;
  shadow.append(style);
}
