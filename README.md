# Worth It?

A Chrome and Firefox extension that shows a movie's **IMDb rating in a hover card** while you browse
cinema programmes (Cinestar, CinemaxX, Cineplex, UCI, Kinopolis) and streaming catalogs (Netflix,
Prime Video, Disney+). No more opening IMDb in another tab to decide whether a film is worth it.

- Rest the pointer on a poster or title for half a second on an enabled site, or hold **Alt (⌥)** to
  look up any title instantly.
- The card shows poster, year, a green / amber / red IMDb score with vote count, genres, runtime and
  a short plot.
- **Wrong movie?** opens the other close matches and a search box; your pick is remembered.
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

To see what it would detect on any site, without API keys, run `npm run probe`, paste
`dist/probe/probe.js` into the DevTools console and call `worthItProbe.watch()`.

## Setup for users

The extension needs two free API keys, entered on its settings page (it opens on install):

- **TMDB**: account at themoviedb.org → Settings → API → Developer key.
- **OMDb**: omdbapi.com/apikey.aspx → FREE (1,000 lookups a day). Ratings are cached for 3 days.

## Development

```bash
npm install
npm run dev            # Chrome with the extension loaded and hot reload
npm run dev:firefox    # same for Firefox
npm test               # unit tests (Vitest)
npm run e2e            # build + Playwright smoke test (live lookup needs TMDB_KEY/OMDB_KEY in .env)
npm run compile        # typecheck
npm run lint
npm run lint:firefox   # Mozilla's add-on linter on the Firefox build
npm run zip            # store packages for Chrome and Firefox (+ sources zip for AMO)
node scripts/make-icons.mjs   # regenerate public/icon/*.png
```

Load it by hand: `npm run build`, then in Chrome open `chrome://extensions`, enable Developer mode,
**Load unpacked** → `dist/chrome`. In Firefox open `about:debugging` → This Firefox →
**Load Temporary Add-on** → `dist/firefox/manifest.json` (`npm run build:firefox` first).

### Layout

| Path                                         | What                                                            |
| -------------------------------------------- | --------------------------------------------------------------- |
| `entrypoints/content/`                       | Hover/dwell/Alt trigger, mounts the card                        |
| `entrypoints/background.ts`                  | Message router; all network calls happen here                   |
| `entrypoints/options/`, `entrypoints/popup/` | Settings + welcome page, toolbar toggle                         |
| `src/detect/`                                | Generic title extraction and cleaning                           |
| `src/match/`                                 | Title normalization and result scoring                          |
| `src/api/`                                   | TMDB and OMDb clients behind a `RatingsProvider` interface      |
| `src/lookup.ts`, `src/cache.ts`              | Search → details → rating with caching and "Wrong movie?" picks |
| `src/ui/`                                    | Card component, shadow-DOM host, positioning                    |

## Publishing

See `store/listing.md` for listing text, permission justifications and the data disclosure, and
`PRIVACY.md` for the privacy policy (host it publicly, e.g. via GitHub Pages, and link it in both
stores). Run `npm run zip`, then upload `dist/worth-it-chrome-<version>.zip` to the Chrome Web Store and
`dist/worth-it-firefox-<version>.zip` plus `dist/worth-it-source-<version>.zip` to addons.mozilla.org.

Movie data from [TMDB](https://www.themoviedb.org/) (this product uses the TMDB API but is not
endorsed or certified by TMDB) and the [OMDb API](https://www.omdbapi.com/) (CC BY-NC 4.0, so the
extension must stay non-commercial). Not affiliated with IMDb.
