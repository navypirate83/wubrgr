/* =====================================================================
   CHECKS FOR THE NAME INDEX
   Run with:  node --test src/lib/scanner/core/nameIndex.test.ts
   The index (nameIndex.ts) must give EXACTLY the same answers as looking at every name
   (bestNameMatch / looksLikeAnyName in fuzzy.ts, kept as the reference). These checks
   run both on thousands of made-up misreads of real card names (taken from the catalogue
   file on this computer when it is there, else from a made-up list) and compare
   the answers, then compare how long each takes.
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { bestNameMatch, looksLikeAnyName } from './fuzzy.ts';
import { bestNameMatchIndexed, buildNameIndex, looksLikeAnyNameIndexed } from './nameIndex.ts';

/* ----- the names: the real catalogue if it is here, else a made-up list ----- */

// A repeatable "random" so every run tests the same things
let seed = 987654;
const random = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)];

const root = resolve(import.meta.dirname, '..', '..', '..', '..');
const databases = ['out-flavor', 'out'].map((folder) => join(root, 'scripts', 'catalogue', folder, 'catalogue.db')).filter(existsSync);

function realNames(): string[] | null {
  if (databases.length === 0) return null;
  const db = new DatabaseSync(databases[0], { readOnly: true });
  try {
    const front = db.prepare('SELECT DISTINCT front_norm AS n FROM printings').all().map((r) => String(r.n));
    let flavor: string[] = [];
    try { flavor = db.prepare('SELECT DISTINCT flavor_norm AS n FROM flavor').all().map((r) => String(r.n)); } catch { /* an older catalogue has none */ }
    return [...new Set([...front, ...flavor])];
  } finally { db.close(); }
}

function madeUpNames(): string[] {
  const pieces = ['serra', 'angel', 'sol', 'ring', 'bolt', 'dark', 'ritual', 'elvish', 'mystic', 'goblin', 'guide', 'lightning', 'plains', 'plain', 'island'];
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const word = () => Array.from({ length: 3 + Math.floor(random() * 6) }, () => pick([...letters])).join('');
  return [...new Set(Array.from({ length: 20000 }, () => Array.from({ length: 1 + Math.floor(random() * 3) }, () => (random() < 0.7 ? pick(pieces) : word())).join(' ')))];
}

const names = realNames() ?? madeUpNames();
const index = buildNameIndex(names);
console.log(`  (${names.length} names, ${databases.length > 0 ? 'from the real catalogue file' : 'made up: no catalogue file here'})`);

/* ----- made-up misreads, like a text reader's mistakes ----- */

const LOOKALIKE = ['0o', '1l', '1i', 'il', '5s', '8b', '2z', 'ce', 'cg', 'ao', 'nh', 'ec', 'uv'];
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789 ';
function misread(name: string): string {
  const letters = name.split('');
  for (let edits = Math.floor(random() * 5); edits > 0 && letters.length > 0; edits--) {
    const at = Math.floor(random() * letters.length);
    const roll = random();
    if (roll < 0.35) {
      // a look-alike swap, the commonest kind of mistake
      const pair = LOOKALIKE.find((p) => p.includes(letters[at]));
      letters[at] = pair ? pair[pair[0] === letters[at] ? 1 : 0] : pick([...ALPHABET]);
    } else if (roll < 0.55) letters[at] = pick([...ALPHABET]);
    else if (roll < 0.75) letters.splice(at, 1);
    else if (roll < 0.9) letters.splice(at, 0, pick([...ALPHABET]));
    else letters.splice(at, 0, ...pick(['the ', ' of', 'xx', ' 1']).split(''));
  }
  return letters.join('').replace(/\s+/g, ' ').trim();
}
// What a read can be: a misread real name, an exact name, a cut-off name, two names run together, or noise
function oneRead(): string {
  const real = pick(names);
  const roll = random();
  if (roll < 0.6) return misread(real);
  if (roll < 0.7) return real;
  if (roll < 0.8) return misread(real.slice(0, Math.max(3, Math.ceil(real.length * (0.6 + random() * 0.4)))));
  if (roll < 0.9) return misread(`${real} ${pick(names)}`.slice(0, 40));
  return Array.from({ length: 4 + Math.floor(random() * 16) }, () => pick([...ALPHABET])).join('').trim() || 'zzzz';
}
// The scanner only matches reads of 4 or more letters
const reads = Array.from({ length: 500 }, oneRead).filter((r) => r.length >= 3);

/* ----- the checks ----- */

test('the index gives exactly the same best match as looking at every name (default settings)', () => {
  let different = 0;
  for (const read of reads) {
    const slow = bestNameMatch(read, names);
    const quick = bestNameMatchIndexed(read, index);
    if (JSON.stringify(slow) !== JSON.stringify(quick)) {
      different++;
      assert.deepEqual(quick, slow, `read "${read}"`);
    }
  }
  assert.equal(different, 0);
});

test('the index gives the same answers with stricter and looser settings too', () => {
  for (const [minimum, margin] of [[0.9, 0.06], [0.7, 0.1], [0.85, 0.03]] as const) {
    for (const read of reads.slice(0, 100)) {
      assert.deepEqual(bestNameMatchIndexed(read, index, minimum, margin), bestNameMatch(read, names, minimum, margin), `read "${read}" at ${minimum}/${margin}`);
    }
  }
});

test('the yes/no version agrees with the plain one for every read', () => {
  for (const read of reads) {
    assert.equal(looksLikeAnyNameIndexed(read, index), looksLikeAnyName(read, names), `read "${read}"`);
  }
  assert.equal(looksLikeAnyNameIndexed('', index), false);
});

test('names that tie for first: the earlier one in the list wins, as before', () => {
  // "plaine" and "plainz" are each one letter from "plain" and from "plains"
  const tied = ['plaina', 'plainb', 'plainz', 'aaaaaaaa', 'plaina2'];
  const tiedIndex = buildNameIndex(tied);
  for (const read of ['plainc', 'plaind', 'plain', 'plaina3']) {
    assert.deepEqual(bestNameMatchIndexed(read, tiedIndex), bestNameMatch(read, tied), read);
  }
  assert.equal(bestNameMatchIndexed('', tiedIndex), null);
  assert.equal(bestNameMatchIndexed('qqqqqqqq', tiedIndex), null);
});

test('an empty list and odd characters do not break it', () => {
  const none = buildNameIndex([]);
  assert.equal(bestNameMatchIndexed('lightning bolt', none), null);
  assert.equal(looksLikeAnyNameIndexed('lightning bolt', none), false);
  const odd = ['jötun grunt', 'kongming', '日本語のカード', 'x'.repeat(300)];
  const oddIndex = buildNameIndex(odd);
  for (const read of ['jotun grunt', 'kongmlng', '日本語のカート', 'x'.repeat(299)]) {
    assert.deepEqual(bestNameMatchIndexed(read, oddIndex), bestNameMatch(read, odd), read);
  }
});

test('the index is quicker than looking at every name (timing comparison)', () => {
  // Two kinds of read: "typical" (a real name with one or two letters wrong, what scanning mostly sees)
  // and the mixed, rougher ones above (cut-off names, run-together names, pure noise: the hard cases)
  const typical = Array.from({ length: 150 }, () => {
    const letters = pick(names).split('');
    for (let edits = 1 + Math.floor(random() * 2); edits > 0; edits--) letters[Math.floor(random() * letters.length)] = pick([...ALPHABET]);
    return letters.join('').trim();
  }).filter((r) => r.length >= 3);
  const timed = reads.slice(0, 150);
  const timeBoth = (list: string[]) => {
    let start = performance.now();
    for (const read of list) bestNameMatch(read, names);
    const slow = (performance.now() - start) / list.length;
    start = performance.now();
    for (const read of list) bestNameMatchIndexed(read, index);
    return { slow, quick: (performance.now() - start) / list.length };
  };
  const easy = timeBoth(typical);
  console.log(`  typical reads, best match: ${easy.slow.toFixed(2)} ms -> ${easy.quick.toFixed(2)} ms per read (${(easy.slow / easy.quick).toFixed(1)}x)`);
  // (warm both up first so neither pays for starting up)
  for (const read of timed.slice(0, 20)) { bestNameMatch(read, names); bestNameMatchIndexed(read, index); }
  const buildStart = performance.now();
  buildNameIndex(names);
  const build = performance.now() - buildStart;
  let start = performance.now();
  for (const read of timed) bestNameMatch(read, names);
  const slowBest = (performance.now() - start) / timed.length;
  start = performance.now();
  for (const read of timed) bestNameMatchIndexed(read, index);
  const quickBest = (performance.now() - start) / timed.length;
  start = performance.now();
  for (const read of timed) looksLikeAnyName(read, names);
  const slowYes = (performance.now() - start) / timed.length;
  start = performance.now();
  for (const read of timed) looksLikeAnyNameIndexed(read, index);
  const quickYes = (performance.now() - start) / timed.length;
  console.log(`  best match: ${slowBest.toFixed(2)} ms -> ${quickBest.toFixed(2)} ms per read (${(slowBest / quickBest).toFixed(1)}x); yes/no: ${slowYes.toFixed(2)} ms -> ${quickYes.toFixed(2)} ms per read (${(slowYes / quickYes).toFixed(1)}x); building the index once: ${build.toFixed(0)} ms`);
  // Not slower than the plain way (the real gain is shown in the line above)
  assert.ok(quickBest <= slowBest * 1.2, 'the indexed best match should not be slower');
});
