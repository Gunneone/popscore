export interface StructuredInfo {
  /** Movies described by JSON-LD or OpenGraph on this page. */
  movies: { title: string; year?: number }[];
  /** Page lists screenings (schema.org ScreeningEvent), i.e. it's a cinema page. */
  hasScreenings: boolean;
}

function types(node: Record<string, unknown>): string[] {
  const t = node['@type'];
  return Array.isArray(t) ? t.map(String) : t ? [String(t)] : [];
}

function yearFrom(v: unknown): number | undefined {
  const m = typeof v === 'string' ? /\b(19|20)\d{2}\b/.exec(v) : null;
  return m ? Number(m[0]) : undefined;
}

export function readStructured(doc: Document): StructuredInfo {
  const info: StructuredInfo = { movies: [], hasScreenings: false };
  const seen = new Set<string>();
  const addMovie = (title: unknown, year?: number) => {
    if (typeof title !== 'string' || !title.trim() || seen.has(title)) return;
    seen.add(title);
    info.movies.push({ title: title.trim(), year });
  };

  const visit = (node: unknown, depth: number): void => {
    if (depth > 8 || node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((n) => visit(n, depth + 1));
      return;
    }
    const obj = node as Record<string, unknown>;
    const t = types(obj);
    if (t.includes('ScreeningEvent')) info.hasScreenings = true;
    if (t.includes('Movie')) {
      addMovie(obj.name, yearFrom(obj.datePublished) ?? yearFrom(obj.dateCreated));
    }
    for (const v of Object.values(obj)) visit(v, depth + 1);
  };

  for (const script of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      visit(JSON.parse(script.textContent ?? ''), 0);
    } catch {
      // Malformed JSON-LD is common; ignore it.
    }
  }

  const ogType = doc.querySelector('meta[property="og:type"]')?.getAttribute('content') ?? '';
  const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content');
  if (ogType.startsWith('video.movie') && ogTitle) addMovie(ogTitle);
  return info;
}
