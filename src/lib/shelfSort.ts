/* =====================================================================
   SORTING THE SHELF: BINDERS, LISTS, DECKS AND PRISMS
   These are the sorts for the pages that list whole binders, card lists,
   decks and PRISM sets (not the card sorts inside a binder: those are in
   binderSort.ts). Each of the four pages has its own list of ways to sort
   and remembers its own choice.
   - "mine" is "My own order": the order you set yourself (the order the
     items are saved in). Every page starts there, so nothing moves until
     you pick something else.
   - Most sorts can be reversed. Choosing the sort already in use flips it.
   - Some sorts have natural groups (letters, formats, legal or not), which
     can get header bars between them (the same "header bars" switch in
     Settings that the card sorts use).
   A saved choice is one short piece of text: the sort's name, with ":r"
   after it when it's the other way round (like "name:r").
   Plain TypeScript with no React in it.
   ===================================================================== */

// The four pages
export type ShelfArea = 'binders' | 'lists' | 'decks' | 'prisms';
export const SHELF_AREAS: ShelfArea[] = ['binders', 'lists', 'decks', 'prisms'];

// What a sort needs to know about one item on a page. Each page fills in
// only the facts its own sorts use.
export type ShelfItem = {
  id: string;
  name: string;
  cards?: number;       // how many cards it holds (binders, lists, decks)
  format?: string;      // a deck's format, as a name
  legal?: boolean;      // a deck that is legal (false: it has a problem)
  missing?: number;     // cards a deck uses that you don't own
  bracket?: number;     // a Commander deck's power bracket, 1 to 5 (none: not rated)
  decks?: number;       // decks in a PRISM set
  work?: number;        // marks still to paint or scrape in a PRISM set
  used?: number;        // when it was last opened (milliseconds; 0 if never)
  made?: number;        // when it was first seen (milliseconds)
  change?: number;      // a binder's cards' price change since they were added, in percent (none: nothing to go by)
};

// One way to sort, as the menu shows it: the value saved, its name in the
// menu and its short word on the button, and (when it can be reversed) the
// name and short word the other way round
export type ShelfSortChoice = {
  value: string;
  name: string;
  short: string;
  reversedName?: string;
  reversedShort?: string;
};

const MINE: ShelfSortChoice = { value: 'mine', name: 'My own order', short: 'Mine' };
const NAME: ShelfSortChoice = { value: 'name', name: 'Name A to Z', short: 'Name', reversedName: 'Name Z to A', reversedShort: 'Name Z-A' };
const USED: ShelfSortChoice = { value: 'used', name: 'Recently opened', short: 'Recent', reversedName: 'Opened longest ago', reversedShort: 'Oldest use' };
const MADE: ShelfSortChoice = { value: 'made', name: 'Newest first', short: 'Newest', reversedName: 'Oldest first', reversedShort: 'Oldest' };
const CHANGE: ShelfSortChoice = { value: 'change', name: 'Biggest price gain first', short: 'Gainers', reversedName: 'Biggest price loss first', reversedShort: 'Losers' };
const CARDS: ShelfSortChoice = { value: 'cards', name: 'Most cards', short: 'Cards', reversedName: 'Fewest cards', reversedShort: 'Fewest' };

// The ways to sort on each page, in the order the menu lists them
export const SHELF_SORTS: Record<ShelfArea, ShelfSortChoice[]> = {
  binders: [MINE, NAME, USED, MADE, CARDS, CHANGE],
  lists: [MINE, NAME, USED, MADE, CARDS],
  decks: [
    MINE, NAME, USED, MADE, CARDS,
    { value: 'format', name: 'By format', short: 'Format', reversedName: 'By format, Z to A', reversedShort: 'Format Z-A' },
    { value: 'legal', name: 'Not legal first', short: 'Legal', reversedName: 'Legal first', reversedShort: 'Legal first' },
    { value: 'bracket', name: 'Highest bracket first', short: 'Bracket', reversedName: 'Lowest bracket first', reversedShort: 'Low bracket' },
    { value: 'missing', name: 'Most cards missing', short: 'Missing', reversedName: 'Fewest cards missing', reversedShort: 'Fewest missing' },
  ],
  prisms: [
    MINE,
    { value: 'work', name: 'Most work waiting', short: 'Work', reversedName: 'Least work waiting', reversedShort: 'Least work' },
    NAME, USED,
    { value: 'decks', name: 'Most decks', short: 'Decks', reversedName: 'Fewest decks', reversedShort: 'Fewest' },
  ],
};

// Every page starts as "My own order"
export const DEFAULT_SHELF_SORT = 'mine';

// A saved choice, as { sort, reversed }. Anything unreadable, or a sort the
// page doesn't have, is "My own order".
export function parseShelfSort(area: ShelfArea, saved: unknown): { sort: string; reversed: boolean } {
  const text = typeof saved === 'string' ? saved : '';
  const reversed = text.endsWith(':r');
  const sort = reversed ? text.slice(0, -2) : text;
  const choice = SHELF_SORTS[area].find((c) => c.value === sort);
  // "My own order" can't be reversed
  if (!choice || (reversed && choice.reversedName === undefined)) return { sort: DEFAULT_SHELF_SORT, reversed: false };
  return { sort, reversed };
}

// The text to save for a choice
export function shelfSortText(sort: string, reversed: boolean): string {
  return reversed ? `${sort}:r` : sort;
}

// Every text a page may save (for the server to check against)
export function allowedShelfTexts(area: ShelfArea): string[] {
  return SHELF_SORTS[area].flatMap((c) => (c.reversedName === undefined ? [c.value] : [c.value, `${c.value}:r`]));
}

// The text to save when this sort is picked: the one already in use flips
// the other way round (if it can), a different one starts in its usual direction
export function pickedShelfSort(area: ShelfArea, saved: unknown, picked: string): string {
  const now = parseShelfSort(area, saved);
  const choice = SHELF_SORTS[area].find((c) => c.value === picked);
  if (!choice) return DEFAULT_SHELF_SORT;
  const flip = picked === now.sort && choice.reversedName !== undefined;
  return shelfSortText(picked, flip ? !now.reversed : false);
}

// Letters, ignoring a symbol code's braces ("{R} Burn" sorts as "R Burn")
const plain = (name: string): string => name.replace(/\{(\w)\}/g, '$1');
const byName = (a: ShelfItem, b: ShelfItem): number => plain(a.name).localeCompare(plain(b.name), undefined, { sensitivity: 'base', numeric: true });

// How two items compare for a sort, in the sort's usual direction (name
// breaks a tie, so equal items always come out the same way)
function compare(area: ShelfArea, sort: string, a: ShelfItem, b: ShelfItem): number {
  const num = (x: number | undefined) => x ?? 0;
  switch (sort) {
    case 'name': return byName(a, b);
    case 'used': return num(b.used) - num(a.used);
    case 'made': return num(b.made) - num(a.made);
    case 'cards': return num(b.cards) - num(a.cards);
    case 'decks': return num(b.decks) - num(a.decks);
    case 'work': return num(b.work) - num(a.work);
    case 'missing': return num(b.missing) - num(a.missing);
    case 'bracket': return num(b.bracket) - num(a.bracket);
    case 'change': return num(b.change) - num(a.change);
    case 'format': return (a.format ?? '').localeCompare(b.format ?? '');
    case 'legal': return Number(a.legal !== false) - Number(b.legal !== false);   // not legal first
    default: return 0;
  }
}

// The items in the saved order, sorted
export function sortShelf<T extends ShelfItem>(area: ShelfArea, items: T[], saved: unknown): T[] {
  const { sort, reversed } = parseShelfSort(area, saved);
  if (sort === DEFAULT_SHELF_SORT) return items;
  // Decks with no bracket always go last, whichever way round it is
  if (sort === 'bracket') {
    const rated = items.filter((i) => i.bracket).sort((a, b) => compare(area, sort, a, b) || byName(a, b));
    const unrated = items.filter((i) => !i.bracket).sort(byName);
    return [...(reversed ? rated.reverse() : rated), ...unrated];
  }
  // Binders with no price change to go by (no added prices) always go last, whichever way round it is
  if (sort === 'change') {
    const rated = items.filter((i) => i.change !== undefined).sort((a, b) => compare(area, sort, a, b) || byName(a, b));
    const unrated = items.filter((i) => i.change === undefined).sort(byName);
    return [...(reversed ? rated.reverse() : rated), ...unrated];
  }
  const sorted = [...items].sort((a, b) => compare(area, sort, a, b) || byName(a, b));
  return reversed ? sorted.reverse() : sorted;
}

// The name of the group an item falls under for this sort (null: the sort
// has no groups, so no header bars)
export function shelfGroup(area: ShelfArea, saved: unknown, item: ShelfItem): string | null {
  const { sort } = parseShelfSort(area, saved);
  switch (sort) {
    case 'name': {
      const first = plain(item.name).trim().charAt(0).toUpperCase();
      return /[A-Z]/.test(first) ? first : '#';
    }
    case 'format': return item.format ?? 'No format';
    case 'legal': return item.legal === false ? 'Not legal' : 'Legal';
    case 'bracket': return item.bracket ? `Bracket ${item.bracket}` : 'Not rated';
    case 'work': return (item.work ?? 0) > 0 ? 'Marks waiting' : 'All marked';
    default: return null;
  }
}

// The items with one moved up or down a spot (by -1 or 1), for "My own order".
// An item already at the end stays put.
export function movedBy<T extends { id: string }>(items: T[], id: string, by: -1 | 1): T[] {
  const from = items.findIndex((i) => i.id === id);
  const to = from + by;
  if (from < 0 || to < 0 || to >= items.length) return items;
  const moved = [...items];
  const [one] = moved.splice(from, 1);
  moved.splice(to, 0, one);
  return moved;
}

// What is drawn down a page: an item, or a header bar before a new group
export type ShelfRow<T> = { kind: 'item'; item: T } | { kind: 'header'; id: string; text: string };

// The sorted items with a header bar before each new group (when headers are on)
export function withShelfHeaders<T extends ShelfItem>(area: ShelfArea, sorted: T[], saved: unknown, headersOn: boolean): ShelfRow<T>[] {
  const rows: ShelfRow<T>[] = [];
  let last: string | null = null;
  for (const item of sorted) {
    const group = headersOn ? shelfGroup(area, saved, item) : null;
    if (group !== null && group !== last) rows.push({ kind: 'header', id: `header-${group}`, text: group });
    last = group;
    rows.push({ kind: 'item', item });
  }
  return rows;
}
