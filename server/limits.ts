const MINUTE = 60_000;

export interface RateLimiter {
  /** Takes one request from this address's allowance; false when it's used up. */
  take(ip: string): boolean;
  /** Forgets addresses whose allowance is full again, so idle ones aren't kept in memory. */
  sweep(): void;
  size(): number;
}

/** Token bucket per IP address: `perMinute` requests a minute, in bursts of up to as many. */
export function rateLimiter(perMinute: number, now: () => number): RateLimiter {
  const buckets = new Map<string, { tokens: number; at: number }>();
  const refill = (b: { tokens: number; at: number }, t: number) =>
    Math.min(perMinute, b.tokens + ((t - b.at) / MINUTE) * perMinute);

  return {
    take(ip) {
      const t = now();
      const prev = buckets.get(ip);
      const tokens = prev ? refill(prev, t) : perMinute;
      const ok = tokens >= 1;
      buckets.set(ip, { tokens: ok ? tokens - 1 : tokens, at: t });
      return ok;
    },
    sweep() {
      const t = now();
      for (const [ip, b] of buckets) if (refill(b, t) >= perMinute) buckets.delete(ip);
    },
    size: () => buckets.size,
  };
}
