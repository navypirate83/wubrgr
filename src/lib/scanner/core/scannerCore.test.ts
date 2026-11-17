/* =====================================================================
   TESTS FOR THE SCANNER'S SHARED CORE
   Run with:  node --test src/lib/scanner/core/*.test.ts
   (Node runs the TypeScript directly; nothing needs installing.)
   The big one is the info-line parser: both printed layouts, leading zeros,
   letters and symbols in collector numbers, token set codes, and garbled OCR.
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCopyrightYears, parseInfoLine } from './infoLine.ts';
import { checkSetCode } from './setCode.ts';
import { bestNameMatch, editDistance, similarity } from './fuzzy.ts';
import { SYMBOL_BYTES, SYMBOL_SIZE, normalizeSymbol, symbolBitsFromGray, symbolScore } from './symbolMatch.ts';
import { rankCandidates, type Candidate } from './rank.ts';
import { decideScan } from './decide.ts';
import { normalizeName } from './text.ts';
import { binarizeForOcr } from './ocrPrep.ts';

/* ---------- the info line ---------- */

test('older layout: number/total and rarity, then set and language', () => {
  const info = parseInfoLine('123/280 R\nDOM • EN');
  assert.deepEqual(info, { collectorNumber: '123', setTotal: '280', rarity: 'R', setCode: 'dom', lang: 'en', layout: 'older' });
});

test('newer layout: rarity and number, then set and language', () => {
  const info = parseInfoLine('R 0123\nMOM • EN');
  assert.deepEqual(info, { collectorNumber: '123', setTotal: null, rarity: 'R', setCode: 'mom', lang: 'en', layout: 'newer' });
});

test('leading zeros and the /total part are dropped', () => {
  assert.equal(parseInfoLine('0045/0264 C\nM19 • EN').collectorNumber, '45');
  assert.equal(parseInfoLine('U 0007\nLCI • EN').collectorNumber, '7');
  assert.equal(parseInfoLine('M 0000\nLCI • EN').collectorNumber, '0');
});

test('collector numbers keep letters and symbols', () => {
  assert.equal(parseInfoLine('123a/280 U\nDOM • EN').collectorNumber, '123a');
  assert.equal(parseInfoLine('R 0123a\nMOM • EN').collectorNumber, '123a');
  assert.equal(parseInfoLine('45★/280 R\nDOM • EN').collectorNumber, '45★');
  assert.equal(parseInfoLine('R 0045★\nMOM • EN').collectorNumber, '45★');
});

test('token and long set codes', () => {
  assert.equal(parseInfoLine('R 0001\nTDOM • EN').setCode, 'tdom');
  assert.equal(parseInfoLine('C 0012\nPLIST • EN').setCode, 'plist');
  assert.equal(parseInfoLine('C 0012\n10E • EN').setCode, '10e');
});

test('other languages', () => {
  assert.equal(parseInfoLine('R 0123\nMOM • JP').lang, 'ja');
  assert.equal(parseInfoLine('R 0123\nMOM • KR').lang, 'ko');
  assert.equal(parseInfoLine('R 0123\nMOM • CS').lang, 'zhs');
  assert.equal(parseInfoLine('R 0123\nMOM • CT').lang, 'zht');
  assert.equal(parseInfoLine('R 0123\nMOM • FR').lang, 'fr');
  assert.equal(parseInfoLine('R 0123\nMOM • PH').lang, 'ph');
});

test('garbled OCR: a misread bullet, extra spaces, lower case, look-alike digits', () => {
  assert.equal(parseInfoLine('R 0123\nMOM + EN').setCode, 'mom');
  assert.equal(parseInfoLine('R 0123\nMOM . EN').lang, 'en');
  assert.equal(parseInfoLine('R 0123\nMOM*EN').setCode, 'mom');
  assert.equal(parseInfoLine('r  0123 \n  mom  •  en').setCode, 'mom');
  assert.equal(parseInfoLine('1O3/28O R\nDOM • EN').collectorNumber, '103');
  assert.equal(parseInfoLine('R O123\nMOM • EN').collectorNumber, '123');
  assert.equal(parseInfoLine('R 01Z3\nMOM • EN').collectorNumber, '123');
});

test('a number alone is accepted when the set was read; nothing usable gives nulls', () => {
  assert.equal(parseInfoLine('0123\nMOM • EN').collectorNumber, '123');
  const nothing = parseInfoLine('~~ ?? ~~');
  assert.equal(nothing.collectorNumber, null);
  assert.equal(nothing.setCode, null);
  assert.equal(parseInfoLine('').layout, null);
});

test('words are never taken for numbers', () => {
  assert.equal(parseInfoLine('ILLUSTRATED BY SOMEONE').collectorNumber, null);
});

test('the copyright year', () => {
  assert.deepEqual(parseCopyrightYears('TM & © 1995 Wizards of the Coast'), { from: 1995, to: 1995 });
  assert.deepEqual(parseCopyrightYears('©1993-1994 Wizards'), { from: 1993, to: 1994 });
  assert.equal(parseCopyrightYears('no year here'), null);
});

/* ---------- set codes ---------- */

const SETS = new Set(['dom', 'mom', 'tdom', 'lea', 'plist', '10e', 'm19', 'sos', 'sob']);

test('a real set code is used as it is', () => {
  assert.deepEqual(checkSetCode('dom', SETS), { code: 'dom', corrected: false, ambiguous: false });
});

test('look-alike swaps (0/O, 1/I, 5/S, 8/B) are tried, and only a real set is accepted', () => {
  assert.deepEqual(checkSetCode('d0m', SETS), { code: 'dom', corrected: true, ambiguous: false });
  assert.deepEqual(checkSetCode('m0m', SETS), { code: 'mom', corrected: true, ambiguous: false });
  assert.equal(checkSetCode('xyz', SETS)?.code, undefined);
  assert.equal(checkSetCode(null, SETS), null);
});

test('a code that could be two real sets is flagged ambiguous', () => {
  const both = new Set(['sos', 'so5']);
  const result = checkSetCode('s0s', new Set(['sos', 'sob', 'so5']));
  assert.equal(result?.ambiguous, true);
  assert.equal(both.size, 2);
});

/* ---------- fuzzy names ---------- */

const NAMES = ['lightning bolt', 'lightning blast', 'sol ring', 'sol talisman', 'plains', 'island', 'exotic orchard'];

test('edit distance counts changes, and look-alike letters cost less', () => {
  assert.equal(editDistance('sol ring', 'sol ring'), 0);
  assert.equal(editDistance('sol ring', 'sol rinq'), 1);
  assert.ok(editDistance('ex0tic orchard', 'exotic orchard') < 1);
  assert.ok(similarity('lightning bolt', 'lightning boit') > 0.9);
});

test('a misread name finds the real card', () => {
  assert.equal(bestNameMatch(normalizeName('Lightning Boit'), NAMES)?.name, 'lightning bolt');
  assert.equal(bestNameMatch(normalizeName('Sol Rinq'), NAMES)?.name, 'sol ring');
  assert.equal(bestNameMatch(normalizeName('Ex0tic 0rchard'), NAMES)?.name, 'exotic orchard');
});

test('a clear match is marked clear, an unclear one is not, and nonsense matches nothing', () => {
  assert.equal(bestNameMatch('lightning bolt', NAMES)?.clear, true);
  assert.equal(bestNameMatch('qqqqqqqq', NAMES), null);
  assert.equal(bestNameMatch('', NAMES), null);
});

/* ---------- the set symbol ---------- */

// A grey picture with a dark square or circle on a light background
function drawing(shape: 'square' | 'circle' | 'cross', size = 80, margin = 10, light = 220, dark = 30) {
  const gray = new Uint8Array(size * size).fill(light);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - size / 2;
      const dy = y - size / 2;
      const inside = Math.abs(dx) < size / 2 - margin && Math.abs(dy) < size / 2 - margin;
      const hit = shape === 'square' ? inside
        : shape === 'circle' ? Math.hypot(dx, dy) < size / 2 - margin
        : Math.abs(dx) < 8 || Math.abs(dy) < 8;
      if (hit) gray[y * size + x] = dark;
    }
  }
  return gray;
}

test('a symbol crop becomes a 64 x 64 bitmap, and a blank crop has no symbol', () => {
  const bits = symbolBitsFromGray(drawing('circle'), 80, 80);
  assert.ok(bits && bits.length === SYMBOL_BYTES && SYMBOL_SIZE === 64);
  assert.equal(symbolBitsFromGray(new Uint8Array(100).fill(120), 10, 10), null);
});

test('the same symbol scores high even loosely cropped or in another colour, different ones score low', () => {
  const circle = symbolBitsFromGray(drawing('circle'), 80, 80)!;
  const looseCircle = symbolBitsFromGray(drawing('circle', 120, 40, 240, 90), 120, 120)!;   // a different crop, and a "gold" symbol
  const square = symbolBitsFromGray(drawing('square'), 80, 80)!;
  const cross = symbolBitsFromGray(drawing('cross'), 80, 80)!;
  assert.ok(symbolScore(circle, looseCircle) > 0.8, `same: ${symbolScore(circle, looseCircle)}`);
  assert.ok(symbolScore(circle, square) < 0.9 && symbolScore(circle, square) < symbolScore(circle, looseCircle));
  assert.ok(symbolScore(circle, cross) < 0.5, `different: ${symbolScore(circle, cross)}`);
  assert.equal(normalizeSymbol(new Uint8Array(SYMBOL_BYTES)).every((b) => b === 0), true);
});

/* ---------- ranking the printings ---------- */

const printing = (id: string, setCode: string, year: number, border: string): Candidate =>
  ({ id, setCode, year, border, group: id });
const BOLT = [
  printing('lea', 'lea', 1993, 'black'), printing('leb', 'leb', 1993, 'black'),
  printing('2ed', '2ed', 1993, 'white'), printing('3ed', '3ed', 1994, 'white'),
  printing('4ed', '4ed', 1995, 'white'), printing('5ed', '5ed', 1997, 'white'),
  printing('m10', 'm10', 2009, 'black'),
];
const ids = (candidates: Candidate[]) => candidates.map((c) => c.id);

test('the year and the border push the right printings up the list, and a clear lead is "likely"', () => {
  const byYear = rankCandidates(BOLT, { years: { from: 1995, to: 1995 } });
  assert.equal(byYear.ordered[0].id, '4ed');
  assert.equal(byYear.likely, true);
  // The border alone only splits them into two bunches, so nothing is clearly ahead
  const byBorder = rankCandidates(BOLT, { border: 'white' });
  assert.deepEqual(ids(byBorder.ordered).slice(0, 4), ['2ed', '3ed', '4ed', '5ed']);
  assert.equal(byBorder.likely, false);
  // With no clues at all every printing is level, the catalogue's order is kept, and nothing is likely
  const none = rankCandidates(BOLT, {});
  assert.deepEqual(ids(none.ordered), ids(BOLT));
  assert.equal(none.likely, false);
});

test('a clue that is wrong costs a printing points but never removes it', () => {
  // No printing is from 1850, but every printing is still in the list (the old way kept them by ignoring the clue)
  const result = rankCandidates(BOLT, { years: { from: 1850, to: 1850 } });
  assert.equal(result.ordered.length, BOLT.length);
  // Art says Beta, a wrong year says Revised: the strong art clue still wins
  const art = new Map([['lea', 120], ['leb', 15], ['2ed', 118]]);
  const mixed = rankCandidates(BOLT.slice(0, 3), { artDistances: art, years: { from: 1994, to: 1994 } });
  assert.equal(mixed.ordered[0].id, 'leb');
});

test('symbol overlap and art distance put the best candidates first', () => {
  const symbols = new Map([['lea', 0.2], ['2ed', 0.9], ['3ed', 0.88], ['4ed', 0.3]]);
  assert.deepEqual(ids(rankCandidates(BOLT.slice(0, 5), { symbolScores: symbols }).ordered).slice(0, 2), ['2ed', '3ed']);
  const art = new Map([['lea', 90], ['leb', 10], ['2ed', 14], ['3ed', 120]]);
  assert.deepEqual(ids(rankCandidates(BOLT.slice(0, 4), { artDistances: art }).ordered).slice(0, 2), ['leb', '2ed']);
  // Art nowhere near any candidate: they all lose about the same, so nothing is clearly ahead
  const far = rankCandidates(BOLT.slice(0, 3), { artDistances: new Map([['lea', 110], ['leb', 112], ['2ed', 114]]) });
  assert.equal(far.likely, false);
});

test('printings that look the same (same set and art) do not count as rivals, but a different set does', () => {
  const foil = { ...printing('foil', 'm10', 2009, 'black'), group: 'm10|art1' };
  const plain = { ...printing('plain', 'm10', 2009, 'black'), group: 'm10|art1' };
  const other = { ...printing('other', 'lea', 1993, 'black'), group: 'lea|art2' };
  const art = new Map([['foil', 20], ['plain', 20], ['other', 140]]);
  const result = rankCandidates([foil, plain, other], { artDistances: art });
  assert.equal(result.likely, true);
  assert.equal(result.ordered[0].group, 'm10|art1');
  assert.equal(result.fits, 2);
  // Close art for two different sets: not likely, and both fit
  const tied = rankCandidates([foil, other], { artDistances: new Map([['foil', 20], ['other', 22]]) });
  assert.equal(tied.likely, false);
  assert.equal(tied.fits, 2);
});

test('the reasons are written in plain words', () => {
  const result = rankCandidates(BOLT.slice(0, 3), { artDistances: new Map([['lea', 20], ['leb', 100], ['2ed', 100]]), border: 'black' });
  assert.match(result.why, /art matches \(20 bits\)/);
  assert.match(result.why, /black border/);
});

/* ---------- how sure a scan is ---------- */

const GOOD = parseInfoLine('R 0123\nMOM • EN');
const OK_SET = { code: 'mom', corrected: false, ambiguous: false };

test('a clean match with the name agreeing is sure', () => {
  assert.equal(decideScan({ info: GOOD, setCode: OK_SET, matches: 1, nameAgrees: true, requireName: true }).status, 'sure');
});

test('a disagreeing name, several matches, a made-up set or no number is uncertain', () => {
  assert.equal(decideScan({ info: GOOD, setCode: OK_SET, matches: 1, nameAgrees: false, requireName: false }).status, 'uncertain');
  assert.equal(decideScan({ info: GOOD, setCode: OK_SET, matches: 2, nameAgrees: true, requireName: false }).status, 'uncertain');
  assert.equal(decideScan({ info: GOOD, setCode: OK_SET, matches: 0, nameAgrees: true, requireName: false }).status, 'uncertain');
  assert.equal(decideScan({ info: GOOD, setCode: null, matches: 1, nameAgrees: true, requireName: false }).status, 'uncertain');
  assert.equal(decideScan({ info: { ...GOOD, collectorNumber: null }, setCode: OK_SET, matches: 0, nameAgrees: true, requireName: false }).status, 'uncertain');
});

test('on the web a single photo needs the name too; elsewhere an unread name is not held against it', () => {
  assert.equal(decideScan({ info: GOOD, setCode: OK_SET, matches: 1, nameAgrees: null, requireName: true }).status, 'uncertain');
  assert.equal(decideScan({ info: GOOD, setCode: OK_SET, matches: 1, nameAgrees: null, requireName: false }).status, 'sure');
});

test('a corrected but ambiguous set code is uncertain; nothing read is none', () => {
  assert.equal(decideScan({ info: GOOD, setCode: { code: 'sos', corrected: true, ambiguous: true }, matches: 1, nameAgrees: true, requireName: false }).status, 'uncertain');
  assert.equal(decideScan({ info: parseInfoLine(''), setCode: null, matches: 0, nameAgrees: null, requireName: false }).status, 'none');
});

/* ---------- getting a crop ready for OCR ---------- */

test('binarizeForOcr makes the smaller side black text on white, either way round, and flip takes the other side', () => {
  // Pale text on a dark bar: mostly dark pixels (the background), a few light ones (the text)
  const paleOnDark = new Uint8Array(100).fill(30);
  for (const i of [10, 11, 12, 40, 41, 70]) paleOnDark[i] = 230;
  const a = binarizeForOcr(paleOnDark);
  assert.deepEqual([a[10], a[40], a[0], a[99]], [0, 0, 255, 255]);
  // Dark text on a pale bar: the same result
  const darkOnPale = paleOnDark.map((v) => 255 - v);
  const b = binarizeForOcr(darkOnPale);
  assert.deepEqual([b[10], b[40], b[0], b[99]], [0, 0, 255, 255]);
  // Flipped: the big side is taken as the text
  const flipped = binarizeForOcr(paleOnDark, true);
  assert.deepEqual([flipped[10], flipped[0]], [255, 0]);
});
