import { defineConfig } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

// Minimal .env support for the live e2e tests (TMDB_KEY, OMDB_KEY).
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

export default defineConfig({
  testDir: 'tests/e2e',
  reporter: 'list',
  projects: [
    {
      // `npm run e2e`
      name: 'smoke',
      testIgnore: ['live/**'],
      // Playwright empties this folder on every run; keep it apart from test-results/sites.
      outputDir: 'test-results/playwright',
      timeout: 30_000,
      workers: 1,
    },
    {
      // Live check of every built-in site: `npm run e2e:sites`. Slow and network-bound, so it is
      // kept out of the normal e2e run. OMDb is mocked; TMDB is real.
      name: 'sites',
      testDir: 'tests/e2e/live',
      outputDir: 'test-results/playwright-sites',
      timeout: 240_000,
      workers: 4,
      fullyParallel: true,
      retries: 0,
    },
  ],
});
