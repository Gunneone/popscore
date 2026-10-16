# Store listing material

## Name

Worth It? – IMDb ratings on hover

## Short description (≤ 132 chars, Chrome)

Point at a movie on cinema or streaming sites and see its IMDb rating instantly. Works on Netflix, Prime Video, Disney+ and cinemas.

## Full description

Is it worth it, or is it trash? Stop opening IMDb in another tab.

Worth It? shows a small card with the IMDb rating when you rest your pointer on a movie title or
poster on cinema and streaming websites:

• IMDb score with a traffic-light color (green / amber / red, adjustable) and vote count
• Brand-new releases without an IMDb rating yet show TMDB's user score, clearly labelled
• Poster, year, genres, runtime and a short plot
• Works on Netflix, Prime Video, Disney+, Cinestar, CinemaxX, Cineplex, UCI and Kinopolis out of the box
• Switch it on for any other site from the toolbar button, or hold Alt (⌥) to look up any title anywhere
• Understands German titles ("Die Unfassbaren" → Now You See Me)
• "Wrong movie?" lets you pick the right film; your choice is remembered
• No account, no tracking. Uses your own free TMDB and OMDb API keys (setup takes ~3 minutes)

Movie data from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.
IMDb ratings via the OMDb API. Not affiliated with IMDb.

## Category

Chrome: Entertainment · Firefox: Search Tools / Photos, Music & Videos

## Chrome Web Store: single purpose

Show the IMDb rating of a movie when the user points at its title on a web page.

## Chrome Web Store: permission justifications

- **Host permissions for the listed cinema/streaming sites (content script)**: read the title of
  the element under the pointer and display the rating card on those pages.
- **api.themoviedb.org, image.tmdb.org, www.omdbapi.com**: look up the movie, its poster and its
  IMDb rating.
- **Optional host permissions (`<all_urls>`)**: requested only when the user turns on "Alt-hover
  on every site" or enables an additional site from the toolbar.
- **storage**: settings, API keys, cache of looked-up ratings.
- **scripting**: register the content script for sites the user enabled.
- **activeTab**: read the current tab's address in the toolbar popup and start the card there right
  after the user enables the site.
- **Remote code**: none. All code is bundled.

## Chrome Web Store: data usage disclosure

- Collected: **Website content** (the title text under the pointer, sent to TMDB for the lookup).
- Not sold, not used for anything except the single purpose, not used for creditworthiness.

## Firefox (AMO)

- `data_collection_permissions.required: ["websiteContent"]` is declared in the manifest.
- Upload the `dist/worth-it-source-<version>.zip` from `npm run zip` with build instructions: `npm ci && npm run zip:firefox`
  (Node 22+).
- Linter warnings about `innerHTML` come from Preact's renderer (`dangerouslySetInnerHTML` support),
  which the extension never uses.

## Assets still needed

- Screenshots 1280×800 (card on a cinema page, on Netflix, the settings page)
- Small promo tile 440×280 (Chrome)
- Hosted privacy policy URL (publish PRIVACY.md, e.g. via GitHub Pages)
