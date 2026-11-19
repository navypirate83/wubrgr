/* =====================================================================
   CHECKS FOR THE ORDER A CARD IS READ IN
   Run with:  node --test src/lib/scanner/core/readPlan.test.ts
   A pretend reader counts which parts get read, so we can check the slow ones are skipped.
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadMoreClues, readCardStaged, readNameBothWays, readTitle, timingWords, type PartReader } from './readPlan.ts';

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

/* ----- how many parts each kind of card reads (the "stop as soon as it has what it needs" checks) ----- */

test('a modern card (name and info line fine): exactly 3 parts, no band, no copyright line, no clues', async () => {
  const { reader, calls } = pretend();
  await readCardStaged(reader, isBolt);
  assert.deepEqual([...calls].sort(), ['info', 'name', 'preview']);
});

test('a card whose name box is unreadable: 4 parts (the band is read as well), still no clues', async () => {
  const { reader, calls } = pretend({ name: 'xx', band: 'Lightning Bolt' });
  const reading = await readCardStaged(reader, isBolt);
  assert.deepEqual([...calls].sort(), ['band', 'info', 'name', 'preview']);
  assert.equal(reading.nameText, 'xx\nLightning Bolt');
});

test('a hands-free card whose title was already read: 2 parts only (info line and picture)', async () => {
  const { reader, calls } = pretend();
  await readCardStaged(reader, isBolt, 'Lightning Bolt');
  assert.deepEqual([...calls].sort(), ['info', 'preview']);
});

test('a failed info line does not make anything else get read again', async () => {
  const { reader, calls } = pretend({ info: '' });
  await readCardStaged(reader, isBolt);
  assert.deepEqual([...calls].sort(), ['info', 'name', 'preview']);
});

test('a card that needs the fallback reads the copyright line and clues once each, only when asked', async () => {
  const { reader, calls } = pretend();
  const reading = await readCardStaged(reader, isBolt);
  assert.equal(calls.length, 3);
  await loadMoreClues(reading);
  assert.deepEqual([...calls].sort(), ['bottom', 'clues', 'info', 'name', 'preview']);
});

test('the picture is made at the same time as the text, not after it', async () => {
  const order: string[] = [];
  const slow = (label: string, ms: number, value: string) => async () => {
    order.push(`${label} start`);
    await new Promise((r) => setTimeout(r, ms));
    order.push(`${label} end`);
    return value;
  };
  const reader: PartReader = {
    name: slow('name', 20, 'Lightning Bolt'), band: async () => '', info: slow('info', 20, 'R 0123'),
    bottom: async () => '', clues: async () => ({}), preview: slow('preview', 20, 'data:x'),
  };
  const reading = await readCardStaged(reader, isBolt);
  // the picture started before the text had finished (so all three overlap)
  assert.ok(order.indexOf('preview start') < order.indexOf('name end'));
  assert.equal(reading.extras?.artPreview, 'data:x');
});

test('a picture that fails is just left out', async () => {
  const { reader } = pretend();
  reader.preview = async () => { throw new Error('no canvas'); };
  const reading = await readCardStaged(reader, isBolt);
  assert.equal(reading.extras, undefined);
});

test('a short name that was read well is read only once; a poor read is still tried the other way round', async () => {
  const reads: boolean[] = [];
  const reader = (first: string, second: string) => async (flip: boolean) => { reads.push(flip); return flip ? second : first; };
  const isOpt = (text: string) => text === 'Opt';
  assert.equal(await readNameBothWays(reader('Opt', 'Qqq'), isOpt), 'Opt');
  assert.deepEqual(reads, [false]);
  reads.length = 0;
  // no name check given: as before, a short read is always tried both ways
  assert.equal(await readNameBothWays(reader('Opt', 'Qqq'), undefined), 'Opt');
  assert.deepEqual(reads, [false, true]);
  reads.length = 0;
  // a poor first read that is not a name: the flipped one is kept when it has more letters
  assert.equal(await readNameBothWays(reader('Op', 'Opt'), isOpt), 'Opt');
  assert.deepEqual(reads, [false, true]);
  reads.length = 0;
  // a long first read is never read twice
  assert.equal(await readNameBothWays(reader('Lightning Bolt', 'x'), () => false), 'Lightning Bolt');
  assert.deepEqual(reads, [false]);
});
