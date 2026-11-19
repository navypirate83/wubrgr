/* =====================================================================
   CHECKS FOR "DO TWO LOOKS AGREE?"
   Run with:  node --test src/lib/scanner/core/frameAgree.test.ts
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { titlesAgree } from './frameAgree.ts';

test('the same title twice agrees, even with different capitals or marks', () => {
  assert.equal(titlesAgree('Exotic Orchard', 'Exotic Orchard'), true);
  assert.equal(titlesAgree('Exotic Orchard', 'EXOTIC  ORCHARD'), true);
  assert.equal(titlesAgree("Lim-Dûl's Vault", "Lim-Dul's Vault"), true);
});

test('one wobbly letter in a long title still agrees', () => {
  assert.equal(titlesAgree('Exotic Orchard', 'Exotic Orchord'), true);
  assert.equal(titlesAgree('Thassa, Deep-Dwelling', 'Thassa, Deep-Dweling'), true);
});

test('two different cards do not agree', () => {
  assert.equal(titlesAgree('Exotic Orchard', 'Command Tower'), false);
  assert.equal(titlesAgree('Lightning Bolt', 'Lightning Helix'), false);
});

test('a half-read title does not agree with a full one', () => {
  assert.equal(titlesAgree('Exotic Orchard', 'Exotic'), false);
});

test('an empty reading never agrees', () => {
  assert.equal(titlesAgree('', ''), false);
  assert.equal(titlesAgree('Exotic Orchard', ''), false);
});

// ---- "clearly different" (used to notice a new card put down where the last one was) ----
import { titlesClearlyDiffer } from './frameAgree.ts';

test('two plainly different titles are clearly different', () => {
  assert.equal(titlesClearlyDiffer('Exotic Orchard', 'Command Tower'), true);
});

test('a wobbly reading of the same title is not clearly different', () => {
  assert.equal(titlesClearlyDiffer('Exotic Orchard', 'Exotic Orchord'), false);
  assert.equal(titlesClearlyDiffer('Exotic Orchard', 'Exotic'), false);
});

test('a missing title is never "clearly different"', () => {
  assert.equal(titlesClearlyDiffer('', 'Command Tower'), false);
  assert.equal(titlesClearlyDiffer('Exotic Orchard', ''), false);
});
