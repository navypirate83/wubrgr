/* =====================================================================
   IMPORTING CARDS INTO BINDERS AND LISTS
   The same decklist reader as for decks (see deckImport.ts and
   deckImportRun.ts) fills binders and lists: pasted text, a .csv or a .json
   file. (A link to an Archidekt or Moxfield deck works too.) A binder
   or list has no sideboard or command zone, so every card is just a card.
     - cardsForCollection: each line looked up on Scryfall, as plain cards
     - addCardsToList / importIntoList: into a list (a printing already
       there gets more copies; the rest go on the end)
     - placeInBinder: into a binder (a printing already there gets more
       copies; the rest go into the first empty pockets, adding pages when
       every pocket is full)
   A card Scryfall doesn't know is skipped and reported back by name.
   Plain TypeScript with no React in it.
   ===================================================================== */

import { MAX_COPIES, firstEmptyPocket, pocketKey, samePrinting, type BinderCard, type BinderCards } from './binderStorage';
import { changeListCards, findList, type ListCard } from './listStorage';
import { cardsFor, type ImportSummary } from './deckImportRun';
import type { ImportedDeck } from './deckImport';
import { fillAddedPrices } from './addedPrice';

// The cards in a decklist, as plain cards with their counts (no zones), and
// the names not found. Each card gets today's price written on it, as the
// price it was added at (see addedPrice.ts).
export async function cardsForCollection(imported: ImportedDeck): Promise<{ cards: ListCard[]; notFound: string[] }> {
  const flat: ImportedDeck = { ...imported, lines: imported.lines.map((line) => ({ ...line, zone: 'main' as const })) };
  // (The format only matters for the command zone, which isn't used here)
  const { cards, notFound } = await cardsFor(flat, 'commander');
  return { cards: await fillAddedPrices(cards.map(({ zone: _zone, slot: _slot, ...card }) => card as ListCard)), notFound };
}

// One card with this many copies (one copy is saved as no count at all)
function counted<T extends BinderCard>(card: T, copies: number): T {
  if (copies > 1) return { ...card, count: copies };
  const { count: _count, ...rest } = card;
  return rest as T;
}

// A list with these cards added: a printing already in it gets more copies
// (up to the most allowed), the rest go on the end, in order
export function addCardsToList(id: string, cards: ListCard[]): boolean {
  if (!findList(id)) return false;
  return changeListCards(id, (existing) => {
    const next = [...existing];
    for (const card of cards) {
      const at = next.findIndex((c) => samePrinting(c, card));
      if (at < 0) next.push(card);
      else next[at] = counted(next[at], Math.min(MAX_COPIES, (next[at].count ?? 1) + (card.count ?? 1)));
    }
    return next;
  });
}

// Look the list up and add it to a list
export async function importIntoList(listId: string, imported: ImportedDeck): Promise<ImportSummary> {
  const { cards, notFound } = await cardsForCollection(imported);
  addCardsToList(listId, cards);
  return { copies: cards.reduce((sum, card) => sum + (card.count ?? 1), 0), notFound };
}

// A binder's cards with these added. "pages" is how many pages it has now;
// the answer says how many it has after (more, if every pocket was full). A
// printing already in the binder gets more copies; the rest go into the first
// empty pockets, page by page. The cards given aren't changed.
export function placeInBinder(existing: BinderCards, pages: number, cards: BinderCard[]): { cards: BinderCards; pages: number } {
  const next: BinderCards = { ...existing };
  let pageCount = pages;
  for (const card of cards) {
    // (A binder's cards don't keep a deck's cost and type)
    const { manaCost: _cost, typeLine: _type, ...plain } = card as BinderCard & { manaCost?: string; typeLine?: string };
    const have = Object.entries(next).find(([, c]) => samePrinting(c, plain));
    if (have) {
      next[have[0]] = counted(have[1], Math.min(MAX_COPIES, (have[1].count ?? 1) + (plain.count ?? 1)));
      continue;
    }
    let spot = firstEmptyPocket(next, pageCount);
    if (!spot) { pageCount += 1; spot = { page: pageCount, slot: 1 }; }
    next[pocketKey(spot.page, spot.slot)] = plain;
  }
  return { cards: next, pages: pageCount };
}
