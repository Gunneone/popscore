import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { testOmdbKey } from '@/src/api/omdb';
import { testTmdbKey } from '@/src/api/tmdb';
import { clearCache } from '@/src/cache';
import { fetchPosterDataUrl, lookup, pickMovie } from '@/src/lookup';
import { normalizeTitle } from '@/src/match/normalize';
import type { Message, Responses } from '@/src/messages';
import { syncContentScripts } from '@/src/registration';
import {
  completePendingSite,
  getUsage,
  savePick,
  TAG_OMDB_BUDGET,
  watchSettings,
} from '@/src/settings';
import { displayScore } from '@/src/ui/format';

async function handle(msg: Message): Promise<Responses[Message['type']]> {
  switch (msg.type) {
    case 'lookup':
      return lookup(msg.req);
    case 'tag': {
      const result = await lookup(msg.req, {
        skipPoster: true,
        omdbBudget: TAG_OMDB_BUDGET,
        tag: true,
      });
      if (result.status === 'error') throw new Error(result.error);
      if (result.status !== 'match') return null;
      const score = displayScore(result.movie);
      return score && { tmdbId: result.movie.tmdbId, value: score.value, source: score.source };
    }
    case 'search': {
      const result = await lookup({
        candidates: [{ text: msg.text, weight: 1, source: 'typed' }],
        pageLang: msg.pageLang,
        cinema: msg.cinema,
        mode: 'manual',
      });
      if (result.status !== 'match') return result;
      await savePick(normalizeTitle(msg.original), result.movie.tmdbId);
      return { ...result, query: msg.original, picked: true };
    }
    case 'pick':
      return pickMovie(msg.query, msg.tmdbId, msg.alternatives);
    case 'posters': {
      const entries = await Promise.all(
        msg.paths.map(async (p) => [p, await fetchPosterDataUrl(p, 'w92')] as const),
      );
      return Object.fromEntries(entries);
    }
    case 'testKeys': {
      const [tmdb, omdb] = await Promise.all([
        msg.tmdbKey.trim() ? testTmdbKey(msg.tmdbKey.trim()) : ('missing' as const),
        msg.omdbKey.trim() ? testOmdbKey(msg.omdbKey.trim()) : ('missing' as const),
      ]);
      return { tmdb, omdb };
    }
    case 'usage':
      return getUsage();
    case 'clearCache':
      await clearCache();
      return null;
    case 'openOptions':
      await browser.runtime.openOptionsPage();
      return null;
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    handle(msg as Message).then(sendResponse, (err: unknown) =>
      sendResponse({ __error: err instanceof Error ? err.message : String(err) }),
    );
    return true;
  });

  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') {
      void browser.tabs.create({ url: browser.runtime.getURL('/options.html') + '?welcome=1' });
    }
    void syncContentScripts();
  });
  browser.runtime.onStartup.addListener(() => void syncContentScripts());
  browser.permissions.onAdded.addListener(() => {
    void completePendingSite().then(syncContentScripts);
  });
  browser.permissions.onRemoved.addListener(() => void syncContentScripts());
  watchSettings(() => void syncContentScripts());
  void syncContentScripts();
});
