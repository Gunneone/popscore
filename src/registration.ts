import { browser } from 'wxt/browser';
import { getSettings } from './settings';
import { DEFAULT_SITE_MATCHES } from './sites';

const SCRIPT_ID = 'popscore-extra-sites';
export const CONTENT_SCRIPT_FILE = 'content-scripts/content.js';

/**
 * The manifest injects the content script on the default sites. Anywhere else it runs only where the
 * user granted access: every site ("Alt-hover everywhere") or the extra sites they switched on.
 */
async function sync(): Promise<void> {
  const settings = await getSettings();
  let matches: string[] = [];
  if (await browser.permissions.contains({ origins: ['<all_urls>'] })) {
    matches = ['<all_urls>'];
  } else {
    for (const pattern of settings.extraSites) {
      if (await browser.permissions.contains({ origins: [pattern] })) matches.push(pattern);
    }
  }

  const existing = await browser.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  if (existing.length) await browser.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
  if (matches.length === 0) return;

  const script = {
    id: SCRIPT_ID,
    matches,
    excludeMatches: DEFAULT_SITE_MATCHES,
    js: [CONTENT_SCRIPT_FILE],
    runAt: 'document_idle' as const,
  };
  try {
    await browser.scripting.registerContentScripts([{ ...script, persistAcrossSessions: true }]);
  } catch {
    // Older Firefox versions only accept non-persistent scripts; we re-sync on every startup anyway.
    await browser.scripting.registerContentScripts([{ ...script, persistAcrossSessions: false }]);
  }
}

let queue: Promise<void> = Promise.resolve();

/** Serialized so overlapping triggers (startup + settings change) can't register the id twice. */
export function syncContentScripts(): Promise<void> {
  queue = queue
    .then(sync)
    .catch((err) => console.warn('[Popscore] script registration failed', err));
  return queue;
}
