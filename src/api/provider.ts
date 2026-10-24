import type { ImdbRating, MediaKind, MovieDetails, MovieSummary } from '../types';
import { fetchImdbRating } from './omdb';
import { movieDetails, searchMovies, searchTv, tvDetails } from './tmdb';

/**
 * Everything the lookup needs from the outside world. v1 talks to TMDB/OMDb directly with the
 * user's own keys; a hosted proxy can implement the same interface later.
 */
export interface RatingsProvider {
  search(
    query: string,
    opts: { kind: MediaKind; language: string; year?: number },
  ): Promise<MovieSummary[]>;
  details(tmdbId: number, kind: MediaKind): Promise<MovieDetails>;
  rating(imdbId: string): Promise<ImdbRating>;
}

export function directProvider(keys: { tmdbKey: string; omdbKey: string }): RatingsProvider {
  const tmdbKey = keys.tmdbKey.trim();
  const omdbKey = keys.omdbKey.trim();
  return {
    search: (query, opts) =>
      opts.kind === 'tv' ? searchTv(query, opts, tmdbKey) : searchMovies(query, opts, tmdbKey),
    // The card UI is English, so details (title, genres, plot) are fetched in English.
    details: (tmdbId, kind) =>
      kind === 'tv' ? tvDetails(tmdbId, 'en-US', tmdbKey) : movieDetails(tmdbId, 'en-US', tmdbKey),
    rating: (imdbId) => fetchImdbRating(imdbId, omdbKey),
  };
}
