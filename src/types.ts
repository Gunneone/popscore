/** TMDB keeps movies and TV shows apart, with ids that overlap. */
export type MediaKind = 'movie' | 'tv';

/** Identifies a title across both kinds: "movie:438631", "tv:1399". */
export function titleKey(m: { kind: MediaKind; tmdbId: number }): string {
  return `${m.kind}:${m.tmdbId}`;
}

export interface Candidate {
  /** Cleaned title text, ready to search. */
  text: string;
  year?: number;
  /**
   * The year came from the page's structured data or a film link's slug, which sites often fill
   * with the date they added the film rather than its release: a ranking hint only, never a
   * reason to reject.
   */
  softYear?: boolean;
  /** The text named a season or episode, or the link or page marks a series: TV shows only. */
  series?: boolean;
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

/** A movie or TV show from a TMDB search. */
export interface MovieSummary {
  kind: MediaKind;
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

export interface MovieDetails {
  kind: MediaKind;
  tmdbId: number;
  title: string;
  originalTitle: string;
  /** For a show, the year it started. */
  year?: number;
  /** Minutes; for a show, of an episode. */
  runtime: number | null;
  genres: string[];
  overview: string;
  posterPath: string | null;
  imdbId: string | null;
  /** TMDB's own user score (0..10), shown when OMDb has no IMDb rating yet. */
  tmdbRating: number | null;
  tmdbVotes: number;
  /** TV shows only. */
  seasons?: number;
  /** TV shows only: the year of the latest episode. */
  lastYear?: number;
  /** TV shows only: ended or cancelled, so no more seasons are coming. */
  ended?: boolean;
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
  kind: MediaKind;
  tmdbId: number;
  value: number;
  source: 'IMDb' | 'TMDB';
}

export type LookupError =
  | 'bad-tmdb-key'
  | 'bad-omdb-key'
  | 'rate-limit'
  /** The Popscore ratings server is over its limits; own API keys don't depend on it. */
  | 'server-busy'
  | 'offline'
  | 'unknown';

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
