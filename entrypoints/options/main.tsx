import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { send } from '@/src/messages';
import { getSettings, updateSettings, watchSettings, type Settings } from '@/src/settings';
import { DEFAULT_SITES } from '@/src/sites';
import type { KeyTestResult, Usage } from '@/src/types';
import { verdict } from '@/src/ui/format';
import '@/src/ui/pages.css';
import './style.css';

const ALL_SITES = { origins: ['<all_urls>'] };
const OMDB_DAILY_LIMIT = 1000;

const welcome = new URLSearchParams(location.search).has('welcome');

function KeyStatus({ state }: { state: KeyTestResult['tmdb'] | undefined }) {
  if (!state) return null;
  const text = {
    ok: 'Key works',
    invalid: 'Key was rejected',
    error: "Couldn't check the key (network?)",
    missing: 'No key yet',
  }[state];
  const cls = state === 'ok' ? 'ok' : state === 'invalid' ? 'bad' : 'warn';
  return <span class={`status small ${cls}`}>{text}</span>;
}

function ApiKeys({ settings }: { settings: Settings }) {
  const [tmdbKey, setTmdbKey] = useState(settings.tmdbKey);
  const [omdbKey, setOmdbKey] = useState(settings.omdbKey);
  const [test, setTest] = useState<KeyTestResult | null>(null);
  const [busy, setBusy] = useState(false);

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
        <span class="step">1</span> API keys
      </h2>
      <p class="muted">
        Worth It? looks movies up on TMDB and reads the IMDb rating from OMDb. Both are free; you
        need one key from each. They're stored in your browser profile and only sent to those two
        services.
      </p>
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

  const toggleSite = (id: string, on: boolean) =>
    void updateSettings({
      disabledSites: on
        ? settings.disabledSites.filter((s) => s !== id)
        : [...settings.disabledSites, id],
    });

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
        <kbd>⌥</kbd>) shows it right away.
      </p>
      <div class="sites">
        {DEFAULT_SITES.map((s) => (
          <label class="switch" key={s.id}>
            <input
              type="checkbox"
              checked={!settings.disabledSites.includes(s.id)}
              onChange={(e) => toggleSite(s.id, e.currentTarget.checked)}
            />
            <span>
              {s.name}{' '}
              <span class="muted small">{s.kind === 'cinema' ? 'cinema' : 'streaming'}</span>
            </span>
          </label>
        ))}
      </div>

      <h3>Your sites</h3>
      {settings.extraSites.length === 0 ? (
        <p class="muted small">
          None yet. To add one, open the site and switch it on from the Worth It? toolbar button.
        </p>
      ) : (
        <ul class="extra">
          {settings.extraSites.map((p) => (
            <li key={p}>
              <code>{p.replace(/^https?:\/\//, '').replace(/\/\*$/, '')}</code>
              <button
                class="btn small"
                type="button"
                onClick={() =>
                  void updateSettings({ extraSites: settings.extraSites.filter((x) => x !== p) })
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

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

function CardSettings({ settings }: { settings: Settings }) {
  const sample = [8.5, 6.4, 4.9];
  return (
    <section class="panel">
      <h2>
        <span class="step">3</span> The card
      </h2>
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
        <span>Verdict colors</span>
        <div class="row">
          <label>
            Green from{' '}
            <input
              class="num"
              type="number"
              min={0}
              max={10}
              step={0.1}
              value={settings.greenAt}
              onChange={(e) => {
                const greenAt = Number(e.currentTarget.value);
                void updateSettings({ greenAt, amberAt: Math.min(settings.amberAt, greenAt) });
              }}
            />
          </label>
          <label>
            Amber from{' '}
            <input
              class="num"
              type="number"
              min={0}
              max={10}
              step={0.1}
              value={settings.amberAt}
              onChange={(e) => {
                const amberAt = Number(e.currentTarget.value);
                void updateSettings({ amberAt, greenAt: Math.max(settings.greenAt, amberAt) });
              }}
            />
          </label>
          <span class="muted small">below is red</span>
        </div>
        <div class="row samples">
          {sample.map((r) => (
            <span key={r} class={`sample ${verdict(r, settings.greenAt, settings.amberAt)}`}>
              {r.toFixed(1)}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function Data() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [cleared, setCleared] = useState(false);
  useEffect(() => {
    void send({ type: 'usage' }).then(setUsage, () => {});
  }, []);

  return (
    <section class="panel">
      <h2>Data</h2>
      <p>
        OMDb lookups today: <b>{usage?.omdbCalls ?? '–'}</b> of{' '}
        {OMDB_DAILY_LIMIT.toLocaleString('en')}{' '}
        <span class="muted small">(ratings are cached for 3 days, so repeat views are free)</span>
      </p>
      <button
        class="btn"
        type="button"
        onClick={() => void send({ type: 'clearCache' }).then(() => setCleared(true))}
      >
        {cleared ? 'Cache cleared' : 'Clear cached ratings'}
      </button>
      <p class="muted small privacy">
        <b>Privacy:</b> when you point at a title, that title text is sent to TMDB to find the
        movie, and the movie's IMDb id is sent to OMDb for the rating. Nothing else leaves your
        browser: no browsing history, no analytics, no account.
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
        <h1>Worth It?</h1>
        <p class="muted">IMDb ratings for any movie you point at.</p>
      </header>
      {welcome && (
        <div class="welcome">
          <b>Welcome!</b> Two free API keys and you're set; it takes about 3 minutes. Then point at
          a movie on Netflix, Prime Video, Disney+ or your cinema's website.
        </div>
      )}
      <ApiKeys settings={settings} />
      <Sites settings={settings} />
      <CardSettings settings={settings} />
      <Data />
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
