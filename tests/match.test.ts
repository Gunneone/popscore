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
