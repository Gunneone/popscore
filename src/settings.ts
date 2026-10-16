import { browser } from 'wxt/browser';
import { storage } from 'wxt/utils/storage';

export type LinkTarget = 'imdb' | 'letterboxd';

export interface Settings {
  tmdbKey: string;
  omdbKey: string;
  /** Ids of default sites (see sites.ts) where auto-hover is switched off. */
  disabledSites: string[];
  /** Extra sites with auto-hover, as origin patterns like "https://www.yorck.de/*". */
  extraSites: string[];
  /** How long the pointer has to rest on a title before the card opens (auto mode). */
  dwellMs: number;
  /** Ratings at or above this are green. */
  greenAt: number;
  /** Ratings at or above this (and below greenAt) are amber; below is red. */
  amberAt: number;
  /** Where the card's "Open on …" link goes. */
  linkTo: LinkTarget;
}

export const DEFAULT_SETTINGS: Settings = {
  tmdbKey: '',
  omdbKey: '',
  disabledSites: [],
  extraSites: [],
  dwellMs: 500,
  greenAt: 7,
  amberAt: 6,
  linkTo: 'imdb',
};

const settingsItem = storage.defineItem<Partial<Settings>>('sync:settings', { fallback: {} });

export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await settingsItem.getValue()) };
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await settingsItem.setValue(next);
  return next;
}

export function watchSettings(cb: (s: Settings) => void): () => void {
  return settingsItem.watch((v) => cb({ ...DEFAULT_SETTINGS, ...v }));
}

export function hasKeys(s: Settings): boolean {
  return s.tmdbKey.trim() !== '' && s.omdbKey.trim() !== '';
}

/** "Wrong movie?" corrections: normalized hovered text -> TMDB id. Synced, so capped. */
interface Pick {
  id: number;
  at: number;
}
const MAX_PICKS = 150;
const picksItem = storage.defineItem<Record<string, Pick>>('sync:picks', { fallback: {} });

export async function getPick(normalizedQuery: string): Promise<number | undefined> {
  return (await picksItem.getValue())[normalizedQuery]?.id;
}

export async function savePick(normalizedQuery: string, tmdbId: number): Promise<void> {
  const picks = {
    ...(await picksItem.getValue()),
    [normalizedQuery]: { id: tmdbId, at: Date.now() },
  };
  const keys = Object.keys(picks);
  if (keys.length > MAX_PICKS) {
    keys
      .sort((a, b) => picks[a].at - picks[b].at)
      .slice(0, keys.length - MAX_PICKS)
      .forEach((k) => delete picks[k]);
  }
  await picksItem.setValue(picks);
}

const usageItem = storage.defineItem<{ date: string; omdbCalls: number }>('local:usage', {
  fallback: { date: '', omdbCalls: 0 },
});

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getUsage(): Promise<{ date: string; omdbCalls: number }> {
  const u = await usageItem.getValue();
  return u.date === today() ? u : { date: today(), omdbCalls: 0 };
}

export async function countOmdbCall(): Promise<void> {
  const u = await getUsage();
  await usageItem.setValue({ date: u.date, omdbCalls: u.omdbCalls + 1 });
}

/**
 * Site the user just asked to enable from the popup. Firefox closes the popup when the permission
 * prompt opens, so the background finishes the job once the permission arrives.
 */
export const pendingSiteItem = storage.defineItem<string>('local:pendingSite', { fallback: '' });

export async function completePendingSite(): Promise<void> {
  const pattern = await pendingSiteItem.getValue();
  if (!pattern) return;
  if (!(await browser.permissions.contains({ origins: [pattern] }))) return;
  const s = await getSettings();
  if (!s.extraSites.includes(pattern))
    await updateSettings({ extraSites: [...s.extraSites, pattern] });
  await pendingSiteItem.setValue('');
}
