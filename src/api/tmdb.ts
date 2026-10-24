import type { MovieDetails, MovieSummary } from '../types';
import { ApiError } from './errors';

const API = 'https://api.themoviedb.org/3';
export const TMDB_IMAGE = 'https://image.tmdb.org/t/p/';

interface TmdbSearchResult {
  id: number;
  title: string;
  original_title: string;
  release_date?: string;
  poster_path?: string | null;
  popularity?: number;
  vote_count?: number;
  genre_ids?: number[];
}

const TV_MOVIE_GENRE = 10770;

interface TmdbMovie {
  id: number;
  title: string;
  original_title: string;
  release_date?: string;
  runtime?: number | null;
  genres?: { id: number; name: string }[];
  overview?: string;
  poster_path?: string | null;
  imdb_id?: string | null;
  vote_average?: number;
  vote_count?: number;
}

interface TmdbTvSearchResult {
  id: number;
  name: string;
  original_name: string;
  first_air_date?: string;
  poster_path?: string | null;
  popularity?: number;
  vote_count?: number;
}

interface TmdbTv {
  id: number;
  name: string;
  original_name: string;
  first_air_date?: string;
  last_air_date?: string | null;
  /** "Returning Series", "Ended", "Canceled", "In Production", … */
  status?: string;
  number_of_seasons?: number;
  episode_run_time?: number[];
  genres?: { id: number; name: string }[];
  overview?: string;
  poster_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  external_ids?: { imdb_id?: string | null };
}

/** v4 "API Read Access Tokens" are JWTs; v3 "API Keys" are 32 hex chars. */
function isBearerToken(key: string): boolean {
  return key.startsWith('eyJ') && key.length > 60;
}

async function tmdbGet<T>(
  path: string,
  params: Record<string, string | number | undefined>,
  key: string,
): Promise<T> {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  }
  const headers: Record<string, string> = { accept: 'application/json' };
  if (isBearerToken(key)) headers.authorization = `Bearer ${key}`;
  else url.searchParams.set('api_key', key);

  let res: Response;
  try {
    res = await fetch(url, { headers });
  } catch {
    throw new ApiError('offline', 'TMDB is unreachable');
  }
  if (res.status === 401) throw new ApiError('bad-tmdb-key', 'TMDB rejected the API key');
  if (res.status === 429) throw new ApiError('rate-limit', 'TMDB rate limit');
  if (!res.ok) throw new ApiError('unknown', `TMDB responded ${res.status}`);
  return (await res.json()) as T;
}

function yearOf(date?: string): number | undefined {
  const y = date ? Number.parseInt(date.slice(0, 4), 10) : NaN;
  return Number.isFinite(y) ? y : undefined;
}

export async function searchMovies(
  query: string,
  opts: { language?: string; year?: number },
  key: string,
): Promise<MovieSummary[]> {
  const data = await tmdbGet<{ results: TmdbSearchResult[] }>(
    '/search/movie',
    { query, language: opts.language, year: opts.year, include_adult: 'false' },
    key,
  );
  return data.results.slice(0, 10).map((r) => ({
    kind: 'movie' as const,
    tmdbId: r.id,
    title: r.title,
    originalTitle: r.original_title,
    releaseDate: r.release_date || undefined,
    year: yearOf(r.release_date),
    posterPath: r.poster_path ?? null,
    popularity: r.popularity ?? 0,
    voteCount: r.vote_count ?? 0,
    tvMovie: r.genre_ids?.includes(TV_MOVIE_GENRE) ?? false,
  }));
}

export async function movieDetails(
  tmdbId: number,
  language: string,
  key: string,
): Promise<MovieDetails> {
  const m = await tmdbGet<TmdbMovie>(`/movie/${tmdbId}`, { language }, key);
  return {
    kind: 'movie',
    tmdbId: m.id,
    title: m.title,
    originalTitle: m.original_title,
    year: yearOf(m.release_date),
    runtime: m.runtime || null,
    genres: (m.genres ?? []).map((g) => g.name),
    overview: m.overview ?? '',
    posterPath: m.poster_path ?? null,
    imdbId: m.imdb_id || null,
    tmdbRating: m.vote_count ? (m.vote_average ?? null) : null,
    tmdbVotes: m.vote_count ?? 0,
  };
}

/** No year filter: tiles often show the year of the latest season, not the first. */
export async function searchTv(
  query: string,
  opts: { language?: string },
  key: string,
): Promise<MovieSummary[]> {
  const data = await tmdbGet<{ results: TmdbTvSearchResult[] }>(
    '/search/tv',
    { query, language: opts.language, include_adult: 'false' },
    key,
  );
  return data.results.slice(0, 10).map((r) => ({
    kind: 'tv' as const,
    tmdbId: r.id,
    title: r.name,
    originalTitle: r.original_name,
    releaseDate: r.first_air_date || undefined,
    year: yearOf(r.first_air_date),
    posterPath: r.poster_path ?? null,
    popularity: r.popularity ?? 0,
    voteCount: r.vote_count ?? 0,
  }));
}

export async function tvDetails(
  tmdbId: number,
  language: string,
  key: string,
): Promise<MovieDetails> {
  // The IMDb id lives in external_ids; appending it saves a second request.
  const t = await tmdbGet<TmdbTv>(
    `/tv/${tmdbId}`,
    { language, append_to_response: 'external_ids' },
    key,
  );
  return {
    kind: 'tv',
    tmdbId: t.id,
    title: t.name,
    originalTitle: t.original_name,
    year: yearOf(t.first_air_date),
    runtime: t.episode_run_time?.[0] || null,
    genres: (t.genres ?? []).map((g) => g.name),
    overview: t.overview ?? '',
    posterPath: t.poster_path ?? null,
    imdbId: t.external_ids?.imdb_id || null,
    tmdbRating: t.vote_count ? (t.vote_average ?? null) : null,
    tmdbVotes: t.vote_count ?? 0,
    seasons: t.number_of_seasons || undefined,
    lastYear: yearOf(t.last_air_date ?? undefined),
    ended: t.status === 'Ended' || t.status === 'Canceled',
  };
}

export async function testTmdbKey(key: string): Promise<'ok' | 'invalid' | 'error'> {
  try {
    await tmdbGet('/configuration', {}, key);
    return 'ok';
  } catch (err) {
    return err instanceof ApiError && err.code === 'bad-tmdb-key' ? 'invalid' : 'error';
  }
}
