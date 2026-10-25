# Privacy policy: Popscore

_Last updated: 24 October 2026_

Popscore shows IMDb ratings for movies and TV shows you point at while browsing, and as small
score tags on the ones you see on the sites where it's switched on. It has no accounts and no
analytics. Unless you enter your own API keys, it looks titles up through the Popscore ratings
server, described below.

## What leaves your browser

Only when you point at a title (by resting on it on a site where you switched auto-hover on, or by
holding Alt), or, with score tags on (the default), when a movie or show scrolls into view on a
site where auto-hover is on:

- **The title text** of that movie or show (the element under your pointer, or the poster or link
  the tag goes on) and **the page's language** are sent to find it, and then its TMDB id. When only
  films are looked up and the best match is doubtful (only part of the title matches, or few people
  rated the film), the same text is also searched as a TV show, to check whether the page shows a
  TV series of that name instead.
- **Its IMDb id** (e.g. `tt1160419`) is sent to get its IMDb rating.
- **Poster images** are loaded from TMDB's image server (image.tmdb.org).

Where these go depends on your settings:

- **Without your own keys (the default)**, the title, language and ids go to the **Popscore
  ratings server**, which looks them up on TMDB and OMDb with the project's own keys. Like any web
  server, it sees your IP address with each request. It keeps the address in memory only, for a
  few minutes, to limit how often one address can ask, and never writes it down. It doesn't log the
  titles or ids it's asked about. It caches the movie and show data (search results, details,
  ratings) for up to 7 days to answer everyone faster, without any record of who asked.
- **With your own TMDB key**, the title, language and TMDB id go straight to **TMDB**
  (api.themoviedb.org) with your key, not to the Popscore server.
- **With your own OMDb key**, the IMDb id goes straight to **OMDb** (www.omdbapi.com) with your key,
  not to the Popscore server.

While it looks up films only (TV shows switched off, or on cinema pages), the extension also
downloads **TMDB's public list of TV series** once a week (files.tmdb.org, about 5 MB) and keeps the
names of the roughly 16,000 most popular shows, so it can skip series tiles without asking about
each one. That download goes straight to TMDB's file server, not through the Popscore server, and
carries no page text, no API key and no settings: it's the same file for everyone.

With both keys, the extension never contacts the Popscore server. Nothing else is sent: not the
page address, not your browsing history, not other page content. TMDB's and OMDb's own privacy
policies apply to the requests they receive.

## What is stored

In your browser's extension storage only:

- your settings and, if you entered them, your API keys (synced across your devices if browser sync
  is on),
- movies and shows you corrected with "Wrong movie?" (synced),
- a cache of looked-up movies, shows and ratings (kept on this device, expires after 3–30 days),
- the names of popular TV series with their TMDB popularity (kept on this device, replaced weekly),
- a count of today's OMDb lookups on your own key.

Removing the extension deletes all of it. The settings page has a button to clear the cache.

## Permissions

- **Access to the supported cinema and streaming sites**: to read the title under your pointer, or
  of the movies and shows in view for score tags, and show the card and the tags there.
- **Access to other sites** (optional, only if you turn on "Alt-hover on every site" or add a site):
  same purpose. On sites you added, score tags read the titles in view like on the built-in ones;
  with only "Alt-hover on every site", nothing is read until you point at a title.
- **storage**: settings and cache. **scripting / activeTab**: to start the card on a site you just
  switched on.
