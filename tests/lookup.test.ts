import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { ApiError } from '../src/api/errors';
import type { RatingsProvider } from '../src/api/provider';
import { SERVER_URL } from '../src/api/server';
import { clearCache } from '../src/cache';
import { lookup, pickMovie, tmdbLanguage } from '../src/lookup';
import { getUsage, updateSettings } from '../src/settings';
import type { LookupRequest, MovieDetails, MovieSummary } from '../src/types';

const summary = (
  tmdbId: number,
  title: string,
  year: number,
  extra: Partial<MovieSummary> = {},
) => ({
  tmdbId,
  title,
  originalTitle: title,
  year,
  releaseDate: `${year}-06-01`,
  posterPath: `/p${tmdbId}.jpg`,
  popularity: 20,
  voteCount: 5000,
  ...extra,
});

const SEARCH: Record<string, MovieSummary[]> = {
  'Die Unfassbaren': [
    summary(75656, 'Die Unfassbaren - Now You See Me', 2013, { originalTitle: 'Now You See Me' }),
    summary(291805, 'Die Unfassbaren 2', 2016),
  ],
  Dune: [
    summary(438631, 'Dune', 2021, { voteCount: 13000 }),
    summary(841, 'Dune', 1984, { voteCount: 2700 }),
  ],
  Play: [summary(9, 'Play', 2011, { voteCount: 2 })],
};

const details = (id: number): MovieDetails => {
  const s = Object.values(SEARCH)
    .flat()
    .find((m) => m.tmdbId === id)!;
  return {
    tmdbId: id,
    title: s.originalTitle,
    originalTitle: s.originalTitle,
    year: s.year,
    runtime: 115,
    genres: ['Thriller', 'Crime'],
    overview: 'Plot.',
    posterPath: s.posterPath ?? null,
    imdbId: `tt${id}`,
    tmdbRating: 7.5,
    tmdbVotes: 812,
  };
};

/** Ratings come from an own OMDb key unless `ownOmdbKey: false`. */
function makeProvider(overrides: Partial<RatingsProvider> = {}) {
  return {
    search: vi.fn(async (q: string) => SEARCH[q] ?? []),
    details: vi.fn(async (id: number) => details(id)),
    rating: vi.fn(async (_imdbId: string, _opts?: { tag?: boolean }) => ({
      rating: 7.2,
      votes: 712_345,
    })),
    ...overrides,
    ownOmdbKey: overrides.ownOmdbKey ?? true,
  } satisfies RatingsProvider;
}

const req = (text: string, extra: Partial<LookupRequest> = {}): LookupRequest => ({
  candidates: [{ text, weight: 1, source: 'test' }],
  pageLang: 'de-DE',
  cinema: false,
  mode: 'auto',
  ...extra,
});

const fetchPoster = async (p: string) => `data:image/jpeg;base64,${p}`;

beforeEach(async () => {
  fakeBrowser.reset();
  await clearCache();
});

describe('lookup', () => {
  it('matches a German title and returns the IMDb rating', async () => {
    const provider = makeProvider();
    const result = await lookup(req('Die Unfassbaren'), { provider, fetchPoster });
    expect(result).toMatchObject({
      status: 'match',
      query: 'Die Unfassbaren',
      picked: false,
      movie: {
        tmdbId: 75656,
        title: 'Now You See Me',
        rating: 7.2,
        votes: 712_345,
        imdbId: 'tt75656',
      },
    });
    expect(provider.search).toHaveBeenCalledWith('Die Unfassbaren', {
      language: 'de-DE',
      year: undefined,
    });
    if (result.status === 'match') {
      expect(result.alternatives.map((a) => a.tmdbId)).toEqual([291805]);
      expect(result.movie.poster).toBe('data:image/jpeg;base64,/p75656.jpg');
    }
  });

  it('caches searches, details and ratings', async () => {
    const provider = makeProvider();
    await lookup(req('Dune'), { provider, fetchPoster });
    await lookup(req('Dune'), { provider, fetchPoster });
    expect(provider.search).toHaveBeenCalledTimes(1);
    expect(provider.details).toHaveBeenCalledTimes(1);
    expect(provider.rating).toHaveBeenCalledTimes(1);
    expect((await getUsage()).omdbCalls).toBe(1);
  });

  it('retries without the year when the year hint finds nothing', async () => {
    const provider = makeProvider({
      search: vi.fn(async (q: string, o: { year?: number }) => (o.year ? [] : (SEARCH[q] ?? []))),
    });
    const result = await lookup(
      { ...req('Dune'), candidates: [{ text: 'Dune', year: 2020, weight: 1, source: 't' }] },
      { provider, fetchPoster },
    );
    expect(provider.search).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('match');
  });

  it('stays quiet in auto mode for non-movies, but answers in manual mode', async () => {
    const provider = makeProvider();
    expect((await lookup(req('Trending Now'), { provider })).status).toBe('nomatch');
    expect((await lookup(req('Play'), { provider })).status).toBe('nomatch');
    const manual = await lookup(req('Play', { mode: 'manual' }), { provider, fetchPoster });
    expect(manual.status).toBe('match');
  });

  it('tries the next candidate when the first one finds nothing', async () => {
    const provider = makeProvider();
    const result = await lookup(
      {
        ...req('x'),
        candidates: [
          { text: 'Mehr erfahren', weight: 1.1, source: 'aria-label' },
          { text: 'Dune', weight: 0.9, source: 'heading' },
        ],
      },
      { provider, fetchPoster },
    );
    expect(result).toMatchObject({ status: 'match', query: 'Dune', movie: { tmdbId: 438631 } });
  });

  it('asks the ratings server when no keys are set', async () => {
    const asked: URL[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: URL | string) => {
        const u = new URL(String(url));
        asked.push(u);
        if (u.pathname === '/v1/search') return Response.json(SEARCH.Dune);
        if (u.pathname === '/v1/movie/438631') return Response.json(details(438631));
        if (u.pathname === '/v1/rating/tt438631') {
          return Response.json({ rating: 8, votes: 1_012_345 });
        }
        return Response.json({ error: 'not-found' }, { status: 404 });
      }),
    );
    const result = await lookup(req('Dune'), { fetchPoster, tag: true });
    expect(result).toMatchObject({ status: 'match', movie: { tmdbId: 438631, rating: 8 } });
    expect(asked.every((u) => u.origin === new URL(SERVER_URL).origin)).toBe(true);
    expect(asked.find((u) => u.pathname === '/v1/search')?.searchParams.get('language')).toBe(
      'de-DE',
    );
    // Tags say so, for the server's budget; the browser's own OMDb count stays untouched.
    expect(asked.find((u) => u.pathname.startsWith('/v1/rating/'))?.searchParams.get('tag')).toBe(
      '1',
    );
    expect((await getUsage()).omdbCalls).toBe(0);
    vi.unstubAllGlobals();
  });

  it('shows the movie with a note when the server is busy for the rating', async () => {
    const provider = makeProvider({
      ownOmdbKey: false,
      rating: vi.fn(async () => {
        throw new ApiError('server-busy', 'busy');
      }),
    });
    const result = await lookup(req('Dune'), { provider, fetchPoster, omdbBudget: 0 });
    expect(result).toMatchObject({
      status: 'match',
      ratingError: 'server-busy',
      movie: { rating: null, tmdbRating: 7.5 },
    });
    // The own-key budget doesn't apply to the server.
    expect(provider.rating).toHaveBeenCalledTimes(1);
    expect((await getUsage()).omdbCalls).toBe(0);
  });

  it('maps API errors', async () => {
    const provider = makeProvider({
      search: vi.fn(async () => {
        throw new ApiError('bad-tmdb-key', 'nope');
      }),
    });
    expect(await lookup(req('Dune'), { provider })).toEqual({
      status: 'error',
      error: 'bad-tmdb-key',
    });
  });

  it('still shows the movie when only the rating fails', async () => {
    const provider = makeProvider({
      rating: vi.fn(async () => {
        throw new ApiError('rate-limit', 'Request limit reached!');
      }),
    });
    const result = await lookup(req('Dune'), { provider, fetchPoster });
    expect(result).toMatchObject({
      status: 'match',
      ratingError: 'rate-limit',
      movie: { rating: null, title: 'Dune' },
    });
  });

  it("keeps TMDB's score for the card when OMDb has no IMDb rating yet", async () => {
    const provider = makeProvider({ rating: vi.fn(async () => ({ rating: null, votes: null })) });
    const result = await lookup(req('Dune'), { provider, fetchPoster });
    expect(result).toMatchObject({
      status: 'match',
      movie: { rating: null, tmdbRating: 7.5, tmdbVotes: 812 },
    });
    expect(result.status === 'match' && result.ratingError).toBeFalsy();
  });

  it('re-checks a missing IMDb rating after a few hours, not days', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-17T12:00:00Z') });
    const rating = vi.fn(async () => ({ rating: null, votes: null }));
    const provider = makeProvider({ rating });
    await lookup(req('Dune'), { provider, fetchPoster });
    vi.setSystemTime(new Date('2026-10-17T19:00:00Z'));
    await lookup(req('Dune'), { provider, fetchPoster });
    expect(rating).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('re-checks a rating on fewer than 100 votes after a day', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-17T12:00:00Z') });
    const rating = vi.fn(async () => ({ rating: 6.1, votes: 99 }));
    const provider = makeProvider({ rating });
    await lookup(req('Dune'), { provider, fetchPoster });
    vi.setSystemTime(new Date('2026-10-18T11:00:00Z'));
    await lookup(req('Dune'), { provider, fetchPoster });
    expect(rating).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date('2026-10-18T13:00:00Z'));
    await lookup(req('Dune'), { provider, fetchPoster });
    expect(rating).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("stops asking OMDb over the tags' budget, without caching the gap", async () => {
    const provider = makeProvider();
    const tag = { provider, fetchPoster, omdbBudget: 1 };
    const first = await lookup(req('Dune'), tag);
    expect(first).toMatchObject({ status: 'match', movie: { rating: 7.2 } });
    expect(provider.rating).toHaveBeenCalledTimes(1);

    // The budget is used up: TMDB's score is all there is for the next film.
    const second = await lookup(req('Die Unfassbaren'), tag);
    expect(second).toMatchObject({ status: 'match', movie: { rating: null, tmdbRating: 7.5 } });
    expect(provider.rating).toHaveBeenCalledTimes(1);
    expect(second.status === 'match' && second.ratingError).toBeFalsy();

    // The card has no budget and still gets the IMDb rating.
    const card = await lookup(req('Die Unfassbaren'), { provider, fetchPoster });
    expect(card).toMatchObject({ status: 'match', movie: { rating: 7.2 } });
    expect(provider.rating).toHaveBeenCalledTimes(2);
    expect((await getUsage()).omdbCalls).toBe(2);
  });

  it('skips the poster for tags', async () => {
    const poster = vi.fn(fetchPoster);
    const result = await lookup(req('Dune'), {
      provider: makeProvider(),
      fetchPoster: poster,
      skipPoster: true,
    });
    expect(result).toMatchObject({ status: 'match', movie: { poster: null } });
    expect(poster).not.toHaveBeenCalled();
  });

  it('counts every OMDb call when several lookups run at once', async () => {
    const provider = makeProvider();
    await Promise.all([
      lookup(req('Dune'), { provider, fetchPoster }),
      lookup(req('Die Unfassbaren'), { provider, fetchPoster }),
    ]);
    expect((await getUsage()).omdbCalls).toBe(2);
  });

  it('remembers a "Wrong movie?" pick for that text', async () => {
    const provider = makeProvider();
    const first = await lookup(req('Dune'), { provider, fetchPoster });
    expect(first.status === 'match' && first.movie.tmdbId).toBe(438631);

    const picked = await pickMovie(
      'Dune',
      841,
      first.status === 'match' ? first.alternatives : [],
      {
        provider,
        fetchPoster,
      },
    );
    expect(picked).toMatchObject({ status: 'match', picked: true, movie: { tmdbId: 841 } });

    const again = await lookup(req('dune'), { provider, fetchPoster });
    expect(again).toMatchObject({ status: 'match', picked: true, movie: { tmdbId: 841 } });
    if (again.status === 'match') expect(again.alternatives.map((a) => a.tmdbId)).toEqual([438631]);
  });

  it('uses the stored keys when no provider is injected', async () => {
    await updateSettings({ tmdbKey: 'k', omdbKey: 'o' });
    const fetchMock = vi.fn(async (url: URL | string) => {
      const u = new URL(String(url));
      if (u.pathname === '/3/search/movie') {
        return Response.json({
          results: [
            {
              id: 1,
              title: 'Dune',
              original_title: 'Dune',
              release_date: '2021-09-15',
              vote_count: 13000,
            },
          ],
        });
      }
      if (u.pathname === '/3/movie/1') {
        return Response.json({
          id: 1,
          title: 'Dune',
          original_title: 'Dune',
          release_date: '2021-09-15',
          runtime: 155,
          genres: [{ id: 1, name: 'Science Fiction' }],
          overview: 'Spice.',
          poster_path: null,
          imdb_id: 'tt1160419',
          vote_average: 7.8,
          vote_count: 13000,
        });
      }
      if (u.hostname === 'www.omdbapi.com') {
        expect(u.searchParams.get('apikey')).toBe('o');
        return Response.json({ Response: 'True', imdbRating: '8.0', imdbVotes: '1,012,345' });
      }
      throw new Error(`unexpected ${u}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await lookup(req('Dune'));
    expect(result).toMatchObject({
      status: 'match',
      movie: {
        rating: 8,
        votes: 1_012_345,
        tmdbRating: 7.8,
        tmdbVotes: 13000,
        runtime: 155,
        genres: ['Science Fiction'],
        poster: null,
      },
    });
    vi.unstubAllGlobals();
  });
});

describe('tmdbLanguage', () => {
  it.each([
    ['de', 'de-DE'],
    ['de-DE', 'de-DE'],
    ['en', 'en-US'],
    ['en-GB', 'en-GB'],
    ['', 'en-US'],
    ['fr', 'fr-FR'],
  ])('%j -> %j', (input, out) => expect(tmdbLanguage(input)).toBe(out));
});
