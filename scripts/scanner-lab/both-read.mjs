/* =====================================================================
   SCANNER LAB: THE CARDS WHERE EVERYTHING WAS READ AND IT STILL WENT WRONG
   Lists the not-right cards where the name AND the collector number were both read correctly. Those are
   mistakes in the scanner's decision, not in the text reading, so they are the cheapest ones to fix.
   Run:  node scripts/scanner-lab/both-read.mjs <tag>
   ===================================================================== */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const results = JSON.parse(await readFile(join(here, 'cache', 'results', `${process.argv[2]}.json`), 'utf8'));
const clean = (t) => t.toLowerCase().replace(/[^a-z0-9]/g, '');
for (const r of results) {
  if (r.outcome === 'RIGHT') continue;
  const digits = String(r.number).replace(/\D/g, '').replace(/^0+/, '');
  const numberRead = digits && (r.infoText.match(/\d+/g) || []).some((run) => run.replace(/^0+/, '').includes(digits));
  const nameRead = clean(r.nameText).includes(clean(r.name).slice(0, Math.max(4, Math.floor(clean(r.name).length * 0.7))));
  if (numberRead && nameRead) console.log(`${r.outcome.padEnd(6)} truth ${r.set} #${r.number}  ${r.name}\n        name:${JSON.stringify(r.nameText).slice(0, 60)}  info:${JSON.stringify(r.infoText)}\n        shown:${r.shown}`);
}
