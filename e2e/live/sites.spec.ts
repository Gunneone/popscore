import {
  chromium,
  test as base,
  type BrowserContext,
  type CDPSession,
  type Page,
} from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_SITES, type SiteDef } from '../../src/sites';

// Visits every built-in site, hovers film links (should open a card for that film) and page chrome
// such as menus, footers, buttons and headings (should open nothing), and writes what happened to
// test-results/sites/<id>.json for scripts/sites-report.mjs. Sites that block automated browsers
// or this region are recorded as skipped. Build first: `npm run e2e:sites` does both.

const EXTENSION = path.resolve('dist/chrome');
const OUT = path.resolve('test-results/sites');
const DWELL_WAIT_MS = 3500;

/** Pages with titles on them, where the site's root isn't one. */
const START_URLS: Record<string, string> = {
  // Chains whose home page only asks you to pick a cinema.
  cinestar: 'https://www.cinestar.de/kino-dortmund',
  kinopolis: 'https://www.kinopolis.de/bn',
  astor: 'https://premiumkino.de/astor-film-lounge-berlin',
  primevideo: 'https://www.primevideo.com/',
  'google-tv': 'https://play.google.com/store/movies',
  iplayer: 'https://www.bbc.co.uk/iplayer',
  srf: 'https://www.srf.ch/play/tv',
  sbs: 'https://www.sbs.com.au/ondemand/',
  rte: 'https://www.rte.ie/player/',
  itvx: 'https://www.itv.com/',
};

function startUrl(site: SiteDef): string {
  if (START_URLS[site.id]) return START_URLS[site.id];
  const [, host, p] = /^\*:\/\/([^/]+)(\/.*)$/.exec(site.matches[0])!;
  return `https://${host.replace(/^\*\./, 'www.')}${p.replace(/\*/g, '')}`;
}

const BLOCKED =
  /just a moment|attention required|access denied|request blocked|are you a robot|verify you are human|captcha|not available in your (country|region)|unavailable in your|isn.t available in your|geo.?(block|restrict)|location ?not ?(valid|supported)|nicht in (deinem|ihrem) land|region.error/i;

interface Probe {
  kind: string;
  label: string;
  href?: string;
  state: string | null;
  card?: string;
}

interface SiteResult {
  id: string;
  name: string;
  kind: string;
  url: string;
  finalUrl?: string;
  status: 'ok' | 'blocked' | 'error';
  reason?: string;
  positives: Probe[];
  negatives: Probe[];
  /** Score tags on the page after loading and one scroll: how many, and what a few sit on. */
  tags?: { poster: number; title: number; samples: string[] };
}

const test = base.extend<object, { ext: BrowserContext }>({
  ext: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const context = await chromium.launchPersistentContext('', {
        channel: 'chromium',
        args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
        viewport: { width: 1280, height: 900 },
      });
      await use(context);
      await context.close();
    },
    { scope: 'worker' },
  ],
});

/**
 * Answers OMDb inside the extension's service worker, so no credits are used. The OMDb key is a
 * dummy too, so a missing mock shows up as a key error instead of spending real lookups.
 */
async function prepareExtension(context: BrowserContext) {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  await worker.evaluate(
    async ({ tmdbKey }) => {
      const g = globalThis as unknown as {
        __omdbMock?: boolean;
        fetch: typeof fetch;
        chrome: { storage: { sync: { set(v: object): Promise<void> } } };
      };
      if (!g.__omdbMock) {
        const real = g.fetch.bind(globalThis);
        g.fetch = (input, init) => {
          const url = input instanceof Request ? input.url : String(input);
          if (url.startsWith('https://www.omdbapi.com/')) {
            const body = { Response: 'True', imdbRating: '7.1', imdbVotes: '12,345' };
            return Promise.resolve(
              new Response(JSON.stringify(body), {
                headers: { 'content-type': 'application/json' },
              }),
            );
          }
          return real(input, init);
        };
        g.__omdbMock = true;
      }
      await g.chrome.storage.sync.set({ settings: { tmdbKey, omdbKey: 'omdb-mock' } });
    },
    { tmdbKey: process.env.TMDB_KEY ?? '' },
  );
}

/** Removes consent dialogs (without answering them) so they don't cover the page. */
async function clearOverlays(page: Page) {
  await page.evaluate(() => {
    const selectors = [
      '#onetrust-consent-sdk',
      '[id^="sp_message_container"]',
      '#usercentrics-root',
      '#usercentrics-cmp-ui',
      '#CybotCookiebotDialog',
      '#didomi-host',
      '#truste-consent-track',
      '.truste_overlay',
      '.truste_box_overlay',
      '#cmpbox',
      '#cmpbox2',
      '#BorlabsCookieBox',
      '#qc-cmp2-container',
      '.fc-consent-root',
      '#cookiebanner',
      '#cookie-banner',
      '[aria-modal="true"][role="dialog"]',
    ];
    document.querySelectorAll(selectors.join(',')).forEach((e) => e.remove());
    for (const el of [document.documentElement, document.body]) {
      el.style.setProperty('overflow', 'auto', 'important');
      el.style.setProperty('position', 'static', 'important');
    }
  });
}

/** Marks film links (positives) and page chrome (negatives) with data-wi-probe="<index>". */
async function markProbes(page: Page) {
  return page.evaluate(() => {
    const FILM_PATH =
      /\/(film|filme|films|filmdetails?|movie|movies|kinofilm|kinofilme|spielfilm|spielfilme|title|titles)(\/|-|_|\.|$)/i;
    const GENERIC =
      /^(mehr|more|details?|infos?|tickets?|trailer|buchen|book|jetzt|alle|all|view|see|weitere|watch|play|ansehen|zum film|learn)\b/i;
    const CHROME =
      'nav, header, footer, [role="navigation"], [role="banner"], [role="contentinfo"]';
    const out: { kind: string; label: string; href?: string }[] = [];
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width >= 30 && r.height >= 12 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const text = (el: Element) => ((el as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim();
    const isFilmLink = (a: Element) => {
      try {
        const u = new URL((a as HTMLAnchorElement).href, location.href);
        return (
          u.hostname.endsWith(location.hostname.replace(/^www\./, '')) && FILM_PATH.test(u.pathname)
        );
      } catch {
        return false;
      }
    };
    const filmLinks = [...document.querySelectorAll('a[href]')].filter(isFilmLink);
    // Inside a film tile, everything is about that film; negatives must come from elsewhere.
    const nearFilm = (el: Element) => {
      let n: Element | null = el;
      for (let i = 0; n && i < 5; i++, n = n.parentElement) {
        if (filmLinks.some((a) => n!.contains(a) || a.contains(n!))) return true;
      }
      return false;
    };
    const mark = (el: Element, kind: string, label: string, href?: string) => {
      el.setAttribute('data-wi-probe', String(out.length));
      out.push({ kind, label, href });
    };

    const seen = new Set<string>();
    for (const a of filmLinks) {
      if (out.filter((p) => p.kind === 'film').length >= 10) break;
      const href = (a as HTMLAnchorElement).href.split('#')[0];
      if (seen.has(href) || a.closest(CHROME)) continue;
      const img = a.querySelector('img[alt]:not([alt=""])');
      const label =
        img?.getAttribute('alt')?.trim() ||
        a.getAttribute('aria-label')?.trim() ||
        a.getAttribute('title')?.trim() ||
        text(a).split(' · ')[0];
      if (!label || label.length < 2 || label.length > 80 || GENERIC.test(label)) continue;
      const target = img && visible(img) ? img : a;
      if (!visible(target)) continue;
      seen.add(href);
      mark(target, 'film', label, href);
    }

    const pick = (selector: string, kind: string, max: number, ok: (el: Element) => boolean) => {
      let n = 0;
      for (const el of document.querySelectorAll(selector)) {
        if (n >= max) return;
        if (el.hasAttribute('data-wi-probe') || !visible(el) || !ok(el)) continue;
        const t = text(el);
        if (!t) continue;
        mark(el, kind, t.slice(0, 80));
        n++;
      }
    };
    const short = (el: Element) => text(el).length >= 2 && text(el).length <= 40;
    pick('nav a, header a, [role="navigation"] a', 'menu', 3, (el) => short(el) && !isFilmLink(el));
    pick('footer a, [role="contentinfo"] a', 'footer', 2, (el) => short(el) && !isFilmLink(el));
    pick(
      'main button, button',
      'button',
      2,
      (el) => short(el) && !el.closest(CHROME) && !nearFilm(el),
    );
    pick('h1, h2, h3', 'heading', 2, (el) => short(el) && !el.closest(CHROME) && !nearFilm(el));
    pick('p', 'text', 1, (el) => text(el).length > 80 && !el.closest(CHROME) && !nearFilm(el));
    return out;
  });
}

/** Counts the score tags and says what the first few are on ("7.1 ← Dune: Part Two"). */
function readTags(): { poster: number; title: number; samples: string[] } {
  const tags = [...document.querySelectorAll<HTMLElement>('popscore-tag')];
  const label = (tag: HTMLElement) => {
    const img = tag.parentElement?.querySelector('img');
    const text = img?.alt || tag.parentElement?.textContent || '';
    return text.replace(/\s+/g, ' ').trim().slice(0, 60);
  };
  return {
    poster: tags.filter((t) => t.style.position === 'absolute').length,
    title: tags.filter((t) => t.style.position !== 'absolute').length,
    samples: tags.slice(0, 8).map((t) => `${t.dataset.score} ← ${label(t)}`),
  };
}

/** A point inside `node`'s visible part where it (or its tile) is the topmost element, or null. */
function hoverPoint(node: Element): { x: number; y: number } | null {
  const r = node.getBoundingClientRect();
  const x0 = Math.max(r.left, 0);
  const x1 = Math.min(r.right, innerWidth);
  const y0 = Math.max(r.top, 0);
  const y1 = Math.min(r.bottom, innerHeight);
  if (x1 - x0 < 8 || y1 - y0 < 8) return null;
  // The middle, where a person points at a poster or title.
  const x = (x0 + x1) / 2;
  const y = (y0 + y1) / 2;
  const hit = document.elementFromPoint(x, y);
  const tile = node.closest('a') ?? node;
  const ok =
    !!hit &&
    (node.contains(hit) ||
      tile.contains(hit) ||
      hit === node.parentElement ||
      hit === node.parentElement?.parentElement);
  return ok ? { x, y } : null;
}

/** The movie title, year and score shown in the card (it lives in a closed shadow root). */
async function readCard(cdp: CDPSession): Promise<string | undefined> {
  try {
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
    const { nodeId } = await cdp.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: 'popscore-card',
    });
    if (!nodeId) return undefined;
    const { node } = await cdp.send('DOM.describeNode', { nodeId, depth: -1, pierce: true });
    const parts: string[] = [];
    const walk = (n: typeof node, inPart: string | null) => {
      const cls = n.attributes?.[n.attributes.indexOf('class') + 1] ?? '';
      const part =
        n.attributes?.includes('class') && /^(title|meta|score)$/.test(cls) ? cls : inPart;
      if (n.nodeType === 3 && part && n.nodeValue?.trim()) parts.push(n.nodeValue.trim());
      for (const c of [...(n.shadowRoots ?? []), ...(n.children ?? [])]) walk(c, part);
    };
    walk(node, null);
    return parts.join(' ') || undefined;
  } catch {
    return undefined;
  }
}

test.describe.configure({ mode: 'parallel' });

for (const site of DEFAULT_SITES) {
  test(`${site.kind} · ${site.name} (${site.id})`, async ({ ext }) => {
    test.skip(!process.env.TMDB_KEY, 'Set TMDB_KEY (e.g. in .env).');
    await prepareExtension(ext);
    const url = startUrl(site);
    const result: SiteResult = {
      id: site.id,
      name: site.name,
      kind: site.kind,
      url,
      status: 'ok',
      positives: [],
      negatives: [],
    };
    const page = await ext.newPage();
    const cdp = await ext.newCDPSession(page);
    try {
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(4000);
      result.finalUrl = page.url();
      const title = await page.title().catch(() => '');
      const body = await page
        .evaluate(() => document.body?.innerText.slice(0, 3000) ?? '')
        .catch(() => '');
      if (
        (res && res.status() >= 400) ||
        BLOCKED.test(`${title}\n${page.url()}\n${body.slice(0, 600)}`)
      ) {
        result.status = 'blocked';
        result.reason = `${res?.status() ?? '?'} ${title}`.trim();
      } else {
        await clearOverlays(page);
        // Lazy-loaded rows appear once scrolled to.
        await page.mouse.wheel(0, 1500);
        await page.waitForTimeout(1500);
        await page.mouse.wheel(0, -3000);
        await page.waitForTimeout(2500);
        result.tags = await page.evaluate(readTags);
        await clearOverlays(page);
        const probes = await markProbes(page);
        // Heavy pages make each hover slow; stop probing well before the test times out.
        const deadline = Date.now() + 150_000;
        for (const [i, probe] of probes.entries()) {
          if (Date.now() > deadline) break;
          const done = (probe.kind === 'film' ? result.positives : result.negatives).filter(
            (p) => p.kind === probe.kind,
          ).length;
          if (done >= (probe.kind === 'film' ? 5 : 3)) continue;
          const el = page.locator(`[data-wi-probe="${i}"]`).first();
          await page.keyboard.press('Escape').catch(() => {});
          await el.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
          const point = await el.evaluate(hoverPoint).catch(() => null);
          // Carousel slides off to the side, covered or hidden elements: nothing a user could point at.
          if (!point) continue;
          await page.mouse.move(point.x, point.y, { steps: 2 });
          await page.waitForTimeout(DWELL_WAIT_MS);
          const card = page.locator('popscore-card');
          let state = (await card.count()) ? await card.getAttribute('data-state') : null;
          if (state === 'loading') {
            await page.waitForTimeout(3000);
            state = await card.getAttribute('data-state');
          }
          if (process.env.SITES_SHOTS)
            await page.screenshot({
              path: path.join(process.env.SITES_SHOTS, `${site.id}-${i}.png`),
            });
          const entry: Probe = { ...probe, state, card: state ? await readCard(cdp) : undefined };
          (probe.kind === 'film' ? result.positives : result.negatives).push(entry);
        }
      }
    } catch (err) {
      result.status = 'error';
      result.reason = String(err).split('\n')[0].slice(0, 200);
    } finally {
      mkdirSync(OUT, { recursive: true });
      writeFileSync(path.join(OUT, `${site.id}.json`), JSON.stringify(result, null, 2));
      await page.close().catch(() => {});
    }
  });
}
