// IMPORTANT: setenv must be the first import so any transitive `src/config.ts`
// import sees valid env vars before validation runs.
import './setenv.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeVersion } from '../src/services/manifest.js';

test('normalizeVersion: strips epoch prefix', () => {
  assert.equal(normalizeVersion('1:6.6.1'), '6.6.1');
  assert.equal(normalizeVersion('2:1.2.3'), '1.2.3');
});

test('normalizeVersion: strips numeric pkgrel suffix', () => {
  assert.equal(normalizeVersion('6.6.1-1'), '6.6.1');
  assert.equal(normalizeVersion('1.88.127-2'), '1.88.127');
});

test('normalizeVersion: strips epoch and pkgrel together', () => {
  assert.equal(normalizeVersion('1:6.6.1-2'), '6.6.1');
});

test('normalizeVersion: strips named pkgrel suffix', () => {
  assert.equal(normalizeVersion('6.10.2-arch1'), '6.10.2');
  assert.equal(normalizeVersion('5.15.0-arch2'), '5.15.0');
});

test('normalizeVersion: leaves plain upstream versions unchanged', () => {
  assert.equal(normalizeVersion('6.10.2'), '6.10.2');
  assert.equal(normalizeVersion('1.2.3'), '1.2.3');
  assert.equal(normalizeVersion('20240101'), '20240101');
});

test('normalizeVersion: preserves hyphenated pre-release identifiers that are not release tags', () => {
  // A trailing alpha-only segment (no digit) is not a release tag and is kept.
  assert.equal(normalizeVersion('1.0.0-beta'), '1.0.0-beta');
  assert.equal(normalizeVersion('1.0.0-rc'), '1.0.0-rc');
});

test('normalizeVersion: trims surrounding whitespace', () => {
  assert.equal(normalizeVersion('  6.6.1-1  '), '6.6.1');
});

test('normalizeVersion: handles plain version with no suffix or epoch', () => {
  assert.equal(normalizeVersion('git'), 'git');
  assert.equal(normalizeVersion('r1234.abcdef'), 'r1234.abcdef');
});
