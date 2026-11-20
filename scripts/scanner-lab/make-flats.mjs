/* =====================================================================
   SCANNER LAB: SAVE THE STRAIGHTENED CARD FROM EACH PHOTO
   Runs the scanner's own card finding and straightening (the edge-and-shape finder, the corner snap, the flattening) offline on
   photos from a saved result file, and saves each straightened card as a 630 x 880 picture in cache/flats. The lab's OCR
   experiments (experiments/*.js) then try different ways of reading the SAME pictures, without running the whole scanner each time.
   Run:  node scripts/scanner-lab/make-flats.mjs <results tag> <photo folder> [which: numberMissing | all] [limit]
   "numberMissing" keeps only the cards whose name was read but whose collector number was not (what the info-line experiment needs).
   ===================================================================== */

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const sharp = createRequire(join(root, 'scripts', 'catalogue', 'package.json'))('sharp');
const load = (path) => import(pathToFileURL(join(root, 'src', 'lib', 'scanner', 'core', path)).href);
const { findCardByShape } = await load('shapeFinder.ts');
const { snapCorners } = await load('cornerSnap.ts');
const { warpCard } = await load('perspective.ts');

const [tag, folder, which = 'numberMissing', limit = '60'] = process.argv.slice(2);
const results = JSON.parse(await readFile(join(here, 'cache', 'results', `${tag}.json`), 'utf8'));

// Same tests the report uses: was the name / the number read?
const clean = (t) => t.toLowerCase().replace(/[^a-z0-9]/g, '');
const likeness = (a, b) => { const x = clean(a), y = clean(b); if (!x || !y) return 0; const row = Array.from({ length: y.length + 1 }, (_, j) => j); for (let i = 1; i <= x.length; i++) { let d = row[0]; row[0] = i; for (let j = 1; j <= y.length; j++) { const up = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, d + (x[i - 1] === y[j - 1] ? 0 : 1)); d = up; } } return 1 - row[y.length] / Math.max(x.length, y.length); };
const nameRead = (read, truth) => { const w = read.split('\n').join(' ').split(/\s+/); let best = likeness(w.join(' '), truth); for (let s = 0; s < w.length; s++) for (let e = s + 1; e <= Math.min(w.length, s + 8); e++) best = Math.max(best, likeness(w.slice(s, e).join(' '), truth)); return best >= 0.8; };
const numberRead = (info, number) => { const digits = String(number).replace(/\D/g, '').replace(/^0+/, ''); return !!digits && (info.match(/\d+/g) || []).some((run) => run.replace(/^0+/, '').includes(digits)); };

const wanted = results.filter((r) => r.outcome !== 'RIGHT' && (which === 'all' || (nameRead(r.nameText, r.name) && !numberRead(r.infoText, r.number)))).slice(0, Number(limit));
const out = join(here, 'cache', 'flats');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const made = [];
for (const r of wanted) {
  const path = join(here, 'cache', folder, r.file);
  const full = await sharp(path).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = full.info.width, H = full.info.height;
  const look = await sharp(path).rotate().resize(320, Math.round((320 * H) / W)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const quad = findCardByShape({ data: look.data, width: 320, height: look.info.height }, 320);
  if (!quad) continue;
  const snapped = snapCorners({ data: full.data, width: W, height: H }, quad.map((p) => ({ x: p.x * W, y: p.y * H })));
  const flat = warpCard({ data: full.data, width: W, height: H }, snapped, 630, 880);
  const file = r.file.replace(/\.[a-z]+$/, '.png');
  await sharp(Buffer.from(flat), { raw: { width: 630, height: 880, channels: 4 } }).png().toFile(join(out, file));
  made.push({ file, name: r.name, set: r.set, number: r.number, group: r.group });
}
await writeFile(join(out, 'flats.json'), JSON.stringify(made, null, 1));
console.log(`saved ${made.length} straightened cards (of ${wanted.length} wanted) in cache/flats`);
