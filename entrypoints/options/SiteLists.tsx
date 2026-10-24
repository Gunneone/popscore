import { useState } from 'preact/hooks';
import { updateSettings, type Settings } from '@/src/settings';
import { DEFAULT_SITES, REGION_NAMES, type Region, type SiteList } from '@/src/sites';

interface Entry {
  /** Site id, or the pattern of a site the user added. */
  key: string;
  name: string;
  region?: Region;
  /** Lower-case text the filter searches: name and domains. */
  search: string;
}

const REGIONS = Object.keys(REGION_NAMES) as Region[];

const hostOf = (pattern: string) => pattern.replace(/^[^:]*:\/\/(\*\.)?/, '').replace(/\/.*$/, '');

const builtIn = (kind: SiteList): Entry[] =>
  DEFAULT_SITES.filter((s) => s.kind === kind).map((s) => ({
    key: s.id,
    name: s.name,
    region: s.region,
    search: `${s.name} ${s.matches.map(hostOf).join(' ')}`.toLowerCase(),
  }));

const CINEMAS = builtIn('cinema');
const STREAMING = builtIn('streaming');

interface PanelProps {
  settings: Settings;
  list: SiteList;
  title: string;
  hint: string;
  entries: Entry[];
  filterable?: boolean;
  empty?: string;
  onRemove?(key: string): void;
}

function SiteListPanel(props: PanelProps) {
  const { settings, list, entries } = props;
  // The short list of the user's own sites starts open; the long built-in ones start folded.
  const [open, setOpen] = useState(!!props.onRemove);
  const [filter, setFilter] = useState('');
  const listOn = !settings.disabledLists.includes(list);
  const off = entries.filter((e) => settings.disabledSites.includes(e.key)).length;
  const count = `${entries.length} ${entries.length === 1 ? 'site' : 'sites'}`;
  const summary =
    entries.length === 0
      ? 'None yet'
      : !listOn
        ? `Paused · ${count}`
        : off
          ? `${count} · ${off} off`
          : `${count} · all on`;

  const toggleList = (on: boolean) =>
    void updateSettings({
      disabledLists: on
        ? settings.disabledLists.filter((l) => l !== list)
        : [...settings.disabledLists, list],
    });
  const toggleSite = (key: string, on: boolean) =>
    void updateSettings({
      disabledSites: on
        ? settings.disabledSites.filter((k) => k !== key)
        : [...settings.disabledSites, key],
    });

  const q = filter.trim().toLowerCase();
  const shown = q ? entries.filter((e) => e.search.includes(q)) : entries;
  const site = (e: Entry) => (
    <li key={e.key}>
      <label>
        <input
          type="checkbox"
          checked={!settings.disabledSites.includes(e.key)}
          onChange={(ev) => toggleSite(e.key, ev.currentTarget.checked)}
        />
        {props.onRemove ? <code>{e.name}</code> : e.name}
      </label>
      {props.onRemove && (
        <button class="btn small" type="button" onClick={() => props.onRemove!(e.key)}>
          Remove
        </button>
      )}
    </li>
  );

  return (
    <div class={`sitelist${listOn ? '' : ' paused'}`}>
      <div class="sitelist-head">
        <label class="switch">
          <input
            type="checkbox"
            checked={listOn}
            onChange={(e) => toggleList(e.currentTarget.checked)}
          />
          <span>
            <b>{props.title}</b>
            <br />
            <span class="muted small">{props.hint}</span>
          </span>
        </label>
        <span class="muted small">{summary}</span>
        {entries.length > 0 && (
          <button
            class="link small"
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? 'Hide ▴' : 'Show sites ▾'}
          </button>
        )}
      </div>
      {entries.length === 0 && props.empty && (
        <p class="muted small sitelist-empty">{props.empty}</p>
      )}
      {open && entries.length > 0 && (
        <div class="sitelist-body">
          {props.filterable && (
            <input
              class="sitelist-filter"
              type="search"
              value={filter}
              onInput={(e) => setFilter(e.currentTarget.value)}
              placeholder="Filter sites…"
              aria-label={`Filter ${props.title.toLowerCase()}`}
            />
          )}
          {props.onRemove ? (
            <ul class="sitelist-own">{shown.map(site)}</ul>
          ) : (
            REGIONS.map((region) => {
              const inRegion = shown.filter((e) => e.region === region);
              if (!inRegion.length) return null;
              return (
                <div key={region}>
                  <h4>{REGION_NAMES[region]}</h4>
                  <ul class="sitelist-grid">{inRegion.map(site)}</ul>
                </div>
              );
            })
          )}
          {shown.length === 0 && <p class="muted small">No site matches “{filter.trim()}”.</p>}
        </div>
      )}
    </div>
  );
}

export function SiteLists({ settings }: { settings: Settings }) {
  const own: Entry[] = settings.extraSites.map((p) => ({
    key: p,
    name: hostOf(p),
    search: p.toLowerCase(),
  }));
  const remove = (pattern: string) =>
    void updateSettings({
      extraSites: settings.extraSites.filter((p) => p !== pattern),
      disabledSites: settings.disabledSites.filter((k) => k !== pattern),
    });

  return (
    <div class="sitelists">
      <SiteListPanel
        settings={settings}
        list="cinema"
        title="Cinemas"
        hint="Cinema chains, tickets and showtimes"
        entries={CINEMAS}
        filterable
      />
      <SiteListPanel
        settings={settings}
        list="streaming"
        title="Streaming services"
        hint="Streaming services and guides"
        entries={STREAMING}
        filterable
      />
      <SiteListPanel
        settings={settings}
        list="custom"
        title="Your sites"
        hint="Sites you switched on from the toolbar button"
        entries={own}
        empty="None yet. To add one, open the site and switch it on from the Popscore toolbar button."
        onRemove={remove}
      />
    </div>
  );
}
