// Shows, per title, where the TMDB → IMDb id → OMDb rating chain breaks.
// Usage: node scripts/diagnose.mjs "Digger" "Whalefall" ...   (keys from .env: TMDB_KEY, OMDB_KEY)
import { existsSync, readFileSync } from 'node:fs';

if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const { TMDB_KEY, OMDB_KEY } = process.env;
if (!TMDB_KEY || !OMDB_KEY) {
  console.error('Set TMDB_KEY and OMDB_KEY in .env first.');
  process.exit(1);
}

async function tmdb(path, params = {}) {
  const url = new URL('https://api.themoviedb.org/3' + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const headers = { accept: 'application/json' };
  if (TMDB_KEY.startsWith('eyJ')) headers.authorization = `Bearer ${TMDB_KEY}`;
  else url.searchParams.set('api_key', TMDB_KEY);
  return (await fetch(url, { headers })).json();
}

async function omdb(params) {
  const url = new URL('https://www.omdbapi.com/');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  url.searchParams.set('apikey', OMDB_KEY);
  return (await fetch(url)).json();
}

const titles = process.argv.slice(2);
const rows = [];
for (const title of titles) {
  const search = await tmdb('/search/movie', { query: title, language: 'de-DE' });
  const top = search.results?.[0];
  if (!top) {
    rows.push({ title, tmdb: 'no result' });
    continue;
  }
  const details = await tmdb(`/movie/${top.id}`, { language: 'en-US' });
  const ext = await tmdb(`/movie/${top.id}/external_ids`);
  const year = (details.release_date ?? '').slice(0, 4);
  const byId = details.imdb_id ? await omdb({ i: details.imdb_id }) : null;
  const byTitle = await omdb({ t: details.original_title, y: year, type: 'movie' });
  rows.push({
    title,
    tmdb: `${details.title} (${year}) #${top.id}`,
    'tmdb imdb_id': details.imdb_id || ext.imdb_id || '—',
    'omdb by id': byId ? `${byId.imdbRating ?? byId.Error} (${byId.imdbVotes ?? ''})` : '—',
    'omdb by title':
      byTitle.Response === 'True'
        ? `${byTitle.imdbID} ${byTitle.imdbRating} (${byTitle.imdbVotes})`
        : byTitle.Error,
  });
}
console.table(rows);
