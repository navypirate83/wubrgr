/* =====================================================================
   SCANNER LAB: MAKE A SHORT LIST OF JUST THE PHOTOS THAT FAILED
   Takes a saved results file and a photo list, and writes a new, shorter photo list holding only the photos that were not
   RIGHT (or only those where one chosen thing went wrong), so a fix aimed at them can be tried quickly instead of re-running
   hundreds of photos.
   Run:  node scripts/scanner-lab/pick-failures.mjs <results tag> <photo folder> <new list name> [NONE|PICKER|WRONG ...]
   Example:  node scripts/scanner-lab/pick-failures.mjs p2-d photos2 failed-none NONE
   ===================================================================== */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [tag, folder, listName, ...outcomes] = process.argv.slice(2);
const wanted = new Set(outcomes.length ? outcomes : ['NONE', 'PICKER', 'WRONG']);
const results = JSON.parse(await readFile(join(here, 'cache', 'results', `${tag}.json`), 'utf8'));
const photos = JSON.parse(await readFile(join(here, 'cache', folder, 'photos.json'), 'utf8'));
const failed = new Set(results.filter((r) => wanted.has(r.outcome)).map((r) => r.file));
const shorter = photos.filter((p) => failed.has(p.file));
await writeFile(join(here, 'cache', folder, `${listName}.json`), JSON.stringify(shorter, null, 1));
console.log(`${shorter.length} photos written to cache/${folder}/${listName}.json`);
