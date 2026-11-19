/* =====================================================================
   CHECKS FOR THE CRASH TRAIL'S PLAIN SUMS
   Run with:  node --test src/lib/scanner/core/crashTrailCore.test.ts
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { CLEAN_EXIT, MAX_CRUMBS, addCrumb, decodeTrail, encodeTrail, lastSteps, reportText, cameraWasActive, stepsSinceCleanExit, sessionReportText, stepsInWords, wasInterrupted, type Crumb } from './crashTrailCore.ts';

test('adding a step puts it at the end and leaves the old list alone', () => {
  const before: Crumb[] = [{ t: 1, s: 'a' }];
  const after = addCrumb(before, 'b', 2);
  assert.deepEqual(after, [{ t: 1, s: 'a' }, { t: 2, s: 'b' }]);
  assert.equal(before.length, 1);
});

test('only the newest steps are kept', () => {
  let list: Crumb[] = [];
  for (let i = 0; i < MAX_CRUMBS + 10; i++) list = addCrumb(list, `step ${i}`, i);
  assert.equal(list.length, MAX_CRUMBS);
  assert.equal(list[0].s, 'step 10');
  assert.equal(list[list.length - 1].s, `step ${MAX_CRUMBS + 9}`);
});

test('a very long step is cut short', () => {
  assert.equal(addCrumb([], 'x'.repeat(500), 1)[0].s.length, 80);
});

test('saving and loading gives the same list back', () => {
  const list = addCrumb(addCrumb([], 'a', 1), 'b', 2);
  assert.deepEqual(decodeTrail(encodeTrail(list)), list);
});

test('loading never throws and drops bad lines', () => {
  assert.deepEqual(decodeTrail(null), []);
  assert.deepEqual(decodeTrail(''), []);
  assert.deepEqual(decodeTrail('{not json'), []);
  assert.deepEqual(decodeTrail('{"a":1}'), []);
  assert.deepEqual(decodeTrail('[{"t":1,"s":"ok"},{"t":"x","s":"bad"},null,5,{"t":2}]'), [{ t: 1, s: 'ok' }]);
});

test('a diary that ends with the clean exit was not interrupted', () => {
  assert.equal(wasInterrupted([]), false);
  assert.equal(wasInterrupted([{ t: 1, s: 'camera mounted' }]), true);
  assert.equal(wasInterrupted([{ t: 1, s: 'camera mounted' }, { t: 2, s: CLEAN_EXIT }]), false);
  // coming back to the screen after a clean exit and then stopping is an interruption again
  assert.equal(wasInterrupted([{ t: 1, s: CLEAN_EXIT }, { t: 2, s: 'photo taken' }]), true);
});

test('the last steps and the words for them', () => {
  const list = ['a', 'b', 'c', 'd', 'e'].map((s, i) => ({ t: i, s }));
  assert.deepEqual(lastSteps(list, 2).map((l) => l.s), ['d', 'e']);
  assert.deepEqual(lastSteps(list, 0), []);
  assert.equal(stepsInWords(list, 3), 'c, then d, then e');
  assert.equal(stepsInWords([], 3), 'none');
});

test('the copied report has one line per step with a date', () => {
  const text = reportText([{ t: Date.UTC(2026, 10, 19, 12, 30, 5), s: 'photo taken' }]);
  const lines = text.split('\n');
  assert.equal(lines.length, 2);
  assert.equal(lines[1], '2026-11-19 12:30:05 UTC  photo taken');
});

test('the camera counts as active only when the last run stopped without a clean exit after a camera step', () => {
  const c = (...steps: string[]): Crumb[] => steps.map((s, i) => ({ t: i, s }));
  assert.equal(cameraWasActive(c('scan screen opened', 'camera code loading')), true);
  assert.equal(cameraWasActive(c('camera starting', CLEAN_EXIT)), false);
  assert.equal(cameraWasActive(c('camera starting', CLEAN_EXIT, 'scan screen opened')), false);
  assert.equal(cameraWasActive(c('scan screen opened')), false);
  assert.equal(cameraWasActive([]), false);
  assert.deepEqual(stepsSinceCleanExit(c('a', CLEAN_EXIT, 'b')).map((x) => x.s), ['b']);
});

test('the sign-in diary text is empty for no steps and lists the steps otherwise', () => {
  assert.equal(sessionReportText([]), '');
  assert.match(sessionReportText([{ t: 0, s: 'restored' }]), /Sign-in steps[\s\S]*restored/);
});
