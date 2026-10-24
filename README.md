# Worth It?

A Chrome and Firefox extension that shows a movie's **IMDb rating in a hover card** while you browse
cinema programmes (CineStar, Odeon, AMC, Hoyts, …) and streaming catalogs (Netflix, Prime Video,
Disney+, …). No more opening IMDb in another tab to decide whether a film is worth it.

- Rest the pointer on a poster or title for half a second on an enabled site, or hold **Alt (⌥)** to
  look up any title instantly.
- Works out of the box on 128 cinema and streaming sites in the German- and English-speaking
  markets (DE, AT, CH, UK, IE, US, CA, AU, NZ), listed in [src/sites.ts](src/sites.ts). In the
  settings they're grouped into Cinemas, Streaming services and Your sites; each list and each site
  can be switched off on its own.
- Every movie in view gets a small score tag in the same green / amber / red, on its poster (or
  after its title in text listings). Tags only look films up as they scroll into view. When the
  ratings server (or your own OMDb key, at 800 lookups a day) runs short, tags show TMDB's score so
  the card keeps the rest. They can be switched off in the settings.
- The card shows poster, year, a green / amber / red IMDb score with vote count, genres, runtime and
  a short plot.
- New releases: OMDb's copy of IMDb ratings lags a few weeks behind, so until it has one the card
  shows TMDB's user score instead, clearly labelled "/10 TMDB".
- **Wrong movie?** opens the other close matches and a search box; your pick is remembered.
- The card links to the film on IMDb, or on Letterboxd if you pick that in the settings.
- Movies only (series are skipped). German titles are understood.

## How it finds titles without per-site code

The extension has no selectors for any particular website, so layout changes rarely break it. For
the element under the pointer it walks up a few ancestors and collects title-looking text from
generic signals:

1. `aria-label` / `title` / `data-*title*` attributes, including a single labelled button or link
   inside a tile (Netflix's "Go to …", Prime Video's overlay buttons)
2. image `alt` text ("Filmplakat: …", "Banner zu …" are cleaned up)
3. a single heading or `[class*=title]` element inside the tile
4. schema.org `Movie` / `ScreeningEvent` JSON-LD and OpenGraph data on the page

Candidates are cleaned of cinema noise (OV, OmU, 3D, IMAX, FSK 12, "Vorpremiere:", "Tickets", …),
then searched on TMDB in the page's language. A match is only shown when the title is similar
enough, the year fits and the film isn't obscure, so hovering a "Play" button never pops up a
card. See `src/detect/` and `src/match/`.

Score tags use the same detector: every image outside menus and footers, plus links to a film's
page in tiles without an image, is treated as if you pointed at it once it scrolls into view, and
gets a tag when that finds a confident match. The tag goes into the page next to the poster (or at
the end of the title), so it scrolls, slides and gets clipped along with it. See
`src/detect/scan.ts` and `entrypoints/content/tags.ts`.

To see what it would detect on any site, without API keys, run `npm run probe`, paste
`dist/probe/probe.js` into the DevTools console and call `worthItProbe.watch()`.

## Setup for users

None. By default the extension asks the Worth It? ratings server (see below), which looks movies up
on TMDB and OMDb with the project's own keys and caches the answers for everyone.

To stay independent of the server, enter your own free keys on the settings page. Each key replaces
the server for its service; with both, the extension never contacts it:

- **TMDB**: account at themoviedb.org → Settings → API → Developer key.
- **OMDb**: omdbapi.com/apikey.aspx → FREE (1,000 lookups a day).

Either way, the browser caches ratings for up to 3 days.

## Ratings server

`server/` is a small Node server (no framework, Node's built-in SQLite for the cache) that answers
the extension's three lookups with the server's own keys. It shares the TMDB and OMDb clients in
`src/api/` with the extension.

| Route                                        | Answers                | Cached for                                                    |
| -------------------------------------------- | ---------------------- | ------------------------------------------------------------- |
| `GET /v1/search?query=&language=&year=`      | TMDB search results    | 7 days; 24 h when nothing was found                           |
| `GET /v1/movie/:tmdbId`                      | TMDB details (English) | 7 days; 24 h with fewer than 100 TMDB votes or no IMDb id yet |
| `GET /v1/rating/:imdbId` (`?tag=1` for tags) | IMDb rating and votes  | 7 days; 24 h with fewer than 100 votes or no rating yet       |
| `GET /health`                                | `{ "ok": true }`       |                                                               |

Answers carry `X-Cache: hit` or `miss`. Clients asking for the same film at once share one upstream
call. Each IP address may make `RATE_LIMIT_PER_MIN` requests a minute (in memory only). OMDb calls
stop at `OMDB_DAILY_LIMIT` a day (UTC), and score tags only get the first 80% of them, so cards keep
working. Over a limit the server answers 429 or 503, and the card says the server is busy. Titles
and ids are not logged.

| Variable             | Default         | What                                                                     |
| -------------------- | --------------- | ------------------------------------------------------------------------ |
| `TMDB_KEY`           | (required)      | TMDB API key or Read Access Token                                        |
| `OMDB_KEY`           | (required)      | OMDb key; the free tier's 1,000 a day won't go far with many users       |
| `OMDB_DAILY_LIMIT`   | `1000`          | Set it to the OMDb key's real daily allowance                            |
| `RATE_LIMIT_PER_MIN` | `300`           | Requests a minute per IP address                                         |
| `PORT`               | `8787`          |                                                                          |
| `DB_PATH`            | `data/cache.db` | SQLite cache and the daily OMDb count                                    |
| `TRUST_PROXY`        | off             | `1` behind exactly one reverse proxy: read the IP from `X-Forwarded-For` |

```bash
npm run server:dev     # build, run and rebuild on changes; reads TMDB_KEY / OMDB_KEY from .env
npm run server:build   # dist/server/index.mjs, which runs on Node 22.13+ with no node_modules
npm run server:start
docker build -f server/Dockerfile -t worth-it-server .
docker run -p 8787:8787 -v worth-it-cache:/data -e TMDB_KEY=… -e OMDB_KEY=… worth-it-server
```

Extension builds ask the server at `WXT_SERVER_URL` (from the environment or `.env`), or else at
`DEFAULT_SERVER_URL` in [src/sites.ts](src/sites.ts). The default is a placeholder: set the real
address there before a release. For development, put `WXT_SERVER_URL=http://localhost:8787` in
`.env.development` so release builds never point at localhost.

## Development

```bash
npm install
npm run dev            # Chrome with the extension loaded and hot reload
npm run dev:firefox    # same for Firefox
npm test               # unit tests (Vitest)
npm run e2e            # build + Playwright smoke test (live lookup needs TMDB_KEY/OMDB_KEY in .env)
npm run server:dev     # the ratings server on :8787 (see "Ratings server")
npm run e2e:sites      # live check of every built-in site (needs TMDB_KEY; OMDb is mocked), ~20 min
npm run compile        # typecheck
npm run lint
npm run lint:firefox   # Mozilla's add-on linter on the Firefox build
npm run zip            # store packages for Chrome and Firefox (+ sources zip for AMO)
node scripts/make-icons.mjs   # regenerate public/icon/*.png
```

`npm run e2e:sites` opens every site in [src/sites.ts](src/sites.ts), points at film links (they
should open a card for that film) and at menus, footers, buttons and headings (they should open
nothing), and writes `test-results/sites-report.md`. OMDb answers are mocked inside the extension,
so it spends no OMDb lookups. Sites that block automated browsers or this region are listed as
skipped, not worked around.

Load it by hand: `npm run build`, then in Chrome open `chrome://extensions`, enable Developer mode,
**Load unpacked** → `dist/chrome`. In Firefox open `about:debugging` → This Firefox →
**Load Temporary Add-on** → `dist/firefox/manifest.json` (`npm run build:firefox` first).

### Layout

| Path                                         | What                                                            |
| -------------------------------------------- | --------------------------------------------------------------- |
| `entrypoints/content/`                       | Hover/dwell/Alt trigger, mounts the card and the score tags     |
| `entrypoints/background.ts`                  | Message router; all network calls happen here                   |
| `entrypoints/options/`, `entrypoints/popup/` | Settings + welcome page, toolbar toggle                         |
| `src/detect/`                                | Generic title extraction and cleaning                           |
| `src/match/`                                 | Title normalization and result scoring                          |
| `src/api/`                                   | TMDB, OMDb and ratings-server clients behind `RatingsProvider`  |
| `src/lookup.ts`, `src/cache.ts`              | Search → details → rating with caching and "Wrong movie?" picks |
| `src/ui/`                                    | Card and score tag, shadow-DOM host, positioning                |
| `server/`                                    | Ratings server: TMDB/OMDb with the project's keys, shared cache |

## Publishing

Before the first release with the server, deploy it, set `DEFAULT_SERVER_URL` in `src/sites.ts` to
its address, and give it an OMDb key with a large enough daily allowance.

See `store/listing.md` for listing text, permission justifications and the data disclosure, and
`PRIVACY.md` for the privacy policy (host it publicly, e.g. via GitHub Pages, and link it in both
stores). Run `npm run zip`, then upload `dist/worth-it-chrome-<version>.zip` to the Chrome Web Store and
`dist/worth-it-firefox-<version>.zip` plus `dist/worth-it-source-<version>.zip` to addons.mozilla.org.

Movie data from [TMDB](https://www.themoviedb.org/) (this product uses the TMDB API but is not
endorsed or certified by TMDB) and the [OMDb API](https://www.omdbapi.com/) (CC BY-NC 4.0, so the
extension must stay non-commercial). Not affiliated with IMDb.
