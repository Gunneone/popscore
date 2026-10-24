import { render, type ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { CONTENT_SCRIPT_FILE } from '@/registration';
import {
  completePendingSite,
  getSettings,
  pendingSiteItem,
  updateSettings,
  type Settings,
} from '@/settings';
import { originPattern, siteState, type SiteList } from '@/sites';
import '@/ui/pages.css';
import './style.css';

const LIST_NAMES: Record<SiteList, string> = {
  cinema: 'Cinemas',
  streaming: 'Streaming services',
  custom: 'Your sites',
};

const KINDS: ['movies' | 'tvShows', string][] = [
  ['movies', 'Movies'],
  ['tvShows', 'TV shows'],
];

interface TabInfo {
  id: number;
  url: string;
  host: string;
  icon?: string;
}

const openSettings = () => void browser.runtime.openOptionsPage().then(() => window.close());

function Toggle(props: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (on: boolean) => void;
}) {
  return (
    <input
      class="toggle"
      type="checkbox"
      role="switch"
      aria-label={props.label}
      checked={props.checked}
      disabled={props.disabled}
      onChange={(e) => props.onChange(e.currentTarget.checked)}
    />
  );
}

function Row(props: {
  title: ComponentChildren;
  hint?: ComponentChildren;
  children: ComponentChildren;
}) {
  return (
    <label class="row">
      <span class="row-text">
        <span class="row-title">{props.title}</span>
        {props.hint && <span class="row-hint">{props.hint}</span>}
      </span>
      {props.children}
    </label>
  );
}

function Popup() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tab, setTab] = useState<TabInfo | null>(null);
  const [error, setError] = useState('');
  // Switched on while the popup is open: the page may need a reload to pick it up.
  const [turnedOn, setTurnedOn] = useState(false);

  useEffect(() => {
    void getSettings().then(setSettings);
    void browser.tabs.query({ active: true, currentWindow: true }).then(([t]) => {
      if (t?.id === undefined || !t.url) return;
      try {
        const host = new URL(t.url).hostname.replace(/^www\./, '');
        setTab({ id: t.id, url: t.url, host, icon: t.favIconUrl });
      } catch {
        // Not a normal web page.
      }
    });
  }, []);

  if (!settings) return null;
  const state = tab ? siteState(tab.url, settings) : null;
  const site = state?.site;
  const pattern = tab ? originPattern(tab.url) : null;
  // A paused list wins over the site's own switch; resuming it is done in Settings.
  const paused = !!state?.list && !state.listOn;
  const on = !!state?.on;

  const save = (patch: Partial<Settings>) => void updateSettings(patch).then(setSettings);

  const toggleSite = (on: boolean) => {
    setError('');
    setTurnedOn(on);
    // Built-in sites and sites the user already added are switched off, not removed.
    const key = site?.id ?? state?.pattern;
    if (key) {
      save({
        disabledSites: on
          ? settings.disabledSites.filter((k) => k !== key)
          : [...settings.disabledSites, key],
      });
      return;
    }
    if (!pattern || !tab || !on) return;
    // The permission request must happen synchronously inside the click handler.
    void pendingSiteItem.setValue(pattern);
    browser.permissions.request({ origins: [pattern] }).then(
      async (granted) => {
        if (!granted) {
          setTurnedOn(false);
          setError('Popscore needs access to this site to show ratings here.');
          return;
        }
        await completePendingSite();
        setSettings(await getSettings());
        await browser.scripting
          .executeScript({ target: { tabId: tab.id }, files: [`/${CONTENT_SCRIPT_FILE}`] })
          .catch(() => {});
      },
      () => {
        setTurnedOn(false);
        setError("Ratings can't be switched on for this page.");
      },
    );
  };

  const reload = () => void browser.tabs.reload(tab!.id).then(() => window.close());

  return (
    <main class="popup">
      <header>
        <img class="logo" src="/icon/48.png" alt="" width={24} height={24} />
        <h1>Popscore</h1>
        <button class="icon-btn" type="button" title="All settings" onClick={openSettings}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              fill="currentColor"
              d="M19.14 12.94a7.07 7.07 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.07 7.07 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.3.6.22l2.39-.96c.5.38 1.04.7 1.63.94l.36 2.54c.05.24.26.42.5.42h3.84c.24 0 .45-.18.5-.42l.36-2.54c.59-.24 1.13-.56 1.63-.94l2.39.96c.22.08.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"
            />
          </svg>
        </button>
      </header>

      <section class="card site">
        {pattern && tab ? (
          <>
            <Row
              title={
                <span class="site-name">
                  {tab.icon && <img src={tab.icon} alt="" width={16} height={16} />}
                  {site?.name ?? tab.host}
                </span>
              }
              hint={
                paused
                  ? `${LIST_NAMES[state!.list!]} are paused.`
                  : on
                    ? 'Point at a title to see its rating.'
                    : 'Ratings are off on this site.'
              }
            >
              <Toggle
                checked={on}
                disabled={paused}
                label={`Ratings on ${site?.name ?? tab.host}`}
                onChange={toggleSite}
              />
            </Row>
            {paused && (
              <p class="note">
                Turn them back on in{' '}
                <button class="link" type="button" onClick={openSettings}>
                  Settings
                </button>
                .
              </p>
            )}
            {turnedOn && on && (
              <div class="note reload">
                <span>Reload the page to get ratings right away.</span>
                <button class="btn primary" type="button" onClick={reload}>
                  Reload
                </button>
              </div>
            )}
            {error && <p class="note error">{error}</p>}
          </>
        ) : (
          <p class="unavailable">Ratings can't show on this page.</p>
        )}
      </section>

      <section class="card">
        <Row title="Score tags on posters" hint="A small rating on every poster you scroll past.">
          <Toggle
            checked={settings.scoreTags}
            label="Score tags on posters"
            onChange={(scoreTags) => save({ scoreTags })}
          />
        </Row>
        <div class="row">
          <span class="row-text">
            <span class="row-title">Ratings for</span>
          </span>
          <div class="chips" role="group" aria-label="Ratings for">
            {KINDS.map(([key, name]) => {
              // The last one on stays on: with neither, there'd be nothing to look up.
              const only = settings[key] && !settings[key === 'movies' ? 'tvShows' : 'movies'];
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={settings[key]}
                  disabled={only}
                  onClick={() => save({ [key]: !settings[key] })}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <p class="tip">
        Anywhere else, hold <kbd>Alt</kbd> (<kbd>⌥</kbd>) and point at a title.
      </p>
    </main>
  );
}

render(<Popup />, document.getElementById('app')!);
