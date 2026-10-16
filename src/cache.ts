import { browser } from 'wxt/browser';

export const DAY = 86_400_000;
const PREFIX = 'c:';
const MAX_ENTRIES = 5000;
const MAX_MEMORY = 500;

interface Entry<T> {
  /** value */
  v: T;
  /** expires at */
  e: number;
  /** written at */
  t: number;
}

const memory = new Map<string, Entry<unknown>>();
let writes = 0;

function remember(key: string, entry: Entry<unknown>): void {
  memory.delete(key);
  memory.set(key, entry);
  if (memory.size > MAX_MEMORY) memory.delete(memory.keys().next().value!);
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  const k = PREFIX + key;
  let entry = memory.get(k) as Entry<T> | undefined;
  if (!entry) {
    entry = (await browser.storage.local.get(k))[k] as Entry<T> | undefined;
    if (entry) remember(k, entry);
  }
  if (!entry) return undefined;
  if (entry.e <= Date.now()) {
    memory.delete(k);
    await browser.storage.local.remove(k);
    return undefined;
  }
  return entry.v;
}

export async function cacheSet<T>(key: string, value: T, ttlMs: number): Promise<void> {
  const k = PREFIX + key;
  const now = Date.now();
  const entry: Entry<T> = { v: value, e: now + ttlMs, t: now };
  remember(k, entry);
  await browser.storage.local.set({ [k]: entry });
  if (++writes % 50 === 0) await pruneCache();
}

/** Drops expired entries, then the oldest ones beyond `max`. */
export async function pruneCache(max = MAX_ENTRIES): Promise<void> {
  const all = (await browser.storage.local.get(null)) as Record<string, unknown>;
  const now = Date.now();
  const entries = Object.entries(all).filter(([k]) => k.startsWith(PREFIX)) as [
    string,
    Entry<unknown>,
  ][];
  const expired = entries.filter(([, e]) => e.e <= now).map(([k]) => k);
  const live = entries.filter(([, e]) => e.e > now).sort((a, b) => a[1].t - b[1].t);
  const overflow = live.slice(0, Math.max(0, live.length - max)).map(([k]) => k);
  const remove = [...expired, ...overflow];
  if (remove.length === 0) return;
  await browser.storage.local.remove(remove);
  remove.forEach((k) => memory.delete(k));
}

export async function clearCache(): Promise<void> {
  const all = (await browser.storage.local.get(null)) as Record<string, unknown>;
  const keys = Object.keys(all).filter((k) => k.startsWith(PREFIX));
  if (keys.length) await browser.storage.local.remove(keys);
  memory.clear();
}
