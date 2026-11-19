/* =====================================================================
   WHERE EACH BINDER'S CARDS ARE KEPT ON THIS DEVICE
   The device's working copy of every binder's cards (see
   binderStorage.ts for what it's for). Each binder's cards are saved
   with AsyncStorage (see storage.ts) as one value, named
   "binderCards:" plus the binder's id, written as JSON text.
   A binder with thousands of cards is too long to be read back as one value
   (the phone stops at about 2 MB), so a long text is cut into pieces, each
   saved under its own name ("binderCardsPart:" plus the id and the number of
   the piece), and the main name holds a short note saying how many pieces
   (see chunkedText.ts). Binders saved the old way, as one value, are still
   read as they are.
   Turning JSON text back into cards takes a moment for a big binder, so
   each binder's cards are also kept here, ready to use, the first time
   they're read.
   Plain TypeScript with no React in it.
   ===================================================================== */

import { storageGet, storageKeys, storageRemove, storageSet } from './storage';
import type { BinderCards } from './binderStorage';
import { cutIntoPieces, joinPieces, noteFor, pieceCountOf } from './chunkedText';

// The saved names: "binderCards:" plus the binder's id
export const CARDS_KEY_PREFIX = 'binderCards:';
// The names of a long binder's pieces: "binderCardsPart:" plus the id, a colon and the piece's number.
// (It doesn't start with "binderCards:", so a piece is never mistaken for a binder of its own.)
export const CARDS_PART_PREFIX = 'binderCardsPart:';
const partKey = (id: string, index: number) => `${CARDS_PART_PREFIX}${id}:${index}`;

// Binders' cards already turned back from JSON, by binder id
const cardsInMemory = new Map<string, BinderCards>();

// A binder's saved text, joined from its pieces if it was cut up.
// Null if there is none, or if a piece is missing.
function savedTextFor(id: string): string | null {
  const saved = storageGet(CARDS_KEY_PREFIX + id);
  if (saved === null) return null;
  const count = pieceCountOf(saved);
  if (count === null) return saved;
  return joinPieces(Array.from({ length: count }, (_, index) => storageGet(partKey(id, index))));
}

// How many pieces a binder's saved value names now (0 if it is saved whole, or not at all)
function savedPieceCount(id: string): number {
  const saved = storageGet(CARDS_KEY_PREFIX + id);
  return saved === null ? 0 : (pieceCountOf(saved) ?? 0);
}

// One binder's cards, read from memory (or from storage the first time).
// null if this device has no copy of it.
function cardsFor(id: string): BinderCards | null {
  const ready = cardsInMemory.get(id);
  if (ready) return ready;
  const text = savedTextFor(id);
  if (text === null) return null;
  try {
    const cards = JSON.parse(text) as BinderCards;
    cardsInMemory.set(id, cards);
    return cards;
  } catch {
    return null;
  }
}

// One binder's cards, or null if this device has no copy of it. It's a
// copy ("structuredClone"), so changing it can't change the saved cards
// by accident; only writeCards does that.
export function readCards(id: string): BinderCards | null {
  const cards = cardsFor(id);
  return cards ? structuredClone(cards) : null;
}

// How many cards a binder has (without copying them)
export function countCards(id: string): number {
  return Object.keys(cardsFor(id) ?? {}).length;
}

// Does this device have a copy of this binder's cards (even an empty one)?
export function hasCards(id: string): boolean {
  return storageGet(CARDS_KEY_PREFIX + id) !== null;
}

// Save one binder's cards. Returns false if saving isn't working, so the
// page can say so. A long binder is saved in pieces (see the top of this file).
export function writeCards(id: string, cards: BinderCards): boolean {
  const copy = structuredClone(cards);
  cardsInMemory.set(id, copy);
  const pieces = cutIntoPieces(JSON.stringify(copy));
  const oldPieceCount = savedPieceCount(id);
  // A short binder is saved whole, as before (and any pieces left from when it was longer are let go)
  if (pieces.length === 1) {
    const saved = storageSet(CARDS_KEY_PREFIX + id, pieces[0]);
    for (let index = 0; index < oldPieceCount; index++) storageRemove(partKey(id, index));
    return saved;
  }
  // A long one: the pieces first and the note last, so an interruption can never leave a note without its pieces
  let saved = true;
  pieces.forEach((piece, index) => { saved = storageSet(partKey(id, index), piece) && saved; });
  saved = storageSet(CARDS_KEY_PREFIX + id, noteFor(pieces.length)) && saved;
  for (let index = pieces.length; index < oldPieceCount; index++) storageRemove(partKey(id, index));
  return saved;
}

// Forget one binder's cards (after it's deleted, or uploaded to Drive).
export function deleteCards(id: string): void {
  cardsInMemory.delete(id);
  for (let index = 0; index < savedPieceCount(id); index++) storageRemove(partKey(id, index));
  storageRemove(CARDS_KEY_PREFIX + id);
}

// Forget every binder's cards ("Reset phone memory"). It removes every
// saved set of cards, not only those of the binders in the list, so cards
// left behind by an older version don't linger either.
export function clearCards(ids: string[]): void {
  for (const id of ids) deleteCards(id);
  for (const key of storageKeys(CARDS_KEY_PREFIX)) storageRemove(key);
  for (const key of storageKeys(CARDS_PART_PREFIX)) storageRemove(key);
  cardsInMemory.clear();
}
