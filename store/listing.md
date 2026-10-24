# Store listing material

## Name

Popscore – IMDb ratings on hover

## Short description (≤ 132 chars, Chrome)

Point at a movie or TV show on cinema and streaming sites to see its IMDb rating. Works on Netflix, Prime Video, Disney+ & cinemas.

## Full description

Is it worth it, or is it trash? Stop opening IMDb in another tab.

Popscore puts a small IMDb score tag on every movie and TV show poster on cinema and streaming
websites, and shows a card with the details when you rest your pointer on a title or poster:

• Score tags on the posters, in a traffic-light color, so you can scan a whole programme at once
• IMDb score with a traffic-light color (green / amber / red, adjustable) and vote count
• Brand-new releases without an IMDb rating yet show TMDB's user score, clearly labelled
• Poster, year, genres, runtime and a short plot; for TV shows, the years they ran and their seasons
• Movies, TV shows or both: your choice in the settings
• Works out of the box on 128 cinema and streaming sites in Germany, Austria, Switzerland, the UK, Ireland, the US, Canada, Australia and New Zealand: Netflix, Prime Video, Disney+, CineStar, Odeon, AMC, Hoyts and many more
• Switch it on for any other site from the toolbar button, or hold Alt (⌥) to look up any title anywhere
• Understands German titles ("Die Unfassbaren" → Now You See Me)
• "Wrong movie?" lets you pick the right title; your choice is remembered
• One click to the title on IMDb, or to films on Letterboxd (your choice)
• No account, no setup, no tracking. Works right after install; optionally use your own free TMDB and OMDb API keys

Movie data from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.
IMDb ratings via the OMDb API. Not affiliated with IMDb.

## Category

Chrome: Entertainment · Firefox: Search Tools / Photos, Music & Videos

## Chrome Web Store: single purpose

Show the IMDb rating of the movies and TV shows on a web page, as tags on their posters and in a
card when the user points at a title.

## Chrome Web Store: permission justifications

- **Host permissions for the listed cinema/streaming sites (content script)**: read the title of
  the element under the pointer, and of the movies and shows in view for the score tags, and
  display the rating card and tags on those pages.
- **The Popscore ratings server**: look up the movie or show and its IMDb rating without the user
  needing API keys of their own.
- **api.themoviedb.org, image.tmdb.org, www.omdbapi.com**: load the poster, and look up the movie
  or show and its IMDb rating directly when the user entered their own API keys.
- **files.tmdb.org**: download TMDB's public list of TV series once a week, so series tiles get no
  movie rating when only films are looked up. It's the same file for everyone; nothing is sent with
  the request.
- **Optional host permissions (`<all_urls>`)**: requested only when the user turns on "Alt-hover
  on every site" or enables an additional site from the toolbar.
- **storage**: settings, optional API keys, cache of looked-up ratings.
- **scripting**: register the content script for sites the user enabled.
- **activeTab**: read the current tab's address in the toolbar popup and start the card there right
  after the user enables the site.
- **Remote code**: none. All code is bundled.

## Chrome Web Store: data usage disclosure

- Collected: **Website content** (the title text under the pointer, or of movies and shows in view
  for the score tags, sent to the Popscore ratings server for the lookup, or to TMDB with the user's
  own key). The server doesn't log it or tie it to the user; it caches movie and show data for up
  to 7 days.
- Not sold, not used for anything except the single purpose, not used for creditworthiness.

## Firefox (AMO)

- `data_collection_permissions.required: ["websiteContent"]` is declared in the manifest.
- Upload the `dist/popscore-source-<version>.zip` from `npm run zip` with build instructions: `npm ci && npm run zip:firefox`
  (Node 22+).
- Linter warnings about `innerHTML` come from Preact's renderer (`dangerouslySetInnerHTML` support),
  which the extension never uses.

## Assets still needed

- Screenshots 1280×800 (card on a cinema page, on Netflix, the settings page)
- Small promo tile 440×280 (Chrome)
- Hosted privacy policy URL (publish PRIVACY.md, e.g. via GitHub Pages)
- The ratings server deployed, with its address as `DEFAULT_SERVER_URL` in `src/sites.ts`
