// Summarizes test-results/sites/*.json (written by e2e/live/sites.spec.ts) into
// test-results/sites-report.md and prints the totals.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const DIR = path.resolve('test-results/sites');
const results = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(path.join(DIR, f), 'utf8')))
  .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));

const norm = (s) =>
  (s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** The card's title (first part of "Title 2026 · Film 7.1") roughly matches the hovered label. */
function sameFilm(label, card) {
  const a = norm(label);
  const b = norm(card);
  if (!a || !b) return false;
  return b.includes(a) || a.split(' ').filter((w) => w.length > 2 && b.includes(w)).length >= 1;
}

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');
const rows = [];
const details = [];
const totals = {
  sites: 0,
  tested: 0,
  blocked: 0,
  error: 0,
  pos: 0,
  posHit: 0,
  posWrong: 0,
  neg: 0,
  negHit: 0,
};

for (const r of results) {
  totals.sites++;
  if (r.status !== 'ok') {
    totals[r.status === 'blocked' ? 'blocked' : 'error']++;
    rows.push(`| ${esc(r.name)} | ${r.kind} | ${r.status} | – | – | ${esc(r.reason)} |`);
    continue;
  }
  totals.tested++;
  const hits = r.positives.filter((p) => p.state === 'match');
  const wrong = hits.filter((p) => !sameFilm(p.label, p.card));
  const falseHits = r.negatives.filter((p) => p.state);
  totals.pos += r.positives.length;
  totals.posHit += hits.length;
  totals.posWrong += wrong.length;
  totals.neg += r.negatives.length;
  totals.negHit += falseHits.length;
  const note = r.positives.length === 0 ? 'no film links found' : '';
  rows.push(
    `| ${esc(r.name)} | ${r.kind} | ok | ${hits.length}/${r.positives.length}${wrong.length ? ` (${wrong.length} ⚠)` : ''} | ${r.negatives.length - falseHits.length}/${r.negatives.length} | ${note} |`,
  );
  const lines = [
    ...r.positives
      .filter((p) => p.state !== 'match' || !sameFilm(p.label, p.card))
      .map(
        (p) =>
          `- film “${esc(p.label)}” → ${p.state ? `${p.state}: ${esc(p.card)}` : 'no card'} (${p.href})`,
      ),
    ...falseHits.map((p) => `- ${p.kind} “${esc(p.label)}” → ${p.state}: ${esc(p.card)}`),
  ];
  if (lines.length)
    details.push(`### ${r.name}\n\n${r.finalUrl ?? r.url}\n\n${lines.join('\n')}\n`);
}

const md = `# Live site check

${totals.tested} of ${totals.sites} sites tested (${totals.blocked} blocked or geo-restricted, ${totals.error} errors).

- Film links: ${totals.posHit} of ${totals.pos} opened a card${totals.posWrong ? `, ${totals.posWrong} of them possibly for a different film` : ''}.
- Other page elements: ${totals.neg - totals.negHit} of ${totals.neg} stayed quiet (${totals.negHit} opened a card).

| Site | Kind | Status | Films with card | Others quiet | Note |
| --- | --- | --- | --- | --- | --- |
${rows.join('\n')}

## Misses and false cards

${details.join('\n') || 'None.'}
`;

writeFileSync(path.resolve('test-results/sites-report.md'), md);
console.log(md.split('\n| Site')[0]);
console.log('Full report: test-results/sites-report.md');
