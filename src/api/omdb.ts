import type { ImdbRating } from '../types';
import { ApiError } from './errors';

const API = 'https://www.omdbapi.com/';

interface OmdbResponse {
  Response: 'True' | 'False';
  Error?: string;
  imdbRating?: string;
  imdbVotes?: string;
}

async function omdbGet(params: Record<string, string>, key: string): Promise<OmdbResponse> {
  const url = new URL(API);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('apikey', key);
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new ApiError('offline', 'OMDb is unreachable');
  }
  // OMDb answers errors (bad key, limit reached) with a JSON body, sometimes with status 401.
  const data = (await res.json().catch(() => null)) as OmdbResponse | null;
  if (!data) throw new ApiError('unknown', `OMDb responded ${res.status}`);
  if (data.Response === 'False') {
    const msg = data.Error ?? '';
    if (/limit/i.test(msg)) throw new ApiError('rate-limit', msg);
    if (/api key/i.test(msg)) throw new ApiError('bad-omdb-key', msg);
  }
  return data;
}

function parseNumber(s: string | undefined): number | null {
  if (!s || s === 'N/A') return null;
  const n = Number.parseFloat(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

export async function fetchImdbRating(imdbId: string, key: string): Promise<ImdbRating> {
  const data = await omdbGet({ i: imdbId }, key);
  if (data.Response === 'False') return { rating: null, votes: null };
  return { rating: parseNumber(data.imdbRating), votes: parseNumber(data.imdbVotes) };
}

export async function testOmdbKey(key: string): Promise<'ok' | 'invalid' | 'error'> {
  try {
    const data = await omdbGet({ i: 'tt0111161' }, key);
    return data.Response === 'True' ? 'ok' : 'error';
  } catch (err) {
    return err instanceof ApiError && err.code === 'bad-omdb-key' ? 'invalid' : 'error';
  }
}
