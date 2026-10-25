# Store listing material

Everything to paste into the Chrome Web Store and addons.mozilla.org (AMO). The images are in
[store/](../store); regenerate them with `npm run build && npm run store:assets` (needs `TMDB_KEY`
and `OMDB_KEY` in `.env`, see [scripts/store/shoot.mjs](../scripts/store/shoot.mjs)).

## Images

| File                           | Size     | Chrome Web Store            | AMO                 |
| ------------------------------ | -------- | --------------------------- | ------------------- |
| `store-icon-128.png`           | 128×128  | Store icon                  | (uses the manifest) |
| `screenshot-1-score-tags.png`  | 1280×800 | Screenshot 1                | Screenshot 1        |
| `screenshot-2-hover-card.png`  | 1280×800 | Screenshot 2                | Screenshot 2        |
| `screenshot-3-streaming.png`   | 1280×800 | Screenshot 3                | Screenshot 3        |
| `screenshot-4-wrong-movie.png` | 1280×800 | Screenshot 4                | Screenshot 4        |
| `screenshot-5-settings.png`    | 1280×800 | Screenshot 5                | Screenshot 5        |
| `promo-small-440x280.png`      | 440×280  | Small promo tile (required) | –                   |
| `promo-marquee-1400x560.png`   | 1400×560 | Marquee promo tile          | –                   |

All are 24-bit PNGs without alpha, as the Chrome Web Store asks; the store icon keeps its
transparent padding (96 px artwork in 128 px). The demo sites in the screenshots (Lumen, Lumen
Kino, Reelhouse) are made up; the ratings, cards and tags are the real extension with live data.

Screenshot captions (AMO shows them under each image):

1. Every poster gets its IMDb score, in green, amber or red.
2. Point at a movie for its rating, votes, genres, runtime and plot.
3. Movies and TV shows, on streaming sites too, in light and dark mode.
4. German titles are understood. Wrong match? Search for the right film.
5. Switch it on for any site from the toolbar; set your own colors and links.

## Name

Popscore – IMDb ratings on hover

## Summary

Chrome takes its summary from the manifest's `description` (≤ 132 characters), currently:

> Hover a movie title on cinema and streaming sites to see its IMDb rating. Movie data from TMDB and OMDb.

A stronger one, if you want to change the manifest (131 characters):

> Point at a movie or TV show on cinema and streaming sites to see its IMDb rating. Works on Netflix, Prime Video, Disney+ & cinemas.

AMO summary (≤ 250 characters, 232):

> See the IMDb rating of every movie and TV show on cinema and streaming sites: a color-coded score tag on each poster, and a card with the details when you point at a title. Works on Netflix, Prime Video, Disney+ and 130+ more sites.

## Full description

Is it worth it, or is it trash? Stop opening IMDb in another tab.

Popscore puts a small IMDb score tag on every movie and TV show poster on cinema and streaming
websites, and shows a card with the details when you rest your pointer on a title or poster:

• Score tags on the posters, in a traffic-light color, so you can scan a whole programme at once
• IMDb score with a traffic-light color (green / amber / red, adjustable) and vote count
• Brand-new releases without an IMDb rating yet show TMDB's user score, clearly labelled
• Poster, year, genres, runtime and a short plot; for TV shows, the years they ran and their seasons
• Movies, TV shows or both: your choice in the settings
• Works out of the box on 131 cinema and streaming sites in Germany, Austria, Switzerland, the UK, Ireland, the US, Canada, Australia and New Zealand: Netflix, Prime Video, Disney+, CineStar, Odeon, AMC, Hoyts and many more
• Switch it on for any other site from the toolbar button, or hold Alt (⌥) to look up any title anywhere
• Understands German titles ("Die Unfassbaren" → Now You See Me)
• "Wrong movie?" lets you pick the right title; your choice is remembered
• One click to the title on Letterboxd, IMDb or TMDB (your choice, for films and shows separately)
• No account, no setup, no tracking. Works right after install; optionally use your own free TMDB and OMDb API keys

Movie data from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.
IMDb ratings via the OMDb API. Not affiliated with IMDb.

## German listing (Deutsch)

Both stores take a listing per language; add German for DE, AT and CH.

Name: Popscore – IMDb-Bewertungen beim Überfahren

AMO summary (241 characters):

> Sieh die IMDb-Bewertung jedes Films und jeder Serie auf Kino- und Streaming-Seiten: ein farbiges Score-Schild auf jedem Poster und eine Karte mit den Details, wenn du auf einen Titel zeigst. Für Netflix, Prime Video, Disney+ und 130+ Seiten.

Description:

Lohnt sich der Film, oder ist er Schrott? Schluss damit, IMDb in einem zweiten Tab zu öffnen.

Popscore setzt ein kleines IMDb-Score-Schild auf jedes Film- und Serienposter auf Kino- und
Streaming-Websites und zeigt eine Karte mit den Details, sobald dein Mauszeiger auf einem Titel
oder Poster ruht:

• Score-Schilder auf den Postern in Ampelfarben: so überblickst du ein ganzes Kinoprogramm auf einen Blick
• IMDb-Bewertung in Ampelfarbe (grün / gelb / rot, einstellbar) mit Anzahl der Stimmen
• Ganz neue Filme ohne IMDb-Bewertung zeigen die TMDB-Nutzerwertung, klar gekennzeichnet
• Poster, Jahr, Genres, Laufzeit und kurze Handlung; bei Serien die Laufzeit in Jahren und die Staffeln
• Filme, Serien oder beides: du wählst in den Einstellungen
• Läuft sofort auf 131 Kino- und Streaming-Seiten in Deutschland, Österreich, der Schweiz, Großbritannien, Irland, den USA, Kanada, Australien und Neuseeland: Netflix, Prime Video, Disney+, CineStar, Cineplex, UCI, Odeon, AMC und viele mehr
• Für jede andere Seite mit einem Klick auf das Symbol in der Symbolleiste einschalten, oder Alt (⌥) halten und überall auf einen Titel zeigen
• Versteht deutsche Titel („Die Unfassbaren“ → Now You See Me)
• „Wrong movie?“ lässt dich den richtigen Titel wählen; deine Wahl wird gespeichert
• Ein Klick zum Titel auf Letterboxd, IMDb oder TMDB (für Filme und Serien getrennt wählbar)
• Kein Konto, keine Einrichtung, kein Tracking. Funktioniert direkt nach der Installation; optional mit eigenen kostenlosen TMDB- und OMDb-API-Schlüsseln

Die Oberfläche der Erweiterung ist auf Englisch.

Filmdaten von TMDB. Dieses Produkt nutzt die TMDB-API, ist aber nicht von TMDB unterstützt oder
zertifiziert. IMDb-Bewertungen über die OMDb-API. Nicht mit IMDb verbunden.

## Chrome Web Store: store listing tab

- **Category**: Lifestyle › Entertainment
- **Language**: English (add German as a second listing, above)
- **Homepage URL**: https://github.com/Gunneone/popscore
- **Support URL**: https://github.com/Gunneone/popscore/issues
- **Mature content**: no

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
- **Privacy policy URL**: the hosted copy of [PRIVACY.md](PRIVACY.md).

## Firefox (AMO)

- **Categories**: Photos, Music & Videos; Games & Entertainment
- **Tags**: imdb, movies, ratings, netflix, streaming
- **Homepage**: https://github.com/Gunneone/popscore
- **Support site**: https://github.com/Gunneone/popscore/issues
- **License**: pick one on upload; the repository has no LICENSE file yet.
- **Privacy policy**: paste the text of [PRIVACY.md](PRIVACY.md) (AMO hosts it on the listing).
- **Experimental / requires payment**: no / no.
- `data_collection_permissions.required: ["websiteContent"]` is declared in the manifest.
- Upload the `dist/popscore-source-<version>.zip` from `npm run zip` with build instructions:
  `npm ci && npm run zip:firefox` (Node 22+).

Notes for reviewers:

> Built with WXT (Vite). To rebuild from the source zip: `npm ci && npm run zip:firefox` on Node
> 22+; the result is dist/popscore-firefox-<version>.zip. To test without the ratings server, add
> free TMDB and OMDb keys on the settings page. Linter warnings about `innerHTML` come from
> Preact's renderer (`dangerouslySetInnerHTML` support), which the extension never uses.

## Still needed before submitting

- Hosted privacy policy URL (publish docs/PRIVACY.md, e.g. via GitHub Pages from docs/)
- The ratings server deployed at `DEFAULT_SERVER_URL` in `src/sites.ts`
- A license for AMO
