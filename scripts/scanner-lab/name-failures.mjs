/* =====================================================================
   SCANNER LAB: THE CARDS WHOSE NAME WAS NOT READ
   Lists, for one saved result file, every card where the text reader did not give back the card's name, grouped by kind of
   card, with what it did read. This shows what the hard titles have in common (a stylised font, a title in an odd place,
   text over busy art...) and so where to look for the fix.
   Run:  node scripts/scanner-lab/name-failures.mjs <tag>
   ===================================================================== */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const results = JSON.parse(await readFile(join(here, 'cache', 'results', `${process.argv[2]}.json`), 'utf8'));
const clean = (t) => t.toLowerCase().replace(/[^a-z0-9]/g, '');
const likeness = (a, b) => { const x = clean(a), y = clean(b); if (!x || !y) return 0; const row = Array.from({ length: y.length + 1 }, (_, j) => j); for (let i = 1; i <= x.length; i++) { let d = row[0]; row[0] = i; for (let j = 1; j <= y.length; j++) { const up = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, d + (x[i - 1] === y[j - 1] ? 0 : 1)); d = up; } } return 1 - row[y.length] / Math.max(x.length, y.length); };
const nameRead = (read, truth) => { const w = read.split('\n').join(' ').split(/\s+/); let best = likeness(w.join(' '), truth); for (let s = 0; s < w.length; s++) for (let e = s + 1; e <= Math.min(w.length, s + 8); e++) best = Math.max(best, likeness(w.slice(s, e).join(' '), truth)); return best >= 0.8; };
const byGroup = {};
for (const r of results) if (r.outcome !== 'RIGHT' && !nameRead(r.nameText, r.name)) (byGroup[r.group] ??= []).push(r);
for (const [group, list] of Object.entries(byGroup).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n${group} (${list.length})`);
  for (const r of list) console.log(`   ${r.name.slice(0, 28).padEnd(28)} ${r.set}/${r.number}  read: ${JSON.stringify(r.nameText).slice(0, 70)}`);
}
