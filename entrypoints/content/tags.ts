import { extractCandidates } from '@/src/detect/extract';
import { findSeeds, isSvgFile, tagPlacement } from '@/src/detect/scan';
import type { StructuredInfo } from '@/src/detect/structured';
import { send } from '@/src/messages';
import type { TagScore } from '@/src/types';
import { ScoreTag, TAG_ELEMENT } from '@/src/ui/tag';

interface Options {
  getStructured(): StructuredInfo;
  pageLang(): string;
  isCinema(): boolean;
  colors(): { greenAt: number; amberAt: number };
}

export interface ScoreTags {
  /** Re-reads the verdict colors from the settings. */
  repaint(): void;
  /** Removes every tag and stops watching the page. */
  stop(): void;
}

/** Images smaller than this are icons and logos, not posters. */
const MIN_POSTER_PX = 60;
const MAX_IN_FLIGHT = 4;
const RESCAN_MS = 400;
/** Lookups start a bit before a poster scrolls into view. */
const ROOT_MARGIN = '300px';
/** One tag per film per tile: how far up to look for one that's already there. */
const TILE_DEPTH = 4;
/** These won't fix themselves while the page is open, so they aren't retried. */
const KEY_ERRORS = ['missing-keys', 'bad-tmdb-key', 'bad-omdb-key'];
const RETRY_MS = 30_000;

function isOurs(node: Node): boolean {
  return (
    node instanceof Element && (node.tagName === 'WORTH-IT-TAG' || node.tagName === 'WORTH-IT-CARD')
  );
}

function nearViewport(el: Element): boolean {
  const r = el.getBoundingClientRect();
  const margin = Number.parseInt(ROOT_MARGIN, 10);
  return (
    r.bottom > -margin &&
    r.top < innerHeight + margin &&
    r.right > -margin &&
    r.left < innerWidth + margin
  );
}

/**
 * A score tag on every movie near the viewport. Finds them the way the hover card does (see
 * `findSeeds` and `extractCandidates`), so it needs no site-specific code either.
 */
export function startScoreTags(opts: Options): ScoreTags {
  let stopped = false;
  /** Lookups by the candidate texts, so a film shown in several rows is looked up once. */
  const memo = new Map<string, Promise<TagScore | null>>();
  const tags = new Map<Element, ScoreTag>();
  /** Elements already checked for being a seed, seeds watched for visibility, seeds queued. */
  const checked = new WeakSet<Element>();
  const watched = new WeakSet<Element>();
  const handled = new WeakSet<Element>();
  const queue: Element[] = [];
  let inFlight = 0;

  const lookUp = (seed: Element): Promise<TagScore | null> => {
    const candidates = extractCandidates(seed, {
      structured: opts.getStructured(),
      viewport: { width: innerWidth, height: innerHeight },
    });
    if (candidates.length === 0) return Promise.resolve(null);
    const key = candidates.map((c) => `${c.text}|${c.year ?? ''}`).join('\n');
    let pending = memo.get(key);
    if (!pending) {
      pending = send({
        type: 'tag',
        req: {
          candidates: candidates.map(({ anchor: _anchor, ...c }) => c),
          pageLang: opts.pageLang(),
          cinema: opts.isCinema(),
          mode: 'auto',
        },
      });
      memo.set(key, pending);
      // Network trouble: try again in a while, once the poster is in view again.
      pending.catch((err: unknown) => {
        if (KEY_ERRORS.includes(err instanceof Error ? err.message : '')) return;
        memo.delete(key);
        setTimeout(() => {
          if (stopped) return;
          handled.delete(seed);
          io.observe(seed);
        }, RETRY_MS);
      });
    }
    return pending.catch(() => null);
  };

  const nearbyTag = (seed: Element, tmdbId: number): [Element, ScoreTag] | undefined => {
    const selector = `${TAG_ELEMENT}[data-tmdb="${tmdbId}"]`;
    let el = seed.parentElement;
    for (let depth = 0; el && depth < TILE_DEPTH; depth++, el = el.parentElement) {
      const host = el.querySelector(selector);
      if (host) return [...tags].find(([, t]) => t.host === host);
    }
    return undefined;
  };

  const place = (seed: Element, score: TagScore) => {
    const existing = tags.get(seed);
    if (existing?.score.tmdbId === score.tmdbId) return;
    if (existing) {
      existing.remove();
      tags.delete(seed);
    }
    // One tag per film per tile (poster and backdrop, poster and title link), on the poster.
    const placement = tagPlacement(seed);
    const twin = nearbyTag(seed, score.tmdbId);
    if (twin) {
      if (placement.kind !== 'poster' || twin[1].placement.kind !== 'title') return;
      twin[1].remove();
      tags.delete(twin[0]);
    }
    const tag = new ScoreTag(score, placement);
    tag.paint(opts.colors().greenAt, opts.colors().amberAt);
    if (!tag.attach()) return;
    tags.set(seed, tag);
    scheduleLayout();
  };

  const pump = () => {
    while (!stopped && inFlight < MAX_IN_FLIGHT && queue.length) {
      const seed = queue.shift()!;
      if (!seed.isConnected) continue;
      // Scrolled past before its turn came: wait until it's back, rather than spend a lookup.
      if (!nearViewport(seed)) {
        handled.delete(seed);
        io.observe(seed);
        continue;
      }
      inFlight++;
      void lookUp(seed)
        .then((score) => {
          if (score && !stopped && seed.isConnected) place(seed, score);
        })
        .finally(() => {
          inFlight--;
          pump();
        });
    }
  };

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const seed = e.target;
        if (!e.isIntersecting || handled.has(seed)) continue;
        if (seed.tagName === 'IMG') {
          const r = e.boundingClientRect;
          if (r.width < MIN_POSTER_PX || r.height < MIN_POSTER_PX || isSvgFile(seed)) continue;
          // Hidden images (shown on hover, preloaded) would put a tag over nothing.
          const visible =
            typeof seed.checkVisibility !== 'function' ||
            seed.checkVisibility({ opacityProperty: true, visibilityProperty: true });
          if (!visible) continue;
        }
        io.unobserve(seed);
        handled.add(seed);
        queue.push(seed);
      }
      pump();
    },
    { rootMargin: ROOT_MARGIN },
  );

  let layoutFrame = 0;
  /** Moves poster tags to their poster's corner, all reads before all writes. */
  function scheduleLayout() {
    if (layoutFrame || stopped) return;
    layoutFrame = requestAnimationFrame(() => {
      layoutFrame = 0;
      const writes = [...tags.values()].map((t) => t.measure());
      writes.forEach((w) => w?.());
    });
  }

  const rescan = () => {
    if (stopped) return;
    for (const seed of findSeeds(document.body, checked)) {
      watched.add(seed);
      io.observe(seed);
    }
    for (const [seed, tag] of tags) {
      if (!seed.isConnected) {
        tag.remove();
        tags.delete(seed);
      } else if (!tag.attached && !tag.attach()) {
        tags.delete(seed);
      }
    }
    scheduleLayout();
  };

  // Throttled rather than debounced: some pages never stop changing.
  let rescanTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleRescan = () => {
    rescanTimer ??= setTimeout(() => {
      rescanTimer = undefined;
      rescan();
    }, RESCAN_MS);
  };

  const mo = new MutationObserver((records) => {
    // Our own tags going in don't need a rescan; a tag the page threw out does.
    const relevant = records.some(
      (r) => r.removedNodes.length > 0 || Array.from(r.addedNodes).some((n) => !isOurs(n)),
    );
    if (relevant) scheduleRescan();
  });
  mo.observe(document.body, { childList: true, subtree: true });

  // Layout shifts above a poster move it away from a tag positioned against a distant ancestor.
  const ro = new ResizeObserver(scheduleLayout);
  ro.observe(document.body);
  addEventListener('resize', scheduleLayout);

  // Lazy images are 0×0 until they load: give them another look once they have a size.
  const onLoad = (e: Event) => {
    const t = e.target as Element;
    if (t.tagName !== 'IMG') return;
    if (watched.has(t) && !handled.has(t)) {
      io.unobserve(t);
      io.observe(t);
    }
    scheduleLayout();
  };
  document.addEventListener('load', onLoad, true);

  rescan();

  return {
    repaint() {
      const { greenAt, amberAt } = opts.colors();
      tags.forEach((t) => t.paint(greenAt, amberAt));
    },
    stop() {
      stopped = true;
      io.disconnect();
      mo.disconnect();
      ro.disconnect();
      removeEventListener('resize', scheduleLayout);
      document.removeEventListener('load', onLoad, true);
      clearTimeout(rescanTimer);
      cancelAnimationFrame(layoutFrame);
      tags.forEach((t) => t.remove());
      tags.clear();
      queue.length = 0;
    },
  };
}
