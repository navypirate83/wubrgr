/* =====================================================================
   YOUR PRISM SETS (this device's copy)
   PRISM lets one physical card serve several Commander decks: the card's
   inner sleeve gets a small paint mark for each deck that uses it. A mark
   is a COLOR (which deck) and a SLOT (a position along the sleeve's edge,
   1 to 48). A "PRISM set" is the group of decks that share cards. The full
   plan is in docs/prism-plan.md.
   A set remembers:
     - its decks, each with the slot (and so the color) it was given. A
       deck's slot should never change once its marks are painted
     - which corner of the sleeve counts as slot 1
     - what has really been painted: for each card (by lowercase name),
       and each physical copy of it, the decks whose marks are on it
   PRISM sets are kept on this device (they are not in your account yet).
   Plain TypeScript with no React in it.
   ===================================================================== */

import { storageGet, storageSet } from './storage';

// A sleeve's edge holds this many slots (Side A: 1 to 24, Side B: 25 to 48)
export const MAX_SLOTS = 48;
export const SLOTS_PER_SIDE = 24;

// The deck colors, one for each of the first 12 slots (then they repeat; the
// slot number always shows beside a color, so two decks are never confused).
// Chosen to be easy to tell apart, including for color-blind players.
export const PRISM_COLORS = [
  '#e4572e', '#2e86ab', '#f2b134', '#3b9c6e', '#8e5bd1', '#d6437a',
  '#14b8a6', '#8a5a2b', '#5b6ee1', '#9aa83a', '#c0392b', '#6b7280',
];
export const colorForSlot = (slot: number): string => PRISM_COLORS[(slot - 1) % PRISM_COLORS.length];

// Which corner of the sleeve is slot 1 (turned the way the sleeve is held)
export const CORNERS = ['top left', 'top right', 'bottom right', 'bottom left'] as const;

// One deck in a set: which deck, and its slot (1 to 48)
export type PrismDeck = { deckId: string; slot: number };

// A card kept in one deck only (a "pin"): that deck always has its own copies
// of it, which no other deck shares. "key" is the card's lowercase name. With
// no "print" the pin covers every printing of the card in that deck; with a
// "print" (a set and collector number, like "dmu/262") only that printing.
export type PinRule = { deckId: string; key: string; print?: string };

// One PRISM set. "painted" is what is really on the sleeves: for each card
// (by lowercase name), one list per physical copy, each listing the ids of the
// decks whose marks are painted on that copy.
export type PrismSet = {
  id: string;
  name: string;
  corner: 0 | 1 | 2 | 3;
  decks: PrismDeck[];
  pins: PinRule[];
  painted: Record<string, string[][]>;
  // The names as shown, by lowercase name (for a card painted earlier that has since left every deck)
  names: Record<string, string>;
};

const KEY = 'prismSets';
export const SET_NAME_LIMIT = 30;

/* ---------------------------------------------------------------------
   READING AND SAVING
   --------------------------------------------------------------------- */

// Every PRISM set on this device, in order (none if there are none, or if
// what's saved can't be read)
export function loadPrismSets(): PrismSet[] {
  try {
    const saved = JSON.parse(storageGet(KEY) ?? '[]');
    if (!Array.isArray(saved)) return [];
    return saved
      .filter((s) => s && typeof s.id === 'string' && typeof s.name === 'string')
      .map((s): PrismSet => ({
        id: s.id,
        name: s.name,
        corner: [0, 1, 2, 3].includes(s.corner) ? s.corner : 0,
        decks: Array.isArray(s.decks)
          ? s.decks.filter((d: PrismDeck) => d && typeof d.deckId === 'string' && Number.isInteger(d.slot) && d.slot >= 1 && d.slot <= MAX_SLOTS)
          : [],
        pins: Array.isArray(s.pins)
          ? s.pins.filter((p: PinRule) => p && typeof p.deckId === 'string' && typeof p.key === 'string' && (p.print === undefined || typeof p.print === 'string'))
          : [],
        painted: s.painted && typeof s.painted === 'object' ? s.painted : {},
        names: s.names && typeof s.names === 'object' ? s.names : {},
      }));
  } catch {
    return [];
  }
}

// Keep every set, just as given. Returns false if the device wouldn't save.
function saveSets(sets: PrismSet[]): boolean {
  return storageSet(KEY, JSON.stringify(sets));
}

export function findPrismSet(id: string): PrismSet | undefined {
  return loadPrismSets().find((s) => s.id === id);
}

// Change one set: "change" gets the set and returns it changed. Returns false
// if there's no such set, or the device wouldn't save.
export function changePrismSet(id: string, change: (set: PrismSet) => PrismSet): boolean {
  const sets = loadPrismSets();
  const index = sets.findIndex((s) => s.id === id);
  if (index < 0) return false;
  sets[index] = change(sets[index]);
  return saveSets(sets);
}

/* ---------------------------------------------------------------------
   SETS
   --------------------------------------------------------------------- */

// "Set 3": the first number not already used as a set name
export function nextPrismSetName(): string {
  const taken = new Set(loadPrismSets().map((s) => s.name.toLowerCase()));
  let n = 1;
  while (taken.has(`set ${n}`)) n++;
  return `Set ${n}`;
}

// Make a new, empty set at the end, and give back its id
export function addPrismSet(name: string): string {
  const id = `prism-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  saveSets([...loadPrismSets(), { id, name: name.trim().slice(0, SET_NAME_LIMIT) || nextPrismSetName(), corner: 0, decks: [], pins: [], painted: {}, names: {} }]);
  return id;
}

export function renamePrismSet(id: string, name: string) {
  const trimmed = name.trim().slice(0, SET_NAME_LIMIT);
  if (trimmed) changePrismSet(id, (s) => ({ ...s, name: trimmed }));
}

export function forgetPrismSet(id: string) {
  saveSets(loadPrismSets().filter((s) => s.id !== id));
}

/* ---------------------------------------------------------------------
   DECKS IN A SET
   --------------------------------------------------------------------- */

// The lowest slot not used by a deck in the set (null: all 48 are used)
export function freeSlot(set: PrismSet): number | null {
  const used = new Set(set.decks.map((d) => d.slot));
  for (let slot = 1; slot <= MAX_SLOTS; slot++) if (!used.has(slot)) return slot;
  return null;
}

// Does anything painted on a sleeve use this deck's marks?
export function deckHasPaint(set: PrismSet, deckId: string): boolean {
  return Object.values(set.painted).some((copies) => copies.some((decks) => decks.includes(deckId)));
}

// Put a deck in the set, in the lowest free slot
export function addDeckToSet(setId: string, deckId: string): boolean {
  return changePrismSet(setId, (s) => {
    const slot = freeSlot(s);
    if (slot === null || s.decks.some((d) => d.deckId === deckId)) return s;
    return { ...s, decks: [...s.decks, { deckId, slot }] };
  });
}

// Take a deck out of the set. Its marks that are painted stay on the sleeves
// (the Changes page lists them to clear); its slot is free again.
export function removeDeckFromSet(setId: string, deckId: string): boolean {
  return changePrismSet(setId, (s) => ({ ...s, decks: s.decks.filter((d) => d.deckId !== deckId) }));
}

// Give a deck another slot (only when nothing is painted for it, and the slot is free)
export function moveDeckSlot(setId: string, deckId: string, slot: number): boolean {
  return changePrismSet(setId, (s) => {
    if (deckHasPaint(s, deckId) || s.decks.some((d) => d.slot === slot)) return s;
    return { ...s, decks: s.decks.map((d) => (d.deckId === deckId ? { ...d, slot } : d)) };
  });
}

// Turn the sleeve corner (only when nothing is painted yet)
export function setCorner(setId: string, corner: 0 | 1 | 2 | 3): boolean {
  return changePrismSet(setId, (s) => (Object.keys(s.painted).length > 0 ? s : { ...s, corner }));
}

/* ---------------------------------------------------------------------
   PINS (a card a deck keeps to itself)
   --------------------------------------------------------------------- */

// Say how one deck keeps one card (by lowercase name): null means it shares it
// again; { } keeps every printing of it to itself; { print } keeps just that
// printing. (Replaces whatever the deck had for that card.)
export function setPin(setId: string, deckId: string, key: string, rule: { print?: string } | null): boolean {
  return changePrismSet(setId, (s) => {
    const others = s.pins.filter((p) => !(p.deckId === deckId && p.key === key));
    return { ...s, pins: rule ? [...others, rule.print ? { deckId, key, print: rule.print } : { deckId, key }] : others };
  });
}

/* ---------------------------------------------------------------------
   PAINT
   --------------------------------------------------------------------- */

// Say what is now painted on one copy of a card (replacing what was noted)
export function setPainted(setId: string, key: string, name: string, copy: number, deckIds: string[]): boolean {
  return changePrismSet(setId, (s) => {
    const copies = [...(s.painted[key] ?? [])];
    while (copies.length <= copy) copies.push([]);
    copies[copy] = [...deckIds];
    return { ...s, painted: { ...s.painted, [key]: copies }, names: { ...s.names, [key]: name } };
  });
}
