import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { send } from '@/messages';
import {
  getSettings,
  TAG_OMDB_BUDGET,
  updateSettings,
  watchSettings,
  type MovieLink,
  type Settings,
  type ShowLink,
} from '@/settings';
import type { KeyTestResult, Usage } from '@/types';
import '@/ui/pages.css';
import './style.css';
import { SiteLists } from './SiteLists';
import { VerdictSlider } from './VerdictSlider';

const ALL_SITES = { origins: ['<all_urls>'] };
const OMDB_DAILY_LIMIT = 1000;

const welcome = new URLSearchParams(location.search).has('welcome');

function KeyStatus({ state }: { state: KeyTestResult['tmdb'] | undefined }) {
  if (!state) return null;
  const text = {
    ok: 'Key works',
    invalid: 'Key was rejected',
    error: "Couldn't check the key (network?)",
    missing: 'No key: the Popscore server is used',
  }[state];
  const cls = { ok: 'ok', invalid: 'bad', error: 'warn', missing: '' }[state];
  return <span class={`status small ${cls}`}>{text}</span>;
}

function ApiKeys({ settings }: { settings: Settings }) {
  const [tmdbKey, setTmdbKey] = useState(settings.tmdbKey);
  const [omdbKey, setOmdbKey] = useState(settings.omdbKey);
  const [test, setTest] = useState<KeyTestResult | null>(null);
  const [busy, setBusy] = useState(false);
  // Open when keys are set; afterwards it's the user's to open and close.
  const [initiallyOpen] = useState(settings.tmdbKey !== '' || settings.omdbKey !== '');

  const save = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    await updateSettings({ tmdbKey: tmdbKey.trim(), omdbKey: omdbKey.trim() });
    setTest(await send({ type: 'testKeys', tmdbKey, omdbKey }).catch(() => null));
    setBusy(false);
  };

  return (
    <section class="panel">
      <h2>
        <span class="step">1</span> Your own API keys (optional)
      </h2>
      <p class="muted">
        Popscore looks movies and shows up on TMDB and reads the IMDb rating from OMDb. Out of the
        box the Popscore server does both for you, so there's nothing to set up. To stay independent
        of it, add your own free keys: each one replaces the server for its service, and with both
        the extension never contacts it. Keys are stored in your browser profile and only sent to
        TMDB and OMDb.
      </p>
      <details class="own-keys" open={initiallyOpen}>
        <summary>Use my own keys</summary>
        <form onSubmit={save}>
          <div class="key">
            <label for="tmdb">
              <b>TMDB</b> API key or Read Access Token
            </label>
            <ol class="small muted">
              <li>
                Create a free account at{' '}
                <a href="https://www.themoviedb.org/signup" target="_blank" rel="noopener">
                  themoviedb.org
                </a>
                .
              </li>
              <li>
                Open{' '}
                <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener">
                  Settings → API
                </a>{' '}
                and request a <i>Developer</i> key (personal, non-commercial use).
              </li>
              <li>Copy the “API Key” (or the longer “API Read Access Token”) and paste it here.</li>
            </ol>
            <input
              id="tmdb"
              value={tmdbKey}
              onInput={(e) => setTmdbKey(e.currentTarget.value)}
              spellcheck={false}
              autocomplete="off"
              placeholder="e.g. 3f2a…"
            />
            <KeyStatus state={test?.tmdb} />
          </div>
          <div class="key">
            <label for="omdb">
              <b>OMDb</b> API key
            </label>
            <ol class="small muted">
              <li>
                Go to{' '}
                <a href="https://www.omdbapi.com/apikey.aspx" target="_blank" rel="noopener">
                  omdbapi.com/apikey.aspx
                </a>
                , choose <i>FREE (1,000 daily limit)</i> and enter your email.
              </li>
              <li>
                Click the activation link in the email, then paste the key from that email here.
              </li>
            </ol>
            <input
              id="omdb"
              value={omdbKey}
              onInput={(e) => setOmdbKey(e.currentTarget.value)}
              spellcheck={false}
              autocomplete="off"
              placeholder="e.g. a1b2c3d4"
            />
            <KeyStatus state={test?.omdb} />
          </div>
          <button class="btn primary" type="submit" disabled={busy}>
            {busy ? 'Checking…' : 'Save and test keys'}
          </button>
        </form>
      </details>
    </section>
  );
}

function Sites({ settings }: { settings: Settings }) {
  const [anywhere, setAnywhere] = useState(false);

  useEffect(() => {
    void browser.permissions.contains(ALL_SITES).then(setAnywhere);
    const refresh = () => void browser.permissions.contains(ALL_SITES).then(setAnywhere);
    browser.permissions.onAdded.addListener(refresh);
    browser.permissions.onRemoved.addListener(refresh);
    return () => {
      browser.permissions.onAdded.removeListener(refresh);
      browser.permissions.onRemoved.removeListener(refresh);
    };
  }, []);

  const toggleAnywhere = (on: boolean) => {
    // Must be called synchronously from the click for the browser to show its prompt.
    const req = on ? browser.permissions.request(ALL_SITES) : browser.permissions.remove(ALL_SITES);
    void req.then(() => browser.permissions.contains(ALL_SITES).then(setAnywhere));
  };

  return (
    <section class="panel">
      <h2>
        <span class="step">2</span> Where it works
      </h2>
      <p class="muted">
        On these sites the card opens when you rest the pointer on a title. Holding <kbd>Alt</kbd> (
        <kbd>⌥</kbd>) shows it right away, here and on sites that are switched off.
      </p>
      <SiteLists settings={settings} />

      <h3>Every other website</h3>
      <label class="switch">
        <input
          type="checkbox"
          checked={anywhere}
          onChange={(e) => toggleAnywhere(e.currentTarget.checked)}
        />
        <span>
          Alt-hover on every site
          <br />
          <span class="muted small">
            Hold <kbd>Alt</kbd> (<kbd>⌥</kbd>) and point at any movie title, on any website. Your
            browser will ask for access to all sites; the extension only reads the element under
            your pointer when you hold Alt there.
          </span>
        </span>
      </label>
    </section>
  );
}

const MOVIE_LINKS: [MovieLink, string][] = [
  ['imdb', 'IMDb'],
  ['tmdb', 'TMDB'],
  ['letterboxd', 'Letterboxd'],
];

// Letterboxd only has films.
const SHOW_LINKS: [ShowLink, string][] = [
  ['imdb', 'IMDb'],
  ['tmdb', 'TMDB'],
];

const KINDS: ['movies' | 'tvShows', string][] = [
  ['movies', 'Movies'],
  ['tvShows', 'TV shows'],
];

function CardSettings({ settings }: { settings: Settings }) {
  return (
    <section class="panel">
      <h2>
        <span class="step">3</span> The card
      </h2>
      <div class="field">
        <span>Rate</span>
        <div class="row">
          {KINDS.map(([key, name]) => {
            // The last one ticked stays on: with neither, there'd be nothing to look up.
            const only = settings[key] && !settings[key === 'movies' ? 'tvShows' : 'movies'];
            return (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={settings[key]}
                  disabled={only}
                  onChange={(e) => void updateSettings({ [key]: e.currentTarget.checked })}
                />{' '}
                {name}
              </label>
            );
          })}
          <span class="muted small">On the card and the score tags. At least one stays on.</span>
        </div>
      </div>
      <div class="field">
        <label for="dwell">Delay before the card opens</label>
        <div class="row">
          <input
            id="dwell"
            type="range"
            min={200}
            max={1500}
            step={100}
            value={settings.dwellMs}
            onInput={(e) => void updateSettings({ dwellMs: Number(e.currentTarget.value) })}
          />
          <span>{(settings.dwellMs / 1000).toFixed(1)} s</span>
        </div>
      </div>
      <div class="field">
        <label class="switch">
          <input
            type="checkbox"
            checked={settings.scoreTags}
            onChange={(e) => void updateSettings({ scoreTags: e.currentTarget.checked })}
          />
          <span>
            Score tags on posters
            <br />
            <span class="muted small">
              A small score on every movie or show you scroll past on the sites above, in the
              verdict color.
              {settings.omdbKey && (
                <>
                  {' '}
                  Each new title uses an OMDb lookup on your key; past {TAG_OMDB_BUDGET} today, tags
                  show TMDB's score and the rest is kept for the card.
                </>
              )}
            </span>
          </span>
        </label>
      </div>
      <div class="field">
        <span>Verdict colors</span>
        <VerdictSlider
          amberAt={settings.amberAt}
          greenAt={settings.greenAt}
          onChange={(range) => void updateSettings(range)}
        />
      </div>
      <div class="field">
        <span>“Open on …” link for movies goes to</span>
        <div class="row">
          {MOVIE_LINKS.map(([value, name]) => (
            <label key={value}>
              <input
                type="radio"
                name="movieLink"
                checked={settings.movieLink === value}
                onChange={() => void updateSettings({ movieLink: value })}
              />{' '}
              {name}
            </label>
          ))}
        </div>
      </div>
      <div class="field">
        <span>“Open on …” link for TV shows goes to</span>
        <div class="row">
          {SHOW_LINKS.map(([value, name]) => (
            <label key={value}>
              <input
                type="radio"
                name="showLink"
                checked={settings.showLink === value}
                onChange={() => void updateSettings({ showLink: value })}
              />{' '}
              {name}
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}

function Data({ settings }: { settings: Settings }) {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [cleared, setCleared] = useState(false);
  useEffect(() => {
    void send({ type: 'usage' }).then(setUsage, () => {});
  }, []);

  return (
    <section class="panel">
      <h2>Data</h2>
      {settings.omdbKey ? (
        <p>
          OMDb lookups on your key today: <b>{usage?.omdbCalls ?? '–'}</b> of{' '}
          {OMDB_DAILY_LIMIT.toLocaleString('en')}{' '}
          <span class="muted small">
            (ratings are cached for up to 3 days, so repeat views are free; score tags stop at{' '}
            {TAG_OMDB_BUDGET})
          </span>
        </p>
      ) : (
        <p class="muted small">
          Ratings are cached in your browser for up to 3 days, and on the Popscore server for up to
          a week, so repeat views are instant.
        </p>
      )}
      <button
        class="btn"
        type="button"
        onClick={() => void send({ type: 'clearCache' }).then(() => setCleared(true))}
      >
        {cleared ? 'Cache cleared' : 'Clear cached ratings'}
      </button>
      <p class="muted small privacy">
        <b>Privacy:</b> when you point at a title, or with score tags on, when a movie or show comes
        into view on a site above, its title text and the page's language are sent to find it, and
        its IMDb id to get the rating. Without your own keys they go to the Popscore server, which
        asks TMDB and OMDb for you and keeps no record of who asked; with your own key, that service
        is asked directly. Nothing else leaves your browser: no browsing history, no analytics, no
        account.
      </p>
    </section>
  );
}

function Options() {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    void getSettings().then(setSettings);
    return watchSettings(setSettings);
  }, []);
  if (!settings) return null;

  return (
    <main class="options">
      <header>
        <h1>Popscore</h1>
        <p class="muted">IMDb ratings for any movie or show you point at.</p>
      </header>
      {welcome && (
        <div class="welcome">
          <b>Welcome!</b> You're all set: point at a movie or show on Netflix, Prime Video, Disney+
          or your cinema's website. There's nothing to sign up for; your own API keys below are
          optional.
        </div>
      )}
      <ApiKeys settings={settings} />
      <Sites settings={settings} />
      <CardSettings settings={settings} />
      <Data settings={settings} />
      <footer class="muted small">
        Movie data and posters from{' '}
        <a href="https://www.themoviedb.org/" target="_blank" rel="noopener">
          TMDB
        </a>
        . This product uses the TMDB API but is not endorsed or certified by TMDB. IMDb ratings via
        the{' '}
        <a href="https://www.omdbapi.com/" target="_blank" rel="noopener">
          OMDb API
        </a>{' '}
        (CC BY-NC 4.0). Not affiliated with IMDb.
      </footer>
    </main>
  );
}

render(<Options />, document.getElementById('app')!);
