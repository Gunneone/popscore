import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { ApiError } from '../src/api/errors';
import type { RatingsProvider } from '../src/api/provider';
import { clearCache } from '../src/cache';
import { lookup, pickMovie, tmdbLanguage } from '../src/lookup';
import { saveSeriesList } from '../src/series';
import { getUsage, updateSettings } from '../src/settings';
import type { LookupRequest, MovieDetails, MovieSummary, SeriesSummary } from '../src/types';

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
  // TMDB's de-DE results (October 2026) for series tiles and a film few people rated.
  Wednesday: [
    summary(19703, 'A Wednesday!', 2008, { voteCount: 380, popularity: 1.6 }),
    summary(18387, 'Tag der Entscheidung', 1978, {
      originalTitle: 'Big Wednesday',
      voteCount: 198,
      popularity: 2.7,
    }),
  ],
  'Haus des Geldes': [
    summary(689249, 'Haus des Geldes: Das Phänomen', 2020, {
      originalTitle: 'La Casa de Papel: el fenómeno',
      voteCount: 1092,
      popularity: 3.8,
    }),
  ],
  Heldin: [summary(1356670, 'Heldin', 2025, { voteCount: 361, popularity: 6.2 })],
};

const TV_SEARCH: Record<string, SeriesSummary[]> = {
  'Haus des Geldes': [
    { name: 'Haus des Geldes', originalName: 'La casa de papel', popularity: 36 },
    { name: 'Haus des Geldes: Korea', originalName: '종이의 집: 공동경제구역', popularity: 14.7 },
  ],
  Heldin: [
    { name: 'Unerschrocken! – Echte Heldinnen', originalName: 'Culottées', popularity: 4.2 },
    { name: 'Heldinnen der Lüfte', originalName: 'Heldinnen der Lüfte', popularity: 0.5 },
  ],
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

function makeProvider(overrides: Partial<RatingsProvider> = {}) {
  return {
    search: vi.fn(async (q: string) => SEARCH[q] ?? []),
    searchSeries: vi.fn(async (q: string) => TV_SEARCH[q] ?? []),
    details: vi.fn(async (id: number) => details(id)),
    rating: vi.fn(async () => ({ rating: 7.2, votes: 712_345 })),
    ...overrides,
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
  await saveSeriesList({ shows: {}, fetched: 0, tried: 0 });
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

  it('reports missing keys without calling anything', async () => {
    const result = await lookup(req('Dune'));
    expect(result).toEqual({ status: 'error', error: 'missing-keys' });
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

describe('lookup and TV series', () => {
  // The weekly list of popular series, by normalized name.
  const LIST: Record<string, number> = { wednesday: 69.5, friends: 139.6 };
  const listedSeries = async (name: string) => LIST[name];

  it('stays quiet in auto mode for a film named like a popular series on the list', async () => {
    const provider = makeProvider();
    const result = await lookup(req('Wednesday'), { provider, listedSeries });
    expect(result).toMatchObject({ status: 'nomatch', query: 'Wednesday' });
    expect(provider.searchSeries).not.toHaveBeenCalled();
    // Alt-hover still finds the film.
    const manual = await lookup(req('Wednesday', { mode: 'manual' }), {
      provider,
      listedSeries,
      fetchPoster,
    });
    expect(manual).toMatchObject({ status: 'match', movie: { tmdbId: 19703 } });
  });

  it("asks TMDB's TV search, once, for a name the list doesn't have", async () => {
    const provider = makeProvider();
    // The list has the show as "La casa de papel".
    const result = await lookup(req('Haus des Geldes'), { provider, listedSeries });
    expect(result).toMatchObject({ status: 'nomatch', query: 'Haus des Geldes' });
    expect(provider.searchSeries).toHaveBeenCalledWith('Haus des Geldes', { language: 'de-DE' });
    await lookup(req('Haus des Geldes'), { provider, listedSeries });
    expect(provider.searchSeries).toHaveBeenCalledTimes(1);
  });

  it('keeps a film few people rated when TMDB has no series of that name', async () => {
    const provider = makeProvider();
    const result = await lookup(req('Heldin'), { provider, listedSeries, fetchPoster });
    expect(result).toMatchObject({ status: 'match', movie: { tmdbId: 1356670 } });
    expect(provider.searchSeries).toHaveBeenCalledTimes(1);
  });

  it('checks for no series for well-known films, or in manual mode', async () => {
    const provider = makeProvider();
    const list = vi.fn(listedSeries);
    await lookup(req('Dune'), { provider, listedSeries: list, fetchPoster });
    const manual = await lookup(req('Haus des Geldes', { mode: 'manual' }), {
      provider,
      listedSeries: list,
      fetchPoster,
    });
    expect(manual).toMatchObject({ status: 'match', movie: { tmdbId: 689249 } });
    expect(list).not.toHaveBeenCalled();
    expect(provider.searchSeries).not.toHaveBeenCalled();
  });

  it('only uses the list when the provider has no TV search', async () => {
    const provider: RatingsProvider = { ...makeProvider(), searchSeries: undefined };
    const result = await lookup(req('Haus des Geldes'), { provider, listedSeries, fetchPoster });
    expect(result).toMatchObject({ status: 'match', movie: { tmdbId: 689249 } });
    expect((await lookup(req('Wednesday'), { provider, listedSeries })).status).toBe('nomatch');
  });

  it('reads the stored weekly list by default', async () => {
    const now = Date.now();
    await saveSeriesList({ shows: { wednesday: 69.5 }, fetched: now, tried: now });
    const provider = makeProvider();
    expect((await lookup(req('Wednesday'), { provider })).status).toBe('nomatch');
    expect(provider.searchSeries).not.toHaveBeenCalled();
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
