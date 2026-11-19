/* =====================================================================
   CHECKS FOR EDITING A CARD
   Run with:  node --test src/lib/cardEdit.test.ts
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONDITIONS, applyEdit, conditionEdit, conditionLabel, conditionOf, conditionShort, finishEdit, languageEdit, matchesVersion, normalizeCondition,
} from './cardEdit.ts';

const bolt = { name: 'Lightning Bolt', set: 'm10', number: '146', face: 0, image: 'https://example.com/en.jpg' };

test('there are six conditions, best first, each with a name and a short form', () => {
  assert.deepEqual(CONDITIONS.map((c) => c.label), ['Mint', 'Near Mint', 'Lightly Played', 'Moderately Played', 'Heavily Played', 'Damaged']);
  assert.deepEqual(CONDITIONS.map((c) => c.short), ['M', 'NM', 'LP', 'MP', 'HP', 'Dmg']);
  assert.equal(conditionShort('lightly_played'), 'LP');
  assert.equal(conditionShort('damaged'), 'Dmg');
  assert.equal(conditionShort('who knows'), 'NM');
});

test('a card with no condition is near mint, and file wordings are understood', () => {
  assert.equal(conditionOf(bolt), 'near_mint');
  assert.equal(normalizeCondition('LP'), 'lightly_played');
  assert.equal(normalizeCondition('Moderately Played'), 'moderately_played');
  assert.equal(normalizeCondition('heavily-played'), 'heavily_played');
  assert.equal(normalizeCondition('who knows'), 'near_mint');
  assert.equal(conditionLabel('lightly_played'), 'Lightly Played');
  assert.equal(normalizeCondition('Light Played'), 'lightly_played');
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

test('the versions search matches the set name, the set code or the number, every word', () => {
  const version = { set: 'm10', set_name: 'Magic 2010', collector_number: '146' };
  assert.equal(matchesVersion(version, ''), true);
  assert.equal(matchesVersion(version, 'magic'), true);
  assert.equal(matchesVersion(version, 'M10'), true);
  assert.equal(matchesVersion(version, '146'), true);
  assert.equal(matchesVersion(version, '2010 146'), true);
  assert.equal(matchesVersion(version, 'magic 147'), false);
  assert.equal(matchesVersion(version, 'alpha'), false);
});

test('a card can be switched to another printing: set and number change, other notes stay', () => {
  const next = applyEdit({ ...bolt, extra: { Condition: 'damaged' } }, { set: 'lea', number: '161', face: 0, image: 'https://example.com/lea.jpg', extra: { Rarity: 'common' } });
  assert.equal(next.set, 'lea');
  assert.equal(next.number, '161');
  assert.equal(next.image, 'https://example.com/lea.jpg');
  assert.equal(next.extra?.Condition, 'damaged');
  assert.equal(next.extra?.Rarity, 'common');
});
