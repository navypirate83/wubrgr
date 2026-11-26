/* =====================================================================
   THE DAILY PRICE FILES
   Makes the prices the app shows: one small file per set, holding nine
   prices for every printing in it. GitHub runs this once a day (see
   .github/workflows/deploy.yml) and publishes the files with the website,
   at /prices/set-<code>.json.

   Why not in the app? The stores' own lists are huge (Card Kingdom's is
   about 48 MB), and a browser isn't allowed to read some of them at all.

   Where each number comes from:
   - Scryfall's "default cards" file: every printing, with the ID numbers
     the stores use for it (and its own copy of two prices, as a backup)
   - TCGCSV (a free copy of TCGplayer's prices): market, mid, low and high
   - Card Kingdom's price list: retail (they sell) and buy (they pay)
   - Cardmarket's price guide: trend, low and 30-day average (euros)

   Run it with:  node scripts/prices/build-prices.mjs <folder to fill>
   ===================================================================== */

import { mkdirSync, writeFileSync, createWriteStream, createReadStream, rmSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Where the files go
const OUT = process.argv[2] ?? 'public/prices';

// Who we say we are when asking (a plain name, no personal details)
const HEADERS = { 'User-Agent': 'WUBRGr-price-builder/1.0', Accept: 'application/json' };

// Wait a moment (so we don't hammer anyone's server)
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Ask for a web address, trying three times before giving up
async function ask(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { headers: HEADERS });
      if (!response.ok) throw new Error(`${url} answered ${response.status}`);
      return response;
    } catch (err) {
      if (attempt === 3) throw err;
      await pause(attempt * 2000);
    }
  }
}
const askJson = async (url) => (await ask(url)).json();

// A price as a number to the cent, or null when there isn't one (0 counts as none)
const money = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) / 100 : null;
};

/* ----- TCGplayer (through TCGCSV): category 1 is Magic ----- */
async function loadTcgplayer() {
  const { results: groups } = await askJson('https://tcgcsv.com/tcgplayer/1/groups');
  const prices = new Map();   // product number -> { Normal: [...], Foil: [...] }
  for (const group of groups) {
    const { results } = await askJson(`https://tcgcsv.com/tcgplayer/1/${group.groupId}/prices`);
    for (const row of results) {
      const kept = prices.get(row.productId) ?? {};
      kept[row.subTypeName] = [money(row.marketPrice), money(row.midPrice), money(row.lowPrice), money(row.highPrice)];
      prices.set(row.productId, kept);
    }
    await pause(100);
  }
  return prices;
}

/* ----- Card Kingdom ----- */
async function loadCardKingdom() {
  const { data } = await askJson('https://api.cardkingdom.com/api/pricelist');
  const prices = new Map();   // Scryfall ID -> { normal, foil, etched }
  for (const entry of data) {
    if (!entry.scryfall_id) continue;
    const finish = entry.is_foil !== 'true' ? 'normal' : /etched/i.test(entry.variation ?? '') ? 'etched' : 'foil';
    const kept = prices.get(entry.scryfall_id) ?? {};
    kept[finish] = {
      retail: money(entry.price_retail),
      // A buy price only counts while they're actually buying that card
      buy: Number(entry.qty_buying) > 0 ? money(entry.price_buy) : null,
      url: entry.url,
    };
    prices.set(entry.scryfall_id, kept);
  }
  return prices;
}

/* ----- Cardmarket ----- */
async function loadCardmarket() {
  const { priceGuides } = await askJson('https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_1.json');
  return new Map(priceGuides.map((row) => [row.idProduct, row]));
}

/* ----- Scryfall: every printing, one per line, read a line at a time ----- */
async function eachPrinting(use) {
  const info = await askJson('https://api.scryfall.com/bulk-data/default-cards');
  // The file is downloaded to a temporary spot first, then read through
  const file = join(tmpdir(), 'scryfall-default-cards.jsonl.gz');
  await pipeline(Readable.fromWeb((await ask(info.jsonl_download_uri)).body), createWriteStream(file));
  // (Some servers hand it over still squeezed small: unsqueeze it if so)
  const start = await new Promise((resolve, reject) => {
    createReadStream(file, { start: 0, end: 1 }).on('data', resolve).on('error', reject);
  });
  let input = createReadStream(file);
  if (start[0] === 0x1f && start[1] === 0x8b) input = input.pipe(createGunzip());
  for await (const line of createInterface({ input, crlfDelay: Infinity })) {
    const text = line.trim().replace(/,$/, '');
    if (text.startsWith('{')) use(JSON.parse(text));
  }
  rmSync(file, { force: true });
}

/* ----- Put them together -----
   Each printing's entry: "n" (not foil), "f" (foil) and "e" (etched), each
   a list of nine prices in this order (must match PRICE_SLOTS in the
   app's lib/prices.ts):
     TCGplayer market, mid, low; Card Kingdom retail, buy;
     Cardmarket trend, low, 30-day average; TCGplayer high
   and "k": the end of its Card Kingdom web address. */
export function entryFor(card, tcg, ck, cm) {
  const finishes = card.finishes ?? [];
  const own = card.prices ?? {};
  const product = tcg.get(card.tcgplayer_id) ?? {};
  const etchedProduct = tcg.get(card.tcgplayer_etched_id) ?? {};
  const kingdom = ck.get(card.id) ?? {};
  const guide = cm.get(card.cardmarket_id) ?? {};

  // All the prices for one finish
  const allPrices = (tcgRow, tcgBackup, ckRow, cmFoil, cmBackup) => {
    const suffix = cmFoil ? '-foil' : '';
    const values = [
      tcgRow?.[0] ?? money(tcgBackup), tcgRow?.[1] ?? null, tcgRow?.[2] ?? null,
      ckRow?.retail ?? null, ckRow?.buy ?? null,
      money(guide[`trend${suffix}`]) ?? money(cmBackup), money(guide[`low${suffix}`]), money(guide[`avg30${suffix}`]),
      tcgRow?.[3] ?? null,
    ];
    return values.some((v) => v !== null) ? values : undefined;
  };

  const entry = {};
  // Only the finishes the printing really comes in (Cardmarket's file has
  // stray foil numbers for cards that have no foil)
  if (finishes.includes('nonfoil')) entry.n = allPrices(product.Normal, own.usd, kingdom.normal, false, own.eur);
  if (finishes.includes('foil')) entry.f = allPrices(product.Foil, own.usd_foil, kingdom.foil, true, own.eur_foil);
  if (finishes.includes('etched')) {
    entry.e = allPrices(etchedProduct.Foil ?? etchedProduct.Normal, own.usd_etched,
      kingdom.etched ?? (finishes.includes('foil') ? undefined : kingdom.foil), true, own.eur_etched);
  }
  const url = kingdom.normal?.url ?? kingdom.foil?.url ?? kingdom.etched?.url;
  if (url) entry.k = url;
  return entry.n || entry.f || entry.e || entry.k ? entry : null;
}

async function main() {
  const [tcg, ck, cm] = await Promise.all([loadTcgplayer(), loadCardKingdom(), loadCardmarket()]);
  console.log(`Prices read: TCGplayer ${tcg.size}, Card Kingdom ${ck.size}, Cardmarket ${cm.size}`);

  const sets = new Map();   // set code -> { Scryfall ID: entry }
  let count = 0;
  await eachPrinting((card) => {
    if (card.digital) return;
    const entry = entryFor(card, tcg, ck, cm);
    if (!entry) return;
    if (!sets.has(card.set)) sets.set(card.set, {});
    sets.get(card.set)[card.id] = entry;
    count++;
  });

  // Far too few would mean something went wrong: fail, so yesterday's files are kept
  if (count < 50000 || tcg.size < 50000 || ck.size < 30000 || cm.size < 50000) {
    throw new Error(`Too few prices (${count} printings): not publishing these`);
  }

  mkdirSync(OUT, { recursive: true });
  // ("set-" in front: Windows won't allow a file called just "con", which is a real set code)
  for (const [code, cards] of sets) writeFileSync(join(OUT, `set-${code}.json`), JSON.stringify(cards));
  writeFileSync(join(OUT, 'info.json'), JSON.stringify({ built: new Date().toISOString(), sets: sets.size, printings: count }));
  console.log(`Wrote ${sets.size} sets, ${count} printings to ${OUT}`);
}

await main();
