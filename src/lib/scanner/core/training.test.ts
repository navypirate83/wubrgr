// Tests: which scans are kept for training (run with: node --test src/lib/scanner/core/training.test.ts)
import test from 'node:test';
import assert from 'node:assert/strict';
import { trainingReason, type Said } from './training.ts';

const said = (status: Said['status']): Said => ({ printingId: 'p1', name: 'X', set: 'cmr', number: '1', lang: 'en', finish: 'nonfoil', status });
const card = (over: Record<string, unknown> = {}, status: Said['status'] = 'sure') => ({ said: said(status), printing: { id: 'p1' }, lang: 'en', ...over });

test('a card the scanner was sure of, left alone, is not kept', () => {
  assert.equal(trainingReason(card()), null);
});

test('a card the scanner was not sure of is kept as "unsure" (a guess counts too)', () => {
  assert.equal(trainingReason(card({}, 'likely')), 'unsure');
  assert.equal(trainingReason(card({}, 'pick')), 'unsure');
});

test('changing the printing or the language is a correction, even on a card it was sure of', () => {
  assert.equal(trainingReason(card({ printing: { id: 'p2' } })), 'changed');
  assert.equal(trainingReason(card({ lang: 'ja' })), 'changed');
  assert.equal(trainingReason(card({ printing: { id: 'p2' } }, 'pick')), 'changed');
});

test('foil and the number of copies are not changes that count', () => {
  assert.equal(trainingReason({ ...card(), finish: 'foil', count: 4 } as never), null);
});

test('"wrong" always wins, and works on a card the scanner was sure of', () => {
  assert.equal(trainingReason(card({ wrong: true })), 'wrong');
  assert.equal(trainingReason(card({ wrong: true, printing: { id: 'p2' } })), 'wrong');
  assert.equal(trainingReason({ wrong: true, printing: { id: 'p1' }, lang: 'en' }), 'wrong');
});

test('a card with no record of what the scanner said (from an older saved list) is only kept when ticked wrong', () => {
  assert.equal(trainingReason({ printing: { id: 'p1' }, lang: 'en' }), null);
});
