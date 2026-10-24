import { chromium, expect, test, type BrowserContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_SERVER_URL } from '../../src/sites';

// Loads the built Chrome extension and hovers posters on a fake cinema page served under a real
// cinema domain, so the manifest's content script runs. Build first: `npm run build`.
const EXTENSION = path.resolve('dist/chrome');
const FIXTURE = readFileSync(path.resolve('tests/e2e/fixtures/cinema.html'), 'utf8');
const PAGE_URL = 'https://www.cinestar.de/popscore-e2e';
// The same page on a streaming site, where TV shows are looked up too.
const STREAMING_URL = 'https://www.joyn.de/popscore-e2e';
const RANKED = readFileSync(path.resolve('tests/e2e/fixtures/ranked.html'), 'utf8');
const RANKED_URL = 'https://www.cinestar.de/popscore-ranked';
/** The ratings server the build asks without own keys (`npm run e2e` builds with the same .env). */
const SERVER_ORIGIN = new URL(process.env.WXT_SERVER_URL || DEFAULT_SERVER_URL).origin;

// The extension's service worker global, where `evaluate` runs.
declare const chrome: { storage: { sync: { set(items: object): Promise<void> } } };

let context: BrowserContext;

test.beforeEach(async () => {
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
  });
  for (const url of [PAGE_URL, STREAMING_URL]) {
    await context.route(url, (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: FIXTURE }),
    );
  }
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

/** The fixture's TV show. */
const SHOWS = [
  // prettier-ignore
  { key: 'stranger', id: 66732, title: 'Stranger Things', date: '2016-07-15', votes: 18000, tmdb: 8.6, imdb: 'tt4574334', imdbRating: 8.6 },
];

/**
 * Stands in for TMDB, OMDb and the ratings server inside the extension's service worker, with the
 * titles above. The hosts asked are kept in the worker's `asked`.
 */
async function mockMovieApis() {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  await worker.evaluate(
    ({ films, shows, serverOrigin }) => {
      const g = globalThis as unknown as { fetch: typeof fetch; asked: string[] };
      const real = g.fetch.bind(globalThis);
      g.asked = [];
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
      g.fetch = async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        g.asked.push(url.hostname);
        if (url.origin === serverOrigin) {
          if (url.pathname === '/v1/search') {
            const q = (url.searchParams.get('query') ?? '').toLowerCase();
            const kind = url.searchParams.get('kind') === 'tv' ? 'tv' : 'movie';
            const titles: typeof films = kind === 'tv' ? shows : films;
            return json(
              titles
                .filter((f) => q.includes(f.key))
                .map((f) => ({
                  kind,
                  tmdbId: f.id,
                  title: f.title,
                  originalTitle: f.title,
                  releaseDate: f.date,
                  year: Number(f.date.slice(0, 4)),
                  posterPath: null,
                  popularity: 50,
                  voteCount: f.votes,
                })),
            );
          }
          const details = /^\/v1\/(movie|tv)\/(\d+)$/.exec(url.pathname);
          const rating = /^\/v1\/rating\/(.+)$/.exec(url.pathname);
          const f = details
            ? (details[1] === 'tv' ? shows : films).find((m) => m.id === Number(details[2]))
            : [...films, ...shows].find((m) => m.imdb === rating?.[1]);
          if (!f) return new Response('{"error":"not-found"}', { status: 404 });
          if (details) {
            return json({
              kind: details[1],
              tmdbId: f.id,
              title: f.title,
              originalTitle: f.title,
              year: Number(f.date.slice(0, 4)),
              runtime: 120,
              genres: [],
              overview: '',
              posterPath: null,
              imdbId: f.imdb,
              tmdbRating: f.tmdb,
              tmdbVotes: f.votes,
              ...(details[1] === 'tv' ? { seasons: 5, ended: true } : {}),
            });
          }
          return json({ rating: f.imdbRating, votes: f.imdbRating ? 1000 : null });
        }
        if (url.hostname === 'api.themoviedb.org') {
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
          if (url.pathname === '/3/search/tv') {
            const q = (url.searchParams.get('query') ?? '').toLowerCase();
            const hits = shows.filter((f) => q.includes(f.key));
            return json({
              results: hits.map((f) => ({
                id: f.id,
                name: f.title,
                original_name: f.title,
                first_air_date: f.date,
                vote_count: f.votes,
                popularity: 50,
              })),
            });
          }
          const show = shows.find((m) => url.pathname === `/3/tv/${m.id}`);
          if (show) {
            return json({
              id: show.id,
              name: show.title,
              original_name: show.title,
              first_air_date: show.date,
              number_of_seasons: 5,
              status: 'Ended',
              vote_average: show.tmdb,
              vote_count: show.votes,
              external_ids: { imdb_id: show.imdb },
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
          const f = [...films, ...shows].find((m) => m.imdb === url.searchParams.get('i'));
          const rating = f?.imdbRating ? String(f.imdbRating) : 'N/A';
          return json({ Response: 'True', imdbRating: rating, imdbVotes: '1,000' });
        }
        return real(input, init);
      };
    },
    { films: FILMS, shows: SHOWS, serverOrigin: SERVER_ORIGIN },
  );
  return {
    asked: () => worker.evaluate(() => (globalThis as unknown as { asked: string[] }).asked),
  };
}

test('shows ratings through the ratings server without own keys', async () => {
  const apis = await mockMovieApis();

  const page = await context.newPage();
  await page.goto(PAGE_URL);
  await expect(page.locator('popscore-tag[data-tmdb="693134"]')).toHaveAttribute(
    'data-score',
    '8.5',
    { timeout: 10_000 },
  );
  await page.locator('#poster-unfassbaren').hover();
  await expect(page.locator('popscore-card')).toHaveAttribute('data-state', 'match', {
    timeout: 5000,
  });
  const hosts = new Set(await apis.asked());
  expect(hosts.has(new URL(SERVER_ORIGIN).hostname)).toBe(true);
  expect(hosts.has('api.themoviedb.org') || hosts.has('www.omdbapi.com')).toBe(false);
});

test('tags TV shows through the ratings server too', async () => {
  const apis = await mockMovieApis();

  const page = await context.newPage();
  await page.goto(STREAMING_URL);
  await expect(page.locator('popscore-tag[data-kind="tv"][data-tmdb="66732"]')).toHaveAttribute(
    'data-score',
    '8.6',
    { timeout: 10_000 },
  );
  const hosts = new Set(await apis.asked());
  expect(hosts.has('api.themoviedb.org') || hosts.has('www.omdbapi.com')).toBe(false);
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

test('links to TMDB when chosen in the settings', async () => {
  const { TMDB_KEY, OMDB_KEY } = process.env;
  test.skip(
    !TMDB_KEY || !OMDB_KEY,
    'Set TMDB_KEY and OMDB_KEY (e.g. in .env) to run the live lookup.',
  );
  await setKeys(TMDB_KEY!, OMDB_KEY!, { movieLink: 'tmdb' });

  const page = await context.newPage();
  await page.goto(PAGE_URL);
  await page.locator('#poster-unfassbaren').hover();
  await expect(page.locator('popscore-card')).toHaveAttribute('data-state', 'match', {
    timeout: 10_000,
  });
  await page.screenshot({ path: 'test-results/card-tmdb.png' });
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

  // In the poster's top-right corner.
  const poster = (await page.locator('#poster-dune').boundingBox())!;
  const box = (await tag(693134).boundingBox())!;
  expect(Math.abs(box.x + box.width - (poster.x + poster.width - 6))).toBeLessThan(2);
  expect(Math.abs(box.y - (poster.y + 6))).toBeLessThan(2);

  // A text link gets it after its title. Other links get none, and neither does the TV show:
  // cinemas don't show series.
  await expect(page.locator('#link-oppenheimer popscore-tag')).toHaveAttribute('data-score', '8.3');
  await expect(page.locator('#link-kontakt popscore-tag, li.show popscore-tag')).toHaveCount(0);
  // The tag's text stays in its shadow root: the hover detector reads the link as before.
  expect(await page.locator('#link-oppenheimer').innerText()).toBe('Oppenheimer');
  await page.screenshot({ path: 'test-results/tags.png' });

  // The hover card still opens through the tag.
  await page.locator('#poster-dune').hover({ position: { x: 140, y: 12 } });
  await expect(page.locator('popscore-card')).toHaveAttribute('data-state', 'match', {
    timeout: 5000,
  });
});

test('tags and opens TV shows on streaming sites, until they are switched off', async () => {
  await setKeys('tmdb-mock', 'omdb-mock');
  await mockMovieApis();

  const page = await context.newPage();
  await page.goto(STREAMING_URL);
  const show = page.locator('popscore-tag[data-kind="tv"][data-tmdb="66732"]');
  await expect(show).toHaveAttribute('data-score', '8.6', { timeout: 10_000 });
  await expect(page.locator('popscore-tag[data-kind="movie"]')).toHaveCount(4);

  await page.locator('#tile-show').hover();
  await expect(page.locator('popscore-card')).toHaveAttribute('data-state', 'match', {
    timeout: 5000,
  });
  await page.screenshot({ path: 'test-results/card-show.png' });
  await page.mouse.move(0, 0);

  // Movies only: the show's tag goes, the films keep theirs.
  await setKeys('tmdb-mock', 'omdb-mock', { tvShows: false });
  await expect(show).toHaveCount(0, { timeout: 5000 });
  await expect(page.locator('popscore-tag[data-kind="movie"]')).toHaveCount(4, { timeout: 5000 });
});

test('keeps a tag above the layers a tile draws over its poster', async () => {
  await setKeys('tmdb-mock', 'omdb-mock');
  await mockMovieApis();
  await context.route(RANKED_URL, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: RANKED }),
  );

  const page = await context.newPage();
  await page.goto(RANKED_URL);
  const tag = page.locator('popscore-tag');
  await expect(tag).toHaveCount(1, { timeout: 10_000 });

  // The topmost element at the tag's center, with the tag made hit-testable for a moment.
  const topmost = () =>
    tag.evaluate((host) => {
      const r = host.getBoundingClientRect();
      host.style.setProperty('pointer-events', 'auto', 'important');
      const top = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2)[0];
      host.style.setProperty('pointer-events', 'none', 'important');
      return top === host ? 'tag' : top.className;
    });
  await expect.poll(topmost).toBe('tag');

  // Still in the poster's top-right corner.
  const poster = (await page.locator('#poster-oppenheimer').boundingBox())!;
  const box = (await tag.boundingBox())!;
  expect(Math.abs(box.x + box.width - (poster.x + poster.width - 6))).toBeLessThan(2);
  expect(Math.abs(box.y - (poster.y + 6))).toBeLessThan(2);
  await page.screenshot({ path: 'test-results/tags-ranked.png' });
});

test('keeps a tag under the page header when the poster scrolls beneath it', async () => {
  await setKeys('tmdb-mock', 'omdb-mock');
  await mockMovieApis();
  // Like cinemahlen.de: a fixed header with a small z-index over a page of plain, static posters.
  await context.route(RANKED_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `<!doctype html><html lang="de"><body style="margin:0">
        <header style="position:fixed;top:0;left:0;right:0;height:120px;z-index:2;background:#911">
          Programm
        </header>
        <main style="padding-top:140px;height:3000px">
          <a href="#"><img id="poster-oppenheimer" alt="Oppenheimer" width="160" height="240"
            style="display:block;background:#ccc" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></a>
        </main>
      </body></html>`,
    }),
  );

  const page = await context.newPage();
  await page.goto(RANKED_URL);
  const tag = page.locator('popscore-tag');
  await expect(tag).toHaveCount(1, { timeout: 10_000 });
  await page.evaluate(() => scrollTo(0, 60));

  const topmost = () =>
    tag.evaluate((host) => {
      const r = host.getBoundingClientRect();
      host.style.setProperty('pointer-events', 'auto', 'important');
      const top = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2)[0];
      host.style.setProperty('pointer-events', 'none', 'important');
      return top === host ? 'tag' : top.tagName;
    });
  await expect.poll(topmost).toBe('HEADER');
  await page.screenshot({ path: 'test-results/tags-header.png' });
});

test('no tags when they are switched off', async () => {
  await setKeys('tmdb-mock', 'omdb-mock', { scoreTags: false });
  await mockMovieApis();

  const page = await context.newPage();
  await page.goto(PAGE_URL);
  await page.waitForTimeout(2000);
  await expect(page.locator('popscore-tag')).toHaveCount(0);
});
