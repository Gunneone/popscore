# Privacy policy: Worth It?

_Last updated: 24 October 2026_

Worth It? shows IMDb ratings for movies and TV shows you point at while browsing, and as small
score tags on the ones you see on the sites where it's switched on. It has no servers of its own, no accounts
and no analytics.

## What leaves your browser

Only when you point at a title (by resting on it on a site where you switched auto-hover on, or by
holding Alt), or, with score tags on (the default), when a movie or show scrolls into view on a
site where auto-hover is on:

- **The title text** of that movie or show (the element under your pointer, or the poster or link
  the tag goes on) is sent to **TMDB** (api.themoviedb.org) to find it, together with your TMDB API
  key and the page's language.
- **Its IMDb id** (e.g. `tt1160419`) is sent to **OMDb** (www.omdbapi.com) with your OMDb
  API key to get its IMDb rating.
- **Poster images** are loaded from TMDB's image server (image.tmdb.org).

Nothing else is sent: not the page address, not your browsing history, not other page content.
These services' own privacy policies apply to the requests they receive.

## What is stored

In your browser's extension storage only:

- your settings and API keys (synced across your devices if browser sync is on),
- movies and shows you corrected with "Wrong movie?" (synced),
- a cache of looked-up movies, shows and ratings (kept on this device, expires after 3–30 days),
- a count of today's OMDb lookups.

Removing the extension deletes all of it. The settings page has a button to clear the cache.

## Permissions

- **Access to the supported cinema and streaming sites**: to read the title under your pointer, or
  of the movies and shows in view for score tags, and show the card and the tags there.
- **Access to other sites** (optional, only if you turn on "Alt-hover on every site" or add a site):
  same purpose. On sites you added, score tags read the titles in view like on the built-in ones;
  with only "Alt-hover on every site", nothing is read until you point at a title.
- **storage**: settings and cache. **scripting / activeTab**: to start the card on a site you just
  switched on.

## Contact

Questions: open an issue in the project's repository.
