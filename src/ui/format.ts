export type Verdict = 'good' | 'okay' | 'bad' | 'none';

export function verdict(rating: number | null, greenAt: number, amberAt: number): Verdict {
  if (rating === null) return 'none';
  if (rating >= greenAt) return 'good';
  if (rating >= amberAt) return 'okay';
  return 'bad';
}

/** 845 -> "845", 41_234 -> "41k", 412_345 -> "412k", 1_234_567 -> "1.2M" */
export function formatVotes(votes: number): string {
  if (votes < 1000) return String(votes);
  if (votes < 1_000_000) return `${Math.round(votes / 1000)}k`;
  return `${(votes / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

/** 166 -> "2h 46m", 45 -> "45m" */
export function formatRuntime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}
