import type { ImdbRating, MovieDetails, MovieSummary, SeriesSummary } from '../types';
import { fetchImdbRating } from './omdb';
import { movieDetails, searchMovies, searchSeries } from './tmdb';

/**
 * Everything the lookup needs from the outside world. v1 talks to TMDB/OMDb directly with the
 * user's own keys; a hosted proxy can implement the same interface later.
 */
export interface RatingsProvider {
  search(query: string, opts: { language: string; year?: number }): Promise<MovieSummary[]>;
  /** TMDB's TV search; without it, auto mode knows series only from the weekly list. */
  searchSeries?(query: string, opts: { language: string }): Promise<SeriesSummary[]>;
  details(tmdbId: number): Promise<MovieDetails>;
  rating(imdbId: string): Promise<ImdbRating>;
}

export function directProvider(keys: { tmdbKey: string; omdbKey: string }): RatingsProvider {
  const tmdbKey = keys.tmdbKey.trim();
  const omdbKey = keys.omdbKey.trim();
  return {
    search: (query, opts) => searchMovies(query, opts, tmdbKey),
    searchSeries: (query, opts) => searchSeries(query, opts, tmdbKey),
    // The card UI is English, so details (title, genres, plot) are fetched in English.
    details: (tmdbId) => movieDetails(tmdbId, 'en-US', tmdbKey),
    rating: (imdbId) => fetchImdbRating(imdbId, omdbKey),
  };
}
