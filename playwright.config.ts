import { defineConfig } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

// Minimal .env support for the live e2e test (TMDB_KEY, OMDB_KEY).
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

export default defineConfig({
  testDir: 'e2e',
  // The live check of all sites has its own config (playwright.sites.config.ts).
  testIgnore: ['live/**'],
  // Playwright empties this folder on every run; keep it apart from test-results/sites.
  outputDir: 'test-results/playwright',
  timeout: 30_000,
  workers: 1,
  reporter: 'list',
});
