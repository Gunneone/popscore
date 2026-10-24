// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, type AppOptions } from '../../server/app';
import { openStore, type Store } from '../../server/store';
import { DAY, HOUR } from '../../server/ttl';

/** OMDb's answers by IMDb id; any other id has a rating on 5,000 votes. */
const OMDB: Record<string, [rating: string, votes: string]> = {
  tt1160419: ['8.0', '1,012,345'],
  tt0000099: ['6.1', '99'],
  tt0000100: ['7.0', '100'],
  tt0000404: ['N/A', 'N/A'],
};

/** TMDB's movie details by id. */
const TMDB: Record<string, { imdb_id: string | null; vote_count: number }> = {
  438631: { imdb_id: 'tt1160419', vote_count: 13000 },
  1311031: { imdb_id: 'tt27999999', vote_count: 40 },
  777: { imdb_id: null, vote_count: 5000 },
};

/** TMDB's TV show details by id: Dark has ended, The Last of Us is still running. */
const TMDB_TV: Record<string, { imdb_id: string; vote_count: number; status: string }> = {
  70523: { imdb_id: 'tt5753856', vote_count: 7936, status: 'Ended' },
  100088: { imdb_id: 'tt3581920', vote_count: 7440, status: 'Returning Series' },
};

let time: number;
let store: Store;
let upstream: ReturnType<typeof stubUpstream>;

function stubUpstream() {
  const fetchMock = vi.fn(async (input: URL | string) => {
    const url = new URL(String(input));
    if (url.hostname === 'www.omdbapi.com') {
      const [rating, votes] = OMDB[url.searchParams.get('i')!] ?? ['7.0', '5,000'];
      return Response.json({ Response: 'True', imdbRating: rating, imdbVotes: votes });
    }
    if (url.pathname === '/3/search/movie') {
      const hits = url.searchParams.get('query')!.toLowerCase().includes('dune')
        ? [{ id: 438631, title: 'Dune', original_title: 'Dune', release_date: '2021-09-15' }]
        : [];
      return Response.json({ results: hits });
    }
    if (url.pathname === '/3/search/tv') {
      const hits = url.searchParams.get('query')!.toLowerCase().includes('dark')
        ? [{ id: 70523, name: 'Dark', original_name: 'Dark', first_air_date: '2017-12-01' }]
        : [];
      return Response.json({ results: hits });
    }
    const tv = /^\/3\/tv\/(\d+)$/.exec(url.pathname)?.[1];
    if (tv && TMDB_TV[tv]) {
      const { imdb_id, ...show } = TMDB_TV[tv];
      return Response.json({
        id: Number(tv),
        name: 'A show',
        original_name: 'A show',
        external_ids: { imdb_id },
        ...show,
      });
    }
    const id = /^\/3\/movie\/(\d+)$/.exec(url.pathname)?.[1];
    if (id && TMDB[id]) {
      return Response.json({
        id: Number(id),
        title: 'A film',
        original_title: 'A film',
        ...TMDB[id],
      });
    }
    return Response.json({}, { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function server(opts: Partial<AppOptions> = {}) {
  const app = createApp({
    store,
    tmdbKey: 'tmdb-secret',
    omdbKey: 'omdb-secret',
    omdbDailyLimit: 1000,
    rateLimitPerMin: 1000,
    now: () => time,
    log: () => {},
    ...opts,
  });
  const get = (path: string, ip = '203.0.113.7') =>
    app.handle(new Request(`http://server${path}`), ip);
  return { app, get };
}

beforeEach(() => {
  time = Date.parse('2026-10-24T12:00:00Z');
  store = openStore(':memory:');
  upstream = stubUpstream();
});

afterEach(() => {
  store.close();
  vi.unstubAllGlobals();
});

describe('ratings server cache', () => {
  it('keeps a rating for a week', async () => {
    const { get } = server();
    const first = await get('/v1/rating/tt1160419');
    expect(first.status).toBe(200);
    expect(first.headers.get('x-cache')).toBe('miss');
    expect(first.headers.get('access-control-allow-origin')).toBe('*');
    expect(await first.json()).toEqual({ rating: 8, votes: 1_012_345 });

    time += 6 * DAY;
    const later = await get('/v1/rating/tt1160419');
    expect(later.headers.get('x-cache')).toBe('hit');
    expect(await later.json()).toEqual({ rating: 8, votes: 1_012_345 });

    time += DAY;
    expect((await get('/v1/rating/tt1160419')).headers.get('x-cache')).toBe('miss');
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it.each(['tt0000099', 'tt0000404'])(
    'keeps %s (under 100 votes, or no rating yet) for a day only',
    async (imdbId) => {
      const { get } = server();
      await get(`/v1/rating/${imdbId}`);
      time += 23 * HOUR;
      expect((await get(`/v1/rating/${imdbId}`)).headers.get('x-cache')).toBe('hit');
      time += 2 * HOUR;
      expect((await get(`/v1/rating/${imdbId}`)).headers.get('x-cache')).toBe('miss');
    },
  );

  it('counts 100 votes as enough for a week', async () => {
    const { get } = server();
    await get('/v1/rating/tt0000100');
    time += 2 * DAY;
    expect((await get('/v1/rating/tt0000100')).headers.get('x-cache')).toBe('hit');
  });

  it('keeps movie details for a week, or a day while new', async () => {
    const { get } = server();
    for (const id of [438631, 1311031, 777]) await get(`/v1/movie/${id}`);
    time += 2 * DAY;
    // 1311031 has 40 TMDB votes, 777 no IMDb id yet.
    const cache = await Promise.all(
      [438631, 1311031, 777].map(async (id) =>
        (await get(`/v1/movie/${id}`)).headers.get('x-cache'),
      ),
    );
    expect(cache).toEqual(['hit', 'miss', 'miss']);
  });

  it('shares a search between spellings, and keeps empty results for a day', async () => {
    const { get } = server();
    const dune = await get('/v1/search?query=Dune&language=de-DE');
    expect(await dune.json()).toMatchObject([{ tmdbId: 438631, title: 'Dune' }]);
    expect((await get('/v1/search?query=dune&language=de-DE')).headers.get('x-cache')).toBe('hit');
    await get('/v1/search?query=Nothing&language=de-DE');
    time += 2 * DAY;
    expect((await get('/v1/search?query=Dune&language=de-DE')).headers.get('x-cache')).toBe('hit');
    expect((await get('/v1/search?query=Nothing&language=de-DE')).headers.get('x-cache')).toBe(
      'miss',
    );
  });

  it('searches TV shows by kind, without the year', async () => {
    const { get } = server();
    const dark = await get('/v1/search?query=Dark&language=de-DE&kind=tv&year=2019');
    expect(await dark.json()).toMatchObject([{ kind: 'tv', tmdbId: 70523, title: 'Dark' }]);
    const asked = new URL(String(upstream.mock.calls[0][0]));
    expect([asked.pathname, asked.searchParams.has('year')]).toEqual(['/3/search/tv', false]);
    // Any year, and the default kind is a different search.
    expect((await get('/v1/search?query=dark&language=de-DE&kind=tv')).headers.get('x-cache')).toBe(
      'hit',
    );
    expect((await get('/v1/search?query=Dark&language=de-DE')).headers.get('x-cache')).toBe('miss');
  });

  it('keeps an ended show for a week, a running one for a day', async () => {
    const { get } = server();
    const dark = await get('/v1/tv/70523');
    expect(await dark.json()).toMatchObject({ kind: 'tv', imdbId: 'tt5753856', ended: true });
    await get('/v1/tv/100088');
    time += 2 * DAY;
    expect((await get('/v1/tv/70523')).headers.get('x-cache')).toBe('hit');
    expect((await get('/v1/tv/100088')).headers.get('x-cache')).toBe('miss');
  });

  it('asks upstream once when many clients want the same film at once', async () => {
    const { get } = server();
    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, i) => get('/v1/rating/tt1160419', `198.51.100.${i}`)),
    );
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(store.omdbCalls('2026-10-24')).toBe(1);
  });

  it('purges expired entries', async () => {
    const { app, get } = server();
    await get('/v1/rating/tt0000099');
    await get('/v1/rating/tt1160419');
    time += 2 * DAY;
    expect(store.purge(time)).toBe(1);
    app.sweep();
    expect(store.purge(time)).toBe(0);
  });
});

describe('ratings server limits', () => {
  it.each([
    '/v1/rating/123',
    '/v1/rating/tt12',
    '/v1/movie/abc',
    '/v1/movie/0',
    '/v1/search?query=',
    '/v1/search?query=%3F%21',
    `/v1/search?query=${'a'.repeat(201)}`,
    '/v1/search?query=Dune&language=german',
    '/v1/search?query=Dune&year=soon',
    '/v1/search?query=Dune&kind=book',
    '/v1/tv/abc',
  ])('rejects %s without asking upstream', async (path) => {
    const { get } = server();
    expect((await get(path)).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('answers 404 for unknown routes and 405 for other methods', async () => {
    const { app, get } = server();
    expect((await get('/v1/everything')).status).toBe(404);
    const post = await app.handle(
      new Request('http://server/v1/rating/tt1160419', { method: 'POST' }),
      '1',
    );
    expect(post.status).toBe(405);
  });

  it('limits requests per IP address', async () => {
    const { get } = server({ rateLimitPerMin: 3 });
    for (let i = 0; i < 3; i++) expect((await get('/v1/rating/tt1160419')).status).toBe(200);
    const limited = await get('/v1/rating/tt1160419');
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: 'server-busy' });
    expect((await get('/v1/rating/tt1160419', '192.0.2.1')).status).toBe(200);
    expect((await get('/health')).status).toBe(200);
    time += 20_000;
    expect((await get('/v1/rating/tt1160419')).status).toBe(200);
  });

  it("keeps the last fifth of the day's OMDb budget for cards", async () => {
    const { get } = server({ omdbDailyLimit: 10 });
    const id = (i: number) => `tt${1_000_000 + i}`;
    for (let i = 0; i < 8; i++) expect((await get(`/v1/rating/${id(i)}?tag=1`)).status).toBe(200);
    const tag = await get(`/v1/rating/${id(8)}?tag=1`);
    expect(tag.status).toBe(503);
    expect(await tag.json()).toEqual({ error: 'server-busy' });
    // Cached ratings are still served to tags.
    expect((await get(`/v1/rating/${id(0)}?tag=1`)).status).toBe(200);

    expect((await get(`/v1/rating/${id(8)}`)).status).toBe(200);
    expect((await get(`/v1/rating/${id(9)}`)).status).toBe(200);
    expect((await get(`/v1/rating/${id(10)}`)).status).toBe(503);
    expect(upstream).toHaveBeenCalledTimes(10);

    time += DAY;
    expect((await get(`/v1/rating/${id(10)}?tag=1`)).status).toBe(200);
  });

  it("hides upstream key problems from clients, and never sends the server's keys", async () => {
    const log = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ status_message: 'Invalid API key' }, { status: 401 })),
    );
    const { get } = server({ log });
    const res = await get('/v1/movie/438631');
    expect(res.status).toBe(502);
    const body = await res.text();
    expect(body).toBe('{"error":"unknown"}');
    expect(log).toHaveBeenCalledOnce();
    expect(String(log.mock.calls[0][0])).not.toContain('tmdb-secret');
  });

  it("passes on TMDB's rate limit as busy, and unreachable services as offline", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 429 })),
    );
    const { get } = server();
    const busy = await get('/v1/movie/438631');
    expect([busy.status, await busy.json()]).toEqual([503, { error: 'server-busy' }]);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('fetch failed'))),
    );
    const offline = await get('/v1/rating/tt1160419');
    expect([offline.status, await offline.json()]).toEqual([502, { error: 'offline' }]);
  });

  it('keeps the daily OMDb count in the database', async () => {
    await server().get('/v1/rating/tt1160419');
    // A restarted server with the same database knows today's count.
    const { get } = server({ omdbDailyLimit: 1 });
    expect((await get('/v1/rating/tt0000099')).status).toBe(503);
  });
});
