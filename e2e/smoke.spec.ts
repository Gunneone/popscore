import { chromium, expect, test, type BrowserContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Loads the built Chrome extension and hovers posters on a fake cinema page served under a real
// cinema domain, so the manifest's content script runs. Build first: `npm run build`.
const EXTENSION = path.resolve('dist/chrome');
const FIXTURE = readFileSync(path.resolve('e2e/fixtures/cinema.html'), 'utf8');
const PAGE_URL = 'https://www.cinestar.de/worth-it-e2e';

// The extension's service worker global, where `evaluate` runs.
declare const chrome: { storage: { sync: { set(items: object): Promise<void> } } };

let context: BrowserContext;

test.beforeEach(async () => {
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
  });
  await context.route(PAGE_URL, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: FIXTURE }),
  );
});

test.afterEach(async () => {
  await context.close();
});

async function setKeys(tmdbKey: string, omdbKey: string, extra: object = {}) {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  await worker.evaluate((settings) => chrome.storage.sync.set({ settings }), {
    tmdbKey,
    omdbKey,
    ...extra,
  });
}

/** Answers TMDB inside the extension's service worker: no results, after `delayMs`. */
async function mockTmdbNoResults(delayMs: number) {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  await worker.evaluate((delay) => {
    const g = globalThis as unknown as { fetch: typeof fetch };
    const real = g.fetch.bind(globalThis);
    g.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (!url.startsWith('https://api.themoviedb.org/')) return real(input, init);
      await new Promise((r) => setTimeout(r, delay));
      return new Response(JSON.stringify({ results: [] }), {
        headers: { 'content-type': 'application/json' },
      });
    };
  }, delayMs);
}

test('asks for API keys when none are set', async () => {
  const page = await context.newPage();
  await page.goto(PAGE_URL);
  await page.locator('#poster-dune').hover();
  await expect(page.locator('worth-it-card')).toHaveAttribute('data-state', 'error:missing-keys', {
    timeout: 5000,
  });
});

test('shows the IMDb rating for a hovered poster', async () => {
  const { TMDB_KEY, OMDB_KEY } = process.env;
  test.skip(
    !TMDB_KEY || !OMDB_KEY,
    'Set TMDB_KEY and OMDB_KEY (e.g. in .env) to run the live lookup.',
  );
  await setKeys(TMDB_KEY!, OMDB_KEY!);

  const page = await context.newPage();
  await page.goto(PAGE_URL);
  await page.locator('#poster-unfassbaren').hover();
  const card = page.locator('worth-it-card');
  await expect(card).toHaveAttribute('data-state', 'match', { timeout: 10_000 });
  await page.screenshot({ path: 'test-results/card.png' });
});

test('falls back to the TMDB score for a new release OMDb has no rating for yet', async () => {
  const { TMDB_KEY, OMDB_KEY } = process.env;
  test.skip(
    !TMDB_KEY || !OMDB_KEY,
    'Set TMDB_KEY and OMDB_KEY (e.g. in .env) to run the live lookup.',
  );
  await setKeys(TMDB_KEY!, OMDB_KEY!);

  const page = await context.newPage();
  await page.goto(PAGE_URL);
  await page.locator('#poster-digger').hover();
  await expect(page.locator('worth-it-card')).toHaveAttribute('data-state', 'match', {
    timeout: 10_000,
  });
  await page.screenshot({ path: 'test-results/card-digger.png' });
});

test('links to Letterboxd when chosen in the settings', async () => {
  const { TMDB_KEY, OMDB_KEY } = process.env;
  test.skip(
    !TMDB_KEY || !OMDB_KEY,
    'Set TMDB_KEY and OMDB_KEY (e.g. in .env) to run the live lookup.',
  );
  await setKeys(TMDB_KEY!, OMDB_KEY!, { linkTo: 'letterboxd' });

  const page = await context.newPage();
  await page.goto(PAGE_URL);
  await page.locator('#poster-unfassbaren').hover();
  await expect(page.locator('worth-it-card')).toHaveAttribute('data-state', 'match', {
    timeout: 10_000,
  });
  await page.screenshot({ path: 'test-results/card-letterboxd.png' });
});

test('dwelling on a TV show never shows a card, not even a loading one', async () => {
  // A slow lookup that finds no film: the card used to show its skeleton, then vanish.
  await setKeys('tmdb-mock', 'omdb-mock');
  await mockTmdbNoResults(600);

  const page = await context.newPage();
  await page.goto(PAGE_URL);
  // The card's shadow root is closed, but its host element and data-state live in the page DOM.
  await page.evaluate(() => {
    const states: string[] = [];
    (window as unknown as { cardStates: string[] }).cardStates = states;
    new MutationObserver((mutations) => {
      for (const m of mutations) {
        const el = m.target as HTMLElement;
        if (el.tagName === 'WORTH-IT-CARD' && el.dataset.state) states.push(el.dataset.state);
      }
    }).observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-state'],
    });
  });
  await page.locator('#tile-show').hover();
  await page.waitForTimeout(2500);
  const states = await page.evaluate(
    () => (window as unknown as { cardStates: string[] }).cardStates,
  );
  expect(states).toEqual([]);
});
