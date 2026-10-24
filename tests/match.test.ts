import { describe, expect, it } from 'vitest';
import { normalizeTitle, titleSimilarity } from '../src/match/normalize';
import { CONFIDENT_SIMILARITY, rankResults } from '../src/match/score';
import type { MovieSummary } from '../src/types';

describe('normalizeTitle', () => {
  it.each([
    ['Die Unfassbaren', 'unfassbaren'],
    ['Amélie', 'amelie'],
    ['Fack ju Göhte', 'fack ju gohte'],
    ['Fast & Furious', 'fast and furious'],
    ['Minions + Monster', 'minions and monster'],
    ['Schlaf und Schlaflos', 'schlaf and schlaflos'],
    ["Ocean's Eleven", 'oceans eleven'],
    ['Die Straße', 'strasse'],
    ['Mission: Impossible – Dead Reckoning', 'mission impossible dead reckoning'],
  ])('%j -> %j', (raw, norm) => {
    expect(normalizeTitle(raw)).toBe(norm);
  });
});

describe('titleSimilarity', () => {
  it('treats punctuation, case and spacing as equal', () => {
    expect(titleSimilarity('Spider-Man: No Way Home', 'Spider Man No Way Home')).toBe(1);
    expect(titleSimilarity('Spider-Man', 'Spiderman')).toBeGreaterThanOrEqual(0.98);
  });

  it('accepts a German title with the original appended', () => {
    expect(
      titleSimilarity('Die Unfassbaren', 'Die Unfassbaren - Now You See Me'),
    ).toBeGreaterThanOrEqual(CONFIDENT_SIMILARITY);
  });

  it('doesn\'t treat a spin-off\'s title as a subtitle (disneyplus.com: "Family Guy" tile)', () => {
    expect(titleSimilarity('Family Guy', "Family Guy Presents: It's a Trap!")).toBeLessThan(
      CONFIDENT_SIMILARITY,
    );
    expect(titleSimilarity('Heldin', 'Heldin: Late Shift')).toBeGreaterThanOrEqual(
      CONFIDENT_SIMILARITY,
    );
  });

  it('scores different films low', () => {
    expect(titleSimilarity('Barbie', 'Oppenheimer')).toBeLessThan(0.3);
  });

  it('tolerates small typos', () => {
    expect(titleSimilarity('Oppenhiemer', 'Oppenheimer')).toBeGreaterThanOrEqual(0.7);
  });

  it('keeps sequels apart', () => {
    expect(titleSimilarity('Die Unfassbaren', 'Die Unfassbaren 2')).toBeLessThan(
      CONFIDENT_SIMILARITY,
    );
    expect(titleSimilarity('Blade Runner', 'Blade Runner 2049')).toBeLessThan(CONFIDENT_SIMILARITY);
    expect(titleSimilarity('Fack ju Göhte', 'Fack ju Göhte 3')).toBeLessThan(CONFIDENT_SIMILARITY);
  });

  it('reads written and roman sequel numbers as digits', () => {
    expect(titleSimilarity('Dune: Part Two', 'Dune: Part 2')).toBeGreaterThanOrEqual(
      CONFIDENT_SIMILARITY,
    );
    expect(titleSimilarity('Der Pate II', 'Der Pate 2')).toBeGreaterThanOrEqual(
      CONFIDENT_SIMILARITY,
    );
    expect(titleSimilarity('Zoomania 2', 'Zoomania 2')).toBe(1);
  });
});

const movie = (
  m: Partial<MovieSummary> & Pick<MovieSummary, 'tmdbId' | 'title'>,
): MovieSummary => ({
  kind: 'movie',
  originalTitle: m.title,
  popularity: 10,
  voteCount: 1000,
  ...m,
});

describe('rankResults', () => {
  const now = new Date('2026-10-16');
  const dune2021 = movie({
    tmdbId: 1,
    title: 'Dune',
    year: 2021,
    releaseDate: '2021-09-15',
    voteCount: 13000,
  });
  const dune1984 = movie({
    tmdbId: 2,
    title: 'Dune',
    year: 1984,
    releaseDate: '1984-12-14',
    voteCount: 2700,
  });

  it('prefers the more popular film when titles tie', () => {
    const [top] = rankResults('Dune', undefined, [dune1984, dune2021], { cinema: false, now });
    expect(top.movie.tmdbId).toBe(1);
    expect(top.confident).toBe(true);
  });

  it('follows the year hint', () => {
    const [top] = rankResults('Dune', 1984, [dune2021, dune1984], { cinema: false, now });
    expect(top.movie.tmdbId).toBe(2);
  });

  it('favors current releases on cinema pages', () => {
    const remake = movie({
      tmdbId: 3,
      title: 'Dune',
      year: 2026,
      releaseDate: '2026-09-01',
      voteCount: 40,
    });
    const [top] = rankResults('Dune', undefined, [dune2021, remake], { cinema: true, now });
    expect(top.movie.tmdbId).toBe(3);
    expect(top.confident).toBe(true);
  });

  it('is not confident about obscure exact matches (UI words like "Play")', () => {
    const obscure = movie({
      tmdbId: 4,
      title: 'Play',
      year: 2011,
      releaseDate: '2011-01-01',
      voteCount: 3,
    });
    const [top] = rankResults('Play', undefined, [obscure], { cinema: false, now });
    expect(top.confident).toBe(false);
  });

  it('does not match TV movies on cinema pages', () => {
    const tvMovie = movie({
      tmdbId: 5,
      title: 'The Original+',
      year: 2026,
      releaseDate: '2026-06-01',
      voteCount: 0,
      tvMovie: true,
    });
    const [top] = rankResults('Original', undefined, [tvMovie], { cinema: true, now });
    expect(top.confident).toBe(false);
    // Elsewhere (streaming sites) they're fair game.
    const remake = { ...tvMovie, voteCount: 500 };
    expect(
      rankResults('The Original+', undefined, [remake], { cinema: false, now })[0].confident,
    ).toBe(true);
  });

  it('ranks a theatrical film above a TV movie of the same name on cinema pages', () => {
    const film = movie({
      tmdbId: 6,
      title: 'Primetime',
      year: 2026,
      releaseDate: '2026-09-24',
      voteCount: 20,
    });
    const tv = movie({
      tmdbId: 7,
      title: 'Primetime',
      year: 2026,
      releaseDate: '2026-02-01',
      voteCount: 30,
      tvMovie: true,
    });
    const [top] = rankResults('Primetime', undefined, [tv, film], { cinema: true, now });
    expect(top.movie.tmdbId).toBe(6);
    expect(top.confident).toBe(true);
  });

  it('is not confident about a show\'s special when the query names a series ("Stranger Things" tile)', () => {
    // TMDB's top results for "Stranger Things" (de-DE), all filed as movies.
    const results = [
      movie({
        tmdbId: 1610413,
        title: 'Ein letztes Abenteuer: Making Stranger Things 5',
        originalTitle: 'One Last Adventure: The Making of Stranger Things 5',
        year: 2026,
        releaseDate: '2026-01-11',
        voteCount: 98,
      }),
      movie({
        tmdbId: 1594337,
        title: 'Stranger Things: Kaminfeuer',
        originalTitle: 'Stranger Things: Fireplace',
        year: 2025,
        releaseDate: '2025-12-01',
        voteCount: 84,
      }),
      movie({
        tmdbId: 182026,
        title: 'Stranger Things',
        year: 2013,
        releaseDate: '2013-04-05',
        voteCount: 81,
      }),
      movie({
        tmdbId: 1455575,
        title: 'Hinter den Kulissen von Stranger Things: The First Shadow',
        originalTitle: 'Behind the Curtain: Stranger Things: The First Shadow',
        year: 2025,
        releaseDate: '2025-04-14',
        voteCount: 36,
      }),
      movie({ tmdbId: 1633210, title: 'Stranger Things: The First Shadow', voteCount: 0 }),
      movie({
        tmdbId: 1664583,
        title: "Stranger Things: Tales from '85 Theatrical Preview",
        year: 2026,
        releaseDate: '2026-04-18',
        voteCount: 3,
      }),
    ];
    const [top] = rankResults('Stranger Things', undefined, results, { cinema: true, now });
    expect(top.confident).toBe(false);
    // A subtitle the query alone names is still fine: German title plus the original.
    const unfassbaren = movie({
      tmdbId: 75656,
      title: 'Die Unfassbaren - Now You See Me',
      originalTitle: 'Now You See Me',
      year: 2013,
      releaseDate: '2013-05-29',
    });
    const sequel = movie({ tmdbId: 291805, title: 'Die Unfassbaren 2', year: 2016 });
    const [film] = rankResults('Die Unfassbaren', undefined, [unfassbaren, sequel], {
      cinema: true,
      now,
    });
    expect(film.movie.tmdbId).toBe(75656);
    expect(film.confident).toBe(true);
  });

  it('is not confident when the year hint is far off', () => {
    const [top] = rankResults('Dune', 1999, [dune2021], { cinema: false, now });
    expect(top.confident).toBe(false);
  });

  it("doesn't reject on a soft year from structured data (sbs.com.au dates films by when it added them)", () => {
    const [top] = rankResults('Dune', 2026, [dune2021], { cinema: false, now, softYear: true });
    expect(top.confident).toBe(true);
  });

  const dark = movie({
    kind: 'tv',
    tmdbId: 70523,
    title: 'Dark',
    year: 2017,
    releaseDate: '2017-12-01',
    voteCount: 7000,
  });

  it("accepts a later season's year for a show, but not a year before it started", () => {
    expect(rankResults('Dark', 2020, [dark], { cinema: false, now })[0].confident).toBe(true);
    expect(rankResults('Dark', 2016, [dark], { cinema: false, now })[0].confident).toBe(true);
    expect(rankResults('Dark', 2010, [dark], { cinema: false, now })[0].confident).toBe(false);
    // A film's year still has to fit.
    const film = { ...dark, kind: 'movie' as const };
    expect(rankResults('Dark', 2020, [film], { cinema: false, now })[0].confident).toBe(false);
  });

  it('does not match TV shows on cinema pages', () => {
    const [top] = rankResults('Dark', undefined, [dark], { cinema: true, now });
    expect(top.confident).toBe(false);
    expect(rankResults('Dark', undefined, [dark], { cinema: false, now })[0].confident).toBe(true);
  });
});

describe('rankResults with a TV series of the same name', () => {
  const now = new Date('2026-10-24');
  const streaming = { cinema: false, now };
  // TMDB's de-DE movie results (October 2026): [id, title, original title, release date, votes, popularity].
  type Row = [number, string, string, string, number, number];
  const results = (rows: Row[]) =>
    rows.map(([tmdbId, title, originalTitle, releaseDate, voteCount, popularity]) =>
      movie({
        tmdbId,
        title,
        originalTitle,
        releaseDate: releaseDate || undefined,
        year: releaseDate ? Number(releaseDate.slice(0, 4)) : undefined,
        voteCount,
        popularity,
      }),
    );

  // prettier-ignore
  const SEARCH: Record<string, Row[]> = {
    'Stranger Things': [
      [1594337, 'Stranger Things: Kaminfeuer', 'Stranger Things: Fireplace', '2025-12-01', 84, 0.8],
      [182026, 'Stranger Things', 'Stranger Things', '2013-04-05', 81, 1.2],
      [1633210, 'Stranger Things: The First Shadow', 'Stranger Things: The First Shadow', '', 0, 2.4],
    ],
    Friends: [
      [10033, 'Just Friends - No Sex', 'Just Friends', '2005-11-23', 1875, 6],
      [691179, 'Friends: The Reunion', 'Friends: The Reunion', '2021-05-27', 1394, 6],
    ],
    'Haus des Geldes': [
      [689249, 'Haus des Geldes: Das Phänomen', 'La Casa de Papel: el fenómeno', '2020-04-03', 1092, 3.8],
      [1580700, 'The House of Gold', 'The House of Gold', '1918-06-17', 0, 1.1],
    ],
    Wednesday: [
      [19703, 'A Wednesday!', 'A Wednesday!', '2008-09-05', 380, 1.6],
      [18387, 'Tag der Entscheidung', 'Big Wednesday', '1978-05-26', 198, 2.7],
      [716602, 'Wednesday', 'Wednesday', '2020-06-19', 0, 1.3],
    ],
    'The Chosen': [
      [1380405, 'The Chosen: Das letzte Abendmahl', 'The Chosen: Last Supper', '2025-03-27', 10, 2.2],
      [25773, 'Die Erwählten', 'The Chosen', '1981-08-20', 30, 2.2],
      [346170, 'The Chosen', 'The Chosen', '2015-07-23', 67, 1.3],
    ],
    Avatar: [
      [19995, 'Avatar - Aufbruch nach Pandora', 'Avatar', '2009-12-16', 34901, 38.1],
      [83533, 'Avatar: Fire and Ash', 'Avatar: Fire and Ash', '2025-12-17', 4578, 66.3],
    ],
    Wicked: [
      [402431, 'Wicked', 'Wicked', '2024-10-16', 3296, 26.7],
      [967941, 'Wicked: Teil 2', 'Wicked: For Good', '2025-11-19', 1199, 19.5],
    ],
    'Spider-Man': [
      [969681, 'Spider-Man: Brand New Day', 'Spider-Man: Brand New Day', '2026-07-29', 6032, 1138.7],
      [557, 'Spider-Man', 'Spider-Man', '2002-05-01', 21650, 47.5],
      [634649, 'Spider-Man: No Way Home', 'Spider-Man: No Way Home', '2021-12-15', 23413, 58.5],
    ],
    'Jurassic World': [
      [1234821, 'Jurassic World: Die Wiedergeburt', 'Jurassic World Rebirth', '2025-06-23', 3876, 35.9],
      [135397, 'Jurassic World', 'Jurassic World', '2015-06-06', 22052, 22.5],
    ],
    'Die Unfassbaren': [
      [75656, 'Die Unfassbaren', 'Now You See Me', '2013-05-29', 17268, 20.1],
      [291805, 'Die Unfassbaren 2', 'Now You See Me 2', '2016-06-02', 11909, 16.8],
    ],
    Heldin: [
      [1356670, 'Heldin', 'Heldin', '2025-02-27', 361, 6.2],
      [55107, 'Meine Heldin', "L'ennui", '1998-11-14', 56, 2.2],
    ],
    Zoomania: [
      [269149, 'Zoomania', 'Zootopia', '2016-02-11', 18659, 30.8],
      [1084242, 'Zoomania 2', 'Zootopia 2', '2025-11-26', 3609, 55.7],
    ],
    'Toy Story': [
      [862, 'Toy Story', 'Toy Story', '1995-11-22', 20726, 37],
      [1084244, 'Toy Story 5', 'Toy Story 5', '2026-06-17', 2699, 114.3],
    ],
    'Downton Abbey': [
      [535544, 'Downton Abbey', 'Downton Abbey', '2019-09-12', 1305, 8.4],
      [1289936, 'Downton Abbey: Das große Finale', 'Downton Abbey: The Grand Finale', '2025-09-10', 310, 11],
    ],
    Fargo: [
      [275, 'Fargo', 'Fargo', '1996-03-08', 9523, 15.3],
      [1243063, 'Fargo', 'Fargo', '2003-09-02', 8, 3.4],
    ],
    'Mr. & Mrs. Smith': [
      [787, 'Mr. & Mrs. Smith', 'Mr. & Mrs. Smith', '2005-06-07', 11621, 19.1],
      [24197, 'Mr. und Mrs. Smith', 'Mr. & Mrs. Smith', '1941-01-31', 264, 3.4],
    ],
  };

  // The series' TMDB popularity: from the weekly list, or TV search for "Haus des Geldes"
  // (listed as "La casa de papel").
  it.each([
    ['Stranger Things', 182026, 140.1],
    ['Friends', 691179, 139.6],
    ['Haus des Geldes', 689249, 36],
    ['Wednesday', 19703, 69.5],
    ['The Chosen', 346170, 95.6],
  ])(
    'is not confident about a film named like a far more popular series: %j',
    (q, id, popularity) => {
      const rows = results(SEARCH[q]);
      const [before] = rankResults(q, undefined, rows, streaming);
      expect(before.movie.tmdbId).toBe(id);
      expect(before.confident).toBe(true);
      expect(before.doubtful).toBe(true);
      const [top] = rankResults(q, undefined, rows, { ...streaming, series: { popularity } });
      expect(top.movie.tmdbId).toBe(id);
      expect(top.confident).toBe(false);
    },
  );

  // The popularity of the series TMDB has under exactly the film's name, if any.
  it.each([
    ['Avatar', 19995, undefined],
    ['Wicked', 402431, 1.4],
    ['Spider-Man', 557, 47.2],
    ['Jurassic World', 135397, undefined],
    ['Die Unfassbaren', 75656, 9.2],
    ['Heldin', 1356670, undefined],
    ['Zoomania', 269149, undefined],
    ['Toy Story', 862, undefined],
    // Judgment calls: the film has many votes, or the series isn't more popular.
    ['Fargo', 275, 96.9],
    ['Mr. & Mrs. Smith', 787, 15.6],
  ])('stays confident about the film %j', (q, id, popularity) => {
    const series = popularity === undefined ? undefined : { popularity };
    const [top] = rankResults(q, undefined, results(SEARCH[q]), { ...streaming, series });
    expect(top.movie.tmdbId).toBe(id);
    expect(top.confident).toBe(true);
  });

  it('gives way to the series when the film has few votes ("Downton Abbey", a judgment call)', () => {
    const rows = results(SEARCH['Downton Abbey']);
    const [top] = rankResults('Downton Abbey', undefined, rows, {
      ...streaming,
      series: { popularity: 67.1 },
    });
    expect(top.movie.tmdbId).toBe(535544);
    expect(top.confident).toBe(false);
  });

  it("keeps the film when the page's year fits it", () => {
    const rows = results(SEARCH['The Chosen']);
    const series = { popularity: 95.6 };
    const [top] = rankResults('The Chosen', 2015, rows, { ...streaming, series });
    expect(top.movie.tmdbId).toBe(346170);
    expect(top.confident).toBe(true);
    // A year from structured data may be when the site added the title: no proof of the film.
    const soft = rankResults('The Chosen', 2015, rows, { ...streaming, series, softYear: true });
    expect(soft[0].confident).toBe(false);
  });
});
