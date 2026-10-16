import { beforeEach, describe, expect, it } from 'vitest';
import { extractCandidates } from '../src/detect/extract';
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
    expect(top).toMatchObject({ text: 'Dune: Part Two', year: 2024 });
  });
});

describe('readStructured', () => {
  it('reads Movie nodes inside @graph and arrays, and OpenGraph movies', () => {
    document.head.innerHTML = `
      <script type="application/ld+json">{"@graph":[{"@type":"WebPage"},{"@type":["Movie","CreativeWork"],"name":"Wicked","dateCreated":"2024-11-21"}]}</script>
      <script type="application/ld+json">not json</script>
      <meta property="og:type" content="video.movie"><meta property="og:title" content="Barbie">`;
    const info = readStructured(document);
    expect(info.movies).toEqual([
      { title: 'Wicked', year: 2024 },
      { title: 'Barbie', year: undefined },
    ]);
    expect(info.hasScreenings).toBe(false);
  });
});
