import { gzipSync } from 'node:zlib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { clearCache, DAY } from '../src/cache';
import { normalizeTitle } from '../src/match/normalize';
import {
  listedSeries,
  parseSeriesExport,
  saveSeriesList,
  SERIES_KEY,
  seriesExportUrl,
  updateSeriesList,
  type SeriesList,
} from '../src/series';

// Lines as in tv_series_ids_10_23_2026.json.gz.
const EXPORT = [
  '{"id":66732,"original_name":"Stranger Things","popularity":140.0927}',
  '{"id":1668,"original_name":"Friends","popularity":139.5629}',
  '{"id":20813,"original_name":"Friends","popularity":2.3129}',
  '{"id":119051,"original_name":"Wednesday","popularity":69.5202}',
  '{"id":85077,"original_name":"The Chosen","popularity":95.6384}',
  '{"id":26777,"original_name":"Chosen","popularity":6.9205}',
  '{"id":71446,"original_name":"La casa de papel","popularity":36.1807}',
  '{"id":76669,"original_name":"Élite","popularity":55.9988}',
  '{"id":232538,"original_name":"Wicked!","popularity":1.3884}',
  '{"id":1,"original_name":"プライド","popularity":6.1022}',
  '',
].join('\n');

/** The gzipped export as a download hands it over: in small chunks that split lines. */
function exportStream(text: string, chunk = 7): ReadableStream<Uint8Array<ArrayBuffer>> {
  const gz = gzipSync(text);
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i >= gz.length) return controller.close();
      controller.enqueue(new Uint8Array(gz.subarray(i, (i += chunk))));
    },
  });
}

const stored = async () =>
  (await fakeBrowser.storage.local.get(SERIES_KEY))[SERIES_KEY] as SeriesList | undefined;

beforeEach(async () => {
  fakeBrowser.reset();
  // Empties the in-memory copy too, then the storage.
  await saveSeriesList({ shows: {}, fetched: 0, tried: 0 });
  await fakeBrowser.storage.local.clear();
});

describe('seriesExportUrl', () => {
  it("asks for yesterday's export (UTC), today's may not be out yet", () => {
    expect(seriesExportUrl(new Date('2026-10-24T05:00:00Z'))).toBe(
      'https://files.tmdb.org/p/exports/tv_series_ids_10_23_2026.json.gz',
    );
    expect(seriesExportUrl(new Date('2027-01-01T00:30:00+01:00'))).toBe(
      'https://files.tmdb.org/p/exports/tv_series_ids_12_30_2026.json.gz',
    );
  });
});

describe('parseSeriesExport', () => {
  it('keeps popular shows by normalized original name, the most popular per name', async () => {
    expect(await parseSeriesExport(exportStream(EXPORT))).toEqual({
      'stranger things': 140.1,
      friends: 139.6,
      wednesday: 69.5,
      chosen: 95.6,
      'casa de papel': 36.2,
      elite: 56,
    });
  });

  it('takes a lower cutoff', async () => {
    const shows = await parseSeriesExport(exportStream(EXPORT), 1);
    expect(shows).toMatchObject({ wicked: 1.4, [normalizeTitle('プライド')]: 6.1, chosen: 95.6 });
  });

  it('skips broken lines and names that look like object keys', async () => {
    const text = [
      'not json',
      '{"id":2,"original_name":"Constructor","popularity":20}',
      '{"id":3,"original_name":"No popularity"}',
      '{"id":4,"popularity":50}',
      '{"id":5,"original_name":"Last line without newline","popularity":9}',
    ].join('\n');
    const shows = await parseSeriesExport(exportStream(text));
    expect(shows).toEqual({ constructor: 20, 'last line without newline': 9 });
  });
});

describe('updateSeriesList', () => {
  const now = new Date('2026-10-24T18:00:00Z');
  const download = () => vi.fn(async () => new Response(exportStream(EXPORT), { status: 200 }));

  it('downloads the list and answers by normalized name', async () => {
    const fetchMock = download();
    vi.stubGlobal('fetch', fetchMock);
    await updateSeriesList(now);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://files.tmdb.org/p/exports/tv_series_ids_10_23_2026.json.gz',
    );
    expect(await stored()).toMatchObject({ fetched: now.getTime(), tried: now.getTime() });
    expect(await listedSeries('wednesday')).toBe(69.5);
    expect(await listedSeries('friends')).toBe(139.6);
    expect(await listedSeries('avatar')).toBeUndefined();
    expect(await listedSeries('constructor')).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it('downloads at most once a week', async () => {
    const fetchMock = download();
    vi.stubGlobal('fetch', fetchMock);
    await updateSeriesList(now);
    await updateSeriesList(new Date(now.getTime() + 6 * DAY));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await updateSeriesList(new Date(now.getTime() + 7 * DAY));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it('keeps the old list when the download fails, and tries again the next day', async () => {
    vi.stubGlobal('fetch', download());
    await updateSeriesList(now);
    const later = now.getTime() + 8 * DAY;
    // A missing export: files.tmdb.org answers 403.
    const failing = vi.fn(async () => new Response('<Error/>', { status: 403 }));
    vi.stubGlobal('fetch', failing);
    await updateSeriesList(new Date(later));
    expect(await stored()).toMatchObject({ fetched: now.getTime(), tried: later });
    expect(await listedSeries('wednesday')).toBe(69.5);

    await updateSeriesList(new Date(later + DAY / 2));
    expect(failing).toHaveBeenCalledTimes(1);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await updateSeriesList(new Date(later + DAY));
    expect(await listedSeries('wednesday')).toBe(69.5);
    vi.unstubAllGlobals();
  });

  it('works without any list when the first download fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(exportStream('garbage\n'))),
    );
    await updateSeriesList(now);
    expect(await stored()).toEqual({ shows: {}, fetched: 0, tried: now.getTime() });
    expect(await listedSeries('wednesday')).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it('survives clearing the cache', async () => {
    vi.stubGlobal('fetch', download());
    await updateSeriesList(now);
    await clearCache();
    expect((await stored())?.shows.wednesday).toBe(69.5);
    vi.unstubAllGlobals();
  });
});
