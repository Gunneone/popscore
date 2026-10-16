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

async function setKeys(tmdbKey: string, omdbKey: string) {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  await worker.evaluate((settings) => chrome.storage.sync.set({ settings }), { tmdbKey, omdbKey });
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
