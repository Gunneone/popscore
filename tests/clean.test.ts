import { describe, expect, it } from 'vitest';
import { cleanSegments, cleanTitle } from '../src/detect/clean';

describe('cleanTitle', () => {
  it.each([
    ['Dune: Part Two (OV)', 'Dune: Part Two'],
    ['Dune: Part Two - OmU', 'Dune: Part Two'],
    ['Avatar: The Way of Water 3D', 'Avatar: The Way of Water'],
    ['IMAX: Oppenheimer', 'Oppenheimer'],
    ['Vorpremiere: Wicked', 'Wicked'],
    ['Ladies Night: Wicked', 'Wicked'],
    ['Barbie FSK 6', 'Barbie'],
    ['Barbie (ab 6)', 'Barbie'],
    ['Watch now: Dune', 'Dune'],
    ['Jetzt ansehen - Dune', 'Dune'],
    ['Dune. Select for details on this title.', 'Dune'],
    ['Mission: Impossible – The Final Reckoning', 'Mission: Impossible – The Final Reckoning'],
    ['Der Herr der Ringe: Die Gefährten (Extended Edition)', 'Der Herr der Ringe: Die Gefährten'],
    ['Filmplakat: Die Unfassbaren', 'Die Unfassbaren'],
    ['Poster zu Zoomania 2', 'Zoomania 2'],
    ['Zoomania 2 Poster', 'Zoomania 2'],
    ['Undercover', 'Undercover'],
    ['Season of the Witch', 'Season of the Witch'],
    ['Fack ju Göhte 3', 'Fack ju Göhte 3'],
    ['1917', '1917'],
    ['300', '300'],
    ['  „Das Boot“  ', 'Das Boot'],
    // Seen on cinestar.de:
    ['"Der Herr der Ringe"-Trilogie', 'Der Herr der Ringe-Trilogie'],
    ['CineSpecial: Halloween - Die Nacht des Grauens (4K)', 'Halloween - Die Nacht des Grauens'],
    [
      'CineSpecial: Ozzy &amp; Black Sabbath: Back To The Beginning',
      'Ozzy & Black Sabbath: Back To The Beginning',
    ],
    ['Stray Kids World Tour LIVE VIEWING – CineSpecial', 'Stray Kids World Tour LIVE VIEWING'],
    ['Preview: Dune: Part Three', 'Dune: Part Three'],
    ['Rodychi - Verwandte (ukr. OmeU)', 'Rodychi - Verwandte'],
    ['Sneakers', 'Sneakers'],
    // Seen on cinemaxx.de and cineplex.de:
    ['SPARKLE PREVIEW: Der perfekte Urlaub', 'Der perfekte Urlaub'],
    ['Mehr über Street Fighter', 'Street Fighter'],
    ['Banner zu Street Fighter', 'Street Fighter'],
    ['Banner zur Emotions Preview: Der perfekte Urlaub', 'Der perfekte Urlaub'],
    ['Mission: Impossible', 'Mission: Impossible'],
  ])('%j -> %j', (raw, title) => {
    expect(cleanTitle(raw)?.title).toBe(title);
  });

  it('keeps a bracketed year as a hint', () => {
    expect(cleanTitle('Oppenheimer (2023)')).toEqual({ title: 'Oppenheimer', year: 2023 });
    expect(cleanTitle('Dune [1984] OV')).toEqual({ title: 'Dune', year: 1984 });
  });

  it.each([
    'Sneak Preview',
    'Sneak Preview (OV)',
    'CineSneak OV: The original surprise preview',
    'Stranger Things Staffel 4',
    'The Crown: Season 2',
    'Folge 3',
    'S01:E04',
    'Dark (Miniserie)',
    'Jetzt ansehen',
    'Tickets',
    'Trailer',
    'OmU',
    '20:15',
    '12,90 €',
    '166 Min',
    '7.8',
    '12',
    '',
    '   ',
    '—',
    'A'.repeat(90),
    'This is a long sentence describing the plot of a film in a lot of words here',
  ])('rejects %j', (raw) => {
    expect(cleanTitle(raw)).toBeNull();
  });
});

describe('cleanSegments', () => {
  it('pulls the title out of a multi-line tile', () => {
    expect(cleanSegments('Dune: Part Two\nFSK 12 · 166 Min\nTickets')).toEqual([
      { title: 'Dune: Part Two' },
    ]);
  });

  it('splits on separators', () => {
    expect(cleanSegments('Wicked | Tickets').map((c) => c.title)).toEqual(['Wicked']);
  });
});
