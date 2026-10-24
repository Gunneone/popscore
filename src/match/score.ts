import type { MovieSummary } from '../types';
import { extendsTitle, titleSimilarity } from './normalize';

export interface ScoreContext {
  cinema: boolean;
  now: Date;
  /** The year hint is unreliable (see Candidate.softYear): it ranks, but doesn't reject. */
  softYear?: boolean;
  /** The most popular TV series named exactly like the query, if lookup checked for one. */
  series?: { popularity: number };
}

export interface Scored {
  movie: MovieSummary;
  /** Title similarity, 0..1. */
  sim: number;
  /** Overall ranking score. */
  score: number;
  /** Good enough to show a card without the user asking (auto mode). */
  confident: boolean;
  /** Only a subtitle matches, or few people rated the film: a series of that name may be meant. */
  doubtful: boolean;
}

const MONTH = 30 * 86_400_000;
export const CONFIDENT_SIMILARITY = 0.86;
/** Fewer TMDB votes than this, and a film gives way to a much more popular series of its name. */
export const WELL_KNOWN_VOTES = 2000;
/** "Much more popular": TMDB popularity this many times the film's. */
export const SERIES_POPULARITY_RATIO = 5;

/** Released between 18 months ago and 6 months from now: what a cinema plausibly shows. */
function isCurrent(movie: MovieSummary, now: Date): boolean {
  if (!movie.releaseDate) return false;
  const t = Date.parse(movie.releaseDate);
  if (Number.isNaN(t)) return false;
  return t >= now.getTime() - 18 * MONTH && t <= now.getTime() + 6 * MONTH;
}

export function rankResults(
  query: string,
  yearHint: number | undefined,
  results: MovieSummary[],
  ctx: ScoreContext,
): Scored[] {
  const matches = results.map((movie) => ({
    movie,
    sim: Math.max(titleSimilarity(query, movie.title), titleSimilarity(query, movie.originalTitle)),
    subtitled: extendsTitle(query, movie.title) || extendsTitle(query, movie.originalTitle),
  }));
  // How many results the query names: as their whole title, or with a subtitle added.
  const named = matches.filter((m) => m.sim === 1 || m.subtitled).length;

  const scored = matches.map(({ movie, sim, subtitled }): Scored => {
    const recent = isCurrent(movie, ctx.now);
    const current = ctx.cinema && recent;

    let yearScore: number;
    let yearOk = true;
    if (yearHint !== undefined) {
      const delta = movie.year === undefined ? undefined : Math.abs(movie.year - yearHint);
      yearScore = delta === undefined ? 0.3 : delta === 0 ? 1 : delta === 1 ? 0.6 : 0;
      yearOk = !!ctx.softYear || (delta !== undefined && delta <= 1);
    } else if (ctx.cinema) {
      yearScore = current ? 1 : 0.1;
    } else {
      yearScore = 0.5;
    }

    const popScore = Math.min(1, Math.log10(1 + movie.voteCount) / 4);
    // Cinemas don't show TV movies; matching one usually means a page label was read as a title.
    const tvOnly = ctx.cinema && movie.tvMovie === true;
    const score = sim * 0.7 + yearScore * 0.18 + popScore * 0.12 - (tvOnly ? 0.2 : 0);
    // Exact-title hits on obscure films are how UI labels like "Play" turn into false matches.
    // New releases are exempt: they have few votes everywhere, streaming sites included.
    const obscure = movie.voteCount < 15 && !recent;
    // Only the subtitle is missing ("Stranger Things" -> "Stranger Things: Fireplace"). Fine when
    // the query names just this film. When it names others too (the plain title, more
    // "<Title>: ..." specials or sequels), it's a show or franchise, and year and popularity
    // picked this one, not the title.
    const ambiguous = subtitled && sim < 1 && named > 1;
    // A series of exactly this name that is far more popular than the film is what the page
    // most likely shows ("Wednesday", not "A Wednesday!"). Popularity favors running shows, so
    // only films few people rated, or that only a subtitle matches, give way; a year on the page
    // that fits the film keeps it.
    const yearFits = yearHint !== undefined && !ctx.softYear && movie.year === yearHint;
    const doubtful = !yearFits && ((subtitled && sim < 1) || movie.voteCount < WELL_KNOWN_VOTES);
    const outshone =
      !!ctx.series &&
      doubtful &&
      ctx.series.popularity >= SERIES_POPULARITY_RATIO * movie.popularity;
    const confident =
      sim >= CONFIDENT_SIMILARITY && yearOk && !obscure && !tvOnly && !ambiguous && !outshone;
    return { movie, sim, score, confident, doubtful };
  });
  return scored.sort((a, b) => b.score - a.score);
}
