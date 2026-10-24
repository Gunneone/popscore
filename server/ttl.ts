import { FEW_VOTES } from '../src/api/omdb';
import type { ImdbRating, MovieDetails, MovieSummary } from '../src/types';

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** IMDb ratings: a week, or a day while the film has no rating or only a few votes. */
export function ratingTtl(r: ImdbRating): number {
  return r.rating === null || r.votes === null || r.votes < FEW_VOTES ? DAY : WEEK;
}

/** New films get their IMDb id and most of their TMDB votes in the first days, so check daily. */
export function detailsTtl(d: MovieDetails): number {
  return !d.imdbId || d.tmdbVotes < FEW_VOTES ? DAY : WEEK;
}

/** A title that finds nothing may be a film TMDB adds tomorrow. */
export function searchTtl(results: MovieSummary[]): number {
  return results.length ? WEEK : DAY;
}
