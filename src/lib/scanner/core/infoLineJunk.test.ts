/* =====================================================================
   CHECKS FOR READING AN INFO LINE THAT HAS JUNK AROUND THE NUMBER
   Run with:  node --test src/lib/scanner/core/infoLineJunk.test.ts
   Each text below is what the text reader really gave on a test photo.
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInfoLine } from './infoLine.ts';

test('a stray line before the real one does not hide the number ("SOC" then "R0330")', () => {
  const info = parseInfoLine('SOC\nR0330\nMH3-EN');
  assert.equal(info.collectorNumber, '330');
  assert.equal(info.setCode, 'mh3');
});

test('a clean number wins over letters read as digits ("COSL1S" then "0195")', () => {
  assert.equal(parseInfoLine('COSL1S\n0195').collectorNumber, '195');
});

test('a number is still taken when no set code could be read', () => {
  assert.equal(parseInfoLine('I\nE0347.').collectorNumber, '347');
  assert.equal(parseInfoLine('029\n-ENOANNI').collectorNumber, '29');
});

test('a number with junk letters after it is still found ("0077FFXV")', () => {
  assert.equal(parseInfoLine('0077FFXV').collectorNumber, '77');
});

test('the older layout still beats a bare number, and a plain good line is unchanged', () => {
  const older = parseInfoLine('042/302M\nC19*EN');
  assert.equal(older.collectorNumber, '42');
  assert.equal(older.setTotal, '302');
  assert.equal(older.layout, 'older');
  const newer = parseInfoLine('R 0123\nMOM • EN');
  assert.equal(newer.collectorNumber, '123');
  assert.equal(newer.setCode, 'mom');
  assert.equal(newer.rarity, 'R');
});

test('text with no digits at all gives no number', () => {
  assert.equal(parseInfoLine('SS\nLC').collectorNumber, null);
  assert.equal(parseInfoLine('').collectorNumber, null);
});
