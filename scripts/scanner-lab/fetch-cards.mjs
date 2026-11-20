/* =====================================================================
   SCANNER LAB, STEP 1: DOWNLOAD A SET OF RANDOM CARDS FROM SCRYFALL
   Scryfall (scryfall.com) is a free website that knows every Magic card and
   has a clean picture of each. This script asks it for random cards, in
   several groups on purpose (old frames, new frames, borderless, foil...),
   so the test covers many kinds of card and not just plain ones. For each
   card it saves the picture and writes a list (cards.json) saying which
   printing each picture is: the right answer to test the scanner against.
   Run:  node scripts/scanner-lab/fetch-cards.mjs [how many per group]
   Scryfall asks programs to wait about 100 ms between requests and to say who
   they are, so this does both (the name below is generic on purpose).
   ===================================================================== */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const IMAGES = join(here, 'cache', 'cards');
const LIST = join(here, 'cache', 'cards.json');
const PER_GROUP = Number(process.argv[2] || 6);

// The groups of cards to draw from. Each is a Scryfall search; "random" picks one card that matches it.
const BASE = 'lang:en -is:digital game:paper -layout:token -layout:emblem -layout:art_series -is:oversized -layout:double_faced_token';
const GROUPS = {
  'frame-1993-old': 'frame:1993',
  'frame-1997': 'frame:1997',
  'frame-2003': 'frame:2003',
  'frame-2015-modern': 'frame:2015 -is:borderless -is:showcase -is:extendedart',
  'borderless': 'is:borderless',
  'showcase': 'is:showcase',
  'extended-art': 'is:extendedart',
  'full-art-land': 'is:fullart type:land',
  'secret-lair': 'set:sld',
  'promo-foil': 'is:promo is:foil',
  'new-2023-on': 'year>=2023',
  'universes-beyond': 'is:ub',
  'reprint-many-printings': 'is:reprint year>=2018',
  'foil-etched': 'is:etched',
  'serialized-or-special': 'is:fullart is:foil',
  'basic-lands': 'type:basic',
  'tokens-and-split': 'layout:split OR layout:adventure OR layout:saga',
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const HEADERS = { 'User-Agent': 'ScannerLab/1.0', Accept: 'application/json' };

// Ask Scryfall for one random card that matches a search (null if it has none).
// If Scryfall says "too many requests" (429), wait a while and try again instead of giving up.
async function randomCard(search) {
  const url = `https://api.scryfall.com/cards/random?q=${encodeURIComponent(`${BASE} ${search}`)}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const reply = await fetch(url, { headers: HEADERS });
    if (reply.status === 429) { await wait(15000 * (attempt + 1)); continue; }
    if (!reply.ok) return null;
    return reply.json();
  }
  return null;
}

await mkdir(IMAGES, { recursive: true });
const cards = existsSync(LIST) ? JSON.parse(await readFile(LIST, 'utf8')) : [];
const have = new Set(cards.map((c) => c.id));

for (const [group, search] of Object.entries(GROUPS)) {
  let got = 0;
  for (let tries = 0; got < PER_GROUP && tries < PER_GROUP * 3; tries++) {
    await wait(350);
    const card = await randomCard(search);
    // Only single-faced cards with a picture, and nothing twice
    if (!card || !card.image_uris || have.has(card.id)) continue;
    const file = `${card.id}.jpg`;
    await wait(120);
    const picture = await fetch(card.image_uris.large, { headers: HEADERS });
    if (!picture.ok) continue;
    await writeFile(join(IMAGES, file), Buffer.from(await picture.arrayBuffer()));
    have.add(card.id);
    got++;
    cards.push({
      id: card.id, file, group, name: card.name, set: card.set, number: card.collector_number,
      frame: card.frame, finishes: card.finishes, borderColor: card.border_color, frameEffects: card.frame_effects ?? [],
      promo: !!card.promo, released: card.released_at,
    });
  }
  console.log(group.padEnd(24), got, 'cards');
}
await writeFile(LIST, JSON.stringify(cards, null, 1));
console.log('total cards in the list:', cards.length);
