/* =====================================================================
   CHECKS FOR THE ORDER A CARD IS READ IN
   Run with:  node --test src/lib/scanner/core/readPlan.test.ts
   A pretend reader counts which parts get read, so we can check the slow ones are skipped.
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadMoreClues, readCardStaged, readTitle, timingWords, type PartReader } from './readPlan.ts';

// A reader that gives fixed text and writes down each part it was asked for
function pretend(texts: { name?: string; band?: string; info?: string; bottom?: string } = {}) {
  const calls: string[] = [];
  const reader: PartReader = {
    name: async () => { calls.push('name'); return texts.name ?? 'Lightning Bolt'; },
    band: async () => { calls.push('band'); return texts.band ?? 'Lightning Bolt'; },
    info: async () => { calls.push('info'); return texts.info ?? 'R 0123\nMOM • EN'; },
    bottom: async () => { calls.push('bottom'); return texts.bottom ?? '© 2023'; },
    clues: async () => { calls.push('clues'); return { border: 'black' as const }; },
    preview: async () => { calls.push('preview'); return 'data:image/jpeg;base64,AAAA'; },
  };
  return { reader, calls };
}
const isBolt = (text: string) => text.includes('Lightning Bolt');

test('a good name is all the title needs: the band is not read', async () => {
  const { reader, calls } = pretend();
  assert.equal(await readTitle(reader, isBolt), 'Lightning Bolt');
  assert.deepEqual(calls, ['name']);
});

test('a name that is not a real card also reads the band', async () => {
  const { reader, calls } = pretend({ name: 'xx', band: 'Lightning Bolt' });
  assert.equal(await readTitle(reader, isBolt), 'xx\nLightning Bolt');
  assert.deepEqual(calls, ['name', 'band']);
});

test('a quick look at a blank card skips the band, but one with some letters does not', async () => {
  const blank = pretend({ name: '' });
  await readTitle(blank.reader, isBolt, true);
  assert.deepEqual(blank.calls, ['name']);
  const some = pretend({ name: 'Zzzq' });
  await readTitle(some.reader, isBolt, true);
  assert.deepEqual(some.calls, ['name', 'band']);
});

test('a staged read leaves out the copyright line and the older-card clues', async () => {
  const { reader, calls } = pretend();
  const reading = await readCardStaged(reader, isBolt);
  assert.deepEqual([...calls].sort(), ['info', 'name', 'preview']);
  assert.equal(reading.nameText, 'Lightning Bolt');
  assert.equal(reading.infoText, 'R 0123\nMOM • EN');
  assert.equal(reading.bottomText, '');
  assert.equal(reading.extras?.artPreview, 'data:image/jpeg;base64,AAAA');
  assert.equal(reading.extras?.border, undefined);
  assert.ok(reading.timings && reading.timings.text >= 0);
});

test('a title that was already read is not read again', async () => {
  const { reader, calls } = pretend();
  const reading = await readCardStaged(reader, isBolt, 'Lightning Bolt');
  assert.equal(calls.includes('name'), false);
  assert.equal(reading.nameText, 'Lightning Bolt');
});

test('the extras are read once, only when asked for, and the art preview is kept', async () => {
  const { reader, calls } = pretend();
  const reading = await readCardStaged(reader, isBolt);
  await loadMoreClues(reading);
  await loadMoreClues(reading);
  assert.equal(calls.filter((c) => c === 'bottom').length, 1);
  assert.equal(calls.filter((c) => c === 'clues').length, 1);
  assert.equal(reading.bottomText, '© 2023');
  assert.equal(reading.extras?.border, 'black');
  assert.equal(reading.extras?.artPreview, 'data:image/jpeg;base64,AAAA');
  assert.equal(reading.moreClues, undefined);
});

test('the timings are put in a few plain words', () => {
  assert.equal(timingWords({ photo: 300, text: 450, preview: 50, lookup: 200 }), '1.0 s (photo 0.3, text 0.5, picture 0.1, look-up 0.2)');
  assert.equal(timingWords(undefined), '');
});

test('the new steps (frame, warm-up, change check, in line) are shown, and resolve is kept out of the total', () => {
  assert.equal(
    timingWords({ frame: 100, warm: 200, check: 50, text: 400, lookup: 160, wait: 100, resolve: 160 }),
    '1.0 s (frame 0.1, change check 0.1, warm-up 0.2, text 0.4, look-up 0.2, in line 0.1)',
  );
});
