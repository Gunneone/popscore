import { DEFAULT_SERVER_URL } from '../sites';
import type { ImdbRating, MovieDetails, MovieSummary } from '../types';
import { ApiError } from './errors';
import type { RatingsProvider } from './provider';

export const SERVER_URL = import.meta.env.WXT_SERVER_URL || DEFAULT_SERVER_URL;

async function serverGet<T>(
  base: string,
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  const url = new URL(base.replace(/\/+$/, '') + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  }
  let res: Response;
  try {
    res = await fetch(url, { headers: { accept: 'application/json' } });
  } catch {
    throw new ApiError('offline', 'The ratings server is unreachable');
  }
  // 429: this browser asked too often; 503: the server's own TMDB/OMDb allowance is used up.
  if (res.status === 429 || res.status === 503) {
    throw new ApiError('server-busy', `The ratings server is busy (${res.status})`);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    const code = body?.error === 'offline' ? 'offline' : 'unknown';
    throw new ApiError(code, `The ratings server responded ${res.status}`);
  }
  return (await res.json()) as T;
}

/** TMDB and OMDb through the Worth It? ratings server (see server/), which holds the keys. */
export function serverProvider(base = SERVER_URL): RatingsProvider {
  return {
    search: (query, opts) =>
      serverGet<MovieSummary[]>(base, '/v1/search', {
        query,
        language: opts.language,
        year: opts.year,
      }),
    details: (tmdbId) => serverGet<MovieDetails>(base, `/v1/movie/${tmdbId}`),
    rating: (imdbId, opts) =>
      serverGet<ImdbRating>(base, `/v1/rating/${encodeURIComponent(imdbId)}`, {
        tag: opts?.tag ? 1 : undefined,
      }),
    ownOmdbKey: false,
  };
}
