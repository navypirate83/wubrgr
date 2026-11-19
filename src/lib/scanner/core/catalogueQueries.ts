/* =====================================================================
   THE CATALOGUE'S QUESTIONS (shared, plain TypeScript)
   The SQL for asking the catalogue things, and the turning of a row into a
   Printing. Both platforms run the same questions through their own store
   (see catalogueTypes.ts), so the answers can't differ.
   No imports except the shapes in catalogueTypes.ts.
   ===================================================================== */

import type { CatalogueInfo, Printing } from './catalogueTypes';

// A printing with its set's name (printings only hold the set's code)
export const PRINTING_SELECT = `
  SELECT p.id, p.name, p.set_code, s.name AS set_name, p.collector_number, p.lang, p.released, p.year,
         p.border, p.frame, p.finishes, p.img, p.img_back, p.illus, p.illus_back,
         p.colors, p.type_line, p.mana_cost, p.cmc, p.rarity, p.layout
  FROM printings p LEFT JOIN sets s ON s.code = p.set_code`;

// The questions
export const SQL = {
  meta: 'SELECT key, value FROM meta',
  // By set and collector number (leading zeros are stripped before asking; see the scanner's parser)
  bySetAndNumber: `${PRINTING_SELECT} WHERE p.set_code = ? AND p.collector_number = ? ORDER BY p.lang = 'en' DESC, p.released`,
  // By the card's front name (normalised: see text.ts), the start of it
  byFrontNameStart: `${PRINTING_SELECT} WHERE p.front_norm LIKE ? ORDER BY p.front_norm, p.released LIMIT ?`,
  byFrontName: `${PRINTING_SELECT} WHERE p.front_norm = ? ORDER BY p.released`,
  setCodes: 'SELECT code FROM sets ORDER BY code',
  // Every set with its name, release date and symbol picture address, newest first (for choosing a set to lock to)
  allSets: 'SELECT code, name, released, icon_url FROM sets ORDER BY released DESC, name',
  frontNames: 'SELECT DISTINCT front_norm FROM printings',
  // Flavor names (another name printed on a card, like Croft Manor on a Command Tower). A catalogue
  // built before this existed has no such table, so asking can fail: the callers cope with that.
  flavorNames: 'SELECT DISTINCT flavor_norm FROM flavor',
  byFlavorName: `${PRINTING_SELECT} WHERE p.id IN (SELECT id FROM flavor WHERE flavor_norm = ?) ORDER BY p.released`,
  setSymbol: 'SELECT symbol FROM sets WHERE code = ?',
  artHash: 'SELECT hash FROM art WHERE illus = ?',
  // The special looks (full art, showcase...) of these printings: add "(?, ?, ...)" with one ? for each id.
  // Only printings that look unusual have a row. A catalogue built before this existed has no such table.
  looksStart: 'SELECT id, full_art, textless, frame_effects, promo_types FROM looks WHERE id IN ',
};

const IMAGE_PREFIX = 'https://cards.scryfall.io/normal/';
// A stored picture address is kept without the part every one starts with
const pictureUrl = (stored: unknown): string | null => {
  if (typeof stored !== 'string' || stored === '') return null;
  return stored.startsWith('http') ? stored : IMAGE_PREFIX + stored;
};

const text = (value: unknown): string => (typeof value === 'string' ? value : value == null ? '' : String(value));
const optional = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

export function rowToPrinting(row: Record<string, unknown>): Printing {
  return {
    id: text(row.id),
    name: text(row.name),
    setCode: text(row.set_code),
    setName: text(row.set_name),
    collectorNumber: text(row.collector_number),
    lang: text(row.lang),
    released: text(row.released),
    year: Number(row.year) || 0,
    border: text(row.border),
    frame: text(row.frame),
    finishes: text(row.finishes).split(',').filter(Boolean),
    image: pictureUrl(row.img),
    imageBack: pictureUrl(row.img_back),
    illus: optional(row.illus),
    illusBack: optional(row.illus_back),
    colors: text(row.colors),
    typeLine: text(row.type_line),
    manaCost: text(row.mana_cost),
    cmc: Number(row.cmc) || 0,
    rarity: text(row.rarity),
    layout: text(row.layout),
  };
}

// The "meta" rows as one object
export function rowsToInfo(rows: Record<string, unknown>[]): CatalogueInfo {
  const meta = new Map(rows.map((r) => [text(r.key), text(r.value)]));
  return {
    schemaVersion: Number(meta.get('schema_version')) || 0,
    builtAt: meta.get('built_at') ?? '',
    sourceUpdatedAt: meta.get('source_updated_at') ?? '',
    printings: Number(meta.get('printings')) || 0,
    sets: Number(meta.get('sets')) || 0,
    artworks: Number(meta.get('artworks')) || 0,
  };
}
