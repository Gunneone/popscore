import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { ApiError } from '../src/api/errors';
import type { RatingsProvider } from '../src/api/provider';
import { clearCache } from '../src/cache';
import { lookup, pickMovie, tmdbLanguage } from '../src/lookup';
import { getUsage, updateSettings } from '../src/settings';
import type { LookupRequest, MediaKind, MovieDetails, MovieSummary } from '../src/types';

const summary = (
  tmdbId: number,
  title: string,
  year: number,
  extra: Partial<MovieSummary> = {},
): MovieSummary => ({
  kind: 'movie',
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

// TMDB numbers movies and shows separately: Dark has the same id as Die Unfassbaren.
const SEARCH_TV: Record<string, MovieSummary[]> = {
  Dark: [summary(75656, 'Dark', 2017, { kind: 'tv', releaseDate: '2017-12-01' })],
};

const details = (id: number, kind: MediaKind = 'movie'): MovieDetails => {
  const s = Object.values(kind === 'tv' ? SEARCH_TV : SEARCH)
    .flat()
    .find((m) => m.tmdbId === id)!;
  const base = {
    kind,
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
  return kind === 'tv'
    ? { ...base, runtime: 55, imdbId: `tt9${id}`, seasons: 3, lastYear: 2020, ended: true }
    : base;
};

function makeProvider(overrides: Partial<RatingsProvider> = {}) {
  return {
    search: vi.fn(
      async (q: string, o: { kind: MediaKind }) => (o.kind === 'tv' ? SEARCH_TV : SEARCH)[q] ?? [],
    ),
    details: vi.fn(async (id: number, kind: MediaKind) => details(id, kind)),
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

/** The searches made for one kind, as [query, options]. */
const searches = (provider: RatingsProvider, kind: MediaKind) =>
  vi.mocked(provider.search).mock.calls.filter(([, o]) => o.kind === kind);

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
      kind: 'movie',
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
    const searched = vi.mocked(provider.search).mock.calls.length;
    await lookup(req('Dune'), { provider, fetchPoster });
    expect(searches(provider, 'movie')).toHaveLength(1);
    expect(provider.search).toHaveBeenCalledTimes(searched);
    expect(provider.details).toHaveBeenCalledTimes(1);
    expect(provider.rating).toHaveBeenCalledTimes(1);
    expect((await getUsage()).omdbCalls).toBe(1);
  });

  it('retries without the year when the year hint finds nothing', async () => {
    const provider = makeProvider({
      search: vi.fn(async (q: string, o: { kind: MediaKind; year?: number }) =>
        o.year || o.kind === 'tv' ? [] : (SEARCH[q] ?? []),
      ),
    });
    const result = await lookup(
      { ...req('Dune'), candidates: [{ text: 'Dune', year: 2020, weight: 1, source: 't' }] },
      { provider, fetchPoster },
    );
    expect(searches(provider, 'movie')).toHaveLength(2);
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
      { kind: 'movie', tmdbId: 841 },
      first.status === 'match' ? first.alternatives : [],
      { provider, fetchPoster },
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
      if (u.pathname === '/3/search/tv') return Response.json({ results: [] });
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

  it('finds a TV show and its IMDb rating', async () => {
    const provider = makeProvider();
    const result = await lookup(req('Dark'), { provider, fetchPoster });
    expect(result).toMatchObject({
      status: 'match',
      movie: { kind: 'tv', tmdbId: 75656, title: 'Dark', seasons: 3, imdbId: 'tt975656' },
    });
    expect(provider.details).toHaveBeenCalledWith(75656, 'tv');
    expect(provider.rating).toHaveBeenCalledWith('tt975656');
  });

  it('keeps a movie and a show with the same TMDB id apart', async () => {
    const provider = makeProvider();
    const film = await lookup(req('Die Unfassbaren'), { provider, fetchPoster });
    const show = await lookup(req('Dark'), { provider, fetchPoster });
    expect(film).toMatchObject({ movie: { kind: 'movie', tmdbId: 75656 } });
    expect(show).toMatchObject({ movie: { kind: 'tv', tmdbId: 75656, title: 'Dark' } });
    expect(provider.details).toHaveBeenCalledTimes(2);
  });

  it('only searches movies when TV shows are switched off', async () => {
    await updateSettings({ tvShows: false });
    const provider = makeProvider();
    expect((await lookup(req('Dark'), { provider })).status).toBe('nomatch');
    expect(searches(provider, 'tv')).toHaveLength(0);
    expect(searches(provider, 'movie').length).toBeGreaterThan(0);
  });

  it('only searches TV shows when movies are switched off', async () => {
    await updateSettings({ movies: false });
    const provider = makeProvider();
    expect((await lookup(req('Dune'), { provider })).status).toBe('nomatch');
    expect(searches(provider, 'movie')).toHaveLength(0);
    expect((await lookup(req('Dark'), { provider, fetchPoster })).status).toBe('match');
  });

  it('searches only TV shows for text that names a season, and skips it with TV off', async () => {
    const provider = makeProvider();
    const seasonal = req('Dune', {
      candidates: [{ text: 'Dune', series: true, weight: 1, source: 'test' }],
    });
    expect((await lookup(seasonal, { provider })).status).toBe('nomatch');
    expect(searches(provider, 'movie')).toHaveLength(0);

    await updateSettings({ tvShows: false });
    vi.mocked(provider.search).mockClear();
    expect((await lookup(seasonal, { provider })).status).toBe('nomatch');
    expect(provider.search).not.toHaveBeenCalled();
  });

  it('leaves TV shows out of automatic lookups on cinema pages', async () => {
    const provider = makeProvider();
    expect((await lookup(req('Dark', { cinema: true }), { provider })).status).toBe('nomatch');
    expect(searches(provider, 'tv')).toHaveLength(0);
    // Alt-hover still finds it.
    const manual = await lookup(req('Dark', { cinema: true, mode: 'manual' }), {
      provider,
      fetchPoster,
    });
    expect(manual).toMatchObject({ status: 'match', movie: { kind: 'tv' } });
  });

  it('remembers a picked show as a show', async () => {
    const provider = makeProvider();
    await pickMovie('Dark Netflix', { kind: 'tv', tmdbId: 75656 }, [], { provider, fetchPoster });
    const again = await lookup(req('Dark Netflix'), { provider, fetchPoster });
    expect(again).toMatchObject({
      status: 'match',
      picked: true,
      movie: { kind: 'tv', tmdbId: 75656, title: 'Dark' },
    });
  });

  it("reads a show's IMDb id, seasons and run from TMDB", async () => {
    await updateSettings({ tmdbKey: 'k', omdbKey: 'o', movies: false });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: URL | string) => {
        const u = new URL(String(url));
        if (u.pathname === '/3/search/tv') {
          return Response.json({
            results: [
              {
                id: 1399,
                name: 'Game of Thrones',
                original_name: 'Game of Thrones',
                first_air_date: '2011-04-17',
                vote_count: 25000,
              },
            ],
          });
        }
        if (u.pathname === '/3/tv/1399') {
          expect(u.searchParams.get('append_to_response')).toBe('external_ids');
          return Response.json({
            id: 1399,
            name: 'Game of Thrones',
            original_name: 'Game of Thrones',
            first_air_date: '2011-04-17',
            last_air_date: '2019-05-19',
            status: 'Ended',
            number_of_seasons: 8,
            episode_run_time: [],
            genres: [{ id: 18, name: 'Drama' }],
            overview: 'Seven noble families.',
            poster_path: null,
            vote_average: 8.5,
            vote_count: 25000,
            external_ids: { imdb_id: 'tt0944947' },
          });
        }
        if (u.hostname === 'www.omdbapi.com') {
          expect(u.searchParams.get('i')).toBe('tt0944947');
          return Response.json({ Response: 'True', imdbRating: '9.2', imdbVotes: '2,400,000' });
        }
        throw new Error(`unexpected ${u}`);
      }),
    );
    const result = await lookup(req('Game of Thrones'));
    expect(result).toMatchObject({
      status: 'match',
      movie: {
        kind: 'tv',
        title: 'Game of Thrones',
        year: 2011,
        lastYear: 2019,
        ended: true,
        seasons: 8,
        runtime: null,
        rating: 9.2,
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
