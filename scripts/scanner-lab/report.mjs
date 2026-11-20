/* =====================================================================
   SCANNER LAB, STEP 4: READ THE RESULTS
   Takes a results file the browser saved (cache/results/<tag>.json) and prints:
     - the totals (RIGHT, WRONG, PICKER, NONE),
     - the same totals for each kind of card (old frame, borderless, foil...), to show where it is weak,
     - one line for every card that was not RIGHT: what the text reader read for the name and for the
       info line, and what the scanner showed. That is where the next fix comes from.
   Run:  node scripts/scanner-lab/report.mjs <tag> [more tags to compare]
   ===================================================================== */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// How alike two pieces of text are, 0 to 1 (1 = the same), by counting single-letter changes
function likeness(a, b) {
  const x = a.toLowerCase().replace(/[^a-z0-9]/g, '');
  const y = b.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!x || !y) return 0;
  const row = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const above = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (x[i - 1] === y[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return 1 - row[y.length] / Math.max(x.length, y.length);
}
// Was the card's name read? (the best match of the real name to any run of words in what the reader gave)
function nameWasRead(read, truth) {
  const words = read.split('\n').join(' ').split(/\s+/);
  let best = likeness(words.join(' '), truth);
  for (let start = 0; start < words.length; start++) for (let end = start + 1; end <= Math.min(words.length, start + 8); end++) best = Math.max(best, likeness(words.slice(start, end).join(' '), truth));
  return best >= 0.8;
}
// Was the collector number read? (its digits appear in the info line text, ignoring leading zeros)
function numberWasRead(info, number) {
  const digits = String(number).replace(/\D/g, '').replace(/^0+/, '');
  if (!digits) return false;
  return (info.match(/\d+/g) || []).some((run) => run.replace(/^0+/, '').includes(digits));
}

// A promo or "The List" printing carries the SAME printed set code and number as the base printing (only a small stamp differs),
// so showing the base printing is as right as the info line can make it: count those as right.
// promo sets are "p" + the set code, with a number like "24p" or "175s"; "plst" is "SET-number"
function equivalentToTruth(r) {
  if (r.outcome !== 'WRONG') return false;
  const m = /\(([A-Za-z0-9]+)\) #(\S+)/.exec(r.shown);
  if (!m) return false;
  const shownSet = m[1].toLowerCase(), shownNumber = m[2].toLowerCase();
  const baseNumber = String(r.number).toLowerCase().replace(/[a-z★]+$/, '');
  if (r.set.toLowerCase() === 'p' + shownSet && baseNumber === shownNumber) return true;
  if (r.set.toLowerCase() === 'plst' && String(r.number).toLowerCase() === `${shownSet}-${shownNumber}`) return true;
  return false;
}
const tags = process.argv.slice(2);
const verbose = !process.env.BRIEF;

for (const tag of tags) {
  const results = JSON.parse(await readFile(join(here, 'cache', 'results', `${tag}.json`), 'utf8'));
  // Promo look-alikes are counted as right (see equivalentToTruth above)
  let promoLookAlikes = 0;
  for (const r of results) if (equivalentToTruth(r)) { r.outcome = 'RIGHT'; r.promoEquivalent = true; promoLookAlikes++; }
  const count = (list) => {
    const c = { RIGHT: 0, WRONG: 0, PICKER: 0, NONE: 0 };
    for (const r of list) c[r.outcome]++;
    return `${String(c.RIGHT).padStart(3)} right | ${String(c.PICKER).padStart(3)} picker | ${String(c.NONE).padStart(3)} not read | ${String(c.WRONG).padStart(3)} WRONG   (of ${list.length})`;
  };
  console.log(`\n===== ${tag} =====`);
  console.log('ALL'.padEnd(24), count(results), promoLookAlikes ? `  (${promoLookAlikes} promo look-alikes counted as right)` : '');
  // Why the not-right ones were not right: was the name read, was the number read?
  const notRight = results.filter((r) => r.outcome !== 'RIGHT');
  const why = { 'name NOT read': 0, 'name read, number NOT read': 0, 'name and number both read': 0 };
  for (const r of notRight) {
    const name = nameWasRead(r.nameText, r.name);
    const number = numberWasRead(r.infoText, r.number);
    why[!name ? 'name NOT read' : !number ? 'name read, number NOT read' : 'name and number both read']++;
  }
  console.log('why not right:'.padEnd(24), JSON.stringify(why));
  const groups = [...new Set(results.map((r) => r.group))];
  for (const g of groups) console.log(g.padEnd(24), count(results.filter((r) => r.group === g)));
  const backgrounds = [...new Set(results.map((r) => r.background))];
  console.log('--- by background');
  for (const b of backgrounds) console.log(b.padEnd(24), count(results.filter((r) => r.background === b)));
  // Where the right printing sits in the list the scanner offered (only for runs saved with the lab hook)
  const ranked = results.filter((r) => r.truthRank !== undefined && r.truthRank !== null && r.outcome !== 'RIGHT' && r.outcome !== 'NONE');
  if (ranked.length) {
    const first = ranked.filter((r) => r.truthRank === 0).length, top3 = ranked.filter((r) => r.truthRank >= 0 && r.truthRank < 3).length, missing = ranked.filter((r) => r.truthRank === -1).length;
    console.log('in the lists offered:'.padEnd(24), `${ranked.length} lists: right printing first in ${first}, in the top 3 in ${top3}, not in the list at all in ${missing}`);
  }
  if (verbose) {
    console.log('--- not right:');
    for (const r of results.filter((x) => x.outcome !== 'RIGHT')) {
      console.log(`${r.outcome.padEnd(6)} ${`${r.set} ${r.number}`.padEnd(10)} ${r.name.slice(0, 26).padEnd(26)} [${r.group}${r.background ? ', ' + r.background : ''}]  name:${JSON.stringify(r.nameText).slice(0, 34)}  info:${JSON.stringify(r.infoText).slice(0, 36)}${r.shown ? '  shown:' + r.shown.slice(0, 44) : ''}`);
    }
  }
}
