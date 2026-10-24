import { chromium, expect, test, type BrowserContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Loads the built Chrome extension and hovers posters on a fake cinema page served under a real
// cinema domain, so the manifest's content script runs. Build first: `npm run build`.
const EXTENSION = path.resolve('dist/chrome');
const FIXTURE = readFileSync(path.resolve('e2e/fixtures/cinema.html'), 'utf8');
const PAGE_URL = 'https://www.cinestar.de/popscore-e2e';

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
  await failSeriesList();
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

/**
 * Fails the download of TMDB's weekly TV series list (5 MB from files.tmdb.org) inside the
 * extension's service worker, before any lookup starts it. Lookups then ask TMDB's TV search,
 * as on a first run before the list arrives. The mocks below pass it through.
 */
async function failSeriesList() {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  await worker.evaluate(() => {
    const g = globalThis as unknown as { fetch: typeof fetch };
    const real = g.fetch.bind(globalThis);
    g.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.startsWith('https://files.tmdb.org/')) return new Response(null, { status: 403 });
      return real(input, init);
    };
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

/** The fixture's films, as TMDB and OMDb would describe them. */
const FILMS = [
  // prettier-ignore
  { key: 'dune', id: 693134, title: 'Dune: Part Two', date: '2024-02-27', votes: 7000, tmdb: 8.1, imdb: 'tt15239678', imdbRating: 8.5 },
  // prettier-ignore
  { key: 'unfassbaren', id: 75656, title: 'Die Unfassbaren - Now You See Me', date: '2013-05-29', votes: 15000, tmdb: 7.3, imdb: 'tt1670345', imdbRating: 6.4 },
  // A new release OMDb has no rating for yet: the tag shows TMDB's score.
  // prettier-ignore
  { key: 'digger', id: 1311031, title: 'Digger', date: '2026-10-01', votes: 40, tmdb: 5.1, imdb: 'tt27999999', imdbRating: null },
  // prettier-ignore
  { key: 'oppenheimer', id: 872585, title: 'Oppenheimer', date: '2023-07-19', votes: 9000, tmdb: 8.1, imdb: 'tt15398776', imdbRating: 8.3 },
];

/** Stands in for TMDB and OMDb inside the extension's service worker, with the films above. */
async function mockMovieApis() {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  await worker.evaluate((films) => {
    const g = globalThis as unknown as { fetch: typeof fetch };
    const real = g.fetch.bind(globalThis);
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    g.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.hostname === 'api.themoviedb.org') {
        // No TV series of the films' names.
        if (url.pathname === '/3/search/tv') return json({ results: [] });
        if (url.pathname === '/3/search/movie') {
          const q = (url.searchParams.get('query') ?? '').toLowerCase();
          const hits = films.filter((f) => q.includes(f.key));
          return json({
            results: hits.map((f) => ({
              id: f.id,
              title: f.title,
              original_title: f.title,
              release_date: f.date,
              vote_count: f.votes,
              popularity: 50,
            })),
          });
        }
        const f = films.find((m) => url.pathname === `/3/movie/${m.id}`);
        if (!f) return new Response('{}', { status: 404 });
        return json({
          id: f.id,
          title: f.title,
          original_title: f.title,
          release_date: f.date,
          imdb_id: f.imdb,
          vote_average: f.tmdb,
          vote_count: f.votes,
        });
      }
      if (url.hostname === 'www.omdbapi.com') {
        const f = films.find((m) => m.imdb === url.searchParams.get('i'));
        const rating = f?.imdbRating ? String(f.imdbRating) : 'N/A';
        return json({ Response: 'True', imdbRating: rating, imdbVotes: '1,000' });
      }
      return real(input, init);
    };
  }, FILMS);
}

test('asks for API keys when none are set', async () => {
  const page = await context.newPage();
  await page.goto(PAGE_URL);
  await page.locator('#poster-dune').hover();
  await expect(page.locator('popscore-card')).toHaveAttribute('data-state', 'error:missing-keys', {
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
  const card = page.locator('popscore-card');
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
  await expect(page.locator('popscore-card')).toHaveAttribute('data-state', 'match', {
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
  await expect(page.locator('popscore-card')).toHaveAttribute('data-state', 'match', {
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
        if (el.tagName === 'POPSCORE-CARD' && el.dataset.state) states.push(el.dataset.state);
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

test('tags every film with its score, on the poster or after the title', async () => {
  await setKeys('tmdb-mock', 'omdb-mock');
  await mockMovieApis();

  const page = await context.newPage();
  await page.goto(PAGE_URL);
  const tag = (id: number) => page.locator(`popscore-tag[data-tmdb="${id}"]`);
  await expect(page.locator('popscore-tag')).toHaveCount(4, { timeout: 10_000 });

  await expect(tag(693134)).toHaveAttribute('data-verdict', 'good');
  await expect(tag(693134)).toHaveAttribute('data-score', '8.5');
  await expect(tag(75656)).toHaveAttribute('data-verdict', 'okay');
  // No IMDb rating yet, so TMDB's 5.1.
  await expect(tag(1311031)).toHaveAttribute('data-score', '5.1');
  await expect(tag(1311031)).toHaveAttribute('data-verdict', 'bad');

  // In the poster's top-left corner.
  const poster = (await page.locator('#poster-dune').boundingBox())!;
  const box = (await tag(693134).boundingBox())!;
  expect(Math.abs(box.x - (poster.x + 6))).toBeLessThan(2);
  expect(Math.abs(box.y - (poster.y + 6))).toBeLessThan(2);

  // A text link gets it after its title; the TV show and other links get none.
  await expect(page.locator('#link-oppenheimer popscore-tag')).toHaveAttribute('data-score', '8.3');
  await expect(page.locator('#link-kontakt popscore-tag, li.show popscore-tag')).toHaveCount(0);
  // The tag's text stays in its shadow root: the hover detector reads the link as before.
  expect(await page.locator('#link-oppenheimer').innerText()).toBe('Oppenheimer');
  await page.screenshot({ path: 'test-results/tags.png' });

  // The hover card still opens through the tag.
  await page.locator('#poster-dune').hover({ position: { x: 12, y: 12 } });
  await expect(page.locator('popscore-card')).toHaveAttribute('data-state', 'match', {
    timeout: 5000,
  });
});

test('no tags when they are switched off', async () => {
  await setKeys('tmdb-mock', 'omdb-mock', { scoreTags: false });
  await mockMovieApis();

  const page = await context.newPage();
  await page.goto(PAGE_URL);
  await page.waitForTimeout(2000);
  await expect(page.locator('popscore-tag')).toHaveCount(0);
});
