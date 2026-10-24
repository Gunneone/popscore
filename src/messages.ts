import { browser } from 'wxt/browser';
import type {
  KeyTestResult,
  LookupRequest,
  LookupResult,
  MediaKind,
  MovieSummary,
  TagScore,
  Usage,
} from './types';

export type Message =
  | { type: 'lookup'; req: LookupRequest }
  /** Score tag for a movie on the page: rejects with the LookupError code when the lookup failed. */
  | { type: 'tag'; req: LookupRequest }
  /** User typed a title into the card; remember the answer for the hovered text `original`. */
  | { type: 'search'; original: string; text: string; pageLang: string; cinema: boolean }
  | {
      type: 'pick';
      query: string;
      kind: MediaKind;
      tmdbId: number;
      alternatives: MovieSummary[];
    }
  | { type: 'posters'; paths: string[] }
  | { type: 'testKeys'; tmdbKey: string; omdbKey: string }
  | { type: 'usage' }
  | { type: 'clearCache' }
  | { type: 'openOptions' };

export interface Responses {
  lookup: LookupResult;
  /** null: not a movie or show, or no score yet. */
  tag: TagScore | null;
  search: LookupResult;
  pick: LookupResult;
  posters: Record<string, string | null>;
  testKeys: KeyTestResult;
  usage: Usage;
  clearCache: null;
  openOptions: null;
}

export async function send<M extends Message>(msg: M): Promise<Responses[M['type']]> {
  const res: unknown = await browser.runtime.sendMessage(msg);
  if (res && typeof res === 'object' && '__error' in res) throw new Error(String(res.__error));
  return res as Responses[M['type']];
}
