# Privacy policy: Worth It?

_Last updated: 24 October 2026_

Worth It? shows IMDb ratings for movies you point at while browsing, and as small score tags on
the movies you see on the sites where it's switched on. It has no servers of its own, no accounts
and no analytics.

## What leaves your browser

Only when you point at a title (by resting on it on a site where you switched auto-hover on, or by
holding Alt), or, with score tags on (the default), when a movie scrolls into view on a site where
auto-hover is on:

- **The title text** of that movie (the element under your pointer, or the poster or link the tag
  goes on) is sent to **TMDB** (api.themoviedb.org) to find the movie, together with your TMDB API
  key and the page's language. When the best match is doubtful (only part of the title matches, or
  few people rated the film), the same text also goes to TMDB's TV search, to check whether the
  page shows a TV series of that name instead.
- **The movie's IMDb id** (e.g. `tt1160419`) is sent to **OMDb** (www.omdbapi.com) with your OMDb
  API key to get its IMDb rating.
- **Poster images** are loaded from TMDB's image server (image.tmdb.org).

Once a week, the extension also downloads **TMDB's public list of TV series** (files.tmdb.org,
about 5 MB) and keeps the names of the roughly 16,000 most popular shows, so it can skip series
tiles without asking TMDB about each one. That request carries no page text, no API key and no
settings: it's the same file for everyone.

Nothing else is sent: not the page address, not your browsing history, not other page content.
These services' own privacy policies apply to the requests they receive.

## What is stored

In your browser's extension storage only:

- your settings and API keys (synced across your devices if browser sync is on),
- movies you corrected with "Wrong movie?" (synced),
- a cache of looked-up movies and ratings (kept on this device, expires after 3–30 days),
- the names of popular TV series with their TMDB popularity (kept on this device, replaced weekly),
- a count of today's OMDb lookups.

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
