import { beforeEach, describe, expect, it } from 'vitest';
import { findSeeds, isBlurred, isSvgFile, tagPlacement } from '../../src/detect/scan';

const q = (sel: string) => document.querySelector(sel)!;

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('findSeeds', () => {
  it('takes poster images, and no separate title link in their tile', () => {
    document.body.innerHTML = `
      <ul>
        <li><a href="/film/dune"><img id="dune" src="d.jpg" alt="Dune"></a>
          <h3><a href="/film/dune">Dune</a></h3></li>
        <li><a href="/film/barbie"><img id="barbie" src="b.jpg" alt="Barbie"></a>
          <h3><a href="/film/barbie">Barbie</a></h3></li>
      </ul>`;
    expect(findSeeds(document.body).map((s) => s.id)).toEqual(['dune', 'barbie']);
  });

  it('takes film links in text listings', () => {
    document.body.innerHTML = `
      <img src="hero.jpg" alt="Kinoprogramm">
      <ul>
        <li><a id="a" href="/film/oppenheimer">Oppenheimer</a> 20:15</li>
        <li><a id="b" href="/film/barbie">Barbie</a> 21:00</li>
        <li><a href="/kontakt">Kontakt</a></li>
      </ul>`;
    const ids = findSeeds(document.body).map((s) => s.id || s.tagName);
    expect(ids).toEqual(['IMG', 'a', 'b']);
  });

  it("doesn't count an image elsewhere on the page as the link's poster", () => {
    document.body.innerHTML = `
      <img src="hero.jpg" alt="Kinoprogramm">
      <p>Auch im Programm: <a id="link" href="/film/oppenheimer">Oppenheimer</a></p>`;
    expect(findSeeds(document.body).map((s) => s.id || s.tagName)).toEqual(['IMG', 'link']);
  });

  it('skips images and links in menus and footers', () => {
    document.body.innerHTML = `
      <nav><a href="/film/dune"><img src="logo.png" alt="Logo"></a><a href="/film/barbie">Barbie</a></nav>
      <main><a href="/film/dune"><img id="poster" src="d.jpg" alt="Dune"></a></main>
      <footer><img src="partner.png" alt="Partner"></footer>`;
    expect(findSeeds(document.body).map((s) => s.id)).toEqual(['poster']);
  });

  it("skips links about the page's own film", () => {
    history.replaceState(null, '', '/film/scott-pilgrim-vs-the-world/');
    document.body.innerHTML = `
      <img id="poster" src="p.jpg" alt="Scott Pilgrim vs. the World">
      <a href="/film/scott-pilgrim-vs-the-world/cast/">Cast</a>
      <a href="/film/scott-pilgrim-vs-the-world/ratings/">3.9</a>
      <a href="/someone/film/scott-pilgrim-vs-the-world/">Review by someone</a>
      <a href="#">Mobile site</a>
      <a id="similar" href="/film/high-fidelity/">High Fidelity</a>`;
    expect(findSeeds(document.body).map((s) => s.id)).toEqual(['poster', 'similar']);
    history.replaceState(null, '', '/');
  });

  it('only returns what it has not looked at before', () => {
    document.body.innerHTML = `<a href="/film/dune"><img id="one" src="d.jpg" alt="Dune"></a>`;
    const checked = new WeakSet<Element>();
    expect(findSeeds(document.body, checked)).toHaveLength(1);
    document.body.insertAdjacentHTML('beforeend', `<img id="two" src="b.jpg" alt="Barbie">`);
    expect(findSeeds(document.body, checked).map((s) => s.id)).toEqual(['two']);
  });
});

describe('isSvgFile', () => {
  it('tells badges and logos from posters', () => {
    const img = (src: string) => Object.assign(document.createElement('img'), { src });
    // schauburg-kino.com's ribbon over posters that show with the Greta app:
    expect(isSvgFile(img('/theme/solar/img/greta-banner.svg'))).toBe(true);
    expect(isSvgFile(img('https://cdn.example.com/logo.SVG?v=2'))).toBe(true);
    expect(isSvgFile(img('https://cdn.cineweb.de/media/filmbilder/330/413884/1.jpg'))).toBe(false);
    // A lazy loader's placeholder, until the poster loads:
    expect(isSvgFile(img('data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E'))).toBe(
      false,
    );
    expect(isSvgFile(document.createElement('img'))).toBe(false);
  });
});

describe('isBlurred', () => {
  it('tells a blurred backdrop copy from the poster', () => {
    // schauburg-kino.com draws a scaled-up, blurred copy of every poster behind it:
    document.body.innerHTML = `
      <style>.movie-poster .blurred-img { filter: blur(0.5rem); transform: scale(1.2); }</style>
      <div class="movie-poster">
        <div><img id="poster" src="1.jpg" alt="Vaterland"></div>
        <img id="backdrop" class="blurred-img" src="1.jpg" alt="Vaterland">
        <img id="faded" style="filter: grayscale(1) blur(4px)" src="2.jpg" alt="Rocky">
        <img id="tinted" style="filter: brightness(0.8)" src="3.jpg" alt="Alte Liebe">
      </div>`;
    expect(isBlurred(q('#poster'))).toBe(false);
    expect(isBlurred(q('#backdrop'))).toBe(true);
    expect(isBlurred(q('#faded'))).toBe(true);
    expect(isBlurred(q('#tinted'))).toBe(false);
  });
});

describe('tagPlacement', () => {
  it('puts the tag on the poster for images, after the title for links', () => {
    document.body.innerHTML = `
      <img id="poster" src="d.jpg" alt="Dune">
      <a id="plain" href="/film/barbie">Barbie</a>
      <a id="block" href="/film/oppenheimer"><h3>Oppenheimer</h3><p>Biopic, 180 min</p></a>`;
    expect(tagPlacement(q('#poster'))).toEqual({ kind: 'poster', img: q('#poster') });
    expect(tagPlacement(q('#plain'))).toEqual({ kind: 'title', el: q('#plain') });
    expect(tagPlacement(q('#block'))).toEqual({ kind: 'title', el: q('#block h3') });
  });
});
