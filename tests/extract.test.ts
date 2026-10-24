import { beforeEach, describe, expect, it } from 'vitest';
import { extractCandidates, inPageChrome, titleFromUrl } from '../src/detect/extract';
import { readStructured } from '../src/detect/structured';

function setBody(html: string) {
  document.body.innerHTML = html;
}

const q = (sel: string) => document.querySelector(sel)!;
const texts = (el: Element) => extractCandidates(el).map((c) => c.text);

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('extractCandidates', () => {
  it('reads streaming tiles via aria-label and alt text', () => {
    setBody(`
      <div class="row" aria-label="Trending Now">
        <div class="tile"><a href="/watch/1" aria-label="Die Unfassbaren"><div class="boxart"><img src="a.jpg" alt="Die Unfassbaren"></div></a></div>
        <div class="tile"><a href="/watch/2" aria-label="Barbie"><div class="boxart"><img src="b.jpg" alt="Barbie"></div></a></div>
      </div>`);
    const [top] = extractCandidates(q('img[alt="Die Unfassbaren"]'));
    expect(top.text).toBe('Die Unfassbaren');
    // aria-label and alt agree, so it outranks everything else.
    expect(top.weight).toBeGreaterThan(1);
  });

  it('reads Prime Video style tiles (title on a sibling button, link and data attribute)', () => {
    setBody(`
      <ul>
        <li><article data-card-title="Hurricane Heist [dt./OV]" data-card-entity-type="Movie">
          <section><div class="packshot">
            <button aria-label="Hurricane Heist [dt./OV]"></button>
            <a href="/detail/1" style="display:none">Hurricane Heist [dt./OV]</a>
            <div><picture><img src="x.jpg" alt=""></picture></div>
          </div></section>
        </article></li>
        <li><article data-card-title="Masterplan"><img src="y.jpg" alt=""></article></li>
      </ul>`);
    expect(texts(q('img'))[0]).toBe('Hurricane Heist');
  });

  it('reads Netflix style "Go to" link labels', () => {
    setBody(
      `<a href="/title/1" aria-label="Go to Back in Action"><span style="background-image:url(x.jpg)"></span></a>`,
    );
    expect(texts(q('span'))[0]).toBe('Back in Action');
  });

  it('strips accessibility sentences (Disney+ style)', () => {
    setBody(
      `<a class="tile" aria-label="Dune. Select for details on this title."><img src="x.jpg" alt=""></a>`,
    );
    expect(texts(q('img'))[0]).toBe('Dune');
  });

  it('finds the heading of a cinema listing item', () => {
    setBody(`
      <ul class="programme">
        <li class="movie"><img src="1.jpg" alt="Filmplakat: Dune: Part Two"><h3>Dune: Part Two</h3><span>FSK 12 · 166 Min</span><a href="/t">Tickets</a></li>
        <li class="movie"><img src="2.jpg" alt="Filmplakat: Wicked"><h3>Wicked</h3><span>FSK 6 · 160 Min</span><a href="/t">Tickets</a></li>
        <li class="movie"><img src="3.jpg" alt="Filmplakat: Barbie"><h3>Barbie</h3><span>FSK 6</span><a href="/t">Tickets</a></li>
      </ul>`);
    expect(texts(q('li:nth-child(2) h3'))[0]).toBe('Wicked');
    expect(texts(q('li:nth-child(1) img'))[0]).toBe('Dune: Part Two');
  });

  it('ignores the Tickets button text when hovering it', () => {
    setBody(`
      <div class="movie"><h2>Wicked (OV)</h2><a class="btn" href="/t">Tickets</a></div>
      <div class="movie"><h2>Barbie</h2><a class="btn" href="/t">Tickets</a></div>`);
    expect(texts(q('.movie a'))).toEqual(['Wicked']);
  });

  it("ignores a showtime group's version label (cinestar.de)", () => {
    setBody(`
      <div class="ShowtimeDayView"><div class="day">Heute</div>
        <div class="ShowtimeGroupView open">
          <div class="attributes">
            <div class="group-title">Original (Untertitel)</div>
            <img src="gb.svg" alt="English">
            <img src="2d.svg" alt="2D,English,OmU (Original mit Untertitel)">
            <img src="omu.svg" alt="2D,English,OmU (Original mit Untertitel)">
          </div>
          <div class="times"><div class="buttonOutter">
            <a class="timeButton" href="/t"><time>23:00</time><span class="recliner">Premium-Sitze<br>verfügbar</span></a>
          </div></div>
        </div>
      </div>`);
    expect(texts(q('.group-title'))).toEqual([]);
    expect(texts(q('time'))).toEqual([]);
  });

  it("uses the film link's URL when the banner only has a tagline (cinecitta.de)", () => {
    setBody(`
      <div class="slider">
        <a href="/film/avengers-doomsday/"><img src="a.jpg" alt="Dein Date mit Dr. Doom!"></a>
        <a href="/film/dune-part-three/"><img src="b.jpg" alt="Auf nach Arrakis!"></a>
      </div>`);
    expect(texts(q('img'))).toContain('avengers doomsday');
  });

  it('ignores a heading that names a row of tiles (filmingo.ch)', () => {
    setBody(`
      <section>
        <div class="row-head"><h2>Entertainment</h2><a href="/all">See all</a></div>
        <ul class="row">
          <li><a href="/film/a"><img alt="Ex Libris"></a></li>
          <li><a href="/film/b"><img alt="Primavera"></a></li>
          <li><a href="/film/c"><img alt="Ish"></a></li>
        </ul>
      </section>`);
    expect(texts(q('h2'))).toEqual([]);
  });

  it('keeps a hero heading that has a description under it', () => {
    setBody(`
      <div class="hero"><h2>Street Fighter</h2><p>In 1993, estranged Street Fighters Ryu and Ken are thrown back into combat.</p></div>
      <ul class="row">
        <li><a href="/film/a"><img alt="Wildwood"></a></li>
        <li><a href="/film/b"><img alt="Verity"></a></li>
        <li><a href="/film/c"><img alt="Whalefall"></a></li>
      </ul>`);
    expect(texts(q('h2'))[0]).toBe('Street Fighter');
  });

  it('does not pick a title from a whole list', () => {
    setBody(`<section><h2>Dune</h2><h2>Wicked</h2><h2>Barbie</h2></section>`);
    expect(texts(q('section'))).toEqual([]);
  });

  it('returns nothing for plain UI', () => {
    setBody(`<nav><button aria-label="Play">▶</button></nav>`);
    expect(texts(q('button'))).toEqual([]);
  });

  it('takes the year from structured data', () => {
    document.head.innerHTML = `<script type="application/ld+json">
      {"@context":"https://schema.org","@type":"ScreeningEvent","workPresented":{"@type":"Movie","name":"Dune: Part Two","datePublished":"2024-02-29"}}
    </script>`;
    setBody(`<div class="film"><h1>Dune: Part Two</h1></div>`);
    const structured = readStructured(document);
    const [top] = extractCandidates(q('h1'), { structured });
    expect(top).toMatchObject({ text: 'Dune: Part Two', year: 2024, softYear: true });
  });

  it('marks a show from a season label, a series link or structured data', () => {
    setBody(`
      <div class="tile" id="a"><a href="/watch/1"><img src="a.jpg" alt="Dark"><span>3 Staffeln</span></a></div>
      <div class="tile" id="b"><a href="/serien/babylon-berlin"><img src="b.jpg" alt="Babylon Berlin"></a></div>
      <div class="tile" id="c"><a href="/watch/3"><img src="c.jpg" alt="Barbie"></a></div>`);
    expect(extractCandidates(q('#a img'))[0]).toMatchObject({ text: 'Dark', series: true });
    expect(extractCandidates(q('#b img'))[0]).toMatchObject({
      text: 'Babylon Berlin',
      series: true,
    });
    expect(extractCandidates(q('#c img'))[0].series).toBeUndefined();

    document.head.innerHTML = `<script type="application/ld+json">{"@type":"TVSeries","name":"Barbie","startDate":"2019-01-01"}</script>`;
    const structured = readStructured(document);
    expect(extractCandidates(q('#c img'), { structured })[0]).toMatchObject({
      text: 'Barbie',
      series: true,
    });
  });
});

describe('readStructured', () => {
  it('reads Movie nodes inside @graph and arrays, and OpenGraph movies', () => {
    document.head.innerHTML = `
      <script type="application/ld+json">{"@graph":[{"@type":"WebPage"},{"@type":["Movie","CreativeWork"],"name":"Wicked","dateCreated":"2024-11-21"}]}</script>
      <script type="application/ld+json">not json</script>
      <meta property="og:type" content="video.movie"><meta property="og:title" content="Barbie">`;
    const info = readStructured(document);
    expect(info.titles).toEqual([
      { title: 'Wicked', year: 2024 },
      { title: 'Barbie', year: undefined },
    ]);
    expect(info.hasScreenings).toBe(false);
  });

  it('reads TV series, but not their seasons or episodes', () => {
    document.head.innerHTML = `
      <script type="application/ld+json">{"@type":"TVEpisode","name":"Secrets","partOfSeason":{"@type":"TVSeason","name":"Season 1"},"partOfSeries":{"@type":"TVSeries","name":"Dark","startDate":"2017-12-01"}}</script>
      <meta property="og:type" content="video.tv_show"><meta property="og:title" content="Babylon Berlin">`;
    expect(readStructured(document).titles).toEqual([
      { title: 'Dark', year: 2017, series: true },
      { title: 'Babylon Berlin', year: undefined, series: true },
    ]);
  });
});

describe('inPageChrome', () => {
  it("treats the site's navigation and footer as chrome", () => {
    setBody(`
      <header id="banner"><a href="/" id="logo">Hoyts</a><nav><a id="menu" href="/movies">Movies</a></nav></header>
      <main><section><header id="hero"><h1>Street Fighter</h1></header>
        <article><a id="tile" href="/movies/wildwood"><img alt="Wildwood"></a><footer id="tile-footer">PG · 2h</footer></article>
      </section></main>
      <footer><h4>About Us</h4><a id="careers" href="/careers">Careers</a></footer>`);
    expect(inPageChrome(q('#menu'))).toBe(true);
    expect(inPageChrome(q('#logo'))).toBe(true);
    expect(inPageChrome(q('#careers'))).toBe(true);
    expect(inPageChrome(q('#hero h1'))).toBe(false);
    expect(inPageChrome(q('#tile img'))).toBe(false);
    expect(inPageChrome(q('#tile-footer'))).toBe(false);
  });

  it('recognizes menus built without nav elements (werstreamt.es, filmfriend.de, filmingo.ch)', () => {
    setBody(`
      <header><div class="row"><ul class="inline-list"><li><a id="a" href="/service/">Service</a></li><li><a href="/x">X</a></li></ul></div></header>
      <navigation-bar><a id="b" href="/collections">Collections</a></navigation-bar>
      <div class="header"><div class="header__navbar"><a id="c" href="/en/entertainment">Entertainment</a></div></div>
      <div class="main-menu__sections"><a id="d" href="/x">Kids</a></div>
      <div class="site-footer"><a id="e" href="/about">About</a></div>
      <div class="card"><div class="card-footer" id="f">Wildwood</div></div>
      <div class="swiper-navigation"><button id="g">›</button></div>`);
    for (const id of ['a', 'b', 'c', 'd', 'e']) expect(inPageChrome(q(`#${id}`)), id).toBe(true);
    expect(inPageChrome(q('#f'))).toBe(false);
    expect(inPageChrome(q('#g'))).toBe(false);
  });

  it('does not treat a header without navigation as chrome', () => {
    setBody(`<header class="hero"><h2>Dune: Part Three</h2></header>`);
    expect(inPageChrome(q('h2'))).toBe(false);
  });
});

describe('titleFromUrl', () => {
  const base = 'https://www.example.de/';
  it.each([
    ['/kino-dortmund/film/primetime', 'primetime'],
    ['/film/avengers-doomsday/', 'avengers doomsday'],
    ['/movies/12345-dune-part-two/tickets', 'dune part two'],
    ['/filme/shaun-das-schaf-spuk-im-kuerbisfeld-2026', 'shaun das schaf spuk im kuerbisfeld'],
    ['https://www.cinemaxx.de/film/street-fighter_a1b2c3d4e5', 'street fighter'],
  ])('%j -> %j', (href, title) => {
    expect(titleFromUrl(href, base)).toEqual({ title, series: false });
  });

  it.each([
    ['/serien/babylon-berlin', 'babylon berlin'],
    ['/de/serie/dark', 'dark'],
    ['/series/the-bear/a1b2c3d4e5f6', 'the bear'],
    ['/tv-shows/fargo', 'fargo'],
  ])('%j -> %j, a series', (href, title) => {
    expect(titleFromUrl(href, base)).toEqual({ title, series: true });
  });

  it.each([
    '/title/81234567',
    '/film?category=now',
    '/programm/heute',
    '/films/',
    '/',
    // Cinemas link screenings this way, broadcasters whole sections.
    '/show/12345',
    '/play/tv/sendungen',
  ])('ignores %j', (href) => {
    expect(titleFromUrl(href, base)).toBeNull();
  });
});
