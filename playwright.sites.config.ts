import { defineConfig } from '@playwright/test';
// Also loads .env (TMDB_KEY).
import base from './playwright.config';

// Live check of every built-in site: `npm run e2e:sites`. Slow and network-bound, so it is kept
// out of the normal e2e run. OMDb is mocked; TMDB is real.
export default defineConfig({
  ...base,
  testDir: 'e2e/live',
  testIgnore: [],
  outputDir: 'test-results/playwright-sites',
  timeout: 240_000,
  workers: 4,
  fullyParallel: true,
  retries: 0,
});
