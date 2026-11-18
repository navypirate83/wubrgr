/* =====================================================================
   CHECKS FOR HOW A PRINTING LOOKS
   Run with:  node --test src/lib/scanner/core/looks.test.ts
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAIN_LOOK, isSpecialLook, isUnusualLayout, lookFromRow, lookFromScryfall, lookLabels, lookToRow, needsLookRow,
} from './looks.ts';

test('an ordinary card has a plain look and needs no row', () => {
  const look = lookFromScryfall({ border_color: 'black', frame_effects: ['legendary'], promo_types: ['boosterfun'] });
  assert.deepEqual(look, PLAIN_LOOK);
  assert.equal(needsLookRow(look), false);
  assert.equal(isSpecialLook(look), false);
  assert.deepEqual(lookLabels(look), []);
});

test('a showcase, extended art frame is read, and the legendary crown and two-sided frames are not', () => {
  const look = lookFromScryfall({ frame_effects: ['legendary', 'showcase', 'extendedart', 'sunmoondfc'] });
  assert.deepEqual(look.frameEffects, ['showcase', 'extendedart']);
  assert.equal(isUnusualLayout(look), true);
  assert.deepEqual(lookLabels(look), ['Showcase', 'Extended art']);
});

test('full art, textless and borderless are read from their own fields', () => {
  const look = lookFromScryfall({ full_art: true, textless: true, border_color: 'borderless' });
  assert.deepEqual(look, { ...PLAIN_LOOK, fullArt: true, textless: true, borderless: true });
  assert.deepEqual(lookLabels(look), ['Full art', 'Borderless', 'Textless']);
});

test('borderless on its own needs no row, but is still special and unusual', () => {
  const look = lookFromScryfall({ border_color: 'borderless' });
  assert.equal(needsLookRow(look), false);
  assert.equal(isSpecialLook(look), true);
  assert.equal(isUnusualLayout(look), true);
});

test('special treatments are kept, others dropped, and a textured card still has the usual layout', () => {
  const look = lookFromScryfall({ promo_types: ['boosterfun', 'textured', 'serialized', 'prerelease'] });
  assert.deepEqual(look.promoTypes, ['textured', 'serialized']);
  assert.equal(needsLookRow(look), true);
  assert.equal(isUnusualLayout(look), false);
  assert.deepEqual(lookLabels(look), ['Textured foil', 'Serialized']);
});

test('a look survives being written to a row and read back', () => {
  const look = lookFromScryfall({ full_art: true, frame_effects: ['etched'], promo_types: ['galaxyfoil'], border_color: 'borderless' });
  assert.deepEqual(lookFromRow(lookToRow(look), 'borderless'), look);
});

test('no row (an ordinary printing, or an older catalogue) reads as plain, with the border colour kept', () => {
  assert.deepEqual(lookFromRow(undefined, 'black'), PLAIN_LOOK);
  assert.equal(lookFromRow(undefined, 'borderless').borderless, true);
});
