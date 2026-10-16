import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { cacheGet, cacheSet, clearCache, pruneCache } from '../src/cache';
import { findDefaultSite, matchesPattern, originPattern } from '../src/sites';
import { formatRuntime, formatVotes, verdict } from '../src/ui/format';
import { placeCard } from '../src/ui/position';

describe('sites', () => {
  it('matches default sites including subdomains and Prime Video paths', () => {
    expect(findDefaultSite('https://www.netflix.com/browse')?.id).toBe('netflix');
    expect(findDefaultSite('https://www.cinestar.de/kino-berlin/programm')?.kind).toBe('cinema');
    expect(findDefaultSite('https://www.amazon.de/gp/video/storefront')?.id).toBe(
      'amazon-de-video',
    );
    expect(findDefaultSite('https://www.amazon.de/-/en/gp/video/detail/B0')?.id).toBe(
      'amazon-de-video',
    );
    expect(findDefaultSite('https://www.amazon.de/dp/B0123')).toBeUndefined();
    expect(findDefaultSite('https://notnetflix.com/')).toBeUndefined();
  });

  it('handles <all_urls> and builds origin patterns', () => {
    expect(matchesPattern('https://example.org/x', '<all_urls>')).toBe(true);
    expect(matchesPattern('chrome://settings', '<all_urls>')).toBe(false);
    expect(originPattern('https://www.yorck.de/filme?x=1')).toBe('https://www.yorck.de/*');
    expect(originPattern('chrome://extensions')).toBeNull();
  });
});

describe('cache', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    await clearCache();
    vi.useRealTimers();
  });

  it('expires entries', async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    await cacheSet('a', 1, 1000);
    expect(await cacheGet('a')).toBe(1);
    vi.setSystemTime(1_000_000 + 1001);
    expect(await cacheGet('a')).toBeUndefined();
    vi.useRealTimers();
  });

  it('prunes the oldest entries beyond the limit', async () => {
    vi.useFakeTimers({ now: 1 });
    for (let i = 0; i < 5; i++) {
      vi.setSystemTime(1 + i);
      await cacheSet(`k${i}`, i, 1e9);
    }
    await pruneCache(3);
    const stored = Object.keys(await fakeBrowser.storage.local.get(null));
    expect(stored.sort()).toEqual(['c:k2', 'c:k3', 'c:k4']);
    vi.useRealTimers();
  });
});

describe('format', () => {
  it('formats votes and runtime', () => {
    expect(formatVotes(845)).toBe('845');
    expect(formatVotes(41_234)).toBe('41k');
    expect(formatVotes(1_234_567)).toBe('1.2M');
    expect(formatVotes(2_000_000)).toBe('2M');
    expect(formatRuntime(166)).toBe('2h 46m');
    expect(formatRuntime(45)).toBe('45m');
  });

  it('maps ratings to verdicts', () => {
    expect(verdict(7, 7, 6)).toBe('good');
    expect(verdict(6.9, 7, 6)).toBe('okay');
    expect(verdict(5.9, 7, 6)).toBe('bad');
    expect(verdict(null, 7, 6)).toBe('none');
  });
});

describe('placeCard', () => {
  const vp = { width: 1200, height: 800 };
  const card = { width: 312, height: 260 };
  const rect = (left: number, top: number, width: number, height: number) => ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  });

  it('goes right of the anchor when there is room', () => {
    expect(placeCard(rect(100, 100, 200, 300), card, vp)).toEqual({ left: 310, top: 100 });
  });

  it('flips left near the right edge', () => {
    expect(placeCard(rect(900, 100, 200, 300), card, vp)).toEqual({ left: 578, top: 100 });
  });

  it('stays inside the viewport vertically', () => {
    expect(placeCard(rect(100, 700, 200, 90), card, vp).top).toBe(800 - 260 - 8);
  });

  it('goes below a wide anchor', () => {
    expect(placeCard(rect(0, 100, 1200, 200), card, vp)).toEqual({ left: 444, top: 310 });
  });
});
