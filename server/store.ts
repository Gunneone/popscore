import { DatabaseSync } from 'node:sqlite';

/** Movie data shared by all clients, plus the daily count of OMDb calls made with the server's key. */
export interface Store {
  get<T>(key: string, now: number): T | undefined;
  set(key: string, value: unknown, expiresAt: number): void;
  omdbCalls(day: string): number;
  countOmdbCall(day: string): void;
  /** Deletes expired entries; returns how many. */
  purge(now: number): number;
  close(): void;
}

export function openStore(path: string): Store {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS cache (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS cache_expires_at ON cache (expires_at);
    CREATE TABLE IF NOT EXISTS usage (
      day TEXT PRIMARY KEY,
      omdb_calls INTEGER NOT NULL
    );
  `);
  const select = db.prepare('SELECT value FROM cache WHERE key = ? AND expires_at > ?');
  const upsert = db.prepare(
    `INSERT INTO cache (key, value, expires_at) VALUES (?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`,
  );
  const purge = db.prepare('DELETE FROM cache WHERE expires_at <= ?');
  const calls = db.prepare('SELECT omdb_calls FROM usage WHERE day = ?');
  const count = db.prepare(
    `INSERT INTO usage (day, omdb_calls) VALUES (?, 1)
     ON CONFLICT (day) DO UPDATE SET omdb_calls = omdb_calls + 1`,
  );
  const oldUsage = db.prepare('DELETE FROM usage WHERE day < ?');

  return {
    get<T>(key: string, now: number) {
      const row = select.get(key, now) as { value: string } | undefined;
      return row ? (JSON.parse(row.value) as T) : undefined;
    },
    set(key, value, expiresAt) {
      upsert.run(key, JSON.stringify(value), expiresAt);
    },
    omdbCalls(day) {
      return (calls.get(day) as { omdb_calls: number } | undefined)?.omdb_calls ?? 0;
    },
    countOmdbCall(day) {
      count.run(day);
      oldUsage.run(day);
    },
    purge(now) {
      return Number(purge.run(now).changes);
    },
    close() {
      db.close();
    },
  };
}
