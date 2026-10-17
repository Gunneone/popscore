import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { CONTENT_SCRIPT_FILE } from '@/src/registration';
import {
  completePendingSite,
  getSettings,
  hasKeys,
  pendingSiteItem,
  updateSettings,
  type Settings,
} from '@/src/settings';
import { originPattern, siteState, type SiteList } from '@/src/sites';
import '@/src/ui/pages.css';
import './style.css';

const LIST_NAMES: Record<SiteList, string> = {
  cinema: 'Cinemas',
  streaming: 'Streaming services',
  custom: 'Your sites',
};

interface TabInfo {
  id: number;
  url: string;
  host: string;
}

function Popup() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tab, setTab] = useState<TabInfo | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void getSettings().then(setSettings);
    void browser.tabs.query({ active: true, currentWindow: true }).then(([t]) => {
      if (t?.id === undefined || !t.url) return;
      try {
        setTab({ id: t.id, url: t.url, host: new URL(t.url).hostname });
      } catch {
        // Not a normal web page.
      }
    });
  }, []);

  if (!settings) return null;
  const ready = hasKeys(settings);
  const state = tab ? siteState(tab.url, settings) : null;
  const site = state?.site;
  const pattern = tab ? originPattern(tab.url) : null;
  // A paused list wins over the site's own switch; resuming it is done in Settings.
  const paused = !!state?.list && !state.listOn;

  const toggle = (on: boolean) => {
    setError('');
    // Built-in sites and sites the user already added are switched off, not removed.
    const key = site?.id ?? state?.pattern;
    if (key) {
      const disabledSites = on
        ? settings.disabledSites.filter((k) => k !== key)
        : [...settings.disabledSites, key];
      void updateSettings({ disabledSites }).then(setSettings);
      return;
    }
    if (!pattern || !tab || !on) return;
    // The permission request must happen synchronously inside the click handler.
    void pendingSiteItem.setValue(pattern);
    browser.permissions.request({ origins: [pattern] }).then(
      async (granted) => {
        if (!granted) {
          setError('Permission was not granted.');
          return;
        }
        await completePendingSite();
        setSettings(await getSettings());
        await browser.scripting
          .executeScript({ target: { tabId: tab.id }, files: [`/${CONTENT_SCRIPT_FILE}`] })
          .catch(() => {});
      },
      () => setError("This page can't be enabled."),
    );
  };

  return (
    <main class="popup">
      <header>
        <h1>Worth It?</h1>
        <span class={`status small ${ready ? 'ok' : 'warn'}`}>
          {ready ? 'Ready' : 'Setup needed'}
        </span>
      </header>

      {!ready && (
        <section class="setup">
          <p>Add your two free API keys to start seeing IMDb ratings.</p>
          <button
            class="btn primary"
            type="button"
            onClick={() => void browser.runtime.openOptionsPage()}
          >
            Set up keys
          </button>
        </section>
      )}

      <section>
        {pattern && tab ? (
          <>
            <label class="switch">
              <input
                type="checkbox"
                checked={!!state?.on}
                disabled={paused}
                onChange={(e) => toggle(e.currentTarget.checked)}
              />
              <span>
                Show ratings when I rest on a title on <b>{site?.name ?? tab.host}</b>
              </span>
            </label>
            {paused && (
              <p class="small muted">
                {LIST_NAMES[state!.list!]} are switched off in{' '}
                <button
                  class="link"
                  type="button"
                  onClick={() => void browser.runtime.openOptionsPage()}
                >
                  Settings
                </button>
                .
              </p>
            )}
            {error && <p class="small error">{error}</p>}
          </>
        ) : (
          <p class="muted">Ratings aren't available on this page.</p>
        )}
        <p class="small muted">
          Anywhere else: hold <kbd>Alt</kbd> (<kbd>⌥</kbd> on Mac) while pointing at a title.
        </p>
      </section>

      <footer>
        <button class="link" type="button" onClick={() => void browser.runtime.openOptionsPage()}>
          Settings
        </button>
      </footer>
    </main>
  );
}

render(<Popup />, document.getElementById('app')!);
