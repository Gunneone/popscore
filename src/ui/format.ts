import type { MovieLink, ShowLink } from '../settings';
import type { MediaKind } from '../types';

export type Verdict = 'good' | 'okay' | 'bad' | 'none';

export function verdict(rating: number | null, greenAt: number, amberAt: number): Verdict {
  if (rating === null) return 'none';
  if (rating >= greenAt) return 'good';
  if (rating >= amberAt) return 'okay';
  return 'bad';
}

export const MIN_TMDB_VOTES = 5;

export interface DisplayScore {
  value: number;
  votes: number | null;
  source: 'IMDb' | 'TMDB';
}

/** The IMDb rating if there is one, else TMDB's user score when enough people voted. */
export function displayScore(m: {
  rating: number | null;
  votes: number | null;
  tmdbRating?: number | null;
  tmdbVotes?: number;
}): DisplayScore | null {
  if (m.rating !== null) return { value: m.rating, votes: m.votes, source: 'IMDb' };
  if (m.tmdbRating != null && (m.tmdbVotes ?? 0) >= MIN_TMDB_VOTES) {
    return { value: m.tmdbRating, votes: m.tmdbVotes ?? null, source: 'TMDB' };
  }
  return null;
}

/** 845 -> "845", 41_234 -> "41k", 412_345 -> "412k", 1_234_567 -> "1.2M" */
export function formatVotes(votes: number): string {
  if (votes < 1000) return String(votes);
  if (votes < 1_000_000) return `${Math.round(votes / 1000)}k`;
  return `${(votes / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

/** A film's year; a show's run: "2016–2025", or "2019–" while it's still running. */
export function formatYears(m: {
  kind: MediaKind;
  year?: number;
  lastYear?: number;
  ended?: boolean;
}): string | null {
  if (m.year === undefined) return null;
  if (m.kind !== 'tv') return String(m.year);
  if (!m.ended) return `${m.year}–`;
  return m.lastYear && m.lastYear !== m.year ? `${m.year}–${m.lastYear}` : String(m.year);
}

/** 166 -> "2h 46m", 45 -> "45m" */
export function formatRuntime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

export interface CardLink {
  href: string;
  label: 'IMDb' | 'TMDB' | 'Letterboxd';
}

/** The card's "Open on …" link: the chosen site, or TMDB for titles IMDb doesn't know yet. */
export function cardLink(
  m: { kind: MediaKind; tmdbId: number; imdbId: string | null },
  links: { movieLink: MovieLink; showLink: ShowLink },
): CardLink {
  const target = m.kind === 'tv' ? links.showLink : links.movieLink;
  if (target === 'letterboxd') {
    return { href: `https://letterboxd.com/tmdb/${m.tmdbId}/`, label: 'Letterboxd' };
  }
  if (target === 'imdb' && m.imdbId) {
    return { href: `https://www.imdb.com/title/${m.imdbId}/`, label: 'IMDb' };
  }
  return { href: `https://www.themoviedb.org/${m.kind}/${m.tmdbId}`, label: 'TMDB' };
}
