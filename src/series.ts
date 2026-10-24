import { browser } from 'wxt/browser';
import { DAY } from './cache';
import { normalizeTitle } from './match/normalize';

// Popular TV series by name, from TMDB's daily export of all series (files.tmdb.org, no API key,
// about 5 MB gzipped, one {"id","original_name","popularity"} object per line). Auto mode uses it
// to tell a series tile from a film of the same name without asking TMDB each time.

/** storage.local key, outside the cache's "c:" prefix: clearing the cache keeps the list. */
export const SERIES_KEY = 'series';
/** Keeps about 16,000 of 235,000 shows (October 2026 export), about 320 kB stored. */
export const SERIES_MIN_POPULARITY = 8;
const EXPORTS = 'https://files.tmdb.org/p/exports/';
const REFRESH = 7 * DAY;
/** After a failed download, try again the next day. */
const RETRY = DAY;

export interface SeriesList {
  /** Normalized original name -> TMDB popularity of the most popular show with that name. */
  shows: Record<string, number>;
  /** When the list was downloaded; 0 if never. */
  fetched: number;
  /** When a download was last tried. */
  tried: number;
}

let memory: Map<string, number> | undefined;

/** Yesterday's export (UTC): TMDB publishes each day's around 8:00 UTC. */
export function seriesExportUrl(now: Date): string {
  const d = new Date(now.getTime() - DAY);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${EXPORTS}tv_series_ids_${mm}_${dd}_${d.getUTCFullYear()}.json.gz`;
}

function addShow(shows: Record<string, number>, line: string, min: number): void {
  if (!line.trim()) return;
  let row: { original_name?: unknown; popularity?: unknown };
  try {
    row = JSON.parse(line) as typeof row;
  } catch {
    return;
  }
  const { original_name: name, popularity } = row;
  if (typeof name !== 'string' || typeof popularity !== 'number' || popularity < min) return;
  const key = normalizeTitle(name);
  const value = Math.round(popularity * 10) / 10;
  if (key && !(Object.hasOwn(shows, key) && shows[key] >= value)) shows[key] = value;
}

/** Gunzips the export line by line and keeps the shows at least `min` popular. */
export async function parseSeriesExport(
  gzipped: ReadableStream<BufferSource>,
  min = SERIES_MIN_POPULARITY,
): Promise<Record<string, number>> {
  const shows: Record<string, number> = {};
  const reader = gzipped
    .pipeThrough(new DecompressionStream('gzip'))
    .pipeThrough(new TextDecoderStream())
    .getReader();
  let rest = '';
  for (;;) {
    const { done, value } = await reader.read();
    const lines = (rest + (value ?? '')).split('\n');
    rest = done ? '' : lines.pop()!;
    for (const line of lines) addShow(shows, line, min);
    if (done) return shows;
  }
}

export async function saveSeriesList(list: SeriesList): Promise<void> {
  memory = new Map(Object.entries(list.shows));
  await browser.storage.local.set({ [SERIES_KEY]: list });
}

async function storedList(): Promise<SeriesList | undefined> {
  return (await browser.storage.local.get(SERIES_KEY))[SERIES_KEY] as SeriesList | undefined;
}

/** Downloads the list when it's a week old, keeping the old one if that fails. */
export async function updateSeriesList(now = new Date()): Promise<void> {
  const old = await storedList();
  const t = now.getTime();
  if (old && (t - old.fetched < REFRESH || t - old.tried < RETRY)) return;
  try {
    const res = await fetch(seriesExportUrl(now));
    if (!res.ok || !res.body) throw new Error(`TMDB export responded ${res.status}`);
    const shows = await parseSeriesExport(res.body);
    if (Object.keys(shows).length === 0) throw new Error('TMDB export is empty');
    await saveSeriesList({ shows, fetched: t, tried: t });
  } catch {
    await saveSeriesList({ shows: old?.shows ?? {}, fetched: old?.fetched ?? 0, tried: t });
  }
}

let nextCheck = 0;

/** Background worker: checks the list's age once a day while the worker runs. */
export function keepSeriesListFresh(now = new Date()): void {
  if (now.getTime() < nextCheck) return;
  nextCheck = now.getTime() + DAY;
  void updateSeriesList(now).catch(() => undefined);
}

/** TMDB popularity of the most popular listed show with this normalized name. */
export async function listedSeries(name: string): Promise<number | undefined> {
  memory ??= new Map(Object.entries((await storedList())?.shows ?? {}));
  return memory.get(name);
}
