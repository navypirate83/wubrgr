/* =====================================================================
   CHECKS FOR CHECKING A SET CODE AGAINST THE REAL SETS
   Run with:  node --test src/lib/scanner/core/setCode.test.ts
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSetCode } from './setCode.ts';

const known = new Set(['one', 'sld', 'mom', 'bro', 'tdom', 'm21', 'onex']);

test('a real code is used as it is', () => {
  assert.deepEqual(checkSetCode('MOM', known), { code: 'mom', corrected: false, ambiguous: false });
});

test('a D read as an O is put right ("SLO" is "SLD")', () => {
  assert.deepEqual(checkSetCode('slo', known), { code: 'sld', corrected: true, ambiguous: false });
});

test('a zero read for the letter O is still put right', () => {
  assert.equal(checkSetCode('m0m', known)?.code, 'mom');
});

test('the bullet read as a letter on the end ("ONEX") gives the real code without it', () => {
  const noX = new Set(['one', 'sld']);
  assert.deepEqual(checkSetCode('onex', noX), { code: 'one', corrected: true, ambiguous: false });
});

test('a real 4 character code is not cut short', () => {
  assert.equal(checkSetCode('tdom', known)?.code, 'tdom');
});

test('something that is no set at all gives nothing', () => {
  assert.equal(checkSetCode('zzzz', known), null);
  assert.equal(checkSetCode(null, known), null);
});

test('a stray extra character inside the code ("CI19" for "C19") is taken out', () => {
  const real = new Set(['c19', 'one', 'sld']);
  assert.deepEqual(checkSetCode('ci19', real), { code: 'c19', corrected: true, ambiguous: false });
});
