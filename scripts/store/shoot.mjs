// Store screenshots and promo tiles: runs the built Chrome extension on the demo pages in
// scripts/store/scenes with live TMDB/OMDb lookups, then frames the captures at the stores' sizes.
// Needs TMDB_KEY and OMDB_KEY in .env and a build: `npm run build && npm run store:assets`.
// Raw captures go to test-results/store-raw, the finished images to store/.
/* global chrome, document, innerHeight, innerWidth -- used in callbacks that run in the browser */
import { chromium } from '@playwright/test';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SCENES = path.join(import.meta.dirname, 'scenes');
const RAW = path.join(ROOT, 'test-results/store-raw');
const OUT = path.join(ROOT, 'store');
const DPR = 2;

const env = { ...process.env };
if (existsSync(path.join(ROOT, '.env'))) {
  for (const line of readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !env[m[1]]) env[m[1]] = m[2];
  }
}
if (!env.TMDB_KEY || !env.OMDB_KEY) throw new Error('Set TMDB_KEY and OMDB_KEY in .env');

// A copy of the build whose popup believes the active tab is the demo cinema: in a Playwright
// tab the popup page would otherwise be its own active tab.
const EXT = path.join(tmpdir(), 'popscore-store-ext');
rmSync(EXT, { recursive: true, force: true });
cpSync(path.join(ROOT, 'dist/chrome'), EXT, { recursive: true });
writeFileSync(
  path.join(EXT, 'store-shim.js'),
  `const q = new URLSearchParams(location.search);
chrome.tabs.query = async () => [{ id: 1, url: q.get('url'), favIconUrl: q.get('icon') ?? undefined }];`,
);
const popupHtml = path.join(EXT, 'popup.html');
writeFileSync(
  popupHtml,
  readFileSync(popupHtml, 'utf8').replace('<head>', '<head><script src="/store-shim.js"></script>'),
);

mkdirSync(RAW, { recursive: true });
mkdirSync(OUT, { recursive: true });

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  deviceScaleFactor: DPR,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
const extId = new URL(worker.url()).host;

/** The demo pages are served under built-in sites' domains, so the manifest's content script runs. */
const CINEMA_URL = 'https://www.cinestar.de/store-demo';
const STREAMING_URL = 'https://www.joyn.de/store-demo';
const KINO_URL = 'https://www.cinestar.de/store-kinoprogramm';
for (const [url, file] of [
  [CINEMA_URL, 'cinema.html'],
  [STREAMING_URL, 'streaming.html'],
  [KINO_URL, 'kino.html'],
]) {
  await context.route(`${url}*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: readFileSync(path.join(SCENES, file), 'utf8'),
    }),
  );
}

/** Shown in the popup as a site the user added. */
const DEMO_SITE = 'https://lumencinema.example/';
await worker.evaluate((settings) => chrome.storage.sync.set({ settings }), {
  tmdbKey: env.TMDB_KEY,
  omdbKey: env.OMDB_KEY,
  extraSites: [`${DEMO_SITE}*`],
});

// ---------------------------------------------------------------------------------------------
// Captures

async function open(url, { width, height, dark = false }) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height });
  await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
  await page.goto(url);
  await page.waitForLoadState('networkidle').catch(() => {});
  return page;
}

/** Waits until `count` score tags have their score. */
async function waitForTags(page, count) {
  await page
    .waitForFunction(
      (n) => document.querySelectorAll('popscore-tag[data-score]').length >= n,
      count,
      { timeout: 30_000 },
    )
    .catch(async () => {
      const tags = await page.$$eval('popscore-tag', (t) => t.map((e) => e.dataset.score));
      console.warn(`${page.url()}: ${tags.length} of ${count} tags (${tags.join(', ')})`);
    });
  await page.waitForTimeout(800);
}

/** Rests the pointer on `selector` until the card shows a match, with its poster loaded. */
async function hover(page, selector, position) {
  const box = await page.locator(selector).boundingBox();
  const x = box.x + (position?.x ?? box.width / 2);
  const y = box.y + (position?.y ?? box.height / 2);
  await page.mouse.move(x - 20, y - 20);
  await page.mouse.move(x, y, { steps: 5 });
  await page.waitForSelector('popscore-card[data-state="match"]', {
    state: 'attached',
    timeout: 20_000,
  });
  await page.waitForTimeout(1500);
  return { x, y };
}

/** The card's box: its shadow root is closed, so it's found by hit-testing the viewport. */
function cardBox(page) {
  return page.evaluate(() => {
    let box = null;
    for (let y = 0; y < innerHeight; y += 4) {
      for (let x = 0; x < innerWidth; x += 4) {
        if (document.elementFromPoint(x, y)?.tagName !== 'POPSCORE-CARD') continue;
        box ??= { left: x, top: y, right: x, bottom: y };
        box.left = Math.min(box.left, x);
        box.right = Math.max(box.right, x);
        box.bottom = Math.max(box.bottom, y);
      }
    }
    return box;
  });
}

/** Draws a mouse pointer at (x, y): screenshots have none. */
async function drawPointer(page, { x, y }, hand = false) {
  const arrow =
    '<path d="M1 1 L1 17 L5.2 13.2 L8 19.5 L10.6 18.4 L7.9 12.3 L13.5 12.3 Z" fill="#000" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>';
  const finger =
    '<path d="M6.2 1.5c-1 0-1.7.8-1.7 1.7v8.2l-1-1c-.7-.7-1.8-.7-2.4 0-.6.6-.6 1.6-.1 2.3l3.9 5.3c.9 1.2 2.3 1.9 3.8 1.9h3.1c2.6 0 4.7-2.1 4.7-4.7V10c0-.9-.7-1.6-1.6-1.6-.4 0-.8.2-1 .4-.2-.7-.9-1.2-1.6-1.2-.4 0-.8.2-1.1.4-.3-.6-.9-1-1.5-1-.3 0-.6.1-.9.2V3.2c0-.9-.7-1.7-1.6-1.7z" fill="#fff" stroke="#000" stroke-width="1.2"/>';
  await page.evaluate(
    ({ x, y, svg, hand }) => {
      const el = document.createElement('div');
      el.innerHTML = `<svg width="22" height="24" viewBox="0 0 22 24">${svg}</svg>`;
      el.style.cssText = `position:fixed;left:${x - (hand ? 6 : 1)}px;top:${y - 1}px;z-index:2147483647;pointer-events:none;filter:drop-shadow(0 1px 1px rgb(0 0 0 / .3))`;
      document.documentElement.append(el);
    },
    { x, y, svg: hand ? finger : arrow, hand },
  );
}

async function capture(page, name, clip) {
  const file = path.join(RAW, `${name}.png`);
  await page.screenshot({ path: file, clip });
  await page.close();
  return file;
}

const raw = {};

// 1. Score tags on a whole cinema programme.
{
  const page = await open(CINEMA_URL, { width: 1360, height: 690 });
  await waitForTags(page, 16);
  raw.tags = await capture(page, 'tags');
}

// 2. The card on a cinema page, close up.
{
  const page = await open(`${CINEMA_URL}?cols=5`, { width: 900, height: 456 });
  await waitForTags(page, 5);
  const at = await hover(page, '#poster-0', { x: 100, y: 120 });
  await drawPointer(page, at);
  raw.card = await capture(page, 'card');
}

// 3. A streaming home page in dark mode, with a TV show's card.
{
  const page = await open(STREAMING_URL, { width: 1240, height: 629, dark: true });
  await waitForTags(page, 14);
  const at = await hover(page, '#series-0', { x: 110, y: 150 });
  await drawPointer(page, at);
  raw.streaming = await capture(page, 'streaming');
}

// 4. A German showtimes list: a German title, and "Wrong movie?" opened.
{
  const page = await open(KINO_URL, { width: 1000, height: 507 });
  await waitForTags(page, 7);
  await hover(page, '#film-2', { x: 40, y: 9 });
  const box = await cardBox(page);
  // "Wrong movie? ▾" sits at the card's bottom left.
  const wrong = { x: box.left + 52, y: box.bottom - 19 };
  await page.mouse.move(wrong.x, wrong.y, { steps: 5 });
  await page.mouse.click(wrong.x, wrong.y);
  await page.waitForTimeout(2000);
  raw.picker = await capture(page, 'picker');
}

// 5a. The toolbar popup on a site the user added.
{
  const icon = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="#1d1a17"/><text x="8" y="12" font-family="Georgia" font-weight="700" font-size="11" text-anchor="middle" fill="#e0a43a">L</text></svg>',
  )}`;
  const page = await context.newPage();
  await page.setViewportSize({ width: 320, height: 600 });
  await page.goto(
    `chrome-extension://${extId}/popup.html?url=${encodeURIComponent(DEMO_SITE)}&icon=${encodeURIComponent(icon)}`,
  );
  await page.waitForSelector('main.popup');
  await page.waitForTimeout(500);
  const box = await page.locator('main.popup').boundingBox();
  raw.popup = await capture(page, 'popup', { x: 0, y: 0, width: 320, height: box.height });
}

// 5b. The settings page's color thresholds and link choices.
{
  const page = await context.newPage();
  await page.setViewportSize({ width: 760, height: 2400 });
  await page.goto(`chrome-extension://${extId}/options.html`);
  await page.waitForSelector('section.panel');
  await page.waitForTimeout(500);
  const panel = page.locator('section.panel').nth(2);
  const box = await panel.boundingBox();
  raw.settings = await capture(page, 'settings', {
    x: box.x - 1,
    y: box.y - 1,
    width: box.width + 2,
    height: Math.min(box.height + 2, 620),
  });
}

// ---------------------------------------------------------------------------------------------
// Framing

const dataUrl = (file) => `data:image/png;base64,${readFileSync(file).toString('base64')}`;
const ICON = dataUrl(path.join(ROOT, 'public/icon/128.png'));
const TAG_CSS = readFileSync(path.join(ROOT, 'src/ui/tag.css'), 'utf8').replace(/:host\b/g, '.tag');

const FONT = `-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif`;
const BASE_CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body {
    width: var(--w); height: var(--h); overflow: hidden; position: relative;
    font-family: ${FONT}; color: #fff;
    background:
      radial-gradient(900px 500px at 92% -10%, rgb(226 61 75 / 0.35), transparent 60%),
      radial-gradient(700px 500px at -10% 110%, rgb(255 248 231 / 0.10), transparent 60%),
      linear-gradient(160deg, #262d57 0%, #1f2547 45%, #141833 100%);
  }
`;

function framePage({ title, subtitle, body, extraCss = '' }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${BASE_CSS}
    body { --w: 1280px; --h: 800px; }
    .caption { position: absolute; left: 64px; top: 46px; right: 300px; }
    h1 { margin: 0; font-size: 40px; font-weight: 750; letter-spacing: -0.02em; line-height: 1.1; }
    p.sub { margin: 10px 0 0; font-size: 19px; line-height: 1.4; color: #c9cde3; }
    .brand { position: absolute; right: 64px; top: 50px; display: flex; align-items: center; gap: 10px;
      font-size: 22px; font-weight: 700; letter-spacing: -0.01em; }
    .brand img { width: 40px; height: 40px; }
    .window { position: absolute; left: 64px; right: 64px; top: 180px; height: 660px;
      border-radius: 14px; overflow: hidden; background: #fff;
      box-shadow: 0 30px 80px rgb(0 0 0 / 0.5), 0 0 0 1px rgb(255 255 255 / 0.08); }
    .chrome { height: 40px; display: flex; align-items: center; gap: 14px; padding: 0 14px;
      background: #eceef2; border-bottom: 1px solid #d9dce2; }
    .window.dark .chrome { background: #23262d; border-color: #33363e; }
    .dots { display: flex; gap: 7px; }
    .dots i { width: 12px; height: 12px; border-radius: 50%; background: #ff5f57; }
    .dots i:nth-child(2) { background: #febc2e; } .dots i:nth-child(3) { background: #28c840; }
    .url { flex: 1; height: 26px; border-radius: 7px; background: #fff; color: #5d6470;
      font-size: 13px; display: flex; align-items: center; padding: 0 12px; }
    .window.dark .url { background: #15171c; color: #a3aab6; }
    .ext { width: 26px; height: 26px; border-radius: 6px; display: grid; place-items: center; }
    .ext img { width: 18px; height: 18px; }
    .shot { display: block; width: 100%; }
    ${extraCss}
  </style></head><body>
    <div class="caption"><h1>${title}</h1><p class="sub">${subtitle}</p></div>
    <div class="brand"><img src="${ICON}" alt="">Popscore</div>
    ${body}
  </body></html>`;
}

function browserWindow(shot, address, { dark = false } = {}) {
  return `<div class="window${dark ? ' dark' : ''}">
    <div class="chrome"><div class="dots"><i></i><i></i><i></i></div>
      <div class="url">${address}</div><div class="ext"><img src="${ICON}" alt=""></div></div>
    <img class="shot" src="${dataUrl(shot)}" alt="">
  </div>`;
}

const SCREENSHOTS = [
  {
    name: 'screenshot-1-score-tags',
    title: 'Every poster gets its IMDb score',
    subtitle: 'Scan a whole cinema programme at a glance: green is good, amber okay, red skip.',
    body: browserWindow(raw.tags, 'lumencinema.example/now-showing'),
  },
  {
    name: 'screenshot-2-hover-card',
    title: 'Point at a movie for the details',
    subtitle: 'IMDb rating and votes, year, genres, runtime and plot, without leaving the page.',
    body: browserWindow(raw.card, 'lumencinema.example/now-showing'),
  },
  {
    name: 'screenshot-3-streaming',
    title: 'Movies and TV shows, on streaming sites too',
    subtitle: 'Over 130 cinema and streaming sites work out of the box, in light and dark mode.',
    body: browserWindow(raw.streaming, 'reelhouse.example/home', { dark: true }),
  },
  {
    name: 'screenshot-4-wrong-movie',
    title: 'Understands German titles',
    subtitle: 'Wrong match? Search for the right film, and Popscore remembers your pick.',
    body: browserWindow(raw.picker, 'lumenkino.example/kinoprogramm'),
  },
  {
    name: 'screenshot-5-settings',
    title: 'Make it yours',
    subtitle:
      'Switch it on for any site from the toolbar. Set your own color thresholds and where links go.',
    body: `<div class="panel settings"><img src="${dataUrl(raw.settings)}" alt=""></div>
      <div class="panel popup"><img src="${dataUrl(raw.popup)}" alt=""></div>`,
    extraCss: `
      .panel { position: absolute; border-radius: 14px; overflow: hidden; background: #fff;
        box-shadow: 0 30px 80px rgb(0 0 0 / 0.5), 0 0 0 1px rgb(255 255 255 / 0.08); }
      .panel img { display: block; width: 100%; }
      .settings { left: 64px; top: 180px; width: 680px; }
      .popup { left: 784px; top: 230px; width: 432px; }`,
  },
];

const PROMOS = [
  { name: 'promo-small-440x280', width: 440, height: 280 },
  { name: 'promo-marquee-1400x560', width: 1400, height: 560 },
];

/** Posters with score tags for the promo tiles: [poster path, score, verdict]. */
const PROMO_POSTERS = [
  ['/vbeyOZm2bvBXcbgPD3v6o94epPX.jpg', '7.8', 'good'],
  ['/pPHpeI2X1qEd1CS1SeyrdhZ4qnT.jpg', '8.7', 'good'],
  ['/si9tolnefLSUKaqQEGz1bWArOaL.jpg', '6.6', 'okay'],
  ['/hBxN6dwrANN1ic3a4G9x6JZcR3C.jpg', '5.5', 'bad'],
];

function promoPage({ width, height }) {
  const big = width > 1000;
  const s = big ? 0.92 : 0.4;
  const posterW = Math.round(200 * s);
  const posters = PROMO_POSTERS.map(
    ([p, score, v], i) => `<div class="poster" style="--i:${i}">
      <img src="https://image.tmdb.org/t/p/w342${p}" alt=""><span class="tag ${v}">${score}</span></div>`,
  ).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${BASE_CSS}
    ${TAG_CSS}
    body { --w: ${width}px; --h: ${height}px; }
    .text { position: absolute; left: ${big ? 96 : 28}px; top: 50%; transform: translateY(-50%);
      width: ${big ? 480 : 230}px; }
    .logo { display: flex; align-items: center; gap: ${big ? 16 : 9}px; }
    .logo img { width: ${big ? 84 : 44}px; height: ${big ? 84 : 44}px; }
    .logo b { font-size: ${big ? 56 : 30}px; font-weight: 750; letter-spacing: -0.02em; }
    p { margin: ${big ? 24 : 12}px 0 0; font-size: ${big ? 34 : 19}px; line-height: 1.3;
      font-weight: 600; color: #e4e7f4; }
    p small { display: block; margin-top: ${big ? 12 : 6}px; font-size: ${big ? 20 : 11}px;
      font-weight: 450; color: #b9bfd8; }
    .posters { position: absolute; right: ${big ? 72 : 22}px; top: 50%;
      transform: translateY(-50%); display: flex; gap: ${Math.round(22 * s)}px; }
    .poster { position: relative; width: ${posterW}px; aspect-ratio: 2 / 3;
      transform: translateY(calc((var(--i) - 1.5) * ${Math.round(16 * s)}px)) rotate(calc((var(--i) - 1.5) * 2deg));
      border-radius: ${Math.round(10 * s) + 2}px; overflow: hidden;
      box-shadow: 0 ${Math.round(20 * s)}px ${Math.round(50 * s)}px rgb(0 0 0 / 0.5); }
    .poster img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .poster .tag { position: absolute; top: ${Math.round(10 * s) + 2}px; right: ${Math.round(10 * s) + 2}px;
      zoom: ${big ? 1.8 : 0.9}; }
    ${big ? '' : '.poster:nth-child(n+3) { display: none; }'}
  </style></head><body>
    <div class="text">
      <div class="logo"><img src="${ICON}" alt=""><b>Popscore</b></div>
      <p>IMDb ratings on<br>every poster<small>On cinema and streaming sites</small></p>
    </div>
    <div class="posters">${posters}</div>
  </body></html>`;
}

const browser = await chromium.launch();
const render = async (html, width, height, file) => {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.screenshot({
    path: path.join(OUT, `${file}.png`),
    clip: { x: 0, y: 0, width, height },
  });
  await page.close();
};
for (const s of SCREENSHOTS) await render(framePage(s), 1280, 800, s.name);
for (const p of PROMOS) await render(promoPage(p), p.width, p.height, p.name);

// The Chrome Web Store wants the 128 px icon's artwork at 96 px, with transparent padding.
{
  const page = await browser.newPage({ viewport: { width: 128, height: 128 } });
  await page.setContent(
    `<body style="margin:0;background:transparent"><img src="${ICON}" style="display:block;margin:16px;width:96px;height:96px"></body>`,
  );
  await page.screenshot({ path: path.join(OUT, 'store-icon-128.png'), omitBackground: true });
  await page.close();
}

await browser.close();
await context.close();
rmSync(EXT, { recursive: true, force: true });
console.log(
  `Wrote ${SCREENSHOTS.length + PROMOS.length + 1} images to ${path.relative(ROOT, OUT)}/`,
);
