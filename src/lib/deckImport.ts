/* =====================================================================
   READING A DECKLIST (to import it into a deck)
   Turns what a person gives us into a plain list of cards, without looking
   anything up (see deckImportRun.ts for that). It reads:
     - TEXT, the way Moxfield, Archidekt, Arena and MTGO write a list:
         1 Sol Ring
         1x Sol Ring (CMM) 400 *F*
       with headings like Commander, Deck and Sideboard (or "SB: 1 Card")
     - a .CSV file: ours (see deckCsv.ts), or one from Moxfield, Archidekt
       or Deckbox (columns are found by their names)
     - JSON: a deck from Archidekt or Moxfield, or a plain list of cards
   A line says how many, which card, and sometimes which printing (the set
   and collector number), whether it's foil, and where it goes: the main
   deck, the sideboard or the command zone.
   Plain TypeScript with no React in it.
   ===================================================================== */

import { parseCsv } from './binderCsv';
import { DECK_FORMATS } from './deckFormats';

// Where a card goes
export type ImportZone = 'main' | 'side' | 'command';

// One card in a decklist
export type ImportLine = {
  name: string;
  count: number;
  zone: ImportZone;
  set?: string;        // the printing, when the list says (lowercase set code)
  number?: string;     // and its collector number
  id?: string;         // or its Scryfall ID, which is exact
  foil?: boolean;
};

// A whole decklist: its cards, and its name and format if the file says
export type ImportedDeck = { name?: string; format?: string; lines: ImportLine[] };

/* ---------------------------------------------------------------------
   FORMATS: the words other sites use, as our format codes
   --------------------------------------------------------------------- */

const FORMAT_WORDS: Record<string, string> = {
  commander: 'commander', edh: 'commander', commanderedh: 'commander',
  duelcommander: 'duel', '1v1commander': 'duel', duel: 'duel', dualcommander: 'duel',
  paupercommander: 'paupercommander', pdh: 'paupercommander',
  predh: 'predh', oathbreaker: 'oathbreaker', tinyleaders: 'tlr', tinyleadersreborn: 'tlr', tlr: 'tlr',
  standard: 'standard', pioneer: 'pioneer', modern: 'modern', legacy: 'legacy', vintage: 'vintage',
  pauper: 'pauper', pennydreadful: 'penny', penny: 'penny', premodern: 'premodern',
  oldschool: 'oldschool', oldschool9394: 'oldschool', futurestandard: 'future', future: 'future',
};

// A format as a site writes it ("Duel Commander", "commander") as our code, or undefined
export function formatFromWords(words: unknown): string | undefined {
  if (typeof words !== 'string') return undefined;
  const code = FORMAT_WORDS[words.toLowerCase().replace(/[^a-z0-9]/g, '')];
  return code && DECK_FORMATS.some((f) => f.code === code) ? code : undefined;
}

// Archidekt's format numbers
const ARCHIDEKT_FORMATS: Record<number, string> = {
  1: 'standard', 2: 'modern', 3: 'commander', 4: 'legacy', 5: 'vintage', 6: 'pauper',
  9: 'future', 10: 'penny', 11: 'duel',
};

/* ---------------------------------------------------------------------
   TEXT
   --------------------------------------------------------------------- */

// The headings a list may have, and where the cards under each go
// ('skip' headings (a maybe-board, tokens) are left out)
const HEADINGS: [RegExp, ImportZone | 'skip'][] = [
  [/^(commanders?|command ?zone)$/i, 'command'],
  [/^(side ?board|sb)$/i, 'side'],
  [/^(companions?)$/i, 'side'],
  [/^(main ?deck|main ?board|main|deck)$/i, 'main'],
  [/^(maybe ?board|maybe|considering|tokens?|wish ?list|acquire)$/i, 'skip'],
];

// Read a decklist written as text, one card per line
export function parseDeckText(text: string): ImportedDeck {
  const lines: ImportLine[] = [];
  let zone: ImportZone | 'skip' = 'main';
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line) continue;
    // A heading? ("Sideboard", "// Commander", "Commander (1)", "Deck:")
    const label = line.replace(/^(\/\/|#+)\s*/, '').replace(/\s*\(\d+\)\s*$/, '').replace(/:\s*$/, '').trim();
    const heading = HEADINGS.find(([pattern]) => pattern.test(label));
    if (heading) { zone = heading[1]; continue; }
    if (/^(\/\/|#)/.test(line)) continue;   // any other comment
    let here = zone;
    // "SB: 1 Card" puts one card in the sideboard
    if (/^SB:\s*/i.test(line)) { line = line.replace(/^SB:\s*/i, ''); here = 'side'; }
    if (here === 'skip') continue;
    // Tags at the end: "[Ramp]", "^Foil^"; foil marks: "*F*", "*E*"
    let foil = false;
    for (;;) {
      const tag = /\s*(\[[^\]]*\]|\^[^^]*\^|\*[FE]\*)\s*$/i.exec(line);
      if (!tag) break;
      if (/foil|\*[FE]\*/i.test(tag[1])) foil = true;
      line = line.slice(0, tag.index);
    }
    // How many: "4 ", "4x " (none means one)
    const counted = /^(\d+)\s*[xX]?\s+(.+)$/.exec(line);
    const count = counted ? Math.max(1, Number(counted[1])) : 1;
    let name = (counted ? counted[2] : line).trim();
    // The printing: "Sol Ring (CMM) 400"
    let set: string | undefined;
    let number: string | undefined;
    const printing = /^(.*?)\s+\(([A-Za-z0-9]{2,6})\)(?:\s+(\S+))?$/.exec(name);
    if (printing) {
      name = printing[1].trim();
      set = printing[2].toLowerCase();
      number = printing[3];
    }
    if (!name) continue;
    lines.push({ name, count, zone: here, ...(set ? { set } : {}), ...(number ? { number } : {}), ...(foil ? { foil: true } : {}) });
  }
  return { lines };
}

/* ---------------------------------------------------------------------
   .CSV
   --------------------------------------------------------------------- */

// A column name made easy to compare: lowercase, no spaces or other marks
const plain = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

// Read a .csv file. The columns are found by their names (the first one
// found of each kind), so a file from our app, Moxfield, Archidekt or Deckbox all read.
export function parseDeckCsv(text: string): ImportedDeck {
  const [header = [], ...rows] = parseCsv(text);
  const columnOf = new Map<string, number>();
  header.forEach((name, index) => { if (!columnOf.has(plain(name))) columnOf.set(plain(name), index); });
  // The value in the first of these columns that has one
  const pick = (row: string[], ...names: string[]) => {
    for (const name of names) {
      const at = columnOf.get(name);
      const value = at === undefined ? '' : (row[at] ?? '').trim();
      if (value) return value;
    }
    return '';
  };
  const lines: ImportLine[] = [];
  let deckName: string | undefined;
  let format: string | undefined;
  for (const row of rows) {
    const name = pick(row, 'name', 'cardname', 'card');
    if (!name) continue;
    deckName ??= pick(row, 'deck', 'deckname') || undefined;
    format ??= formatFromWords(pick(row, 'format'));
    // A set code (Deckbox writes the set's whole name in "Edition": not a code)
    const setText = pick(row, 'setcode', 'editioncode', 'set', 'edition').toLowerCase();
    const set = /^[a-z0-9]{2,6}$/.test(setText) ? setText : undefined;
    const number = pick(row, 'collectornumber', 'cardnumber', 'number', 'cn');
    const id = pick(row, 'scryfallid').toLowerCase();
    const zoneText = pick(row, 'zone', 'board', 'section').toLowerCase();
    const zone: ImportZone = /side/.test(zoneText) ? 'side' : /command|commander/.test(zoneText) ? 'command' : 'main';
    const foil = /^(foil|etched|yes|true|1)$/i.test(pick(row, 'foil', 'finish'));
    const count = Math.round(Number(pick(row, 'quantity', 'count', 'qty', 'amount'))) || 1;
    lines.push({
      name, count: Math.max(1, count), zone,
      ...(set ? { set } : {}),
      ...(set && number ? { number } : {}),
      ...(/^[0-9a-f-]{36}$/.test(id) ? { id } : {}),
      ...(foil ? { foil: true } : {}),
    });
  }
  return { ...(deckName ? { name: deckName } : {}), ...(format ? { format } : {}), lines };
}

/* ---------------------------------------------------------------------
   JSON
   --------------------------------------------------------------------- */

type Obj = Record<string, unknown>;
const isObj = (value: unknown): value is Obj => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

// Moxfield's boards: { "key": { quantity, isFoil, card: { name, set, cn, scryfall_id } } }
function moxfieldBoard(board: unknown, zone: ImportZone, into: ImportLine[]) {
  const cards = isObj(board) && isObj(board.cards) ? board.cards : isObj(board) ? board : {};
  for (const entry of Object.values(cards)) {
    if (!isObj(entry) || !isObj(entry.card)) continue;
    const name = text(entry.card.name);
    if (!name) continue;
    const set = text(entry.card.set)?.toLowerCase();
    const number = text(entry.card.cn) ?? text(entry.card.collector_number);
    const id = text(entry.card.scryfall_id)?.toLowerCase();
    into.push({
      name, zone, count: Math.max(1, Math.round(Number(entry.quantity)) || 1),
      ...(set && number ? { set, number } : {}),
      ...(id && /^[0-9a-f-]{36}$/.test(id) ? { id } : {}),
      ...(entry.isFoil === true || entry.finish === 'foil' ? { foil: true } : {}),
    });
  }
}

// Read an already-opened JSON deck: Archidekt's, Moxfield's, or a plain list of cards
export function parseDeckData(data: unknown): ImportedDeck | null {
  const lines: ImportLine[] = [];
  let name: string | undefined;
  let format: string | undefined;
  if (isObj(data) && (isObj(data.boards) || isObj(data.mainboard) || isObj(data.commanders))) {
    // Moxfield (the newer layout has "boards", the older one the boards on the deck itself)
    const boards = isObj(data.boards) ? data.boards : data;
    moxfieldBoard(boards.commanders, 'command', lines);
    moxfieldBoard(boards.mainboard, 'main', lines);
    moxfieldBoard(boards.sideboard, 'side', lines);
    moxfieldBoard(boards.companions, 'side', lines);
    name = text(data.name);
    format = formatFromWords(data.format);
  } else if (isObj(data) && Array.isArray(data.cards) && data.cards.some((c) => isObj(c) && isObj(c.card) && isObj(c.card.oracleCard))) {
    // Archidekt: cards with their categories (Commander, Sideboard, Maybeboard...)
    const left = new Set<string>();   // categories that aren't part of the deck
    if (Array.isArray(data.categories)) {
      for (const category of data.categories) {
        if (isObj(category) && category.includedInDeck === false && text(category.name)) left.add(String(category.name).toLowerCase());
      }
    }
    for (const entry of data.cards) {
      if (!isObj(entry) || !isObj(entry.card) || !isObj(entry.card.oracleCard)) continue;
      const cardName = text(entry.card.oracleCard.name);
      if (!cardName) continue;
      const categories = Array.isArray(entry.categories) ? entry.categories.map((c) => String(c).toLowerCase()) : [];
      if (categories.some((c) => left.has(c) || /^(maybeboard|maybe)$/.test(c))) continue;
      const zone: ImportZone = categories.includes('commander') ? 'command' : categories.includes('sideboard') ? 'side' : 'main';
      const edition = isObj(entry.card.edition) ? text(entry.card.edition.editioncode)?.toLowerCase() : undefined;
      const number = text(entry.card.collectorNumber);
      const id = text(entry.card.uid)?.toLowerCase();
      lines.push({
        name: cardName, zone, count: Math.max(1, Math.round(Number(entry.quantity)) || 1),
        ...(edition && number ? { set: edition, number } : {}),
        ...(id && /^[0-9a-f-]{36}$/.test(id) ? { id } : {}),
        ...(/foil/i.test(String(entry.modifier ?? '')) ? { foil: true } : {}),
      });
    }
    name = text(data.name);
    format = typeof data.deckFormat === 'number' ? ARCHIDEKT_FORMATS[data.deckFormat] : formatFromWords(data.deckFormat);
  } else {
    // A plain list: [ { name, quantity, set, number... } ] or { cards: [...] }
    const list = Array.isArray(data) ? data : isObj(data) && Array.isArray(data.cards) ? data.cards : isObj(data) && Array.isArray(data.deck) ? data.deck : null;
    if (!list) return null;
    for (const item of list) {
      if (!isObj(item)) continue;
      const inner = isObj(item.card) ? item.card : item;
      const cardName = text(item.name) ?? text(inner.name) ?? text(item.cardName);
      if (!cardName) continue;
      const set = (text(item.set) ?? text(item.setCode) ?? text(item.edition) ?? text(inner.set))?.toLowerCase();
      const number = text(item.number) ?? text(item.collectorNumber) ?? text(item.collector_number) ?? text(item.cn) ?? text(inner.collector_number);
      const zoneText = String(item.zone ?? item.board ?? '').toLowerCase();
      lines.push({
        name: cardName,
        count: Math.max(1, Math.round(Number(item.quantity ?? item.count ?? item.qty)) || 1),
        zone: /side/.test(zoneText) ? 'side' : /command/.test(zoneText) ? 'command' : 'main',
        ...(set && number && /^[a-z0-9]{2,6}$/.test(set) ? { set, number } : {}),
        ...(item.foil === true ? { foil: true } : {}),
      });
    }
    if (isObj(data)) { name = text(data.name); format = formatFromWords(data.format); }
  }
  return lines.length > 0 ? { ...(name ? { name } : {}), ...(format ? { format } : {}), lines } : null;
}

// Read JSON text (null if it isn't JSON or has no cards)
export function parseDeckJson(source: string): ImportedDeck | null {
  try { return parseDeckData(JSON.parse(source)); } catch { return null; }
}

/* ---------------------------------------------------------------------
   ANYTHING: work out which kind it is
   --------------------------------------------------------------------- */

// Read whatever was given: JSON (starts with { or [), a .csv (a first line
// of column names with a Name column), otherwise text. Gives a deck with no
// cards if nothing could be read.
export function parseDeckSource(source: string): ImportedDeck {
  const trimmed = source.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const json = parseDeckJson(trimmed);
    if (json) return json;
  }
  const first = trimmed.split(/\r?\n/, 1)[0] ?? '';
  const columns = first.split(',').map(plain);
  if (columns.length > 2 && columns.some((c) => ['name', 'cardname', 'card'].includes(c))) return parseDeckCsv(trimmed);
  return parseDeckText(trimmed);
}

// Is this a link to a deck on a site we can read? (Archidekt or Moxfield)
export function looksLikeDeckLink(source: string): boolean {
  return /^https?:\/\/\S+$/i.test(source.trim());
}

/* ---------------------------------------------------------------------
   A DECK AS TEXT (for the .txt download and "Copy")
   --------------------------------------------------------------------- */

// A deck's cards as text the other sites can read back: a heading (Commander,
// Deck, Sideboard), then "1 Sol Ring (CMM) 400" (with " *F*" for a foil)
export function deckToText(deck: { cards: { name: string; set: string; number: string; count?: number; foil?: boolean; zone?: 'side' | 'command' }[] }): string {
  const part = (heading: string, zone: 'command' | 'side' | undefined) => {
    const cards = deck.cards.filter((card) => card.zone === zone);
    if (cards.length === 0) return '';
    const rows = cards.map((card) => `${card.count ?? 1} ${card.name} (${card.set.toUpperCase()}) ${card.number}${card.foil ? ' *F*' : ''}`);
    return `${heading}\n${rows.join('\n')}\n`;
  };
  return [part('Commander', 'command'), part('Deck', undefined), part('Sideboard', 'side')].filter(Boolean).join('\n');
}
