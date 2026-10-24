# Privacy policy: Worth It?

_Last updated: 24 October 2026_

Worth It? shows IMDb ratings for movies you point at while browsing, and as small score tags on
the movies you see on the sites where it's switched on. It has no accounts and no analytics. Unless
you enter your own API keys, it looks movies up through the Worth It? ratings server, described
below.

## What leaves your browser

Only when you point at a title (by resting on it on a site where you switched auto-hover on, or by
holding Alt), or, with score tags on (the default), when a movie scrolls into view on a site where
auto-hover is on:

- **The title text** of that movie (the element under your pointer, or the poster or link the tag
  goes on) and **the page's language** are sent to find the movie, and then its TMDB id.
- **The movie's IMDb id** (e.g. `tt1160419`) is sent to get its IMDb rating.
- **Poster images** are loaded from TMDB's image server (image.tmdb.org).

Where these go depends on your settings:

- **Without your own keys (the default)**, the title, language and ids go to the **Worth It?
  ratings server**, which looks them up on TMDB and OMDb with the project's own keys. Like any web
  server, it sees your IP address with each request. It keeps the address in memory only, for a
  few minutes, to limit how often one address can ask, and never writes it down. It doesn't log the
  titles or ids it's asked about. It caches the movie data (search results, movie details, ratings)
  for up to 7 days to answer everyone faster, without any record of who asked.
- **With your own TMDB key**, the title, language and TMDB id go straight to **TMDB**
  (api.themoviedb.org) with your key, not to the Worth It? server.
- **With your own OMDb key**, the IMDb id goes straight to **OMDb** (www.omdbapi.com) with your key,
  not to the Worth It? server.

With both keys, the extension never contacts the Worth It? server. Nothing else is sent: not the
page address, not your browsing history, not other page content. TMDB's and OMDb's own privacy
policies apply to the requests they receive.

## What is stored

In your browser's extension storage only:

- your settings and, if you entered them, your API keys (synced across your devices if browser sync
  is on),
- movies you corrected with "Wrong movie?" (synced),
- a cache of looked-up movies and ratings (kept on this device, expires after 3–30 days),
- a count of today's OMDb lookups on your own key.

Removing the extension deletes all of it. The settings page has a button to clear the cache.

## Permissions

- **Access to the supported cinema and streaming sites**: to read the title under your pointer, or
  of the movies in view for score tags, and show the card and the tags there.
- **Access to other sites** (optional, only if you turn on "Alt-hover on every site" or add a site):
  same purpose. On sites you added, score tags read the movies in view like on the built-in ones;
  with only "Alt-hover on every site", nothing is read until you point at a title.
- **storage**: settings and cache. **scripting / activeTab**: to start the card on a site you just
  switched on.

## Contact

Questions: open an issue in the project's repository.
