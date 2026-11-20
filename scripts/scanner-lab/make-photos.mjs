/* =====================================================================
   SCANNER LAB, STEP 2: TURN CLEAN CARD PICTURES INTO PHONE-STYLE PHOTOS
   The pictures from Scryfall are perfect flat scans. A real phone photo is
   not: the card is tilted and seen at an angle, there is a table behind it,
   a shadow, uneven light, a little blur, grain, maybe a patch of glare, and
   the picture is squashed to a JPEG. This makes that kind of photo from each
   scan, so the scanner can be tested on many cards without taking photos.
   For every card it makes a few photos with different looks (made from a
   fixed seed, so the same run always gives the same photos), and writes
   photos.json: each photo with the right answer (set code and number).
   How a photo is made, step by step:
     1. pick a background (a plain colour, with grain and a soft light gradient),
     2. pick where the card's four corners land: tilted, a little in perspective, a good size,
     3. for every pixel inside those corners, work out which spot on the scan it shows
        (the same maths as straightening a card, run the other way) and copy that colour,
     4. darken a soft shadow just below and to one side of the card,
     5. blur a little, add grain, sometimes add a bright glare patch, and save as a JPEG.
   Run:  node scripts/scanner-lab/make-photos.mjs [photos per card] [folder name, default photos] [most blur, default 1.5]
   (a typical phone photo is sharp, about 0.3 to 0.9; the harder 1.5 is for stress tests)
   ===================================================================== */

import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// sharp (a picture library) lives with the catalogue scripts
const sharp = createRequire(join(here, '..', 'catalogue', 'package.json'))('sharp');
const CARDS = join(here, 'cache', 'cards');
const PER_CARD = Number(process.argv[2] || 2);
const PHOTOS = join(here, 'cache', process.argv[3] || 'photos');
const MOST_BLUR = Number(process.argv[4] || 1.5);
await mkdir(PHOTOS, { recursive: true });
const cards = JSON.parse(await readFile(join(here, 'cache', 'cards.json'), 'utf8'));

// A small repeatable random number maker (the same seed always gives the same numbers)
function randomMaker(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hashOf = (text) => [...text].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

// The maths that carries four points onto four others (the same as perspective.ts, written out here so this script stands alone).
// Gives 8 numbers; apply() uses them.
function homography(from, to) {
  const rows = [];
  for (let k = 0; k < 4; k++) {
    const [u, v] = from[k];
    const [x, y] = to[k];
    rows.push([u, v, 1, 0, 0, 0, -x * u, -x * v, x]);
    rows.push([0, 0, 0, u, v, 1, -y * u, -y * v, y]);
  }
  for (let col = 0; col < 8; col++) {
    let best = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(rows[r][col]) > Math.abs(rows[best][col])) best = r;
    [rows[col], rows[best]] = [rows[best], rows[col]];
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const f = rows[r][col] / rows[col][col];
      for (let c = col; c < 9; c++) rows[r][c] -= f * rows[col][c];
    }
  }
  return rows.map((row, i) => row[8] / row[i]);
}
const apply = (h, x, y) => {
  const w = h[6] * x + h[7] * y + 1;
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
};

// The looks a photo can have
const BACKGROUNDS = [
  { name: 'light-table', base: [196, 188, 176] },
  { name: 'white-box', base: [225, 222, 216] },
  { name: 'cardboard', base: [150, 120, 90] },
  { name: 'dark-mat', base: [38, 40, 46] },
  { name: 'wood', base: [110, 72, 48] },
  { name: 'blue-mat', base: [70, 90, 130] },
];

async function makePhoto(card, index) {
  const random = randomMaker(hashOf(card.id) + index * 977);
  const scan = await sharp(join(CARDS, card.file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const sw = scan.info.width;
  const sh = scan.info.height;
  // The photo is portrait or landscape, about 1200 x 1600 (a typical downsized phone photo)
  const landscape = random() < 0.3;
  const W = landscape ? 1600 : 1200;
  const H = landscape ? 1200 : 1600;
  const background = BACKGROUNDS[Math.floor(random() * BACKGROUNDS.length)];
  // 1. the background: a base colour, a soft gradient of light across it, and grain
  const lightAngle = random() * Math.PI * 2;
  const lightAmount = 0.15 + random() * 0.25;
  const out = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const light = 1 + lightAmount * (((x / W - 0.5) * Math.cos(lightAngle) + (y / H - 0.5) * Math.sin(lightAngle)) * 1.6);
      const grain = (random() - 0.5) * 14;
      const o = (y * W + x) * 3;
      for (let c = 0; c < 3; c++) out[o + c] = Math.max(0, Math.min(255, background.base[c] * light + grain));
    }
  }
  // 2. where the card's corners land: somewhere near the middle, 38% to 70% of the shorter side, tilted, with perspective
  const size = Math.min(W, H) * (0.38 + random() * 0.32);
  const cw = size;
  const ch = size * (sh / sw);
  const cx = W * (0.38 + random() * 0.24);
  const cy = H * (0.38 + random() * 0.24);
  const tilt = (random() - 0.5) * 0.9; // up to about 26 degrees either way
  const squeeze = (random() - 0.5) * 0.18;
  const lean = (random() - 0.5) * 0.12;
  const base = [[-cw / 2, -ch / 2], [cw / 2, -ch / 2], [cw / 2, ch / 2], [-cw / 2, ch / 2]];
  const corners = base.map(([x, y]) => {
    // perspective: one side is nearer the camera, so it looks a little bigger
    const near = 1 + squeeze * (y / (ch / 2)) + lean * (x / (cw / 2));
    const px = x * near;
    const py = y * (1 + lean * 0.4 * (x / (cw / 2)));
    return [cx + px * Math.cos(tilt) - py * Math.sin(tilt), cy + px * Math.sin(tilt) + py * Math.cos(tilt)];
  });
  const scanCorners = [[0, 0], [sw - 1, 0], [sw - 1, sh - 1], [0, sh - 1]];
  const toScan = homography(corners, scanCorners); // a photo spot -> the spot on the scan
  // 4. a soft shadow: the card's shape moved down and to one side, drawn as a darker patch
  const shadow = [random() * 30 + 10, random() * 30 + 10];
  const toScanShadow = homography(corners.map(([x, y]) => [x + shadow[0], y + shadow[1]]), scanCorners);
  const minX = Math.max(0, Math.floor(Math.min(...corners.map((p) => p[0])) - 60));
  const maxX = Math.min(W - 1, Math.ceil(Math.max(...corners.map((p) => p[0])) + 90));
  const minY = Math.max(0, Math.floor(Math.min(...corners.map((p) => p[1])) - 60));
  const maxY = Math.min(H - 1, Math.ceil(Math.max(...corners.map((p) => p[1])) + 90));
  // 3. the colour of the scan at a spot between pixels (a blend of the four nearest)
  const sample = (u, v) => {
    const x0 = Math.floor(u);
    const y0 = Math.floor(v);
    const fx = u - x0;
    const fy = v - y0;
    const at = (xx, yy, c) => scan.data[(yy * sw + xx) * 4 + c];
    return [0, 1, 2].map((c) => (at(x0, y0, c) * (1 - fx) + at(x0 + 1, y0, c) * fx) * (1 - fy) + (at(x0, y0 + 1, c) * (1 - fx) + at(x0 + 1, y0 + 1, c) * fx) * fy);
  };
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const o = (y * W + x) * 3;
      const [su, sv] = apply(toScanShadow, x, y);
      if (su >= 2 && sv >= 2 && su < sw - 3 && sv < sh - 3) for (let c = 0; c < 3; c++) out[o + c] *= 0.72;
      const [u, v] = apply(toScan, x, y);
      if (u >= 1 && v >= 1 && u < sw - 2 && v < sh - 2) {
        const rgb = sample(u, v);
        for (let c = 0; c < 3; c++) out[o + c] = rgb[c];
      }
    }
  }
  // 5. a bright glare patch on some photos (a lamp reflecting off the card)
  const glare = random() < 0.4;
  if (glare) {
    const gx = cx + (random() - 0.5) * cw * 0.7;
    const gy = cy + (random() - 0.5) * ch * 0.7;
    const gr = cw * (0.12 + random() * 0.15);
    for (let y = Math.max(0, Math.floor(gy - gr)); y < Math.min(H, gy + gr); y++) {
      for (let x = Math.max(0, Math.floor(gx - gr)); x < Math.min(W, gx + gr); x++) {
        const d = Math.hypot(x - gx, y - gy) / gr;
        if (d < 1) for (let c = 0; c < 3; c++) { const o = (y * W + x) * 3 + c; out[o] = out[o] + (255 - out[o]) * (1 - d) * 0.55; }
      }
    }
  }
  // blur a little, save as a JPEG of middling quality
  const blur = 0.3 + random() * (MOST_BLUR - 0.3);
  const quality = 62 + Math.floor(random() * 28);
  const file = `${card.id}_${index}.jpg`;
  await sharp(out, { raw: { width: W, height: H, channels: 3 } }).blur(blur).jpeg({ quality }).toFile(join(PHOTOS, file));
  return { file, cardId: card.id, name: card.name, set: card.set, number: card.number, group: card.group, finishes: card.finishes, frame: card.frame, background: background.name, landscape, glare, blur: +blur.toFixed(2), quality };
}

const photos = [];
for (const card of cards) for (let i = 0; i < PER_CARD; i++) photos.push(await makePhoto(card, i));
await writeFile(join(PHOTOS, 'photos.json'), JSON.stringify(photos, null, 1));
console.log('made', photos.length, 'photos from', cards.length, 'cards');
