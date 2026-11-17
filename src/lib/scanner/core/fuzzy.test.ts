/* =====================================================================
   CHECKS FOR THE QUICK NAME MATCHING
   Run with:  node --test src/lib/scanner/core/fuzzy.test.ts
   The name matching was made much quicker (it gives up early on names that can't match).
   These checks keep a copy of the ORIGINAL slow version and make sure the quick one gives
   exactly the same answers, then check that it really is quick on a catalogue-sized list.
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { bestNameMatch, editDistance, looksLikeAnyName, similarity } from './fuzzy.ts';

/* ----- the original, slow version (kept here only to compare against) ----- */

const LOOKALIKES = ['0o', '1l', '1i', 'il', '5s', '8b', '2z', 'ce', 'cg', 'ao', 'nh', 'ec', 'uv'];
const CHEAP = new Set(LOOKALIKES.flatMap((p) => [p, p[1] + p[0]]));
function slowDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const swap = a[i - 1] === b[j - 1] ? 0 : CHEAP.has(a[i - 1] + b[j - 1]) ? 0.4 : 1;
      current.push(Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + swap));
    }
    previous = current;
  }
  return previous[b.length];
}
function slowBest(read: string, names: readonly string[], minimum = 0.78, margin = 0.06) {
  if (!read) return null;
  let best: { name: string; score: number } | null = null;
  let runnerUp = 0;
  for (const name of names) {
    if (Math.abs(name.length - read.length) > Math.max(read.length, name.length) * (1 - minimum)) continue;
    const longest = Math.max(read.length, name.length);
    const score = Math.max(0, 1 - slowDistance(read, name) / longest);
    if (score < minimum - 0.2) continue;
    if (!best || score > best.score) {
      if (best && best.name !== name) runnerUp = Math.max(runnerUp, best.score);
      best = { name, score };
    } else if (name !== best.name) {
      runnerUp = Math.max(runnerUp, score);
    }
  }
  if (!best || best.score < minimum) return null;
  return { name: best.name, similarity: best.score, clear: best.score - runnerUp >= margin };
}

/* ----- made-up names and made-up misreads (the same every run) ----- */

let seed = 12345;
const random = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const LETTERS = 'abcdefghijklmnopqrstuvwxyz0158 ';
const word = (length: number) => Array.from({ length }, () => LETTERS[Math.floor(random() * LETTERS.length)]).join('');
// Names are built from a small set of pieces, so many are alike (like "serra angel" and "serra avatar")
const PIECES = ['serra', 'angel', 'sol', 'ring', 'bolt', 'dark', 'ritual', 'elvish', 'mystic', 'goblin', 'guide', 'lightning'];
const madeUpName = () => Array.from({ length: 1 + Math.floor(random() * 3) }, () => (random() < 0.7 ? PIECES[Math.floor(random() * PIECES.length)] : word(3 + Math.floor(random() * 6)))).join(' ');
// A name with a few letters changed, added or taken out, like a text reader's mistakes
function misread(name: string): string {
  const letters = name.split('');
  for (let k = Math.floor(random() * 4); k > 0; k--) {
    const at = Math.floor(random() * letters.length);
    const roll = random();
    if (roll < 0.5) letters[at] = LETTERS[Math.floor(random() * LETTERS.length)];
    else if (roll < 0.75) letters.splice(at, 1);
    else letters.splice(at, 0, LETTERS[Math.floor(random() * LETTERS.length)]);
  }
  return letters.join('');
}

test('the quick distance matches the slow one for every pair', () => {
  for (let i = 0; i < 2000; i++) {
    const a = madeUpName();
    const b = random() < 0.5 ? misread(a) : madeUpName();
    assert.equal(Math.abs(editDistance(a, b) - slowDistance(a, b)) < 1e-9, true, `${a} / ${b}`);
  }
});

test('the quick distance gives up (says "more than the limit") only when it really is more', () => {
  for (let i = 0; i < 2000; i++) {
    const a = madeUpName();
    const b = misread(random() < 0.5 ? a : madeUpName());
    const real = slowDistance(a, b);
    const limit = Math.floor(random() * 8);
    const quick = editDistance(a, b, limit);
    if (real <= limit) assert.ok(Math.abs(quick - real) < 1e-9, `${a} / ${b}`);
    else assert.ok(quick > limit, `${a} / ${b}`);
  }
});

test('the quick best match gives the very same answer as the slow one', () => {
  const names = Array.from(new Set(Array.from({ length: 1500 }, madeUpName)));
  for (let i = 0; i < 400; i++) {
    const real = names[Math.floor(random() * names.length)];
    const read = random() < 0.2 ? real : random() < 0.9 ? misread(real) : madeUpName();
    const quick = bestNameMatch(read, names);
    const slow = slowBest(read, names);
    assert.deepEqual(quick === null ? null : { ...quick, similarity: Math.round(quick.similarity * 1e9) },
      slow === null ? null : { ...slow, similarity: Math.round(slow.similarity * 1e9) }, `read "${read}"`);
  }
});

test('"does any name come close" agrees with "is there a best match"', () => {
  const names = Array.from(new Set(Array.from({ length: 1500 }, madeUpName)));
  for (let i = 0; i < 400; i++) {
    const read = random() < 0.7 ? misread(names[Math.floor(random() * names.length)]) : word(3 + Math.floor(random() * 12));
    assert.equal(looksLikeAnyName(read, names), slowBest(read, names) !== null, `read "${read}"`);
  }
  assert.equal(looksLikeAnyName('', names), false);
});

test('the real examples still work', () => {
  const names = ['lightning bolt', 'sol ring', 'exotic orchard', 'plains', 'plain jane'];
  assert.equal(bestNameMatch('lightning boit', names)?.name, 'lightning bolt');
  assert.equal(bestNameMatch('ex0tic 0rchard', names)?.name, 'exotic orchard');
  assert.equal(bestNameMatch('qqqqqqqq', names), null);
  assert.ok(similarity('lightning bolt', 'lightning boit') > 0.9);
  assert.equal(looksLikeAnyName('sol rinq', names), true);
  assert.equal(looksLikeAnyName('qqqqqqqq', names), false);
});

test('a read against 30,000 names takes a small fraction of a second', () => {
  const names = Array.from({ length: 30000 }, (_, i) => `${madeUpName()} ${i % 97}`);
  const reads = Array.from({ length: 20 }, (_, i) => (i % 2 ? misread(names[i * 1000]) : word(14)));
  const started = performance.now();
  for (const read of reads) { bestNameMatch(read, names); looksLikeAnyName(read, names); }
  const each = (performance.now() - started) / reads.length;
  console.log(`  (about ${each.toFixed(1)} ms per read, best match and yes/no together)`);
  // The slow version took around a second or more for each of these on a computer, far more on a phone
  assert.ok(each < 120, `took ${each} ms per read`);
});
