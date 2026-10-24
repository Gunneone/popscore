export interface Candidate {
  /** Cleaned title text, ready to search. */
  text: string;
  year?: number;
  /**
   * The year came from the page's structured data, which sites often fill with the date they
   * added the film rather than its release: a ranking hint only, never a reason to reject.
   */
  softYear?: boolean;
  /** Higher is more trustworthy (0..~1.5). */
  weight: number;
  source: string;
}

export interface LookupRequest {
  candidates: Candidate[];
  /** BCP-47 language of the page, e.g. "de-DE". Controls which title translations TMDB searches. */
  pageLang: string;
  /** True on cinema sites: favors films released around now. */
  cinema: boolean;
  /** "auto" = dwell on an enabled site, only confident matches. "manual" = Alt-hover or typed search. */
  mode: 'auto' | 'manual';
}

export interface MovieSummary {
  tmdbId: number;
  title: string;
  originalTitle: string;
  releaseDate?: string;
  year?: number;
  posterPath?: string | null;
  popularity: number;
  voteCount: number;
  /** TMDB files it under "TV Movie": made for television, so not on at a cinema. */
  tvMovie?: boolean;
}

/** A TV series from TMDB's TV search: only used to tell a series from a film of the same name. */
export interface SeriesSummary {
  name: string;
  originalName: string;
  popularity: number;
}

export interface MovieDetails {
  tmdbId: number;
  title: string;
  originalTitle: string;
  year?: number;
  runtime: number | null;
  genres: string[];
  overview: string;
  posterPath: string | null;
  imdbId: string | null;
  /** TMDB's own user score (0..10), shown when OMDb has no IMDb rating yet. */
  tmdbRating: number | null;
  tmdbVotes: number;
}

export interface ImdbRating {
  rating: number | null;
  votes: number | null;
}

export interface MovieCard extends MovieDetails, ImdbRating {
  /** Poster as a data URL, so a strict page CSP can't block it. */
  poster: string | null;
}

/** What a score tag shows: the card's score, without the rest of the card. */
export interface TagScore {
  tmdbId: number;
  value: number;
  source: 'IMDb' | 'TMDB';
}

export type LookupError =
  'missing-keys' | 'bad-tmdb-key' | 'bad-omdb-key' | 'rate-limit' | 'offline' | 'unknown';

export type LookupResult =
  | {
      status: 'match';
      query: string;
      confidence: number;
      movie: MovieCard;
      alternatives: MovieSummary[];
      picked: boolean;
      /** Set when TMDB worked but the IMDb rating couldn't be fetched. */
      ratingError?: LookupError;
    }
  | { status: 'nomatch'; query: string; alternatives: MovieSummary[] }
  | { status: 'error'; error: LookupError };

export interface KeyTestResult {
  tmdb: 'ok' | 'invalid' | 'error' | 'missing';
  omdb: 'ok' | 'invalid' | 'error' | 'missing';
}

export interface Usage {
  date: string;
  omdbCalls: number;
}
