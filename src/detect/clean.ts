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
  'Event|Live|Special|Double Feature|Marathon|Neu|New|Jetzt im Kino|Now Playing|Now Showing|' +
  'Bald im Kino|Coming Soon|Demnächst|Neu im Kino|Top Filme|Alle Filme|All Movies|Kinoprogramm|' +
  'Programm|Festival|Film ?festival|Filmfest';
// Streaming-site button and accessibility phrases.
const ACTION =
  'Watch now|Watch|Play|Resume|Continue watching|Weiterschauen|Jetzt ansehen|Ansehen|Abspielen|' +
  'Trailer ansehen|Watch trailer|Trailer|Teaser|Tickets?|Tickets kaufen|Jetzt buchen|Buchen|' +
  'More info|More information|Mehr Infos|Mehr Informationen|Details|Info|Rent|Buy|Leihen|Kaufen|' +
  'See all|View all|Show all|Alle anzeigen|Alle ansehen|Mehr anzeigen|' +
  'Add to (?:my )?list|Zur Liste hinzufügen|Meine Liste|My List|Remove from (?:my )?list|' +
  // Category labels: "Last Man Down - movies".
  'Movies|Filme|Serien|Series';

// Labels of page controls (close buttons, carousel arrows, menus). Several are also film titles
// ("Close", "Next", "The Menu"), but as the whole text of an element they're almost always controls.
const CONTROL =
  'Close|Schließen|Menu|Menü|Open menu|Menü öffnen|Next|Weiter|Previous|Prev|Vorherige[rs]?|' +
  'Back|Zurück|Share|Teilen|Search|Suche|Suchen|Log ?in|Sign in|Sign up|Anmelden|Registrieren|' +
  'Go|Los|Start|Startseite|More|Mehr|Genres?|Consent|Zustimmen|Einwilligen|Agree|I agree|Got it|' +
  '(?:Accept|Reject|Allow) all|Alle (?:akzeptieren|ablehnen|zulassen)|Get started|Jetzt starten|' +
  'Loslegen|Subscribe|Abonnieren|Try (?:it )?(?:for )?free|Kostenlos testen|' +
  'Start (?:your )?free trial|' +
  'Verstanden|' +
  'Log ?out|Abmelden|Cancel|Abbrechen|Accept|Akzeptieren|Settings|Einstellungen|Skip|Überspringen|' +
  'Mute|Unmute|Stummschalten|Pause|Fullscreen|Vollbild|Options|Optionen|Scroll (?:left|right)|' +
  'Nach (?:links|rechts)';

const FORMAT_SUFFIX = new RegExp(`\\s*(?:[-–—|:/,]\\s*)?\\b(?:${FORMAT})\\s*$`, 'i');
const FORMAT_PREFIX = new RegExp(`^(?:${FORMAT})\\s*(?:[-–—|:/]\\s*)`, 'i');
const EVENT_PREFIX = new RegExp(`^(?:${EVENT})\\s*(?:[-–—|:!]\\s*)`, 'i');
const EVENT_SUFFIX = new RegExp(`\\s*[-–—|:]\\s*(?:${EVENT})\\s*$`, 'i');
const ACTION_PREFIX = new RegExp(`^(?:${ACTION})\\s*[-–—|:]\\s*`, 'i');
// Link labels that wrap the title: "Mehr über Street Fighter", "Tickets für Wicked".
const ACTION_PHRASE_PREFIX =
  /^(?:Mehr (?:über|zu|zum Film)|More about|More info(?:rmation)? (?:on|about)|Details (?:zu|zum Film|for|about)|Infos? (?:zu|zum Film|über)|Tickets (?:für|zu|for)|Trailer (?:zu|zum Film|for)|(?:See|Watch|View|Play) (?:the )?trailer (?:of|for)(?: the (?:movie|film))?\s*[-–:]?|Zum Film|Go to)\s+/i;
// Branded screening series: "SPARKLE PREVIEW: X", "Kinopolis Classics: X", "UCI KidsClub Frühstückskino: X".
const SERIES_LABEL_PREFIX =
  /^(?:[\p{L}'’-]+\s+){0,2}(?:Previews?|Specials?|Events?|Nights?|Sneak|Premieren?|Classics?|Matinee|Reihe|\p{L}*kino|\p{L}*club)\s*:\s*/iu;
const ACTION_SUFFIX = new RegExp(`\\s*[-–—|:,]\\s*(?:${ACTION})\\s*$`, 'i');
const ACTION_ONLY = new RegExp(`^(?:${ACTION}|${EVENT}|${FORMAT}|${CONTROL})$`, 'i');

const AGE_RATING =
  /\b(?:FSK|USK|PG|Rated)\s*-?\s*\d{1,2}\b|\bab\s+\d{1,2}(?:\s+Jahren)?\b|\b(?:FSK|ab)\s+0\b/gi;
const SERIES =
  /\b(?:Staffel|Season|Series|Serie)\s*\d+|\b(?:Folge|Episode|Ep\.)\s*\d+|\bS\d{1,2}\s*:?\s*E\d{1,3}\b|\b(?:TV[- ]Serie|Miniserie|Limited Series|Docuseries|Dokuserie)\b/i;
// Accessibility text after the title, e.g. Disney+'s "Dune. Select for details on this title."
const TRAILING_SENTENCE =
  /[.,]\s+(?:\p{Lu}[^.]*\b(?:select|details|press|click|tap|auswählen|wählen|drücken|klicken|tippen|öffnen|open)\b.*)$/iu;
// Image alt text like "Filmplakat: Dune", "Poster zu Dune", "Dune Poster".
const IMAGE_PREFIX =
  /^(?:(?:Film|Kino|Werbe|Movie)\s?)?(?:plakat|poster|banner|cover|bild|artwork|key ?art|thumbnail|vorschaubild|boxart)(?:\s+(?:zu|zur|zum|von|für|zum Film|for|of|from))?\s*[:\-–]?\s+/i;
const IMAGE_SUFFIX =
  /\s*[-–:]?\s*\b(?:(?:Film|Kino|Movie)\s?)?(?:plakat|poster|banner|cover|artwork|key ?art|thumbnail|boxart)$/i;
// Credits after the title: "CLAYFACE A FILM BY JAMES WATKINS", "Heldin – ein Film von Petra Volpe".
const CREDIT_SUFFIX =
  /\s*[-–—|,]?\s+(?:an?|ein)\s+(?:film|movie)\s+(?:by|from|von)\s+.+$|\s*[-–—|,]?\s+(?:directed by|regie:?)\s+.+$/i;
// Classification codes cinemas print after the title (UK, AU, US): "SENSE AND SENSIBILITY PG".
const RATING_SUFFIX = /\s+(?:PG-?13|PG|NC-17|MA ?15\+|R ?18\+|M|G|R|CTC|12A|15A|U|TBC)$/;
// "Sneak Preview", "CineSneak OV: ...": the film is a secret, nothing to look up.
const SECRET_SCREENING = /^(?:\p{L}*\s?sneak\b|überraschungsfilm|surprise movie|mystery movie)/iu;
// Times, prices, runtimes, scores and short numbers. (3+ digit numbers stay: "1917", "300".)
const NOT_A_TITLE =
  /^\d{1,2}[:.]\d{2}(?!\d)|€|\$\s*\d|\bmin\.?$|^\d+\s*min\b|^\d+[.,]\d+$|^\d{1,2}$|^\p{P}+$/iu;

// Words that describe a screening rather than name a film: version, language, subtitles, format,
// seats. Text made only of these is a label ("Original (Untertitel)", "OV mit dt. UT", "Deutsch").
const LANGUAGES_DE =
  'deutsch|englisch|französisch|spanisch|italienisch|japanisch|koreanisch|türkisch|polnisch|' +
  'russisch|ukrainisch|arabisch|chinesisch|kantonesisch|persisch|kurdisch|griechisch|' +
  'portugiesisch|schwedisch|dänisch|norwegisch|finnisch|niederländisch|ungarisch|tschechisch|' +
  'rumänisch|kroatisch|serbisch|hebräisch';
const LANGUAGES_EN =
  'english|german|french|spanish|italian|japanese|korean|turkish|polish|russian|ukrainian|' +
  'arabic|chinese|mandarin|cantonese|persian|farsi|kurdish|greek|portuguese|swedish|danish|' +
  'norwegian|finnish|dutch|hungarian|czech|romanian|croatian|serbian|hebrew|hindi|tamil|' +
  'telugu|malayalam|kannada|punjabi|bengali';
const SCREENING_WORD = new RegExp(
  '^(?:' +
    // German language adjectives take endings: "deutsche", "englischen".
    `(?:${LANGUAGES_DE})(?:e|en|er|es)?|${LANGUAGES_EN}|` +
    'dt|engl|eng|franz|frz|span|ital|jap|kor|türk|poln|russ|ukr|arab|' +
    'original|originale|originalversion|originalfassung|originalton|originalsprache|orig|' +
    'ov|of|omu|omdu|omeu|omenglu|df|synchron|synchronisiert|synchronfassung|fassung|version|' +
    'sprache|untertitel|untertiteln|untertitelt|ut|subtitled|subtitles|subs|dubbed|' +
    '2d|3d|hfr|imax|4dx|screenx|dolby|atmos|laser|premium|deluxe|recliner|barrierefrei|' +
    'audiodeskription|sitze|sitzplätze|plätze|seats|verfügbar|available|ausverkauft|' +
    'restplätze|wenige|freie|mit|with|ohne|without|und|and|in|' +
    // Accessible screenings: "On-Screen Captions", "Sensory Friendly", "Audio Described".
    'on|screen|open|captions?|captioned|sensory|friendly|relaxed|autism|audio|described|' +
    'screenings?|vorstellung|hörfilm' +
    ')$',
);

// Genre tags on tiles ("Familie", "Action, Thriller"). A few films share these names, but a tile's
// genre chip is far more common than a film called "Familie".
const GENRES =
  'action|abenteuer|adventure|animation|animationsfilm|anime|biografie|biopic|biography|comedy|komödie|tragikomödie|crime|krimi|doku|dokumentation|dokumentarfilm|documentary|drama|familie|familienfilm|family|fantasy|horror|kinderfilm|kids|buddy|superhero|superhelden|liebesfilm|romance|romantik|musical|musik|music|mystery|science|fiction|sci|fi|thriller|psychothriller|western|kriegsfilm|historienfilm|arthouse|kurzfilm|satire|' +
  // Category names: "Entertainment", "Comedies, Love stories, Road movies".
  'entertainment|unterhaltung|comedies|komödien|dramas|thrillers|documentaries|dokus|' +
  'dokumentarfilme|krimis|horrorfilme|actionfilme|animationsfilme|kinderfilme|liebesfilme|' +
  'abenteuerfilme';
const GENRE_WORD = new RegExp(`^(?:${GENRES})$`);
// "Fast verheiratet – Komödie mit Emily Blunt", "Nostalgia | Thriller-Drama".
const GENRE_SUFFIX = new RegExp(
  `\\s+[-–—|]\\s+(?:${GENRES})(?:[-\\s](?:${GENRES}))*(?:\\s+(?:mit|with|von|by)\\s+.+)?$`,
  'i',
);

function isScreeningLabel(s: string): boolean {
  const words = s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  return words.length > 0 && words.every((w) => SCREENING_WORD.test(w) || GENRE_WORD.test(w));
}

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

  // Alt text that is a file name: "Movie_43_cover".
  if (!s.includes(' ') && s.includes('_')) s = s.replace(/_+/g, ' ');

  // "On-Screen Captions: Sense and Sensibility", "OmU: Dune": a label made of screening words.
  const labelled = /^([^:]{2,40}):\s+(.+)$/.exec(s);
  if (labelled && isScreeningLabel(labelled[1])) s = labelled[2];

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
    CREDIT_SUFFIX,
    RATING_SUFFIX,
    GENRE_SUFFIX,
    /^[\s"'„“”‚‘’«»\-–—|:•·,]+|[\s"'„“”‚‘’«»\-–—|:•·,]+$/g,
  );

  // Alt text that is a URL slug: "toy-story-5".
  if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(s)) s = s.replace(/-/g, ' ');

  if (s.length < 2 || s.length > 80) return null;
  if (!/[\p{L}\p{N}]/u.test(s)) return null;
  if (ACTION_ONLY.test(s) || NOT_A_TITLE.test(s) || isScreeningLabel(s)) return null;
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
