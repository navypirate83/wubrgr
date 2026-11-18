/* =====================================================================
   CHECKS FOR THE LENS CHOICES
   Run with:  node --test src/lib/scanner/core/lenses.test.ts
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { findLens, lensChoices, type LensCandidate } from './lenses.ts';

const lens = (id: string, type: string, position = 'back'): LensCandidate => ({ id, type, position, isVirtualDevice: false, physicalDevices: [] });
const blended = (id: string, inner: LensCandidate[]): LensCandidate => ({ id, type: 'triple', position: 'back', isVirtualDevice: true, physicalDevices: inner });

test('three separate back lenses are offered widest first', () => {
  const choices = lensChoices([lens('2', 'telephoto'), lens('0', 'wide-angle'), lens('3', 'ultra-wide-angle')]);
  assert.deepEqual(choices.map((c) => c.label), ['Ultra-wide', 'Main', 'Zoom']);
  assert.deepEqual(choices.map((c) => c.id), ['3', '0', '2']);
});

test('lenses inside a blended camera are found too', () => {
  const choices = lensChoices([blended('0', [lens('1', 'ultra-wide-angle'), lens('2', 'wide-angle')])]);
  assert.deepEqual(choices.map((c) => c.id), ['1', '2']);
});

test('the front camera is never offered', () => {
  const choices = lensChoices([lens('1', 'wide-angle', 'front'), lens('0', 'wide-angle'), lens('2', 'ultra-wide-angle')]);
  assert.deepEqual(choices.map((c) => c.id), ['2', '0']);
});

test('a phone with one lens has no choice to show', () => {
  assert.deepEqual(lensChoices([lens('0', 'wide-angle')]), []);
  assert.deepEqual(lensChoices([]), []);
});

test('the same kind of lens is only offered once', () => {
  const choices = lensChoices([lens('0', 'wide-angle'), lens('5', 'wide-angle'), lens('3', 'telephoto')]);
  assert.deepEqual(choices.map((c) => c.id), ['0', '3']);
});

test('findLens finds a lens by id, even inside a blended camera, and gives nothing for an unknown one', () => {
  const devices = [blended('0', [lens('1', 'ultra-wide-angle'), lens('2', 'wide-angle')]), lens('7', 'telephoto')];
  assert.equal(findLens(devices, '2')?.id, '2');
  assert.equal(findLens(devices, '7')?.id, '7');
  assert.equal(findLens(devices, '99'), null);
  assert.equal(findLens(devices, null), null);
});
