/* =====================================================================
   CHECKS FOR EDITING A CARD
   Run with:  node --test src/lib/cardEdit.test.ts
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONDITIONS, applyEdit, conditionEdit, conditionLabel, conditionOf, finishEdit, languageEdit, normalizeCondition,
} from './cardEdit.ts';

const bolt = { name: 'Lightning Bolt', set: 'm10', number: '146', face: 0, image: 'https://example.com/en.jpg' };

test('there are six conditions, best first, each with a name', () => {
  assert.deepEqual(CONDITIONS.map((c) => c.label), ['Mint', 'Near Mint', 'Light Played', 'Moderately Played', 'Heavily Played', 'Damaged']);
});

test('a card with no condition is near mint, and file wordings are understood', () => {
  assert.equal(conditionOf(bolt), 'near_mint');
  assert.equal(normalizeCondition('LP'), 'lightly_played');
  assert.equal(normalizeCondition('Moderately Played'), 'moderately_played');
  assert.equal(normalizeCondition('heavily-played'), 'heavily_played');
  assert.equal(normalizeCondition('who knows'), 'near_mint');
  assert.equal(conditionLabel('lightly_played'), 'Light Played');
});

test('setting a condition keeps the card\'s other notes and does not change the original', () => {
  const card = { ...bolt, extra: { Rarity: 'common' } };
  const next = applyEdit(card, conditionEdit('damaged'));
  assert.equal(conditionOf(next), 'damaged');
  assert.equal(next.extra?.Rarity, 'common');
  assert.equal(card.extra?.Condition, undefined);
});

test('finishes: normal has no foil mark, foil has one, etched is foil with a note', () => {
  const foil = applyEdit(bolt, finishEdit('foil'));
  assert.equal(foil.foil, true);
  assert.equal(foil.extra?.Foil, undefined);
  const etched = applyEdit(foil, finishEdit('etched'));
  assert.equal(etched.foil, true);
  assert.equal(etched.extra?.Foil, 'etched');
  const plain = applyEdit(etched, finishEdit('nonfoil'));
  assert.equal(plain.foil, undefined);
  assert.equal(plain.extra?.Foil, undefined);
});

test('a language gives the card its picture; English takes the language note away', () => {
  const japanese = applyEdit(bolt, languageEdit('ja', 'https://example.com/ja.jpg'));
  assert.equal(japanese.lang, 'ja');
  assert.equal(japanese.image, 'https://example.com/ja.jpg');
  const english = applyEdit(japanese, languageEdit('en', 'https://example.com/en.jpg'));
  assert.equal(english.lang, undefined);
  assert.equal(english.image, 'https://example.com/en.jpg');
});
