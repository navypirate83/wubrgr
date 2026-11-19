/* =====================================================================
   CHECKS FOR THE CRASH REPORT DECISIONS
   Run with:  node --test src/lib/crashReportCore.test.ts
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { reportId, savedId, shouldList, shouldPopUp } from './crashReportCore.ts';

test('the id is read from the first line, and anything else is 0', () => {
  assert.equal(reportId('id=1700000000000\nrest'), 1700000000000);
  assert.equal(reportId(''), 0);
  assert.equal(reportId(null), 0);
  assert.equal(reportId('hello id=5'), 0);
});

test('a saved id that is missing or damaged is 0', () => {
  assert.equal(savedId('42'), 42);
  assert.equal(savedId(null), 0);
  assert.equal(savedId('abc'), 0);
});

test('the pop-up shows a new report once, and never a cleared or empty one', () => {
  assert.equal(shouldPopUp(10, 0, 0), true);
  assert.equal(shouldPopUp(10, 10, 0), false);
  assert.equal(shouldPopUp(10, 5, 10), false);
  assert.equal(shouldPopUp(0, 0, 0), false);
  assert.equal(shouldPopUp(11, 10, 0), true);
});

test('settings lists a report until it is cleared', () => {
  assert.equal(shouldList(10, 0), true);
  assert.equal(shouldList(10, 10), false);
  assert.equal(shouldList(0, 0), false);
});
