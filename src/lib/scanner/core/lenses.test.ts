/* =====================================================================
   CHECKS FOR THE LENS CHOICES
   Run with:  node --test src/lib/scanner/core/lenses.test.ts
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { findCamera, lensChoices, mainCamera, type LensCandidate } from './lenses.ts';

// A camera for the checks: a single lens zooms from 1x to 8x unless told otherwise
const camera = (id: string, type: string, minZoom = 1, maxZoom = 8, position = 'back'): LensCandidate => ({ id, type, position, minZoom, maxZoom });
// A lens that is only listed as a part of a blended camera: the camera library gives it no kind and no zoom
const part = (id: string): LensCandidate => camera(id, 'unknown', 0, 0);

test('a blended back camera gets zoom buttons on itself: widest, 1x, 2x', () => {
  const choices = lensChoices([camera('0', 'triple', 0.6, 10), camera('1', 'wide-angle', 1, 4, 'front')], '0');
  assert.deepEqual(choices.map((c) => c.label), ['0.6x', '1x', '2x']);
  assert.deepEqual(choices.map((c) => c.deviceId), ['0', '0', '0']);
  assert.deepEqual(choices.map((c) => c.zoom), [0.6, 1, 2]);
});

test('a blended camera is used even when the phone calls a single lens its usual camera', () => {
  const devices = [camera('0', 'wide-angle'), camera('5', 'triple', 0.5, 10)];
  assert.equal(mainCamera(devices, '0')?.id, '5');
  assert.deepEqual(lensChoices(devices, '0').map((c) => c.label), ['0.5x', '1x', '2x']);
});

test('separate back cameras: the ultra-wide and zoom cameras get their own buttons', () => {
  const choices = lensChoices([camera('2', 'telephoto'), camera('0', 'wide-angle'), camera('3', 'ultra-wide-angle')], '0');
  assert.deepEqual(choices.map((c) => c.label), ['Ultra-wide', '1x', '2x', 'Tele']);
  assert.deepEqual(choices.map((c) => c.deviceId), ['3', '0', '0', '2']);
});

test('lenses that are only parts of another camera are never offered', () => {
  const choices = lensChoices([camera('0', 'wide-angle'), part('2'), part('3')], '0');
  assert.deepEqual(choices.map((c) => c.deviceId), ['0', '0']);
});

test('the front camera is never offered', () => {
  const choices = lensChoices([camera('1', 'triple', 0.5, 8, 'front'), camera('0', 'wide-angle')], '0');
  assert.deepEqual(choices.map((c) => c.deviceId), ['0', '0']);
});

test('nothing to show when there is no back camera, or one that cannot zoom', () => {
  assert.deepEqual(lensChoices([], null), []);
  assert.deepEqual(lensChoices([camera('0', 'wide-angle', 1, 1)], '0'), []);
});

test('every button has its own id', () => {
  const choices = lensChoices([camera('2', 'telephoto'), camera('0', 'triple', 0.6, 10), camera('3', 'ultra-wide-angle')], '0');
  assert.equal(new Set(choices.map((c) => c.id)).size, choices.length);
});

test('findCamera finds a camera by id and gives nothing for an unknown one', () => {
  const devices = [camera('0', 'triple', 0.6, 10), camera('7', 'telephoto')];
  assert.equal(findCamera(devices, '7')?.id, '7');
  assert.equal(findCamera(devices, '99'), null);
  assert.equal(findCamera(devices, null), null);
});
