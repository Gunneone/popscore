import type { MovieSummary } from '../types';
import { titleSimilarity } from './normalize';

export interface ScoreContext {
  cinema: boolean;
  now: Date;
}

export interface Scored {
  movie: MovieSummary;
  /** Title similarity, 0..1. */
  sim: number;
  /** Overall ranking score. */
  score: number;
  /** Good enough to show a card without the user asking (auto mode). */
  confident: boolean;
}

const MONTH = 30 * 86_400_000;
export const CONFIDENT_SIMILARITY = 0.86;

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
  const scored = results.map((movie): Scored => {
    const sim = Math.max(
      titleSimilarity(query, movie.title),
      titleSimilarity(query, movie.originalTitle),
    );
    const current = ctx.cinema && isCurrent(movie, ctx.now);

    let yearScore: number;
    let yearOk = true;
    if (yearHint !== undefined) {
      const delta = movie.year === undefined ? undefined : Math.abs(movie.year - yearHint);
      yearScore = delta === undefined ? 0.3 : delta === 0 ? 1 : delta === 1 ? 0.6 : 0;
      yearOk = delta !== undefined && delta <= 1;
    } else if (ctx.cinema) {
      yearScore = current ? 1 : 0.1;
    } else {
      yearScore = 0.5;
    }

    const popScore = Math.min(1, Math.log10(1 + movie.voteCount) / 4);
    const score = sim * 0.7 + yearScore * 0.18 + popScore * 0.12;
    // Exact-title hits on obscure films are how UI labels like "Play" turn into false matches.
    const obscure = movie.voteCount < 15 && !current;
    const confident = sim >= CONFIDENT_SIMILARITY && yearOk && !obscure;
    return { movie, sim, score, confident };
  });
  return scored.sort((a, b) => b.score - a.score);
}
