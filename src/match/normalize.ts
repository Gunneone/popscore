const LEADING_ARTICLES = /^(the|a|an|der|die|das|ein|eine|le|la|les|el|il|lo)\s+/;

/** Lowercase, fold accents/umlauts, unify "&"/"und"/"and", drop punctuation and a leading article. */
export function normalizeTitle(s: string): string {
  let t = s
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’‘`´]/g, '')
    .replace(/[&+]/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\bund\b/g, 'and')
    .replace(/\s+/g, ' ')
    .trim();
  t = t.replace(LEADING_ARTICLES, '');
  return t;
}

function bigrams(s: string): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

/** Sørensen–Dice coefficient over character bigrams (0..1). */
export function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const ga = bigrams(a);
  const gb = bigrams(b);
  let overlap = 0;
  for (const [g, n] of ga) overlap += Math.min(n, gb.get(g) ?? 0);
  return (2 * overlap) / (a.length - 1 + (b.length - 1));
}

// Sequel markers. "one"/"i"/"v"/"x" are left out: too often real words ("I, Robot", "X-Men").
const NUMBER_WORDS: Record<string, string> = {
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  zwei: '2',
  drei: '3',
  vier: '4',
  funf: '5',
  sechs: '6',
  sieben: '7',
  acht: '8',
  neun: '9',
  zehn: '10',
  ii: '2',
  iii: '3',
  iv: '4',
  vi: '6',
  vii: '7',
  viii: '8',
  ix: '9',
};

/** Writes sequel numbers as digits: "part two" / "part ii" / "teil zwei" / "part 02" -> "part 2". */
function digitsForNumbers(normalized: string): string {
  return normalized
    .split(' ')
    .map((w) => (/^\d+$/.test(w) ? String(Number(w)) : (NUMBER_WORDS[w] ?? w)))
    .join(' ');
}

function numbersIn(title: string): string {
  return title
    .split(' ')
    .filter((w) => /^\d+$/.test(w))
    .sort()
    .join(',');
}

/**
 * The normalized `long` is `short` plus a subtitle, and the raw title really breaks there
 * ("Family Guy Presents: It's a Trap!" is no "Family Guy" plus a subtitle).
 */
function addsSubtitle(short: string, long: string, longRaw: string): boolean {
  const head = digitsForNumbers(normalizeTitle(longRaw.split(/\s[-–—|]\s|:\s|\s\(/)[0]));
  return long.startsWith(short + ' ') && head === short;
}

/** `title` is `query` plus a subtitle: "Stranger Things: Fireplace" for "Stranger Things". */
export function extendsTitle(query: string, title: string): boolean {
  const x = digitsForNumbers(normalizeTitle(query));
  return !!x && addsSubtitle(x, digitsForNumbers(normalizeTitle(title)), title);
}

/** How alike two titles are, 0..1. Tolerates punctuation, spacing, accents and a missing subtitle. */
export function titleSimilarity(a: string, b: string): number {
  const x = digitsForNumbers(normalizeTitle(a));
  const y = digitsForNumbers(normalizeTitle(b));
  if (!x || !y) return 0;
  if (x === y) return 1;
  // "Dune" vs "Dune 2", "Blade Runner" vs "Blade Runner 2049": letters nearly identical, different film.
  const differentNumbers = numbersIn(x) !== numbersIn(y);
  const cx = x.replace(/ /g, '');
  const cy = y.replace(/ /g, '');
  if (cx === cy && !differentNumbers) return 0.98;
  let sim = diceCoefficient(cx, cy);
  // One title is the other plus a subtitle ("Die Unfassbaren" vs "Die Unfassbaren - Now You See Me").
  // Usually the same film; rankResults doubts it when the shorter title names other results too.
  const [short, long, longRaw] = x.length <= y.length ? [x, y, b] : [y, x, a];
  if (addsSubtitle(short, long, longRaw))
    sim = Math.max(sim, 0.8 + 0.2 * (short.length / long.length));
  return differentNumbers ? Math.min(sim, 0.7) : sim;
}
