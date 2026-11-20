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
const tags = process.argv.slice(2);
const verbose = !process.env.BRIEF;

for (const tag of tags) {
  const results = JSON.parse(await readFile(join(here, 'cache', 'results', `${tag}.json`), 'utf8'));
  const count = (list) => {
    const c = { RIGHT: 0, WRONG: 0, PICKER: 0, NONE: 0 };
    for (const r of list) c[r.outcome]++;
    return `${String(c.RIGHT).padStart(3)} right | ${String(c.PICKER).padStart(3)} picker | ${String(c.NONE).padStart(3)} not read | ${String(c.WRONG).padStart(3)} WRONG   (of ${list.length})`;
  };
  console.log(`\n===== ${tag} =====`);
  console.log('ALL'.padEnd(24), count(results));
  const groups = [...new Set(results.map((r) => r.group))];
  for (const g of groups) console.log(g.padEnd(24), count(results.filter((r) => r.group === g)));
  const backgrounds = [...new Set(results.map((r) => r.background))];
  console.log('--- by background');
  for (const b of backgrounds) console.log(b.padEnd(24), count(results.filter((r) => r.background === b)));
  if (verbose) {
    console.log('--- not right:');
    for (const r of results.filter((x) => x.outcome !== 'RIGHT')) {
      console.log(`${r.outcome.padEnd(6)} ${`${r.set} ${r.number}`.padEnd(10)} ${r.name.slice(0, 26).padEnd(26)} [${r.group}${r.background ? ', ' + r.background : ''}]  name:${JSON.stringify(r.nameText).slice(0, 34)}  info:${JSON.stringify(r.infoText).slice(0, 36)}${r.shown ? '  shown:' + r.shown.slice(0, 44) : ''}`);
    }
  }
}
