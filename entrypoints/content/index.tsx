import { defineContentScript } from 'wxt/utils/define-content-script';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { extractCandidates, inPageChrome } from '@/src/detect/extract';
import { readStructured, type StructuredInfo } from '@/src/detect/structured';
import { send } from '@/src/messages';
import { getSettings, watchSettings, type Settings } from '@/src/settings';
import { DEFAULT_SITE_MATCHES, findDefaultSite, siteState } from '@/src/sites';
import type { LookupResult, MovieSummary } from '@/src/types';
import { Card, type CardState } from '@/src/ui/Card';
import { CardHost } from '@/src/ui/host';
import { pointerRect, type Rect } from '@/src/ui/position';
import { startScoreTags, type ScoreTags } from './tags';

export default defineContentScript({
  matches: DEFAULT_SITE_MATCHES,
  runAt: 'document_idle',
  main(ctx) {
    void startHoverCards(ctx);
  },
});

type Mode = 'auto' | 'manual';

const HIDE_DELAY_MS = 250;
const SKELETON_DELAY_MS = 150;

function isEditable(el: Element | null): boolean {
  return !!el?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
}

async function startHoverCards(ctx: ContentScriptContext): Promise<void> {
  let settings: Settings = await getSettings();

  const host = new CardHost();
  ctx.onInvalidated(() => host.destroy());

  let structuredUrl = '';
  let structured: StructuredInfo = { movies: [], hasScreenings: false };
  const getStructured = () => {
    if (structuredUrl !== location.href) {
      structured = readStructured(document);
      structuredUrl = location.href;
    }
    return structured;
  };

  /** Dwell-to-show is on for enabled sites; everywhere else only Alt-hover works. */
  const autoEnabled = () => siteState(location.href, settings).on;
  const isCinema = () =>
    findDefaultSite(location.href)?.kind === 'cinema' || getStructured().hasScreenings;
  const pageLang = () =>
    document.documentElement.lang ||
    (/\.(de|at|ch)$/.test(location.hostname) ? 'de-DE' : navigator.language) ||
    'en';

  /** Score tags on every movie: enabled sites only, never where there's just Alt-hover. */
  let tags: ScoreTags | null = null;
  const syncTags = () => {
    const want = settings.scoreTags && autoEnabled();
    if (want && !tags) {
      tags = startScoreTags({
        getStructured,
        pageLang,
        isCinema,
        colors: () => ({ greenAt: settings.greenAt, amberAt: settings.amberAt }),
      });
    } else if (!want && tags) {
      tags.stop();
      tags = null;
    } else tags?.repaint();
  };
  syncTags();
  ctx.onInvalidated(
    watchSettings((s) => {
      settings = s;
      syncTags();
    }),
  );
  ctx.onInvalidated(() => tags?.stop());

  let pointer = { x: 0, y: 0 };
  let hovered: Element | null = null;
  let active: { anchor: Element; mode: Mode } | null = null;
  let seq = 0;
  let dwellTimer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let skeletonTimer: ReturnType<typeof setTimeout> | undefined;
  let altTriggered = false;
  let setupHintShown = false;
  const memo: Record<Mode, WeakMap<Element, Promise<LookupResult>>> = {
    auto: new WeakMap(),
    manual: new WeakMap(),
  };

  const anchorRect = (anchor: Element): Rect => {
    const r = anchor.getBoundingClientRect();
    const huge = r.width > innerWidth * 0.5 || r.height > innerHeight * 0.6;
    return huge || (r.width === 0 && r.height === 0) ? pointerRect(pointer.x, pointer.y) : r;
  };

  const cancelHide = () => clearTimeout(hideTimer);
  const hideNow = () => {
    clearTimeout(hideTimer);
    clearTimeout(skeletonTimer);
    seq++;
    active = null;
    host.hide();
  };
  const scheduleHide = () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideNow, HIDE_DELAY_MS);
  };

  const fallback = (): LookupResult => ({ status: 'error', error: 'unknown' });

  const show = (state: CardState) => {
    if (!active) return;
    host.show(
      <Card
        state={state}
        greenAt={settings.greenAt}
        amberAt={settings.amberAt}
        linkTo={settings.linkTo}
        onPick={pick}
        onSearch={search}
        onOpenSettings={() => void send({ type: 'openOptions' }).catch(() => {})}
        loadPosters={loadPosters}
      />,
      anchorRect(active.anchor),
      state.kind === 'loading'
        ? 'loading'
        : state.result.status === 'error'
          ? `error:${state.result.error}`
          : state.result.status,
    );
  };

  /** Shows whatever `pending` resolves to for the active anchor, unless the user moved on. */
  const settle = async (pending: Promise<LookupResult>, mode: Mode) => {
    const id = seq;
    const result = await pending;
    clearTimeout(skeletonTimer);
    if (id !== seq || !active) return;
    if (result.status === 'error') {
      memo.auto.delete(active.anchor);
      memo.manual.delete(active.anchor);
    }
    if (mode === 'auto' && result.status !== 'match') {
      // Don't pop up on non-titles; but say once per page when an own key is rejected.
      const keyProblem =
        result.status === 'error' && ['bad-tmdb-key', 'bad-omdb-key'].includes(result.error);
      if (keyProblem && !setupHintShown) {
        setupHintShown = true;
        show({ kind: 'result', result });
      } else hideNow();
      return;
    }
    show({ kind: 'result', result });
  };

  const remember = (pending: Promise<LookupResult>) => {
    if (!active) return;
    memo.auto.set(active.anchor, pending);
    memo.manual.set(active.anchor, pending);
  };

  function pick(query: string, movie: MovieSummary, pool: MovieSummary[]) {
    if (!active) return;
    seq++;
    show({ kind: 'loading' });
    const pending = send({ type: 'pick', query, tmdbId: movie.tmdbId, alternatives: pool }).catch(
      fallback,
    );
    remember(pending);
    void settle(pending, 'manual');
  }

  function search(original: string, text: string) {
    if (!active) return;
    seq++;
    show({ kind: 'loading' });
    const pending = send({
      type: 'search',
      original,
      text,
      pageLang: pageLang(),
      cinema: isCinema(),
    }).catch(fallback);
    pending.then((r) => r.status === 'match' && remember(pending));
    void settle(pending, 'manual');
  }

  function loadPosters(paths: string[]) {
    return send({ type: 'posters', paths });
  }

  function trigger(target: Element, mode: Mode) {
    if (host.owns(target) || isEditable(target)) return;
    // Menus and footers are full of words that happen to be film titles ("About Us", "Home").
    if (mode === 'auto' && inPageChrome(target)) return;
    const candidates = extractCandidates(target, {
      structured: getStructured(),
      viewport: { width: innerWidth, height: innerHeight },
    });
    if (candidates.length === 0) return;
    const anchor = candidates[0].anchor;
    if (
      active?.anchor === anchor &&
      host.visible &&
      (mode === 'auto' || active.mode === 'manual')
    ) {
      cancelHide();
      return;
    }

    seq++;
    cancelHide();
    active = { anchor, mode };
    let pending = memo[mode].get(anchor);
    if (!pending) {
      pending = send({
        type: 'lookup',
        req: {
          candidates: candidates.map(({ anchor: _anchor, ...c }) => c),
          pageLang: pageLang(),
          cinema: isCinema(),
          mode,
        },
      }).catch(fallback);
      memo[mode].set(anchor, pending);
    }

    // A skeleton while we wait, only when asked (Alt-hover). On dwell the card appears once there's
    // a match: TV shows, events and other non-films would otherwise flash an empty card.
    clearTimeout(skeletonTimer);
    if (mode === 'manual') {
      const id = seq;
      skeletonTimer = setTimeout(() => id === seq && show({ kind: 'loading' }), SKELETON_DELAY_MS);
    } else {
      host.hide();
    }
    void settle(pending, mode);
  }

  ctx.addEventListener(
    document,
    'pointerover',
    (e) => {
      if (e.pointerType === 'touch') return;
      const target = e.target as Element;
      pointer = { x: e.clientX, y: e.clientY };
      clearTimeout(dwellTimer);
      if (host.owns(target)) {
        cancelHide();
        return;
      }
      hovered = target;
      if (active && (active.anchor === target || active.anchor.contains(target))) {
        cancelHide();
        return;
      }
      if (active) scheduleHide();
      if (e.altKey) trigger(target, 'manual');
      else if (autoEnabled()) {
        dwellTimer = setTimeout(() => trigger(target, 'auto'), settings.dwellMs);
      }
    },
    { capture: true, passive: true },
  );

  ctx.addEventListener(
    document,
    'pointermove',
    (e) => {
      pointer = { x: e.clientX, y: e.clientY };
    },
    { capture: true, passive: true },
  );

  ctx.addEventListener(document.documentElement, 'pointerleave', () => {
    clearTimeout(dwellTimer);
    if (active) scheduleHide();
  });

  ctx.addEventListener(
    window,
    'keydown',
    (e) => {
      if (e.key === 'Escape' && host.visible) {
        hideNow();
        return;
      }
      if (e.key !== 'Alt' || e.repeat || host.owns(e.target)) return;
      if (!hovered || isEditable(document.activeElement)) return;
      clearTimeout(dwellTimer);
      altTriggered = true;
      trigger(hovered, 'manual');
    },
    { capture: true },
  );

  ctx.addEventListener(
    window,
    'keyup',
    (e) => {
      // Keep Firefox on Windows from opening its menu bar when Alt was used for a lookup.
      if (e.key === 'Alt' && altTriggered) {
        altTriggered = false;
        e.preventDefault();
      }
    },
    { capture: true },
  );

  ctx.addEventListener(
    window,
    'scroll',
    () => {
      if (!active || !host.visible) return;
      const r = active.anchor.getBoundingClientRect();
      if (!active.anchor.isConnected || r.bottom < 0 || r.top > innerHeight) hideNow();
      else host.position(anchorRect(active.anchor));
    },
    { capture: true, passive: true },
  );
}
