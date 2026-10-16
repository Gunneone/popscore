export interface CleanTitle {
  title: string;
  year?: number;
}

// Screening formats and event labels cinemas put around a film's title.
const FORMAT =
  'OV|OmU|OmdU|OmeU|OmenglU|Originalfassung|Originalversion|Original Version|English Version|engl\\.?|' +
  '2D|3D|in 3D|HFR|IMAX(?: 3D)?|4DX(?: 3D)?|ScreenX|Dolby(?: Cinema| Atmos| Vision)?|Atmos|D-BOX|' +
  'Laser|Premium|Deluxe|Recliner|Mit Untertiteln|Untertitelt|Barrierefrei|Audiodeskription';
const EVENT =
  '[A-Za-zÄÖÜäöü]+-?Special|Preview|Vorpremiere|Premiere|Vorpremieren|Exklusive Vorpremiere|Fan-?Preview|Fan Event|' +
  'Ladies Night|Ladies Preview|Kinotag|Kino-?Tag|Kinderkino|Kinder-?Kino|Familienkino|Familien-?Matinee|' +
  'Matinee|Mini-?Kino|Seniorenkino|Best of Cinema|Klassiker|Wiederaufführung|Re-?Release|Jubiläum|' +
  'Event|Live|Special|Double Feature|Marathon|Neu|New|Jetzt im Kino|Now Playing|Bald im Kino|Coming Soon';
// Streaming-site button and accessibility phrases.
const ACTION =
  'Watch now|Watch|Play|Resume|Continue watching|Weiterschauen|Jetzt ansehen|Ansehen|Abspielen|' +
  'Trailer ansehen|Watch trailer|Trailer|Teaser|Tickets?|Tickets kaufen|Jetzt buchen|Buchen|' +
  'More info|More information|Mehr Infos|Mehr Informationen|Details|Info|Rent|Buy|Leihen|Kaufen|' +
  'Add to (?:my )?list|Zur Liste hinzufügen|Meine Liste|My List|Remove from (?:my )?list';

const FORMAT_SUFFIX = new RegExp(`\\s*(?:[-–—|:/,]\\s*)?\\b(?:${FORMAT})\\s*$`, 'i');
const FORMAT_PREFIX = new RegExp(`^(?:${FORMAT})\\s*(?:[-–—|:/]\\s*)`, 'i');
const EVENT_PREFIX = new RegExp(`^(?:${EVENT})\\s*(?:[-–—|:!]\\s*)`, 'i');
const EVENT_SUFFIX = new RegExp(`\\s*[-–—|:]\\s*(?:${EVENT})\\s*$`, 'i');
const ACTION_PREFIX = new RegExp(`^(?:${ACTION})\\s*[-–—|:]\\s*`, 'i');
// Link labels that wrap the title: "Mehr über Street Fighter", "Tickets für Wicked".
const ACTION_PHRASE_PREFIX =
  /^(?:Mehr (?:über|zu|zum Film)|More about|More info(?:rmation)? (?:on|about)|Details (?:zu|zum Film|for|about)|Infos? (?:zu|zum Film|über)|Tickets (?:für|zu|for)|Trailer (?:zu|zum Film|for)|Zum Film|Go to)\s+/i;
// Branded screening series: "SPARKLE PREVIEW: X", "Emotions Preview: X", "Kinopolis Classics: X".
const SERIES_LABEL_PREFIX =
  /^(?:[\p{L}'’-]+\s+){0,2}(?:Previews?|Specials?|Events?|Nights?|Sneak|Premieren?|Classics?|Matinee|Reihe)\s*:\s*/iu;
const ACTION_SUFFIX = new RegExp(`\\s*[-–—|:,]\\s*(?:${ACTION})\\s*$`, 'i');
const ACTION_ONLY = new RegExp(`^(?:${ACTION}|${EVENT}|${FORMAT})$`, 'i');

const AGE_RATING =
  /\b(?:FSK|USK|PG|Rated)\s*-?\s*\d{1,2}\b|\bab\s+\d{1,2}(?:\s+Jahren)?\b|\b(?:FSK|ab)\s+0\b/gi;
const SERIES =
  /\b(?:Staffel|Season|Series|Serie)\s*\d+|\b(?:Folge|Episode|Ep\.)\s*\d+|\bS\d{1,2}\s*:?\s*E\d{1,3}\b|\b(?:TV[- ]Serie|Miniserie|Limited Series|Docuseries|Dokuserie)\b/i;
// Accessibility text after the title, e.g. Disney+'s "Dune. Select for details on this title."
const TRAILING_SENTENCE =
  /[.,]\s+(?:\p{Lu}[^.]*\b(?:select|details|press|click|tap|auswählen|wählen|drücken|klicken|tippen|öffnen|open)\b.*)$/iu;
// Image alt text like "Filmplakat: Dune", "Poster zu Dune", "Dune Poster".
const IMAGE_PREFIX =
  /^(?:Film|Kino|Werbe)?(?:plakat|poster|banner|cover|bild|artwork|key ?art|thumbnail|vorschaubild|boxart)(?:\s+(?:zu|zur|zum|von|für|zum Film|for|of|from))?\s*[:\-–]?\s+/i;
const IMAGE_SUFFIX =
  /\s*[-–:]?\s*\b(?:Film|Kino)?(?:plakat|poster|cover|artwork|key ?art|thumbnail|boxart)$/i;
// "Sneak Preview", "CineSneak OV: ...": the film is a secret, nothing to look up.
const SECRET_SCREENING = /^(?:\p{L}*\s?sneak\b|überraschungsfilm|surprise movie|mystery movie)/iu;
// Times, prices, runtimes, scores and short numbers. (3+ digit numbers stay: "1917", "300".)
const NOT_A_TITLE =
  /^\d{1,2}[:.]\d{2}\b|€|\$\s*\d|\bmin\.?$|^\d+\s*min\b|^\d+[.,]\d+$|^\d{1,2}$|^\p{P}+$/iu;

const ENTITIES: Record<string, string> = {
  amp: '&',
  quot: '"',
  apos: "'",
  '#39': "'",
  lt: '<',
  gt: '>',
  nbsp: ' ',
};

/** Some sites double-escape alt text, leaving a literal "&amp;". */
function decodeEntities(s: string): string {
  return s.replace(/&(amp|quot|apos|#39|lt|gt|nbsp);/g, (_m, e: string) => ENTITIES[e]);
}

function stripRepeatedly(s: string, ...patterns: RegExp[]): string {
  let prev: string;
  do {
    prev = s;
    for (const p of patterns) s = s.replace(p, '').trim();
  } while (s !== prev);
  return s;
}

/**
 * Turns raw text from a page element into a searchable movie title, or null if it isn't one.
 * Returns null for series too: the extension rates movies only.
 */
export function cleanTitle(raw: string): CleanTitle | null {
  let s = decodeEntities(raw)
    // Quotes are typography, not part of titles: „Der Herr der Ringe“-Trilogie.
    .replace(/["„“”«»]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return null;
  if (SECRET_SCREENING.test(s) || SERIES.test(s)) return null;

  s = s.replace(TRAILING_SENTENCE, '');

  let year: number | undefined;
  s = s.replace(/[([]\s*((?:19|20)\d{2})\s*[)\]]/g, (_m, y: string) => {
    year ??= Number(y);
    return ' ';
  });
  // Any other bracketed bits are labels: "(OV)", "[3D]", "(Director's Cut)".
  s = s.replace(/\s*[([][^()[\]]{0,40}[)\]]/g, ' ');
  s = s.replace(AGE_RATING, ' ').replace(/\s+/g, ' ').trim();

  s = stripRepeatedly(
    s,
    FORMAT_SUFFIX,
    FORMAT_PREFIX,
    EVENT_PREFIX,
    EVENT_SUFFIX,
    ACTION_PREFIX,
    ACTION_SUFFIX,
    ACTION_PHRASE_PREFIX,
    SERIES_LABEL_PREFIX,
    IMAGE_PREFIX,
    IMAGE_SUFFIX,
    /^[\s"'„“”‚‘’«»\-–—|:•·,]+|[\s"'„“”‚‘’«»\-–—|:•·,]+$/g,
  );

  if (s.length < 2 || s.length > 80) return null;
  if (!/[\p{L}\p{N}]/u.test(s)) return null;
  if (ACTION_ONLY.test(s) || NOT_A_TITLE.test(s)) return null;
  if (s.split(' ').length > 12) return null;
  return year === undefined ? { title: s } : { title: s, year };
}

/** Text that holds several fields ("Dune: Part Two\nFSK 12 · 166 Min") -> its title-looking parts, best first. */
export function cleanSegments(raw: string): CleanTitle[] {
  const segments = raw
    .split(/\n|\s[|•·]\s/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: CleanTitle[] = [];
  for (const seg of segments.length ? segments : [raw]) {
    const c = cleanTitle(seg);
    if (c && !out.some((o) => o.title === c.title)) out.push(c);
  }
  return out;
}
