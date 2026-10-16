// Pure data: imported by wxt.config.ts at build time, so no browser APIs here.

export type SiteKind = 'streaming' | 'cinema';

export interface SiteDef {
  id: string;
  name: string;
  kind: SiteKind;
  /** Content-script match patterns. */
  matches: string[];
}

export const DEFAULT_SITES: SiteDef[] = [
  { id: 'netflix', name: 'Netflix', kind: 'streaming', matches: ['*://*.netflix.com/*'] },
  { id: 'primevideo', name: 'Prime Video', kind: 'streaming', matches: ['*://*.primevideo.com/*'] },
  {
    id: 'amazon-de-video',
    name: 'Prime Video on amazon.de',
    kind: 'streaming',
    matches: ['*://www.amazon.de/*gp/video/*'],
  },
  { id: 'disneyplus', name: 'Disney+', kind: 'streaming', matches: ['*://*.disneyplus.com/*'] },
  { id: 'cinestar', name: 'Cinestar', kind: 'cinema', matches: ['*://*.cinestar.de/*'] },
  { id: 'cinemaxx', name: 'CinemaxX', kind: 'cinema', matches: ['*://*.cinemaxx.de/*'] },
  { id: 'cineplex', name: 'Cineplex', kind: 'cinema', matches: ['*://*.cineplex.de/*'] },
  { id: 'uci', name: 'UCI', kind: 'cinema', matches: ['*://*.uci-kinowelt.de/*'] },
  { id: 'kinopolis', name: 'Kinopolis', kind: 'cinema', matches: ['*://*.kinopolis.de/*'] },
];

export const DEFAULT_SITE_MATCHES = DEFAULT_SITES.flatMap((s) => s.matches);

/** Hosts the background worker talks to. */
export const API_HOST_PERMISSIONS = [
  'https://api.themoviedb.org/*',
  'https://image.tmdb.org/*',
  'https://www.omdbapi.com/*',
];

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
