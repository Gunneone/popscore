import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { cacheGet, cacheSet, clearCache, pruneCache } from '../../src/cache';
import {
  DEFAULT_SITES,
  findDefaultSite,
  matchesPattern,
  originPattern,
  REGION_NAMES,
  siteState,
} from '../../src/sites';
import { mediaKinds } from '../../src/settings';
import {
  cardLink,
  displayScore,
  formatRuntime,
  formatVotes,
  formatYears,
  verdict,
} from '../../src/ui/format';
import { placeCard } from '../../src/ui/position';

describe('sites', () => {
  it('matches default sites including subdomains and Prime Video paths', () => {
    expect(findDefaultSite('https://www.netflix.com/browse')?.id).toBe('netflix');
    expect(findDefaultSite('https://www.cinestar.de/kino-berlin/programm')?.kind).toBe('cinema');
    expect(findDefaultSite('https://www.amazon.de/gp/video/storefront')?.id).toBe('primevideo');
    expect(findDefaultSite('https://www.amazon.de/-/en/gp/video/detail/B0')?.id).toBe('primevideo');
    expect(findDefaultSite('https://www.amazon.co.uk/gp/video/detail/B0')?.id).toBe('primevideo');
    expect(findDefaultSite('https://www.amazon.de/dp/B0123')).toBeUndefined();
    expect(findDefaultSite('https://notnetflix.com/')).toBeUndefined();
  });

  it('limits big multi-purpose domains to their video section', () => {
    expect(findDefaultSite('https://www.bbc.co.uk/iplayer/episode/m0')?.id).toBe('iplayer');
    expect(findDefaultSite('https://www.bbc.co.uk/news')).toBeUndefined();
    expect(findDefaultSite('https://www.srf.ch/play/tv/film')?.id).toBe('srf');
    expect(findDefaultSite('https://www.srf.ch/news')).toBeUndefined();
    expect(findDefaultSite('https://www.itv.com/')?.id).toBe('itvx');
    expect(findDefaultSite('https://www.itv.com/news')).toBeUndefined();
    expect(findDefaultSite('https://www.fandango.com/movies')?.kind).toBe('cinema');
    expect(findDefaultSite('https://athome.fandango.com/browse')?.kind).toBe('streaming');
  });

  it('keeps the catalog consistent: unique ids, valid patterns, no overlapping hosts', () => {
    const ids = DEFAULT_SITES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const site of DEFAULT_SITES) {
      expect(site.region in REGION_NAMES).toBe(true);
      for (const pattern of site.matches) {
        expect(pattern).toMatch(/^\*:\/\/(\*\.)?[a-z0-9.-]+\/\S*$/);
        // A URL of this site, e.g. "*://*.odeon.co.uk/*" -> "https://www.odeon.co.uk/".
        const [, host, path] = /^\*:\/\/([^/]+)(\/.*)$/.exec(pattern)!;
        const url = `https://${host.replace(/^\*\./, 'www.')}${path.replace(/\*/g, '')}`;
        const owners = DEFAULT_SITES.filter((s) => s.matches.some((p) => matchesPattern(url, p)));
        expect(
          owners.map((s) => s.id),
          url,
        ).toEqual([site.id]);
      }
    }
  });

  it('handles <all_urls> and builds origin patterns', () => {
    expect(matchesPattern('https://example.org/x', '<all_urls>')).toBe(true);
    expect(matchesPattern('chrome://settings', '<all_urls>')).toBe(false);
    expect(originPattern('https://www.yorck.de/filme?x=1')).toBe('https://www.yorck.de/*');
    expect(originPattern('chrome://extensions')).toBeNull();
  });
});

describe('siteState', () => {
  const own = 'https://www.example-kino.de/*';
  const base = { disabledSites: [], disabledLists: [], extraSites: [own] };

  it('is on when the site and its list are on', () => {
    expect(siteState('https://www.odeon.co.uk/films', base)).toMatchObject({
      list: 'cinema',
      on: true,
    });
    expect(siteState('https://www.example-kino.de/programm', base)).toMatchObject({
      list: 'custom',
      pattern: own,
      on: true,
    });
  });

  it('is off when the site is switched off', () => {
    const s = { ...base, disabledSites: ['odeon', own] };
    expect(siteState('https://www.odeon.co.uk/', s)).toMatchObject({ siteOn: false, on: false });
    expect(siteState('https://www.example-kino.de/', s)).toMatchObject({
      siteOn: false,
      on: false,
    });
  });

  it("is off while its list is paused, keeping the site's own choice", () => {
    const s = { ...base, disabledLists: ['streaming' as const, 'custom' as const] };
    expect(siteState('https://www.netflix.com/browse', s)).toMatchObject({
      listOn: false,
      siteOn: true,
      on: false,
    });
    expect(siteState('https://www.example-kino.de/', s).on).toBe(false);
    expect(siteState('https://www.cinestar.de/', s).on).toBe(true);
  });

  it('knows nothing about other sites', () => {
    expect(siteState('https://example.org/', base)).toMatchObject({ list: null, on: false });
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

  it('prefers the IMDb rating and falls back to a TMDB score with enough votes', () => {
    expect(displayScore({ rating: 8, votes: 100, tmdbRating: 7, tmdbVotes: 50 })).toEqual({
      value: 8,
      votes: 100,
      source: 'IMDb',
    });
    expect(displayScore({ rating: null, votes: null, tmdbRating: 7.5, tmdbVotes: 812 })).toEqual({
      value: 7.5,
      votes: 812,
      source: 'TMDB',
    });
    expect(displayScore({ rating: null, votes: null, tmdbRating: 9, tmdbVotes: 2 })).toBeNull();
    // Cached entries from older versions have no TMDB fields.
    expect(displayScore({ rating: null, votes: null })).toBeNull();
  });

  it('maps ratings to verdicts', () => {
    expect(verdict(7, 7, 6)).toBe('good');
    expect(verdict(6.9, 7, 6)).toBe('okay');
    expect(verdict(5.9, 7, 6)).toBe('bad');
    expect(verdict(null, 7, 6)).toBe('none');
  });

  it("gives a film's year and a show's run", () => {
    expect(formatYears({ kind: 'movie', year: 2021 })).toBe('2021');
    expect(formatYears({ kind: 'tv', year: 2017, lastYear: 2020, ended: true })).toBe('2017–2020');
    expect(formatYears({ kind: 'tv', year: 2019, lastYear: 2025, ended: false })).toBe('2019–');
    expect(formatYears({ kind: 'tv', year: 2019, lastYear: 2019, ended: true })).toBe('2019');
    expect(formatYears({ kind: 'movie' })).toBeNull();
  });

  it('links films and shows to the site chosen for each', () => {
    const film = { kind: 'movie' as const, tmdbId: 1437696, imdbId: 'tt123' };
    const show = { kind: 'tv' as const, tmdbId: 1399, imdbId: 'tt0944947' };
    const links = { movieLink: 'letterboxd' as const, showLink: 'imdb' as const };
    expect(cardLink(film, links)).toEqual({
      href: 'https://letterboxd.com/tmdb/1437696/',
      label: 'Letterboxd',
    });
    expect(cardLink(show, links)).toEqual({
      href: 'https://www.imdb.com/title/tt0944947/',
      label: 'IMDb',
    });
    expect(cardLink(film, { ...links, movieLink: 'tmdb' }).href).toBe(
      'https://www.themoviedb.org/movie/1437696',
    );
    expect(cardLink(show, { ...links, showLink: 'tmdb' }).href).toBe(
      'https://www.themoviedb.org/tv/1399',
    );
    // IMDb doesn't know every new title yet.
    expect(cardLink({ ...film, imdbId: null }, { ...links, movieLink: 'imdb' }).label).toBe('TMDB');
  });
});

describe('mediaKinds', () => {
  it('lists what is switched on, and never nothing', () => {
    expect(mediaKinds({ movies: true, tvShows: true })).toEqual(['movie', 'tv']);
    expect(mediaKinds({ movies: false, tvShows: true })).toEqual(['tv']);
    expect(mediaKinds({ movies: false, tvShows: false })).toEqual(['movie']);
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
