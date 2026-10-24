import { toLookupError } from './api/errors';
import { directProvider, type RatingsProvider } from './api/provider';
import { TMDB_IMAGE } from './api/tmdb';
import { cacheGet, cacheSet, DAY } from './cache';
import { normalizeTitle } from './match/normalize';
import { rankResults, type ScoreContext, type Scored } from './match/score';
import { listedSeries } from './series';
import {
  countOmdbCall,
  getPick,
  getSettings,
  getUsage,
  hasKeys,
  mediaKinds,
  savePick,
  type PickRef,
  type Settings,
} from './settings';
import {
  titleKey,
  type Candidate,
  type ImdbRating,
  type LookupError,
  type LookupRequest,
  type LookupResult,
  type MediaKind,
  type MovieCard,
  type MovieDetails,
  type MovieSummary,
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
  /** The weekly list of popular TV series (see src/series.ts). */
  listedSeries?: (name: string) => Promise<number | undefined>;
}

/** "de" -> "de-DE"; TMDB uses the language to decide which title translation it returns. */
export function tmdbLanguage(pageLang: string): string {
  const lang = (pageLang || 'en').trim();
  if (/^[a-z]{2}-[A-Z]{2}$/.test(lang)) return lang;
  const base = lang.slice(0, 2).toLowerCase();
  return base === 'en' ? 'en-US' : `${base}-${base.toUpperCase()}`;
}

async function resolveProvider(
  deps: LookupDeps,
  settings: Settings,
): Promise<RatingsProvider | null> {
  if (deps.provider) return deps.provider;
  return hasKeys(settings) ? directProvider(settings) : null;
}

async function cachedSearch(
  provider: RatingsProvider,
  kind: MediaKind,
  query: string,
  year: number | undefined,
  language: string,
): Promise<MovieSummary[]> {
  // TV search takes no year (see searchTv).
  if (kind === 'tv') year = undefined;
  // "s3": entries from before TV shows lack kind.
  const key = `s3:${kind}:${language}:${year ?? ''}:${normalizeTitle(query)}`;
  const hit = await cacheGet<MovieSummary[]>(key);
  if (hit) return hit;
  let results = await provider.search(query, { kind, language, year });
  // A wrong year hint (e.g. German release year vs original year) shouldn't hide the film.
  if (results.length === 0 && year !== undefined) {
    results = await provider.search(query, { kind, language });
  }
  // Pages without a lang attribute may be in another language than we guessed.
  if (results.length === 0 && language !== 'en-US') {
    results = await provider.search(query, { kind, language: 'en-US' });
  }
  await cacheSet(key, results, results.length ? 30 * DAY : 7 * DAY);
  return results;
}

/**
 * The most popular TV series named exactly like `query`: from the weekly list, else from TMDB's
 * TV search, which also knows shows by their translated names ("Haus des Geldes").
 */
async function seriesNamed(
  provider: RatingsProvider,
  query: string,
  language: string,
  deps: LookupDeps,
): Promise<ScoreContext['series']> {
  const name = normalizeTitle(query);
  const listed = await (deps.listedSeries ?? listedSeries)(name);
  if (listed !== undefined) return { popularity: listed };
  const named = (await cachedSearch(provider, 'tv', query, undefined, language)).filter(
    (s) => normalizeTitle(s.title) === name || normalizeTitle(s.originalTitle) === name,
  );
  return named.length ? { popularity: Math.max(...named.map((s) => s.popularity)) } : undefined;
}

async function cachedDetails(
  provider: RatingsProvider,
  ref: PickRef,
  now: Date,
): Promise<MovieDetails> {
  // "d3": entries from before TV shows lack kind.
  const key = `d3:${ref.kind}:${ref.tmdbId}`;
  const hit = await cacheGet<MovieDetails>(key);
  if (hit) return hit;
  const details = await provider.details(ref.tmdbId, ref.kind);
  // New films and running shows change quickly (IMDb id added, TMDB score moving, new seasons),
  // so refresh them daily.
  const latest = details.lastYear ?? details.year;
  const recent = latest === undefined || latest >= now.getFullYear() - 1;
  await cacheSet(key, details, recent ? 1 * DAY : 30 * DAY);
  return details;
}

/**
 * What to search for a candidate: TV only when it names a season or links to a series, movies
 * only for automatic lookups on cinema pages (cinemas don't show series), and only kinds the
 * user switched on.
 */
function kindsFor(cand: Candidate, enabled: MediaKind[], req: LookupRequest): MediaKind[] {
  if (cand.series) return enabled.filter((k) => k === 'tv');
  if (req.cinema && req.mode === 'auto') return enabled.filter((k) => k === 'movie');
  return enabled;
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
  ref: PickRef,
  deps: LookupDeps,
): Promise<{ movie: MovieCard; ratingError?: LookupError }> {
  const details = await cachedDetails(provider, ref, deps.now ?? new Date());
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

function except(movies: MovieSummary[], ref: PickRef | null): MovieSummary[] {
  const skip = ref && titleKey(ref);
  return movies.filter((m) => titleKey(m) !== skip).slice(0, 5);
}

function others(scored: Scored[], ref: PickRef | null): MovieSummary[] {
  return except(
    scored.map((s) => s.movie),
    ref,
  );
}

/** Movie and TV results for one candidate, in one list for ranking. */
async function searchKinds(
  provider: RatingsProvider,
  kinds: MediaKind[],
  query: string,
  year: number | undefined,
  language: string,
): Promise<MovieSummary[]> {
  const lists = await Promise.all(
    kinds.map((kind) => cachedSearch(provider, kind, query, year, language)),
  );
  return lists.flat();
}

export async function lookup(req: LookupRequest, deps: LookupDeps = {}): Promise<LookupResult> {
  try {
    const settings = await getSettings();
    const provider = await resolveProvider(deps, settings);
    if (!provider) return { status: 'error', error: 'missing-keys' };
    const language = tmdbLanguage(req.pageLang);
    const now = deps.now ?? new Date();
    const enabled = mediaKinds(settings);

    let best: { query: string; scored: Scored[] } | null = null;
    for (const cand of req.candidates.slice(0, MAX_CANDIDATES)) {
      const norm = normalizeTitle(cand.text);
      if (!norm) continue;
      const kinds = kindsFor(cand, enabled, req);
      if (kinds.length === 0) continue;

      const picked = await getPick(norm);
      if (picked !== undefined) {
        const results = await searchKinds(provider, kinds, cand.text, cand.year, language);
        const { movie, ratingError } = await buildCard(provider, picked, deps);
        const alternatives = except(results, picked);
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
      const results = await searchKinds(
        provider,
        kinds,
        cand.text,
        cand.softYear ? undefined : cand.year,
        language,
      );
      const ctx: ScoreContext = { cinema: req.cinema, now, softYear: cand.softYear };
      let scored = rankResults(cand.text, cand.year, results, ctx);
      // Searched for films only (TV shows switched off, or a cinema page), auto mode stays quiet
      // when a doubtful film match shares its name with a far more popular series: the page
      // most likely shows the series. Alt-hover and typed searches still answer with the film.
      if (
        req.mode === 'auto' &&
        !kinds.includes('tv') &&
        scored[0]?.confident &&
        scored[0].doubtful
      ) {
        const series = await seriesNamed(provider, cand.text, language, deps);
        if (series) scored = rankResults(cand.text, cand.year, results, { ...ctx, series });
      }
      if (scored.length && (!best || scored[0].score > best.scored[0].score)) {
        best = { query: cand.text, scored };
      }
      if (scored[0]?.confident) break;
    }

    const query = best?.query ?? req.candidates[0]?.text ?? '';
    const top = best?.scored[0];
    const accept = top && (req.mode === 'auto' ? top.confident : top.sim >= 0.5);
    if (!top || !accept) {
      return { status: 'nomatch', query, alternatives: best ? others(best.scored, null) : [] };
    }

    const { movie, ratingError } = await buildCard(provider, top.movie, deps);
    return {
      status: 'match',
      query,
      confidence: top.score,
      movie,
      alternatives: others(best!.scored, top.movie),
      picked: false,
      ratingError,
    };
  } catch (err) {
    return { status: 'error', error: toLookupError(err) };
  }
}

/** "Wrong movie?" choice: remember it for this hovered text and return the chosen title's card. */
export async function pickMovie(
  query: string,
  ref: PickRef,
  alternatives: MovieSummary[],
  deps: LookupDeps = {},
): Promise<LookupResult> {
  try {
    const provider = await resolveProvider(deps, await getSettings());
    if (!provider) return { status: 'error', error: 'missing-keys' };
    await savePick(normalizeTitle(query), ref);
    const { movie, ratingError } = await buildCard(provider, ref, deps);
    return {
      status: 'match',
      query,
      confidence: 1,
      movie,
      alternatives: alternatives.filter((m) => titleKey(m) !== titleKey(ref)),
      picked: true,
      ratingError,
    };
  } catch (err) {
    return { status: 'error', error: toLookupError(err) };
  }
}
