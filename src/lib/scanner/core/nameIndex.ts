/* =====================================================================
   A QUICK-LOOKUP INDEX FOR CARD NAMES (shared, plain TypeScript)
   The scanner compares the name it read against about 30,000 real card names on
   every scan (see fuzzy.ts). The old way looked at every name, one after another,
   and only gave up on a name after starting the careful letter-by-letter work on it.
   This builds a small "index" once (when the names are loaded, and kept after that)
   that lets most names be thrown out with one cheap number each, so the careful
   work is only done on the few names that could possibly be close.
   HOW IT THROWS A NAME OUT (and why that is always safe):
   Every name gets a count of how many times each letter or digit appears in it. Suppose the text that
   was read has three "e"s and a name has only one: at least two letters of the read text have no
   matching letter in the name. Each of those must be swapped for a different letter (costs at least
   0.4, the cheapest swap, between look-alike letters) or taken out (costs 1). So the closeness
   calculation can NEVER come out cheaper than 0.4 for each of those "missing" letters, and (letting the
   name be the one with extras instead) the same is true the other way round. That minimum cost is worked
   out from the counts alone. If it already is more than the name is allowed to cost, the name can't be
   a match, and is skipped without being looked at any more. Only names that survive get the careful
   calculation (editDistance in fuzzy.ts), and the survivors are looked at cheapest-minimum first, so
   a good match is found early and then makes the rest of the names easier to throw out.
   The answers are exactly the same as the old way (fuzzy.ts keeps the old way, and the tests run both
   on many misread real names to prove it).
   ===================================================================== */

import { editDistance } from './fuzzy.ts';

// Letters and digits get their own counter; everything else (spaces, other alphabets) shares one.
// (Sharing a counter between different characters only makes the minimum cost smaller, never bigger,
// so the throwing-out stays safe.)
const COUNTERS = 38;
const counterOf = (code: number): number =>
  code >= 97 && code <= 122 ? code - 96 : code >= 48 && code <= 57 ? code - 21 : 37;

// The cheapest any single swap of two different letters can cost (see LOOKALIKES in fuzzy.ts)
const CHEAPEST_SWAP = 0.4;

export type NameIndex = {
  names: readonly string[];       // the names, in the order they were given
  lengths: Uint16Array;           // each name's length
  counts: Uint8Array;             // for each name, its 38 letter counters one after another
  positionOf: Map<string, number>; // name -> where it is in the list (for the "exactly this name" shortcut)
};

// Build the index (about 1 MB for 30,000 names, and a few milliseconds' work)
export function buildNameIndex(names: readonly string[]): NameIndex {
  const lengths = new Uint16Array(names.length);
  const counts = new Uint8Array(names.length * COUNTERS);
  const positionOf = new Map<string, number>();
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    lengths[i] = Math.min(name.length, 65535);
    // A counter holds up to 255; a name longer than that is marked by its length and never thrown out
    for (let c = 0; c < name.length; c++) {
      const at = i * COUNTERS + counterOf(name.charCodeAt(c));
      if (counts[at] < 255) counts[at]++;
    }
    if (!positionOf.has(name)) positionOf.set(name, i);
  }
  return { names, lengths, counts, positionOf };
}

// The read text's own letter counters, and which of them are in use
function countRead(read: string): { counts: Uint8Array; used: number[] } {
  const counts = new Uint8Array(COUNTERS);
  for (let c = 0; c < read.length; c++) if (counts[counterOf(read.charCodeAt(c))] < 255) counts[counterOf(read.charCodeAt(c))]++;
  const used: number[] = [];
  for (let c = 0; c < COUNTERS; c++) if (counts[c] > 0) used.push(c);
  return { counts, used };
}

// For every name that passes the "length is close enough" test, work out how many letters of the
// read text OR of the name have no partner in the other (the larger of the two numbers), and file the
// name's position under that number. The result is "buckets[k] = positions needing at least k unmatched
// letters", with the positions in list order inside each bucket.
function sortByMinimumCost(read: string, index: NameIndex, minimum: number): number[][] {
  const { counts: readCounts, used } = countRead(read);
  const buckets: number[][] = [];
  const total = index.names.length;
  for (let i = 0; i < total; i++) {
    const length = index.lengths[i];
    // The same length test the old way used first (a name much longer or shorter can't be close enough)
    if (Math.abs(length - read.length) > Math.max(read.length, length) * (1 - minimum)) continue;
    let k = 0;
    // Names too long for the counters to be trusted are never thrown out
    if (length <= 255) {
      // How many letters of the read text have no matching letter in this name
      let missing = 0;
      const base = i * COUNTERS;
      for (let u = 0; u < used.length; u++) {
        const extra = readCounts[used[u]] - index.counts[base + used[u]];
        if (extra > 0) missing += extra;
      }
      // (the name's own unmatched letters are the same number, plus how much longer the name is)
      k = missing + Math.max(0, length - read.length);
    }
    (buckets[k] ??= []).push(i);
  }
  return buckets;
}

// Same answers as bestNameMatch in fuzzy.ts, but only the names that could be close get the careful work
export function bestNameMatchIndexed(
  read: string, index: NameIndex, minimum = 0.78, margin = 0.06,
): { name: string; similarity: number; clear: boolean } | null {
  if (!read) return null;
  const buckets = sortByMinimumCost(read, index, minimum);
  // The longest "longest of the two lengths" a name that passed the length test can have
  const longestPossible = read.length / minimum + 1;
  // A name in the list exactly is the best there can be, so start from it (as the old way did)
  const exact = index.positionOf.get(read);
  let best: { at: number; score: number } | null = exact === undefined ? null : { at: exact, score: 1 };
  let runnerUp = 0;
  for (let k = 0; k < buckets.length; k++) {
    const bucket = buckets[k];
    if (!bucket) continue;
    // The lowest score still worth knowing about right now (see bestNameMatch): once a best exists, only
    // names within the margin of it can change the answer
    const floor = best ? Math.max(minimum - 0.2, best.score - margin) : minimum - 0.2;
    // If even the biggest allowance any name could have is smaller than this bucket's minimum cost, so is every later bucket's
    if (CHEAPEST_SWAP * k - 1e-9 > longestPossible * (1 - floor) + 1e-9) break;
    for (const at of bucket) {
      if (best && at === best.at) continue;
      const name = index.names[at];
      const longest = Math.max(read.length, name.length);
      const nowFloor = best ? Math.max(minimum - 0.2, best.score - margin) : minimum - 0.2;
      const limit = longest * (1 - nowFloor) + 1e-9;
      // Its minimum cost already is more than it is allowed: it can't be a match
      if (CHEAPEST_SWAP * k - 1e-9 > limit) continue;
      const distance = editDistance(read, name, limit);
      if (distance > limit) continue;
      const score = Math.max(0, 1 - distance / longest);
      if (score < minimum - 0.2) continue;
      // Names are looked at out of list order, so when two names tie the one earlier in the list must win
      // (as it did when everything was looked at in order)
      if (!best || score > best.score || (score === best.score && at < best.at)) {
        if (best && best.at !== at) runnerUp = Math.max(runnerUp, best.score);
        best = { at, score };
      } else if (at !== best.at) {
        runnerUp = Math.max(runnerUp, score);
      }
    }
  }
  if (!best || best.score < minimum) return null;
  return { name: index.names[best.at], similarity: best.score, clear: best.score - runnerUp >= margin };
}

// Same answer as looksLikeAnyName in fuzzy.ts: is any real name close to this?
export function looksLikeAnyNameIndexed(read: string, index: NameIndex, minimum = 0.78): boolean {
  if (!read) return false;
  const buckets = sortByMinimumCost(read, index, minimum);
  for (let k = 0; k < buckets.length; k++) {
    const bucket = buckets[k];
    if (!bucket) continue;
    for (const at of bucket) {
      const name = index.names[at];
      const longest = Math.max(read.length, name.length);
      const limit = longest * (1 - minimum) + 1e-9;
      if (CHEAPEST_SWAP * k - 1e-9 > limit) continue;
      const distance = editDistance(read, name, limit);
      if (distance <= limit && 1 - distance / longest >= minimum) return true;
    }
  }
  return false;
}
