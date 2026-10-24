import type { ImdbRating, MediaKind, MovieDetails, MovieSummary } from '../types';
import { fetchImdbRating } from './omdb';
import { serverProvider } from './server';
import { movieDetails, searchMovies, searchTv, tvDetails } from './tmdb';

/** Everything the lookup needs from the outside world. */
export interface RatingsProvider {
  search(
    query: string,
    opts: { kind: MediaKind; language: string; year?: number },
  ): Promise<MovieSummary[]>;
  details(tmdbId: number, kind: MediaKind): Promise<MovieDetails>;
  /** `tag`: for a score tag, which the ratings server serves last when it's short of lookups. */
  rating(imdbId: string, opts?: { tag?: boolean }): Promise<ImdbRating>;
  /** Ratings come from the user's own OMDb key, so they count against its daily limit. */
  ownOmdbKey: boolean;
}

/**
 * Each service uses the user's own key when there is one, and the Popscore ratings server
 * otherwise. With both keys the extension never talks to the server.
 */
export function makeProvider(
  keys: { tmdbKey: string; omdbKey: string },
  server: RatingsProvider = serverProvider(),
): RatingsProvider {
  const tmdbKey = keys.tmdbKey.trim();
  const omdbKey = keys.omdbKey.trim();
  return {
    search: tmdbKey
      ? (query, opts) =>
          opts.kind === 'tv' ? searchTv(query, opts, tmdbKey) : searchMovies(query, opts, tmdbKey)
      : server.search,
    // The card UI is English, so details (title, genres, plot) are fetched in English.
    details: tmdbKey
      ? (tmdbId, kind) =>
          kind === 'tv'
            ? tvDetails(tmdbId, 'en-US', tmdbKey)
            : movieDetails(tmdbId, 'en-US', tmdbKey)
      : server.details,
    rating: omdbKey ? (imdbId) => fetchImdbRating(imdbId, omdbKey) : server.rating,
    ownOmdbKey: omdbKey !== '',
  };
}
