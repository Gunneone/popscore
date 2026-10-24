import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/api/errors';
import { makeProvider, type RatingsProvider } from '../src/api/provider';
import { serverProvider } from '../src/api/server';

afterEach(() => vi.unstubAllGlobals());

function fakeServer() {
  return {
    search: vi.fn(async () => []),
    details: vi.fn(async () => {
      throw new Error('server details');
    }),
    rating: vi.fn(async () => ({ rating: 7, votes: 5000 })),
    ownOmdbKey: false,
  } satisfies RatingsProvider;
}

/** Answers TMDB and OMDb like the real services, and records which hosts were asked. */
function stubDirectApis() {
  const hosts: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL | string) => {
      const u = new URL(String(url));
      hosts.push(u.hostname);
      if (u.hostname === 'www.omdbapi.com') {
        return Response.json({ Response: 'True', imdbRating: '8.0', imdbVotes: '1,000' });
      }
      return Response.json({ results: [] });
    }),
  );
  return hosts;
}

describe('makeProvider', () => {
  it('uses the server for everything without keys', async () => {
    const server = fakeServer();
    const hosts = stubDirectApis();
    const p = makeProvider({ tmdbKey: ' ', omdbKey: '' }, server);
    await p.search('Dune', { language: 'en-US' });
    await p.rating('tt1160419', { tag: true });
    expect(server.search).toHaveBeenCalledOnce();
    expect(server.rating).toHaveBeenCalledWith('tt1160419', { tag: true });
    expect(hosts).toEqual([]);
    expect(p.ownOmdbKey).toBe(false);
  });

  it('asks TMDB directly with an own TMDB key, and the server for ratings', async () => {
    const server = fakeServer();
    const hosts = stubDirectApis();
    const p = makeProvider({ tmdbKey: 'k', omdbKey: '' }, server);
    await p.search('Dune', { language: 'en-US' });
    await p.rating('tt1160419');
    expect(hosts).toEqual(['api.themoviedb.org']);
    expect(server.search).not.toHaveBeenCalled();
    expect(server.rating).toHaveBeenCalledOnce();
    expect(p.ownOmdbKey).toBe(false);
  });

  it('asks OMDb directly with an own OMDb key, and the server for TMDB', async () => {
    const server = fakeServer();
    const hosts = stubDirectApis();
    const p = makeProvider({ tmdbKey: '', omdbKey: 'o' }, server);
    await p.search('Dune', { language: 'en-US' });
    expect(await p.rating('tt1160419')).toEqual({ rating: 8, votes: 1000 });
    expect(hosts).toEqual(['www.omdbapi.com']);
    expect(server.search).toHaveBeenCalledOnce();
    expect(server.rating).not.toHaveBeenCalled();
    expect(p.ownOmdbKey).toBe(true);
  });

  it('never asks the server with both keys', async () => {
    const server = fakeServer();
    const hosts = stubDirectApis();
    const p = makeProvider({ tmdbKey: 'k', omdbKey: 'o' }, server);
    await p.search('Dune', { language: 'en-US' });
    await p.rating('tt1160419');
    expect(hosts).toEqual(['api.themoviedb.org', 'www.omdbapi.com']);
    expect(server.search).not.toHaveBeenCalled();
    expect(server.rating).not.toHaveBeenCalled();
  });
});

describe('serverProvider', () => {
  const BASE = 'https://ratings.test/';

  function stubServer(res: () => Response | Promise<Response>) {
    const urls: URL[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: URL | string) => {
        urls.push(new URL(String(url)));
        return res();
      }),
    );
    return urls;
  }

  it('asks the server and returns its answer', async () => {
    const urls = stubServer(() => Response.json([{ tmdbId: 1, title: 'Dune' }]));
    const results = await serverProvider(BASE).search('Dune', { language: 'de-DE', year: 2021 });
    expect(results).toEqual([{ tmdbId: 1, title: 'Dune' }]);
    expect(urls[0].href).toBe('https://ratings.test/v1/search?query=Dune&language=de-DE&year=2021');
  });

  it('marks score tag lookups', async () => {
    const urls = stubServer(() => Response.json({ rating: 8, votes: 1000 }));
    const p = serverProvider(BASE);
    await p.rating('tt1160419', { tag: true });
    await p.rating('tt1160419');
    expect(urls.map((u) => u.pathname + u.search)).toEqual([
      '/v1/rating/tt1160419?tag=1',
      '/v1/rating/tt1160419',
    ]);
  });

  it.each([
    [429, 'server-busy'],
    [503, 'server-busy'],
    [500, 'unknown'],
  ])('maps status %i to %s', async (status, code) => {
    stubServer(() => Response.json({ error: 'x' }, { status }));
    await expect(serverProvider(BASE).details(1)).rejects.toEqual(
      expect.objectContaining({ code }),
    );
  });

  it('passes on that TMDB or OMDb were unreachable', async () => {
    stubServer(() => Response.json({ error: 'offline' }, { status: 502 }));
    await expect(serverProvider(BASE).rating('tt1160419')).rejects.toEqual(
      new ApiError('offline', 'The ratings server responded 502'),
    );
  });

  it('reports an unreachable server as offline', async () => {
    stubServer(() => Promise.reject(new TypeError('Failed to fetch')));
    await expect(serverProvider(BASE).search('Dune', { language: 'en-US' })).rejects.toEqual(
      expect.objectContaining({ code: 'offline' }),
    );
  });
});
