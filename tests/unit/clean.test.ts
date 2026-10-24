import { describe, expect, it } from 'vitest';
import { cleanSegments, cleanTitle } from '../../src/detect/clean';

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
    // Seen on landmarktheatres.com:
    ['See trailer of the movie - Clayface', 'Clayface'],
    ['Watch trailer for Wicker', 'Wicker'],
    ['Banner zu Street Fighter', 'Street Fighter'],
    ['Banner zur Emotions Preview: Der perfekte Urlaub', 'Der perfekte Urlaub'],
    ['Mission: Impossible', 'Mission: Impossible'],
    // Seen on uci-kinowelt.de:
    ['UCI KidsClub Frühstückskino: Marsupilami', 'Marsupilami'],
    // Seen on harkins.com:
    ['On-Screen Captions: Sense and Sensibility', 'Sense and Sensibility'],
    // Seen on ipic.com, landmarktheatres.com and eventcinemas.com.au:
    ['Street Fighter Movie Poster', 'Street Fighter'],
    ['Movie poster for Whalefall', 'Whalefall'],
    ['CLAYFACE A FILM BY JAMES WATKINS', 'CLAYFACE'],
    ['Heldin – ein Film von Petra Volpe', 'Heldin'],
    ['SENSE AND SENSIBILITY PG', 'SENSE AND SENSIBILITY'],
    ['Verity MA15+', 'Verity'],
    ['Malcolm X', 'Malcolm X'],
    ['Men in Black', 'Men in Black'],
    // Seen on rakuten.tv:
    ['toy-story-5 - Banner', 'toy story 5'],
    ['Last Man Down - movies', 'Last Man Down'],
    // Seen on netzkino.de and srf.ch:
    ['Movie_43_cover', 'Movie 43'],
    ['Fast verheiratet – Komödie mit Emily Blunt', 'Fast verheiratet'],
    ['Mission: Impossible – Dead Reckoning', 'Mission: Impossible – Dead Reckoning'],
    ['Spider-Man', 'Spider-Man'],
    ['Sensory Friendly Screening: Wildwood', 'Wildwood'],
    ['Music and Lyrics', 'Music and Lyrics'],
    ['Dune (Original mit Untertitel)', 'Dune'],
    // Titles that contain screening words but aren't made of them:
    ['Johnny English', 'Johnny English'],
    ['The Original', 'The Original'],
    ['The Menu', 'The Menu'],
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
    // Seasons and episodes with no show title in front:
    'Folge 3',
    'S01:E04',
    'Staffel 2',
    '3 Staffeln',
    'Jetzt ansehen',
    // Control labels (a cinestar.de notice's close button matched the film "Close"):
    'Close',
    'Schließen',
    'Menu',
    'Next',
    'Zurück',
    'Tickets',
    'Trailer',
    'OmU',
    // Version, language, format and seat labels (cinestar.de: "Original (Untertitel)"):
    'Original (Untertitel)',
    'Original',
    'Deutsch',
    'Englisch mit deutschen Untertiteln',
    'OV mit dt. UT',
    '2D,English,OmU (Original mit Untertitel)',
    'English (Subtitled)',
    '3D Dolby Atmos',
    'Premium-Sitze verfügbar',
    // Accessibility app badges (schauburg-kino.com: "GRETA" matched the 2018 film "Greta"):
    'GRETA',
    'Greta & Starks',
    // Genre tags (uci-kinowelt.de: "Familie" matched a 2025 film of that name):
    'Familie',
    'Buddy, Comedy, Animation, Fantasy',
    'Start',
    'Filme',
    'More',
    'Consent',
    'Entertainment',
    // myvue.com's cinema picker button matched the film "Go":
    'GO',
    'Accept All',
    'Get Started',
    'Alle akzeptieren',
    'Action, Thriller',
    'Science-Fiction',
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

describe('cleanTitle on TV shows', () => {
  it.each([
    ['Stranger Things Staffel 4', 'Stranger Things'],
    ['The Crown: Season 2', 'The Crown'],
    ['The Crown: Season 4, Episode 1', 'The Crown'],
    ['Dark 2. Staffel', 'Dark'],
    ['Dark (Miniserie)', 'Dark'],
    ['Chernobyl – Limited Series', 'Chernobyl'],
    ['Babylon Berlin S01:E04', 'Babylon Berlin'],
    ['Fargo | TV Show', 'Fargo'],
    ['Dark - Serien', 'Dark'],
  ])('%j -> %j, flagged as a series', (raw, title) => {
    expect(cleanTitle(raw)).toEqual({ title, series: true });
  });

  it('keeps titles that only look like seasons', () => {
    expect(cleanTitle('Season of the Witch')).toEqual({ title: 'Season of the Witch' });
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
