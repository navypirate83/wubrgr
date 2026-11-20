/* =====================================================================
   SCANNER LAB: WHAT EACH CUT-OUT READ
   The website scanner may cut a card out of a photo several ways (as found, widened, upside down, the outline
   finder's finds) and keep the one whose text makes the most sense (src/lib/scanner/core/cardCuts.ts). This
   prints, for every photo of a saved run, each cut-out that was read: its score, the title text and the info
   line text. It is how to see WHY a photo went wrong: no good cut-out at all, or a good one that lost.
   A "Q" cut-out is from the quick finders (0 as found, 1 widened, 2 and 3 the same two upside down);
   an "O" cut-out is from the outline finder (4 turns of each find).
   Run:  node scripts/scanner-lab/cuts.mjs <results tag> [only the photos that were not right: "bad"]
   ===================================================================== */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [tag, which] = process.argv.slice(2);
const results = JSON.parse(await readFile(join(here, 'cache', 'results', `${tag}.json`), 'utf8'));
// Text on one line, cut short, so a row stays readable
const short = (text, length) => JSON.stringify(String(text || '').replace(/\s+/g, ' ').slice(0, length));

for (const r of results) {
  if (which === 'bad' && r.outcome === 'RIGHT') continue;
  console.log(`\n${r.outcome.padEnd(6)} ${r.file}   shown: ${String(r.shown).slice(0, 60)}   (${r.seconds} s)`);
  for (const c of r.cuts || []) console.log(`   ${c.group === 2 ? 'Q' : 'O'}${c.cut}  score ${String(c.score).padEnd(3)}  title ${short(c.name, 44)}  info ${short(c.info, 30)}`);
}
