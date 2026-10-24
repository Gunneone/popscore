// Pure data: imported by wxt.config.ts at build time, so no browser APIs here.

export type SiteKind = 'streaming' | 'cinema';

/** The settings page's lists: the two built-in kinds, plus the sites the user added. */
export type SiteList = SiteKind | 'custom';

export type Region = 'intl' | 'de' | 'at' | 'ch' | 'uk' | 'us' | 'au';

export const REGION_NAMES: Record<Region, string> = {
  intl: 'International',
  de: 'Germany',
  at: 'Austria',
  ch: 'Switzerland',
  uk: 'UK & Ireland',
  us: 'US & Canada',
  au: 'Australia & New Zealand',
};

export interface SiteDef {
  id: string;
  name: string;
  kind: SiteKind;
  region: Region;
  /** Content-script match patterns. */
  matches: string[];
}

/** "cinestar.de" covers the domain and its subdomains; anything with "://" is a match pattern already. */
function site(kind: SiteKind, region: Region, id: string, name: string, hosts: string[]): SiteDef {
  const matches = hosts.map((h) => (h.includes('://') ? h : `*://*.${h}/*`));
  return { id, name, kind, region, matches };
}

const cinema = (region: Region, id: string, name: string, ...hosts: string[]) =>
  site('cinema', region, id, name, hosts);
const streaming = (region: Region, id: string, name: string, ...hosts: string[]) =>
  site('streaming', region, id, name, hosts);

// Cinema chains, plus ticketing and showtime guides. Hosts must not overlap between entries
// (e.g. fandango.com tickets vs athome.fandango.com streaming): tests check this.
const CINEMAS: SiteDef[] = [
  cinema('de', 'cinestar', 'CineStar', 'cinestar.de'),
  cinema('de', 'cinemaxx', 'CinemaxX', 'cinemaxx.de'),
  cinema('de', 'uci', 'UCI Kinowelt', 'uci-kinowelt.de'),
  cinema('de', 'cineplex', 'Cineplex', 'cineplex.de'),
  cinema('de', 'kinopolis', 'Kinopolis', 'kinopolis.de'),
  cinema('de', 'cinedom', 'Cinedom', 'cinedom.de'),
  cinema('de', 'cinecitta', 'CineCitta', 'cinecitta.de'),
  cinema('de', 'yorck', 'Yorck Kinos', 'yorck.de'),
  cinema('de', 'astor', 'Astor Film Lounge', 'premiumkino.de'),
  cinema('de', 'traumpalast', 'Traumpalast', 'traumpalast.de'),
  cinema('de', 'cinemotion', 'Cinemotion', 'cinemotion-kino.de'),
  cinema('de', 'mathaeser', 'Mathäser Filmpalast', 'mathaeser.de'),
  cinema('de', 'filmpalast-zkm', 'Filmpalast am ZKM', 'filmpalast.net'),
  cinema('de', 'kinoheld', 'kinoheld', 'kinoheld.de'),
  cinema('de', 'kino-de', 'kino.de', 'kino.de'),
  cinema('at', 'cineplexx', 'Cineplexx', 'cineplexx.at', 'villagecinemas.at'),
  cinema('at', 'megaplex', 'Hollywood Megaplex', 'megaplex.at'),
  cinema('at', 'dieselkino', 'Dieselkino', 'dieselkino.at'),
  cinema('ch', 'pathe', 'Pathé', 'pathe.ch'),
  cinema('ch', 'bluecinema', 'blue Cinema', 'bluecinema.ch'),
  cinema('ch', 'arena', 'Arena Cinemas', 'arena.ch'),
  cinema('ch', 'kinepolis', 'Kinepolis', 'kinepolis.ch'),
  cinema('uk', 'odeon', 'Odeon', 'odeon.co.uk', 'odeoncinemas.ie'),
  cinema('uk', 'cineworld', 'Cineworld', 'cineworld.co.uk', 'cineworld.ie'),
  cinema('uk', 'vue', 'Vue', 'myvue.com'),
  cinema('uk', 'everyman', 'Everyman', 'everymancinema.com'),
  cinema('uk', 'picturehouse', 'Picturehouse', 'picturehouses.com'),
  cinema('uk', 'curzon', 'Curzon', '*://www.curzon.com/*', '*://curzon.com/*'),
  cinema('uk', 'showcase-uk', 'Showcase', 'showcasecinemas.co.uk'),
  cinema('uk', 'omniplex', 'Omniplex', 'omniplex.ie', 'omniplexcinemas.co.uk'),
  cinema('uk', 'reel', 'Reel Cinemas', 'reelcinemas.co.uk'),
  cinema('uk', 'the-light', 'The Light', 'thelight.co.uk'),
  cinema('uk', 'scott', 'Scott Cinemas', 'scottcinemas.co.uk'),
  cinema('uk', 'bfi-southbank', 'BFI Southbank', '*://whatson.bfi.org.uk/*'),
  cinema('uk', 'imc', 'IMC Cinemas', 'imc.ie'),
  cinema('us', 'amc', 'AMC', 'amctheatres.com'),
  cinema('us', 'regal', 'Regal', 'regmovies.com'),
  cinema('us', 'cinemark', 'Cinemark', 'cinemark.com'),
  cinema('us', 'marcus', 'Marcus Theatres', 'marcustheatres.com'),
  cinema('us', 'harkins', 'Harkins', 'harkins.com'),
  cinema('us', 'alamo', 'Alamo Drafthouse', 'drafthouse.com'),
  cinema('us', 'showcase-us', 'Showcase', 'showcasecinemas.com'),
  cinema('us', 'landmark-theatres', 'Landmark Theatres', 'landmarktheatres.com'),
  cinema('us', 'cinepolis', 'Cinépolis', 'cinepolisusa.com'),
  cinema('us', 'bb-theatres', 'B&B Theatres', 'bbtheatres.com'),
  cinema('us', 'emagine', 'Emagine', 'emagine-entertainment.com'),
  cinema('us', 'angelika', 'Angelika', 'angelikafilmcenter.com'),
  cinema('us', 'ipic', 'iPic', 'ipic.com'),
  cinema('us', 'santikos', 'Santikos', 'santikos.com'),
  cinema('us', 'malco', 'Malco', 'malco.com'),
  cinema('us', 'studio-movie-grill', 'Studio Movie Grill', 'studiomoviegrill.com'),
  cinema('us', 'fandango', 'Fandango', '*://www.fandango.com/*', '*://fandango.com/*'),
  cinema('us', 'atom', 'Atom Tickets', 'atomtickets.com'),
  cinema('us', 'cineplex-ca', 'Cineplex', 'cineplex.com'),
  cinema('us', 'landmark-cinemas', 'Landmark Cinemas', 'landmarkcinemas.com'),
  cinema('us', 'imagine', 'Imagine Cinemas', 'imaginecinemas.com'),
  cinema('au', 'hoyts', 'Hoyts', 'hoyts.com.au', 'hoyts.co.nz'),
  cinema('au', 'event', 'Event Cinemas', 'eventcinemas.com.au', 'eventcinemas.co.nz'),
  cinema('au', 'village', 'Village Cinemas', 'villagecinemas.com.au'),
  cinema('au', 'reading', 'Reading Cinemas', 'readingcinemas.com.au', 'readingcinemas.co.nz'),
  cinema('au', 'palace', 'Palace Cinemas', 'palacecinemas.com.au'),
  cinema('au', 'dendy', 'Dendy', 'dendy.com.au'),
];

const AMAZON_VIDEO = ['de', 'com', 'co.uk', 'ca', 'com.au'].map(
  (tld) => `*://www.amazon.${tld}/*gp/video/*`,
);

// Streaming services and streaming guides. Big multi-purpose domains are limited to their
// video section (BBC iPlayer, SRF Play, ...), so news pages there stay untouched.
const STREAMING: SiteDef[] = [
  streaming('intl', 'netflix', 'Netflix', 'netflix.com'),
  streaming('intl', 'primevideo', 'Prime Video', 'primevideo.com', ...AMAZON_VIDEO),
  streaming('intl', 'disneyplus', 'Disney+', 'disneyplus.com'),
  streaming('intl', 'apple-tv', 'Apple TV', '*://tv.apple.com/*'),
  streaming('intl', 'hbo-max', 'HBO Max', 'hbomax.com', 'max.com'),
  streaming('intl', 'paramountplus', 'Paramount+', 'paramountplus.com'),
  streaming('intl', 'mubi', 'MUBI', 'mubi.com'),
  streaming('intl', 'rakuten', 'Rakuten TV', 'rakuten.tv'),
  streaming('intl', 'pluto', 'Pluto TV', 'pluto.tv'),
  streaming('intl', 'plex', 'Plex', 'plex.tv'),
  streaming('intl', 'tubi', 'Tubi', 'tubitv.com', 'tubi.tv'),
  streaming('intl', 'google-tv', 'Google TV', '*://play.google.com/store/movies*'),
  streaming('intl', 'justwatch', 'JustWatch', 'justwatch.com'),
  streaming('de', 'wow', 'WOW', 'wowtv.de'),
  streaming('de', 'sky-de', 'Sky', 'sky.de'),
  streaming('de', 'joyn', 'Joyn', 'joyn.de', 'joyn.at'),
  streaming('de', 'rtlplus', 'RTL+', '*://plus.rtl.de/*'),
  streaming('de', 'magentatv', 'MagentaTV', 'magentatv.de'),
  streaming('de', 'waipu', 'waipu.tv', 'waipu.tv'),
  streaming('de', 'zattoo', 'Zattoo', 'zattoo.com'),
  streaming('de', 'ard', 'ARD Mediathek', 'ardmediathek.de'),
  streaming('de', 'zdf', 'ZDF', 'zdf.de'),
  streaming('de', 'arte', 'arte', 'arte.tv'),
  streaming('de', '3sat', '3sat', '3sat.de'),
  streaming('de', 'netzkino', 'Netzkino', 'netzkino.de'),
  streaming('de', 'alleskino', 'Alleskino', 'alleskino.de'),
  streaming('de', 'filmfriend', 'filmfriend', 'filmfriend.de'),
  streaming('de', 'sooner', 'Sooner', 'sooner.de'),
  streaming('de', 'videobuster', 'Videobuster', 'videobuster.de'),
  streaming('de', 'werstreamt', 'werstreamt.es', 'werstreamt.es'),
  streaming('at', 'orf', 'ORF ON', '*://on.orf.at/*'),
  streaming('ch', 'playsuisse', 'Play Suisse', 'playsuisse.ch'),
  streaming('ch', 'srf', 'SRF Play', '*://www.srf.ch/play/*'),
  streaming('ch', 'filmingo', 'Filmingo', 'filmingo.ch'),
  streaming('uk', 'iplayer', 'BBC iPlayer', '*://www.bbc.co.uk/iplayer*'),
  streaming('uk', 'itvx', 'ITVX', '*://www.itv.com/', '*://www.itv.com/watch*'),
  streaming('uk', 'channel4', 'Channel 4', 'channel4.com'),
  streaming('uk', 'channel5', '5', 'channel5.com'),
  streaming('uk', 'now', 'NOW', 'nowtv.com'),
  streaming('uk', 'bfi-player', 'BFI Player', '*://player.bfi.org.uk/*'),
  streaming('uk', 'curzon-home', 'Curzon Home Cinema', '*://homecinema.curzon.com/*'),
  streaming('uk', 'britbox', 'BritBox', 'britbox.com'),
  streaming('uk', 'rte', 'RTÉ Player', '*://www.rte.ie/player*'),
  streaming('us', 'hulu', 'Hulu', 'hulu.com'),
  streaming('us', 'peacock', 'Peacock', 'peacocktv.com'),
  streaming('us', 'starz', 'Starz', 'starz.com'),
  streaming('us', 'mgmplus', 'MGM+', 'mgmplus.com'),
  streaming('us', 'amcplus', 'AMC+', 'amcplus.com'),
  streaming('us', 'shudder', 'Shudder', 'shudder.com'),
  streaming('us', 'criterion', 'Criterion Channel', 'criterionchannel.com'),
  streaming('us', 'kanopy', 'Kanopy', 'kanopy.com'),
  streaming('us', 'fandango-home', 'Fandango at Home', '*://athome.fandango.com/*', 'vudu.com'),
  streaming('us', 'roku', 'The Roku Channel', '*://therokuchannel.roku.com/*'),
  streaming('us', 'acorn', 'Acorn TV', 'acorn.tv'),
  streaming('us', 'crave', 'Crave', 'crave.ca'),
  streaming('us', 'cbc-gem', 'CBC Gem', '*://gem.cbc.ca/*'),
  streaming('au', 'stan', 'Stan', 'stan.com.au'),
  streaming('au', 'binge', 'Binge', 'binge.com.au'),
  streaming('au', 'iview', 'ABC iview', '*://iview.abc.net.au/*'),
  streaming('au', 'sbs', 'SBS On Demand', '*://www.sbs.com.au/ondemand*'),
  streaming('au', '9now', '9Now', '9now.com.au'),
  streaming('au', '7plus', '7plus', '7plus.com.au'),
  streaming('au', '10', '10', '10.com.au'),
  streaming('au', 'neon', 'Neon', 'neon.co.nz'),
  streaming('au', 'tvnz', 'TVNZ+', 'tvnz.co.nz'),
  streaming('au', 'threenow', 'ThreeNow', 'threenow.co.nz'),
];

export const DEFAULT_SITES: SiteDef[] = [...CINEMAS, ...STREAMING];

export const DEFAULT_SITE_MATCHES = DEFAULT_SITES.flatMap((s) => s.matches);

/** The parts of the settings that decide where auto-hover is on. */
export interface SiteSettings {
  /** Built-in site ids, or patterns of the user's own sites, that are switched off. */
  disabledSites: string[];
  /** Lists switched off as a whole; their sites keep their own on/off choice for later. */
  disabledLists: SiteList[];
  extraSites: string[];
}

export interface SiteState {
  /** The built-in site the page belongs to. */
  site?: SiteDef;
  /** The user's own site pattern the page belongs to. */
  pattern?: string;
  list: SiteList | null;
  listOn: boolean;
  siteOn: boolean;
  /** Auto-hover is on: both the site and its list are switched on. */
  on: boolean;
}

export function siteState(url: string, s: SiteSettings): SiteState {
  const site = findDefaultSite(url);
  const pattern = site ? undefined : s.extraSites.find((p) => matchesPattern(url, p));
  const key = site?.id ?? pattern;
  if (!key) return { list: null, listOn: false, siteOn: false, on: false };
  const list: SiteList = site ? site.kind : 'custom';
  const listOn = !s.disabledLists.includes(list);
  const siteOn = !s.disabledSites.includes(key);
  return { site, pattern, list, listOn, siteOn, on: listOn && siteOn };
}

/**
 * The Popscore ratings server (see server/), used for each service the user has no own key for.
 * Builds can point elsewhere with WXT_SERVER_URL. `.example` never resolves: set the real address
 * before a release.
 */
export const DEFAULT_SERVER_URL = 'https://ratings.popscore.example';

/** Hosts the background worker talks to. */
export function apiHostPermissions(serverUrl: string): string[] {
  return [
    'https://api.themoviedb.org/*',
    'https://image.tmdb.org/*',
    // The weekly TV series list (src/series.ts): sent without CORS headers, so it needs the host.
    'https://files.tmdb.org/*',
    'https://www.omdbapi.com/*',
    originPattern(serverUrl) ?? originPattern(DEFAULT_SERVER_URL)!,
  ];
}

/** Minimal match-pattern test for the patterns used above (scheme wildcard, *. subdomains, * in path). */
export function matchesPattern(url: string, pattern: string): boolean {
  if (pattern === '<all_urls>') return /^(https?|file):/.test(url);
  const m = /^(\*|https?):\/\/([^/]+)(\/.*)$/.exec(pattern);
  if (!m) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const [, scheme, host, path] = m;
  const urlScheme = u.protocol.slice(0, -1);
  if (scheme === '*' ? !['http', 'https'].includes(urlScheme) : scheme !== urlScheme) return false;
  if (host !== '*') {
    if (host.startsWith('*.')) {
      const base = host.slice(2);
      if (u.hostname !== base && !u.hostname.endsWith('.' + base)) return false;
    } else if (u.hostname !== host) return false;
  }
  const re = new RegExp('^' + path.split('*').map(escapeRegex).join('.*') + '$');
  return re.test(u.pathname + u.search);
}

function escapeRegex(s: string): string {
  return s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

export function findDefaultSite(url: string): SiteDef | undefined {
  return DEFAULT_SITES.find((s) => s.matches.some((p) => matchesPattern(url, p)));
}

/** "https://www.yorck.de/foo" -> "https://www.yorck.de/*" (pattern used for permissions and registration). */
export function originPattern(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return `${u.protocol}//${u.hostname}/*`;
  } catch {
    return null;
  }
}
