import { useEffect, useState } from 'preact/hooks';
import { normalizeTitle } from '../match/normalize';
import type { LinkTarget } from '../settings';
import type { LookupError, LookupResult, MovieSummary } from '../types';
import { displayScore, formatRuntime, formatVotes, verdict } from './format';

export type CardState = { kind: 'loading' } | { kind: 'result'; result: LookupResult };

export interface CardProps {
  state: CardState;
  greenAt: number;
  amberAt: number;
  linkTo: LinkTarget;
  onPick(query: string, movie: MovieSummary, pool: MovieSummary[]): void;
  onSearch(original: string, text: string): void;
  onOpenSettings(): void;
  loadPosters(paths: string[]): Promise<Record<string, string | null>>;
}

const ERROR_TEXT: Record<LookupError, string> = {
  'bad-tmdb-key': "TMDB didn't accept your API key.",
  'bad-omdb-key': "OMDb didn't accept your API key.",
  'rate-limit':
    'Daily lookup limit reached (OMDb free keys allow 1,000 a day). Movies you looked up before still work.',
  'server-busy':
    'The Worth It? server is busy. Try again in a bit, or add your own free API keys in Settings.',
  offline: "Couldn't reach the movie database. Check your connection.",
  unknown: 'Something went wrong looking this up.',
};

const RATING_ERROR_TEXT: Partial<Record<LookupError, string>> = {
  'rate-limit': "OMDb's free daily limit (1,000 lookups) is used up. Ratings return tomorrow.",
  'bad-omdb-key': "OMDb didn't accept your API key, so there's no IMDb rating.",
  'server-busy': "The Worth It? server is busy, so there's no IMDb rating for now. Try again soon.",
  offline: "Couldn't get the IMDb rating. Check your connection.",
};

/** Errors the settings page can fix: own keys to correct, or to add. */
const SETTINGS_ERRORS: LookupError[] = ['bad-tmdb-key', 'bad-omdb-key', 'server-busy'];

export function Card(props: CardProps) {
  const { state } = props;
  let body;
  if (state.kind === 'loading') body = <Skeleton />;
  else if (state.result.status === 'error')
    body = <ErrorView {...props} error={state.result.error} />;
  else if (state.result.status === 'nomatch')
    body = (
      <NoMatch {...props} query={state.result.query} alternatives={state.result.alternatives} />
    );
  else {
    const r = state.result;
    body = <MatchView {...props} key={`${r.movie.tmdbId}:${r.query}`} result={r} />;
  }
  return (
    <div class="card" role="dialog" aria-label="IMDb rating">
      {body}
    </div>
  );
}

function Skeleton() {
  return (
    <div class="top skeleton" aria-busy="true">
      <div class="poster" />
      <div>
        <div class="bar" style={{ width: '75%', marginTop: 0 }} />
        <div class="bar" style={{ width: '40%' }} />
        <div class="bar" style={{ width: '55%', height: '20px', marginTop: '12px' }} />
      </div>
    </div>
  );
}

function ErrorView(props: CardProps & { error: LookupError }) {
  return (
    <>
      <p class="message">{ERROR_TEXT[props.error]}</p>
      {SETTINGS_ERRORS.includes(props.error) && (
        <button class="primary" type="button" onClick={props.onOpenSettings}>
          Open settings
        </button>
      )}
    </>
  );
}

function NoMatch(props: CardProps & { query: string; alternatives: MovieSummary[] }) {
  return (
    <>
      <p class="message">
        No confident match for <b>“{props.query}”</b>.
      </p>
      {props.alternatives.length > 0 && <div class="facts">Did you mean:</div>}
      <Picker {...props} pool={props.alternatives} />
    </>
  );
}

function MatchView(props: CardProps & { result: Extract<LookupResult, { status: 'match' }> }) {
  const { result, greenAt, amberAt } = props;
  const m = result.movie;
  const [open, setOpen] = useState(false);
  const [posterOk, setPosterOk] = useState(true);
  const score = displayScore(m);
  const v = verdict(score?.value ?? null, greenAt, amberAt);

  const q = normalizeTitle(result.query);
  const aka =
    q !== normalizeTitle(m.title) && q !== normalizeTitle(m.originalTitle)
      ? result.query
      : m.originalTitle !== m.title
        ? m.originalTitle
        : null;
  const facts = [m.genres.slice(0, 3).join(', '), m.runtime ? formatRuntime(m.runtime) : '']
    .filter(Boolean)
    .join(' · ');
  const current: MovieSummary = {
    tmdbId: m.tmdbId,
    title: m.title,
    originalTitle: m.originalTitle,
    year: m.year,
    posterPath: m.posterPath,
    popularity: 0,
    voteCount: 0,
  };
  const ratingNote = result.ratingError ? RATING_ERROR_TEXT[result.ratingError] : undefined;
  const link =
    props.linkTo === 'letterboxd'
      ? { href: `https://letterboxd.com/tmdb/${m.tmdbId}/`, label: 'Letterboxd' }
      : m.imdbId
        ? { href: `https://www.imdb.com/title/${m.imdbId}/`, label: 'IMDb' }
        : null;

  return (
    <>
      <div class="top">
        {m.poster && posterOk ? (
          <img class="poster" src={m.poster} alt="" onError={() => setPosterOk(false)} />
        ) : (
          <div class="poster" />
        )}
        <div>
          <p class="title">{m.title}</p>
          {aka && <div class="aka">aka “{aka}”</div>}
          <div class="meta">
            {m.year ?? 'Year unknown'} · Film{result.picked ? ' · your pick' : ''}
          </div>
          <div class={`rating ${v}`}>
            <span class="dot" />
            {score ? (
              <>
                <span class="score">{score.value.toFixed(1)}</span>
                <span class="out">/10 {score.source}</span>
                {score.votes !== null && (
                  <span class="votes">· {formatVotes(score.votes)} votes</span>
                )}
              </>
            ) : (
              <span class="score">No rating yet</span>
            )}
          </div>
        </div>
      </div>
      {facts && <div class="facts">{facts}</div>}
      {m.overview && <p class="plot">{m.overview}</p>}
      {ratingNote && (
        <div class="note">
          {ratingNote}{' '}
          {result.ratingError && SETTINGS_ERRORS.includes(result.ratingError) && (
            <button class="link" type="button" onClick={props.onOpenSettings}>
              Settings
            </button>
          )}
        </div>
      )}
      <div class="footer">
        <button class="link" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Close ▴' : 'Wrong movie? ▾'}
        </button>
        {link && (
          <a class="link" href={link.href} target="_blank" rel="noopener noreferrer">
            Open on {link.label} ↗
          </a>
        )}
      </div>
      {open && (
        <Picker
          {...props}
          query={result.query}
          alternatives={result.alternatives}
          pool={[current, ...result.alternatives]}
        />
      )}
    </>
  );
}

function Picker(
  props: CardProps & { query: string; alternatives: MovieSummary[]; pool: MovieSummary[] },
) {
  const { alternatives, loadPosters } = props;
  const [thumbs, setThumbs] = useState<Record<string, string | null>>({});
  const [text, setText] = useState(props.query);

  useEffect(() => {
    const paths = alternatives.map((a) => a.posterPath).filter((p): p is string => !!p);
    if (paths.length) loadPosters(paths).then(setThumbs, () => {});
  }, [alternatives, loadPosters]);

  return (
    <div class="picker">
      {alternatives.length > 0 && (
        <ul class="alts">
          {alternatives.map((a) => {
            const thumb = a.posterPath ? thumbs[a.posterPath] : null;
            return (
              <li key={a.tmdbId}>
                <button
                  class="alt"
                  type="button"
                  onClick={() => props.onPick(props.query, a, props.pool)}
                >
                  {thumb ? <img src={thumb} alt="" /> : <span class="thumb" />}
                  <span>
                    {a.title} <span class="year">{a.year ?? '—'}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <form
        class="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) props.onSearch(props.query, text.trim());
        }}
      >
        <input
          value={text}
          onInput={(e) => setText(e.currentTarget.value)}
          placeholder="Search another title…"
          aria-label="Search another movie title"
        />
        <button type="submit">Search</button>
      </form>
    </div>
  );
}
