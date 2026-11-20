/* =====================================================================
   SCANNER LAB: DOES THE SCANNER FIND THE CARD IN EACH PHOTO?
   Before any text can be read, the scanner has to find the card in the photo and cut it out flat. This runs
   the website scanner's own finding steps offline on a folder of photos, in the same order the scan page uses:
     1. the edge-and-shape finder (core/shapeFinder.ts) on a small copy of the photo,
     2. if that finds nothing, the colour finder (core/cardFinder.ts) on the same small copy,
     3. if that finds nothing either, the slower outline finder (core/outlineFinder.ts).
   It saves one wide picture (a "contact sheet") showing what was cut out of every photo, in order, so a person can
   see at a glance which cards were found properly. A red tile means no finder found anything.
   Under each tile nothing is drawn (to keep this simple); the order and the finder used are printed instead.
   Run:  node scripts/scanner-lab/finder-check.mjs <photo folder inside cache> <where to save the sheet.jpg> [only these file-name starts...]
   ===================================================================== */

import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const sharp = createRequire(join(root, 'scripts', 'catalogue', 'package.json'))('sharp');
const load = (path) => import(pathToFileURL(join(root, 'src', 'lib', 'scanner', 'core', path)).href);
const { findCardByShape } = await load('shapeFinder.ts');
const { findCard } = await load('cardFinder.ts');
const { findOutlines, flatCard } = await load('outlineFinder.ts');
const { snapCorners } = await load('cornerSnap.ts');
const { warpCard } = await load('perspective.ts');

// The scan page's own sizes: the small copy the quick finders look at, and the room kept round the card for the corner snap
const LOOK_WIDTH = 320;
const TILE = { w: 252, h: 352 };

const [folder, sheetPath, ...only] = process.argv.slice(2);
const dir = join(here, 'cache', folder);
const files = (await readdir(dir)).filter((f) => /\.(jpe?g|png)$/i.test(f)).filter((f) => !only.length || only.some((start) => f.startsWith(start))).sort();

// Cut the card out flat from the full-size photo, given its corners as shares of the photo (what the quick finders give)
function flatten(full, W, H, quad) {
  const snapped = snapCorners({ data: full, width: W, height: H }, quad.map((p) => ({ x: p.x * W, y: p.y * H })));
  return { data: Buffer.from(warpCard({ data: full, width: W, height: H }, snapped, 630, 880)), width: 630, height: 880 };
}

const tiles = [];
const counts = { shape: 0, colour: 0, outline: 0, none: 0 };
for (const file of files) {
  const path = join(dir, file);
  // The photo turned the right way up (a phone stores it sideways with a note saying which way is up), as the browser does
  const full = await sharp(path).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = full.info.width, H = full.info.height;
  const look = await sharp(path).rotate().resize(LOOK_WIDTH, Math.max(1, Math.round((LOOK_WIDTH * H) / W)), { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const lookPicture = { data: look.data, width: look.info.width, height: look.info.height };
  let by = 'none';
  let flat = null;
  let quad = null;
  try { quad = findCardByShape(lookPicture, LOOK_WIDTH); } catch { quad = null; }
  if (quad) by = 'shape';
  else { quad = findCard(lookPicture); if (quad) by = 'colour'; }
  if (quad) flat = flatten(full.data, W, H, quad);
  else {
    // The outline finder works on a copy no bigger than 1600 on its long side, like the scan page
    const scale = Math.min(1, 1600 / Math.max(W, H));
    const work = await sharp(path).rotate().resize(Math.round(W * scale), Math.round(H * scale), { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const photo = { data: work.data, width: work.info.width, height: work.info.height };
    const found = findOutlines(photo);
    if (found.length) { by = 'outline'; const picture = flatCard(photo, found[0]); flat = { data: Buffer.from(picture.data), width: picture.width, height: picture.height }; }
  }
  counts[by] += 1;
  console.log(`${String(tiles.length + 1).padStart(2)}  ${by.padEnd(8)} ${file}`);
  tiles.push(flat
    ? await sharp(flat.data, { raw: { width: flat.width, height: flat.height, channels: 4 } }).resize(TILE.w, TILE.h, { fit: 'fill' }).jpeg().toBuffer()
    : await sharp({ create: { width: TILE.w, height: TILE.h, channels: 3, background: '#a00' } }).jpeg().toBuffer());
}

// Lay the tiles out in rows of 8
const perRow = 8;
const rows = Math.ceil(tiles.length / perRow);
await sharp({ create: { width: TILE.w * Math.min(perRow, tiles.length), height: TILE.h * rows, channels: 3, background: '#444' } })
  .composite(tiles.map((input, i) => ({ input, left: (i % perRow) * TILE.w, top: Math.floor(i / perRow) * TILE.h })))
  .jpeg({ quality: 82 }).toFile(sheetPath);
console.log(`found by: shape ${counts.shape}, colour ${counts.colour}, outline ${counts.outline}, nothing ${counts.none} (of ${files.length}); sheet saved`);
