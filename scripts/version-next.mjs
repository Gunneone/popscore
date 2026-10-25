#!/usr/bin/env node
// Sets the next calendar version, YYYY.M.N: year, month, and the release number within that month
// (2026.10.1, 2026.10.2, then 2026.11.1). No leading zeros: the browser stores reject them, and
// the result is also valid semver for npm. Releasing several times a day works, which matters when
// a store rejects an upload and the fix has to go out with a higher version.
// The version is set here before a release, not at build time, so a rebuild from source on
// another day (as AMO reviewers do) produces the same package. WXT copies it into the manifest.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const d = new Date();
const month = `${d.getFullYear()}.${d.getMonth() + 1}`;
const current = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const n = current.startsWith(`${month}.`) ? Number(current.split('.')[2]) + 1 : 1;
execFileSync('npm', ['version', `${month}.${n}`, '--no-git-tag-version'], {
  cwd: ROOT,
  stdio: 'inherit',
});
