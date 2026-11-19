/* =====================================================================
   BUILD THE CARD CATALOGUE (run by hand, now and then)
   The scanner (on Android and on the web) identifies a card from a small
   SQLite database that lives ON THE DEVICE, so it works with no internet.
   This script makes that database from Scryfall's bulk downloads:
     1. finds the newest "default_cards" and "unique_artwork" files (Scryfall
        publishes them every day as gzipped JSON Lines, one card per line)
     2. reads every PAPER printing from default_cards (digital-only printings
        are left out), keeping: name, set, collector number, language, release
        date, border colour, frame, finishes, picture, colours, type, rarity...
        and, for the unusual-looking ones (full art, showcase, extended art, etched,
        textured, serialized...), a row in the "looks" table: the scanner uses it to
        know when a card won't have the usual layout. See src/lib/scanner/core/looks.ts.
     3. fingerprints the ARTWORK: one 256-bit "perceptual hash" for each
        illustration (the art_crop picture of it, from unique_artwork), both faces
        of a double-faced card. See src/lib/scanner/core/phash.ts, which this
        script uses itself so the stored fingerprints and the app's agree.
        Each printing in the database says which illustration(s) it has.
     4. draws every set's symbol (its icon_svg_uri from /sets) as a 64 x 64
        black-and-white bitmap, for matching the set symbol on old cards.
     5. writes everything to out/catalogue.db, a gzipped copy
        out/catalogue.db.gz, and a tiny out/catalogue.json (version, size and
        checksum) the app reads to see if there's a newer catalogue.
   It can be stopped and run again: every fingerprint and every set symbol is
   saved in cache/ as it's made, so a rerun only does what's new. (The first
   run downloads about 60,000 art pictures, at most 8 a second: an hour or
   two. Later runs only fetch artwork that is new.)
   Run it from this folder (scripts/catalogue) with:
       npm install          (once)
       node build-catalogue.mjs
   Options:
       --out <folder>       where the finished files go (default: ./out)
       --cache <folder>     where downloads and fingerprints are kept (default: ./cache)
       --art-limit <n>      only fingerprint n new artworks this run (for trying it out;
                            the database is built with the fingerprints so far)
       --skip-art           don't fingerprint anything new this run
   Being polite to Scryfall: every request says who we are, the pictures are
   fetched at most 8 a second altogether, and a 429 ("slow down") is waited out.
   The bulk files come from data.scryfall.io, which isn't rate limited.
   ===================================================================== */

import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createGunzip, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';
import { artHash, hashToHex, hexToHash, rgbaToGray } from '../../src/lib/scanner/core/phash.ts';
import { normalizeName } from '../../src/lib/scanner/core/text.ts';
import { lookFromScryfall, lookToRow, needsLookRow } from '../../src/lib/scanner/core/looks.ts';

/* ---------- options ---------- */

const here = dirname(fileURLToPath(import.meta.url));
const flag = (name) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : null; };
const OUT = flag('--out') ?? join(here, 'out');
const CACHE = flag('--cache') ?? join(here, 'cache');
const ART_LIMIT = flag('--art-limit') ? Number(flag('--art-limit')) : Infinity;
const SKIP_ART = process.argv.includes('--skip-art');

// The database's own version. The app refuses a database whose version it
// doesn't know, so change it whenever existing tables change in a way an app
// can't ignore. (Adding a new table, like "looks", doesn't need it: apps that
// don't know about the table never ask for it, and newer apps cope without it.)
const SCHEMA_VERSION = 1;

// Scryfall asks every program to say who it is
const USER_AGENT = 'WUBRGr/0.2 (+https://github.com/navypirate83/wubrgr)';
const JSON_HEADERS = { 'User-Agent': USER_AGENT, Accept: 'application/json;q=0.9,*/*;q=0.8' };
const IMAGE_HEADERS = { 'User-Agent': USER_AGENT, Accept: 'image/*;q=0.9,*/*;q=0.8' };

/* ---------- polite fetching ---------- */

// At most this many requests a second, all together (Scryfall's limit is 10)
const REQUESTS_PER_SECOND = 8;
let nextSlot = 0;
async function waitMyTurn() {
  const now = Date.now();
  const mine = Math.max(now, nextSlot);
  nextSlot = mine + 1000 / REQUESTS_PER_SECOND;
  if (mine > now) await new Promise((resolve) => setTimeout(resolve, mine - now));
}

// Fetch with the polite pace, waiting out a 429 and trying a few times
async function politeFetch(url, headers) {
  for (let attempt = 1; ; attempt++) {
    await waitMyTurn();
    try {
      const response = await fetch(url, { headers });
      if (response.status === 429) {
        const wait = Number(response.headers.get('retry-after')) || 5 * attempt;
        console.warn(`  429 from Scryfall: waiting ${wait}s`);
        await new Promise((resolve) => setTimeout(resolve, wait * 1000));
        if (attempt < 6) continue;
      }
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      return response;
    } catch (err) {
      if (attempt >= 4) throw err;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

/* ---------- 1. the bulk files ---------- */

// Download a (large) file once: kept in the cache under its own dated name
async function downloadOnce(url) {
  const file = join(CACHE, url.split('/').pop());
  if (existsSync(file)) return file;
  console.log(`Downloading ${url}`);
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: '*/*' } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const part = `${file}.part`;
  await pipeline(Readable.fromWeb(response.body), createWriteStream(part));
  await rename(part, file);
  return file;
}

// Read a gzipped JSON Lines file, one card at a time
async function* cardsIn(file) {
  const lines = createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of lines) if (line.trim()) yield JSON.parse(line);
}

/* ---------- 2. the printings ---------- */

const IMAGE_PREFIX = 'https://cards.scryfall.io/normal/';
// A picture address without the part every one starts with (saves space)
const shortPicture = (url) => (typeof url === 'string' && url.startsWith(IMAGE_PREFIX) ? url.slice(IMAGE_PREFIX.length) : url ?? null);

// One printing's row, from a Scryfall card. A card with two faces that have
// their own pictures (transforming, modal, reversible) has a front and a back.
function printingRow(card) {
  const faces = Array.isArray(card.card_faces) ? card.card_faces : [];
  const twoPictures = faces.length >= 2 && faces[0].image_uris && faces[1].image_uris && !card.image_uris;
  const front = twoPictures ? faces[0] : card;
  const back = twoPictures ? faces[1] : null;
  const first = faces[0] ?? card;
  const name = card.name;
  return {
    id: card.id,
    name,
    name_norm: normalizeName(name),
    front_norm: normalizeName(name.split(' // ')[0]),
    set_code: card.set,
    collector_number: String(card.collector_number),
    lang: card.lang,
    released: card.released_at ?? '',
    year: Number((card.released_at ?? '').slice(0, 4)) || 0,
    border: card.border_color ?? '',
    frame: card.frame ?? '',
    finishes: (card.finishes ?? []).join(','),
    img: shortPicture(front.image_uris?.normal),
    img_back: back ? shortPicture(back.image_uris?.normal) : null,
    illus: card.illustration_id ?? front.illustration_id ?? first.illustration_id ?? null,
    illus_back: back ? back.illustration_id ?? null : null,
    colors: (card.colors ?? first.colors ?? []).join(''),
    type_line: card.type_line ?? faces.map((f) => f.type_line).filter(Boolean).join(' // '),
    mana_cost: card.mana_cost ?? first.mana_cost ?? '',
    cmc: card.cmc ?? 0,
    rarity: card.rarity ?? '',
    layout: card.layout ?? '',
  };
}

/* ---------- 3. the art fingerprints ---------- */

// Every illustration in unique_artwork and the art picture to fingerprint:
// the card's own picture, or (a double-faced card) each face's
async function artSources(file) {
  const sources = new Map();
  for await (const card of cardsIn(file)) {
    const add = (id, picture) => { if (id && picture?.art_crop && !sources.has(id)) sources.set(id, picture.art_crop); };
    add(card.illustration_id, card.image_uris);
    for (const face of card.card_faces ?? []) add(face.illustration_id, face.image_uris ?? card.image_uris);
  }
  return sources;
}

// The fingerprints made so far, from the cache (one line per artwork: id, tab, 64 letters/digits)
const HASH_FILE = join(CACHE, 'art-hashes.tsv');
async function loadHashes() {
  const hashes = new Map();
  if (!existsSync(HASH_FILE)) return hashes;
  for (const line of (await readFile(HASH_FILE, 'utf8')).split('\n')) {
    const [id, hex] = line.split('\t');
    if (id && hex?.length === 64) hashes.set(id, hexToHash(hex));
  }
  return hashes;
}

// Fingerprint one artwork picture
async function fingerprint(url) {
  const response = await politeFetch(url, IMAGE_HEADERS);
  const { data, info } = await sharp(Buffer.from(await response.arrayBuffer())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return artHash(rgbaToGray(data, info.width, info.height), info.width, info.height);
}

// Fingerprint what's missing, a few at a time, saving each as it's made
async function fingerprintMissing(wanted, sources, hashes) {
  const todo = wanted.filter((id) => !hashes.has(id) && sources.has(id)).slice(0, Number.isFinite(ART_LIMIT) ? ART_LIMIT : undefined);
  let failed = 0;
  let done = 0;
  const started = Date.now();
  let cursor = 0;
  async function worker() {
    while (cursor < todo.length) {
      const id = todo[cursor++];
      try {
        const hash = await fingerprint(sources.get(id));
        hashes.set(id, hash);
        await appendFile(HASH_FILE, `${id}\t${hashToHex(hash)}\n`);
      } catch (err) {
        failed++;
        console.warn(`  couldn't fingerprint ${id}: ${err.message}`);
      }
      done++;
      if (done % 500 === 0 || done === todo.length) {
        const perSecond = done / ((Date.now() - started) / 1000);
        console.log(`  ${done} of ${todo.length} new artworks (${failed} failed), about ${Math.round((todo.length - done) / perSecond / 60)} minutes left`);
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  return { attempted: todo.length, failed };
}

/* ---------- 4. the set symbols ---------- */

const SYMBOL_FILE = join(CACHE, 'set-symbols.json');
const SYMBOL_SIZE = 64;

// Draw one set's icon (an SVG) as a 64 x 64 black-and-white bitmap: 1 bit per
// pixel, 1 = dark (part of the symbol), row by row, 8 pixels to a byte
async function symbolBitmap(svg) {
  const { data } = await sharp(Buffer.from(svg), { density: 400 })
    .resize(SYMBOL_SIZE, SYMBOL_SIZE, { fit: 'contain', background: '#ffffff' })
    .flatten({ background: '#ffffff' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const bytes = new Uint8Array((SYMBOL_SIZE * SYMBOL_SIZE) / 8);
  for (let i = 0; i < SYMBOL_SIZE * SYMBOL_SIZE; i++) if (data[i] < 128) bytes[i >> 3] |= 0x80 >> (i & 7);
  return bytes;
}

// Every set's symbol, by the icon's address (many sets share one icon).
// Already-drawn ones come from the cache.
async function setSymbols(sets) {
  const cached = existsSync(SYMBOL_FILE) ? JSON.parse(await readFile(SYMBOL_FILE, 'utf8')) : {};
  const urls = [...new Set(sets.map((s) => s.icon_svg_uri).filter(Boolean))].filter((url) => !cached[url]);
  console.log(`Set symbols: ${urls.length} to draw (${Object.keys(cached).length} already done)`);
  let cursor = 0;
  async function worker() {
    while (cursor < urls.length) {
      const url = urls[cursor++];
      try {
        const response = await politeFetch(url, { 'User-Agent': USER_AGENT, Accept: 'image/svg+xml,*/*;q=0.8' });
        cached[url] = Buffer.from(await symbolBitmap(await response.text())).toString('base64');
      } catch (err) {
        console.warn(`  couldn't draw ${url}: ${err.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  await writeFile(SYMBOL_FILE, JSON.stringify(cached));
  return cached;
}

/* ---------- 5. the database ---------- */

const SCHEMA = `
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE sets (
    code TEXT PRIMARY KEY, name TEXT NOT NULL, released TEXT, set_type TEXT, parent_code TEXT,
    icon_url TEXT, symbol BLOB
  );
  CREATE TABLE printings (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, name_norm TEXT NOT NULL, front_norm TEXT NOT NULL,
    set_code TEXT NOT NULL, collector_number TEXT NOT NULL, lang TEXT NOT NULL,
    released TEXT, year INTEGER, border TEXT, frame TEXT, finishes TEXT,
    img TEXT, img_back TEXT, illus TEXT, illus_back TEXT,
    colors TEXT, type_line TEXT, mana_cost TEXT, cmc REAL, rarity TEXT, layout TEXT
  );
  CREATE TABLE art (illus TEXT PRIMARY KEY, hash BLOB NOT NULL);
  CREATE TABLE looks (
    id TEXT PRIMARY KEY, full_art INTEGER NOT NULL, textless INTEGER NOT NULL,
    frame_effects TEXT NOT NULL, promo_types TEXT NOT NULL
  );
  -- FLAVOR NAMES: some printings (Secret Lair, Universes Beyond...) show another name on the card than
  -- the card's real one (Command Tower printed as "Croft Manor"). One row for each flavor name: the
  -- name in the plain matching form (see text.ts) and the printing it belongs to. A new table, so
  -- apps that don't know about it never ask for it.
  CREATE TABLE flavor (flavor_norm TEXT NOT NULL, id TEXT NOT NULL);
  CREATE INDEX flavor_name ON flavor (flavor_norm);
  CREATE INDEX printings_set_number ON printings (set_code, collector_number);
  CREATE INDEX printings_front ON printings (front_norm);
  CREATE INDEX printings_illus ON printings (illus);
`;

async function main() {
  await mkdir(CACHE, { recursive: true });
  await mkdir(OUT, { recursive: true });

  // 1. the newest bulk files
  const index = (await (await politeFetch('https://api.scryfall.com/bulk-data', JSON_HEADERS)).json()).data;
  const pick = (type) => {
    const entry = index.find((e) => e.type === type);
    if (!entry?.jsonl_download_uri) throw new Error(`Scryfall's bulk list has no JSON Lines file for ${type}`);
    return entry;
  };
  const defaultEntry = pick('default_cards');
  const uniqueEntry = pick('unique_artwork');
  const defaultFile = await downloadOnce(defaultEntry.jsonl_download_uri);
  const uniqueFile = await downloadOnce(uniqueEntry.jsonl_download_uri);

  // 2. the printings (paper only)
  console.log('Reading the printings…');
  const rows = [];
  // The printings that look unusual (full art, showcase...): their id and look
  const looks = [];
  // Each flavor name a printing wears, with the printing's id (a card's own, and each face's)
  const flavors = [];
  let digitalSkipped = 0;
  for await (const card of cardsIn(defaultFile)) {
    if (!(card.games ?? []).includes('paper')) { digitalSkipped++; continue; }
    rows.push(printingRow(card));
    const look = lookFromScryfall(card);
    if (needsLookRow(look)) looks.push({ id: card.id, ...lookToRow(look) });
    const flavorNames = new Set([card.flavor_name, ...(Array.isArray(card.card_faces) ? card.card_faces.map((f) => f.flavor_name) : [])].filter(Boolean));
    for (const flavor of flavorNames) {
      const plain = normalizeName(String(flavor).split(' // ')[0]);
      if (plain) flavors.push({ flavor_norm: plain, id: card.id });
    }
  }
  const wanted = [...new Set(rows.flatMap((r) => [r.illus, r.illus_back]).filter(Boolean))];

  // 3. the art fingerprints
  console.log('Reading the artwork list…');
  const sources = await artSources(uniqueFile);
  const hashes = await loadHashes();
  const missingSource = wanted.filter((id) => !sources.has(id) && !hashes.has(id)).length;
  let fingerprinted = { attempted: 0, failed: 0 };
  if (!SKIP_ART) {
    console.log(`Art: ${wanted.length} illustrations wanted, ${wanted.filter((id) => hashes.has(id)).length} already fingerprinted`);
    fingerprinted = await fingerprintMissing(wanted, sources, hashes);
  }

  // 4. the sets and their symbols
  console.log('Reading the sets…');
  const sets = (await (await politeFetch('https://api.scryfall.com/sets', JSON_HEADERS)).json()).data;
  const symbols = await setSymbols(sets);

  // 5. write the database
  console.log('Writing the database…');
  const dbFile = join(OUT, 'catalogue.db');
  await rm(dbFile, { force: true });
  const db = new DatabaseSync(dbFile);
  db.exec('PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF; PRAGMA page_size = 4096;');
  db.exec(SCHEMA);
  db.exec('BEGIN');
  const addSet = db.prepare('INSERT INTO sets (code, name, released, set_type, parent_code, icon_url, symbol) VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const s of sets) {
    const symbol = s.icon_svg_uri && symbols[s.icon_svg_uri] ? Buffer.from(symbols[s.icon_svg_uri], 'base64') : null;
    addSet.run(s.code, s.name, s.released_at ?? null, s.set_type ?? null, s.parent_set_code ?? null, s.icon_svg_uri ?? null, symbol);
  }
  const columns = Object.keys(rows[0]);
  const addPrinting = db.prepare(`INSERT INTO printings (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`);
  for (const row of rows) addPrinting.run(...columns.map((c) => row[c]));
  const addLook = db.prepare('INSERT INTO looks (id, full_art, textless, frame_effects, promo_types) VALUES (?, ?, ?, ?, ?)');
  for (const look of looks) addLook.run(look.id, look.full_art, look.textless, look.frame_effects, look.promo_types);
  const addFlavor = db.prepare('INSERT INTO flavor (flavor_norm, id) VALUES (?, ?)');
  for (const flavor of flavors) addFlavor.run(flavor.flavor_norm, flavor.id);
  const addArt = db.prepare('INSERT INTO art (illus, hash) VALUES (?, ?)');
  let artRows = 0;
  for (const id of wanted) {
    const hash = hashes.get(id);
    if (hash) { addArt.run(id, hash); artRows++; }
  }
  const builtAt = new Date().toISOString();
  const addMeta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
  const counts = { printings: rows.length, sets: sets.length, artworks: artRows };
  for (const [key, value] of Object.entries({
    schema_version: SCHEMA_VERSION, built_at: builtAt, source_updated_at: defaultEntry.updated_at, ...counts,
  })) addMeta.run(key, String(value));
  db.exec('COMMIT');
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  db.exec('VACUUM');
  db.close();

  // 6. the gzipped copy and the small "what's new" file
  const bytes = await readFile(dbFile);
  const gzipped = gzipSync(bytes, { level: 9 });
  await writeFile(`${dbFile}.gz`, gzipped);
  await writeFile(join(OUT, 'catalogue.json'), JSON.stringify({
    schemaVersion: SCHEMA_VERSION, builtAt, sourceUpdatedAt: defaultEntry.updated_at, ...counts,
    bytes: bytes.length, gzipBytes: gzipped.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }, null, 2));

  // The final counts
  const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
  console.log('\nDONE');
  console.log(`  printings:  ${rows.length} (paper; ${digitalSkipped} digital-only left out)`);
  console.log(`  flavor names: ${flavors.length} printings wear another name (Croft Manor on a Command Tower...)`);
  console.log(`  looks:      ${looks.length} printings look unusual (full art, showcase, extended art, etched...)`);
  console.log(`  sets:       ${sets.length} (${sets.filter((s) => symbols[s.icon_svg_uri]).length} with a symbol bitmap)`);
  console.log(`  art hashes: ${artRows} of ${wanted.length} illustrations wanted`);
  console.log(`              ${fingerprinted.attempted} tried this run, ${fingerprinted.failed} failed, ${missingSource} have no picture in unique_artwork`);
  console.log(`  database:   ${mb(bytes.length)} (${mb(gzipped.length)} gzipped) in ${OUT}`);
}

await main();
