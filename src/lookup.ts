import { toLookupError } from './api/errors';
import { directProvider, type RatingsProvider } from './api/provider';
import { TMDB_IMAGE } from './api/tmdb';
import { cacheGet, cacheSet, DAY } from './cache';
import { normalizeTitle } from './match/normalize';
import { rankResults, type Scored } from './match/score';
import { countOmdbCall, getPick, getSettings, getUsage, hasKeys, savePick } from './settings';
import type {
  ImdbRating,
  LookupError,
  LookupRequest,
  LookupResult,
  MovieCard,
  MovieDetails,
  MovieSummary,
} from './types';

const MAX_CANDIDATES = 3;

export interface LookupDeps {
  provider?: RatingsProvider;
  fetchPoster?: (path: string) => Promise<string | null>;
  now?: Date;
  /** Score tags only need the numbers, not the poster. */
  skipPoster?: boolean;
  /** Don't ask OMDb for ratings that aren't cached once this many calls were made today. */
  omdbBudget?: number;
}

/** "de" -> "de-DE"; TMDB uses the language to decide which title translation it returns. */
export function tmdbLanguage(pageLang: string): string {
  const lang = (pageLang || 'en').trim();
  if (/^[a-z]{2}-[A-Z]{2}$/.test(lang)) return lang;
  const base = lang.slice(0, 2).toLowerCase();
  return base === 'en' ? 'en-US' : `${base}-${base.toUpperCase()}`;
}

async function resolveProvider(deps: LookupDeps): Promise<RatingsProvider | null> {
  if (deps.provider) return deps.provider;
  const settings = await getSettings();
  return hasKeys(settings) ? directProvider(settings) : null;
}

async function cachedSearch(
  provider: RatingsProvider,
  query: string,
  year: number | undefined,
  language: string,
): Promise<MovieSummary[]> {
  // "s2": entries from before TV movies were flagged lack tvMovie.
  const key = `s2:${language}:${year ?? ''}:${normalizeTitle(query)}`;
  const hit = await cacheGet<MovieSummary[]>(key);
  if (hit) return hit;
  let results = await provider.search(query, { language, year });
  // A wrong year hint (e.g. German release year vs original year) shouldn't hide the film.
  if (results.length === 0 && year !== undefined) {
    results = await provider.search(query, { language });
  }
  // Pages without a lang attribute may be in another language than we guessed.
  if (results.length === 0 && language !== 'en-US') {
    results = await provider.search(query, { language: 'en-US' });
  }
  await cacheSet(key, results, results.length ? 30 * DAY : 7 * DAY);
  return results;
}

async function cachedDetails(
  provider: RatingsProvider,
  tmdbId: number,
  now: Date,
): Promise<MovieDetails> {
  // "d2": entries from before TMDB scores were stored lack tmdbRating.
  const key = `d2:${tmdbId}`;
  const hit = await cacheGet<MovieDetails>(key);
  if (hit) return hit;
  const details = await provider.details(tmdbId);
  // New films change quickly (IMDb id added, TMDB score moving), so refresh them daily.
  const recent = details.year === undefined || details.year >= now.getFullYear() - 1;
  await cacheSet(key, details, recent ? 1 * DAY : 30 * DAY);
  return details;
}

async function cachedRating(
  provider: RatingsProvider,
  imdbId: string,
  budget = Infinity,
): Promise<ImdbRating> {
  const key = `r:${imdbId}`;
  const hit = await cacheGet<ImdbRating>(key);
  if (hit) return hit;
  // Over budget: no rating, and nothing cached, so the card can still fetch the real one later.
  if ((await getUsage()).omdbCalls >= budget) return { rating: null, votes: null };
  await countOmdbCall();
  const rating = await provider.rating(imdbId);
  // OMDb lags behind IMDb for new releases; check again soon so the real rating appears early.
  await cacheSet(key, rating, rating.rating === null ? DAY / 4 : 3 * DAY);
  return rating;
}

const posterMemory = new Map<string, string | null>();

export async function fetchPosterDataUrl(path: string, size = 'w154'): Promise<string | null> {
  const key = size + path;
  if (posterMemory.has(key)) return posterMemory.get(key)!;
  let dataUrl: string | null = null;
  try {
    const res = await fetch(`${TMDB_IMAGE}${size}${path}`);
    if (res.ok) {
      const type = res.headers.get('content-type') ?? 'image/jpeg';
      const bytes = new Uint8Array(await res.arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      dataUrl = `data:${type};base64,${btoa(binary)}`;
    }
  } catch {
    dataUrl = null;
  }
  if (posterMemory.size > 200) posterMemory.delete(posterMemory.keys().next().value!);
  posterMemory.set(key, dataUrl);
  return dataUrl;
}

async function buildCard(
  provider: RatingsProvider,
  tmdbId: number,
  deps: LookupDeps,
): Promise<{ movie: MovieCard; ratingError?: LookupError }> {
  const details = await cachedDetails(provider, tmdbId, deps.now ?? new Date());
  let rating: ImdbRating = { rating: null, votes: null };
  let ratingError: LookupError | undefined;
  if (details.imdbId) {
    try {
      rating = await cachedRating(provider, details.imdbId, deps.omdbBudget);
    } catch (err) {
      ratingError = toLookupError(err);
    }
  }
  const poster =
    details.posterPath && !deps.skipPoster
      ? await (deps.fetchPoster ?? fetchPosterDataUrl)(details.posterPath)
      : null;
  return { movie: { ...details, ...rating, poster }, ratingError };
}

function others(scored: Scored[], exceptId: number): MovieSummary[] {
  return scored
    .map((s) => s.movie)
    .filter((m) => m.tmdbId !== exceptId)
    .slice(0, 5);
}

export async function lookup(req: LookupRequest, deps: LookupDeps = {}): Promise<LookupResult> {
  try {
    const provider = await resolveProvider(deps);
    if (!provider) return { status: 'error', error: 'missing-keys' };
    const language = tmdbLanguage(req.pageLang);
    const now = deps.now ?? new Date();

    let best: { query: string; scored: Scored[] } | null = null;
    for (const cand of req.candidates.slice(0, MAX_CANDIDATES)) {
      const norm = normalizeTitle(cand.text);
      if (!norm) continue;

      const pickedId = await getPick(norm);
      if (pickedId !== undefined) {
        const results = await cachedSearch(provider, cand.text, cand.year, language);
        const { movie, ratingError } = await buildCard(provider, pickedId, deps);
        const alternatives = results.filter((m) => m.tmdbId !== pickedId).slice(0, 5);
        return {
          status: 'match',
          query: cand.text,
          confidence: 1,
          movie,
          alternatives,
          picked: true,
          ratingError,
        };
      }

      // TMDB's year filter would hide the film when a soft year is wrong, so it only ranks.
      const results = await cachedSearch(
        provider,
        cand.text,
        cand.softYear ? undefined : cand.year,
        language,
      );
      const scored = rankResults(cand.text, cand.year, results, {
        cinema: req.cinema,
        now,
        softYear: cand.softYear,
      });
      if (scored.length && (!best || scored[0].score > best.scored[0].score)) {
        best = { query: cand.text, scored };
      }
      if (scored[0]?.confident) break;
    }

    const query = best?.query ?? req.candidates[0]?.text ?? '';
    const top = best?.scored[0];
    const accept = top && (req.mode === 'auto' ? top.confident : top.sim >= 0.5);
    if (!top || !accept) {
      return { status: 'nomatch', query, alternatives: best ? others(best.scored, -1) : [] };
    }

    const { movie, ratingError } = await buildCard(provider, top.movie.tmdbId, deps);
    return {
      status: 'match',
      query,
      confidence: top.score,
      movie,
      alternatives: others(best!.scored, top.movie.tmdbId),
      picked: false,
      ratingError,
    };
  } catch (err) {
    return { status: 'error', error: toLookupError(err) };
  }
}

/** "Wrong movie?" choice: remember it for this hovered text and return the chosen film's card. */
export async function pickMovie(
  query: string,
  tmdbId: number,
  alternatives: MovieSummary[],
  deps: LookupDeps = {},
): Promise<LookupResult> {
  try {
    const provider = await resolveProvider(deps);
    if (!provider) return { status: 'error', error: 'missing-keys' };
    await savePick(normalizeTitle(query), tmdbId);
    const { movie, ratingError } = await buildCard(provider, tmdbId, deps);
    return {
      status: 'match',
      query,
      confidence: 1,
      movie,
      alternatives: alternatives.filter((m) => m.tmdbId !== tmdbId),
      picked: true,
      ratingError,
    };
  } catch (err) {
    return { status: 'error', error: toLookupError(err) };
  }
}
