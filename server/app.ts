import { ApiError } from '../src/api/errors';
import { fetchImdbRating } from '../src/api/omdb';
import { movieDetails, searchMovies } from '../src/api/tmdb';
import { normalizeTitle } from '../src/match/normalize';
import type { LookupError } from '../src/types';
import { rateLimiter } from './limits';
import type { Store } from './store';
import { detailsTtl, ratingTtl, searchTtl } from './ttl';

/** Score tags may use this share of the day's OMDb calls; the rest is kept for cards. */
const TAG_SHARE = 0.8;
const MAX_QUERY = 200;
const IMDB_ID = /^tt\d{7,10}$/;
const TMDB_ID = /^[1-9]\d{0,9}$/;
const LANGUAGE = /^[a-z]{2}(-[A-Z]{2})?$/;

export interface AppOptions {
  store: Store;
  tmdbKey: string;
  omdbKey: string;
  /** OMDb calls the server's key allows per day (UTC). */
  omdbDailyLimit: number;
  /** Requests a minute per client IP address. */
  rateLimitPerMin: number;
  now?: () => number;
  log?: (message: string) => void;
}

export interface App {
  handle(req: Request, ip: string): Promise<Response>;
  /** Housekeeping, every minute or so: expired cache entries and idle rate-limit buckets. */
  sweep(): void;
}

class BadRequest extends Error {}

function json(body: unknown, status = 200, cache?: 'hit' | 'miss'): Response {
  const headers: Record<string, string> = {
    'cache-control': 'no-store',
    // Public movie data without keys: any build of the extension may ask.
    'access-control-allow-origin': '*',
  };
  if (cache) headers['x-cache'] = cache;
  return Response.json(body, { status, headers });
}

/**
 * The ratings server: TMDB search and details and OMDb's IMDb ratings with the server's own keys,
 * cached for every client. Mirrors the extension's `RatingsProvider`.
 */
export function createApp(opts: AppOptions): App {
  const { store } = opts;
  const now = opts.now ?? Date.now;
  const log = opts.log ?? ((message: string) => console.error(message));
  const limiter = rateLimiter(opts.rateLimitPerMin, now);
  /** Lookups in progress: clients asking for the same film at once share one upstream call. */
  const inflight = new Map<string, Promise<unknown>>();

  const today = () => new Date(now()).toISOString().slice(0, 10);

  async function cached<T>(
    key: string,
    load: () => Promise<T>,
    ttl: (value: T) => number,
    beforeLoad?: () => void,
  ): Promise<Response> {
    const hit = store.get<T>(key, now());
    if (hit !== undefined) return json(hit, 200, 'hit');
    let pending = inflight.get(key) as Promise<T> | undefined;
    if (!pending) {
      beforeLoad?.();
      pending = load()
        .then((value) => {
          store.set(key, value, now() + ttl(value));
          return value;
        })
        .finally(() => inflight.delete(key));
      inflight.set(key, pending);
    }
    return json(await pending, 200, 'miss');
  }

  /** Counts an OMDb call against today's budget, or refuses it when the budget is used up. */
  function spendOmdbCall(tag: boolean): void {
    const limit = tag ? Math.floor(opts.omdbDailyLimit * TAG_SHARE) : opts.omdbDailyLimit;
    if (store.omdbCalls(today()) >= limit) {
      throw new ApiError('server-busy', `OMDb budget for ${tag ? 'tags' : 'today'} is used up`);
    }
    store.countOmdbCall(today());
  }

  async function route(url: URL): Promise<Response> {
    const params = url.searchParams;
    if (url.pathname === '/v1/search') {
      const query = (params.get('query') ?? '').trim();
      const normalized = normalizeTitle(query);
      if (!normalized || query.length > MAX_QUERY) throw new BadRequest('query');
      const language = params.get('language') || 'en-US';
      if (!LANGUAGE.test(language)) throw new BadRequest('language');
      const yearText = params.get('year');
      const year = yearText ? Number(yearText) : undefined;
      if (year !== undefined && !(Number.isInteger(year) && year >= 1870 && year <= 2200)) {
        throw new BadRequest('year');
      }
      return cached(
        `s:${language}:${year ?? ''}:${normalized}`,
        () => searchMovies(query, { language, year }, opts.tmdbKey),
        searchTtl,
      );
    }

    const movie = /^\/v1\/movie\/([^/]+)$/.exec(url.pathname);
    if (movie) {
      if (!TMDB_ID.test(movie[1])) throw new BadRequest('tmdbId');
      const tmdbId = Number(movie[1]);
      // The card UI is English, like the extension's own details lookups.
      return cached(`d:${tmdbId}`, () => movieDetails(tmdbId, 'en-US', opts.tmdbKey), detailsTtl);
    }

    const rating = /^\/v1\/rating\/([^/]+)$/.exec(url.pathname);
    if (rating) {
      const imdbId = rating[1];
      if (!IMDB_ID.test(imdbId)) throw new BadRequest('imdbId');
      const tag = params.get('tag') === '1';
      return cached(
        `r:${imdbId}`,
        () => fetchImdbRating(imdbId, opts.omdbKey),
        ratingTtl,
        () => spendOmdbCall(tag),
      );
    }

    return json({ error: 'not-found' }, 404);
  }

  function failure(err: unknown): Response {
    if (err instanceof BadRequest) return json({ error: 'bad-request', field: err.message }, 400);
    const code: LookupError = err instanceof ApiError ? err.code : 'unknown';
    if (code === 'server-busy' || code === 'rate-limit') return json({ error: 'server-busy' }, 503);
    if (code === 'offline') return json({ error: 'offline' }, 502);
    // A rejected server key or an odd upstream answer: worth a look, but not the client's business.
    log(`Upstream error (${code}): ${err instanceof Error ? err.message : String(err)}`);
    return json({ error: 'unknown' }, 502);
  }

  return {
    async handle(req, ip) {
      if (req.method !== 'GET') return json({ error: 'method-not-allowed' }, 405);
      const url = new URL(req.url);
      if (url.pathname === '/health') return json({ ok: true });
      if (!limiter.take(ip)) return json({ error: 'server-busy' }, 429);
      try {
        return await route(url);
      } catch (err) {
        return failure(err);
      }
    },
    sweep() {
      store.purge(now());
      limiter.sweep();
    },
  };
}
