export interface StructuredInfo {
  /** Movies and TV shows described by JSON-LD or OpenGraph on this page. */
  titles: { title: string; year?: number; series?: boolean }[];
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
  const info: StructuredInfo = { titles: [], hasScreenings: false };
  const seen = new Set<string>();
  const addTitle = (title: unknown, year?: number, series = false) => {
    if (typeof title !== 'string' || !title.trim() || seen.has(title)) return;
    seen.add(title);
    info.titles.push(
      series ? { title: title.trim(), year, series } : { title: title.trim(), year },
    );
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
      addTitle(obj.name, yearFrom(obj.datePublished) ?? yearFrom(obj.dateCreated));
    }
    // Not TVSeason or TVEpisode: their names aren't the show's.
    if (t.includes('TVSeries')) {
      addTitle(obj.name, yearFrom(obj.startDate) ?? yearFrom(obj.datePublished), true);
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
  if (ogType.startsWith('video.movie') && ogTitle) addTitle(ogTitle);
  if (ogType.startsWith('video.tv_show') && ogTitle) addTitle(ogTitle, undefined, true);
  return info;
}
