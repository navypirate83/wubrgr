/* =====================================================================
   MOVING SEVERAL CARDS INTO A BINDER OR ONTO A LIST AT ONCE
   Used by "Move to a binder" and "Move to a list" when cards are selected
   in a binder or a list. (Adding them to a deck is a copy, not a move: see
   components/binder/AddToDeckDialog.tsx.) The
   cards go in the way the app always adds to a binder: a printing the
   binder already has gets more copies, the rest fill its first empty
   pockets, and pages are added when it is full. The cards keep their own
   details (their added price and so on), because they are moved, not new.
   The caller takes them out of where they came from once this succeeds.
   ===================================================================== */

import { binderPages, isLocalMode, loadBinderList, saveBinder, saveBinderList, type BinderCard } from '@/lib/binderStorage';
import { placeInBinder } from '@/lib/collectionImport';
import { isSignedIn, signInWithGoogle, syncBinder, syncList } from '@/lib/googleDrive';
import { addCardsToList } from '@/lib/collectionImport';
import { costAndTypeOf } from '@/lib/cardDetails';
import type { ListCard } from '@/lib/listStorage';

// Put these cards in the binder. Gives back how many pages were added.
export async function moveCardsToBinder(binderId: string, cards: BinderCard[]): Promise<{ pagesAdded: number }> {
  if (!isLocalMode() && !isSignedIn()) await signInWithGoogle();
  const existing = await syncBinder(binderId);
  const pagesBefore = binderPages(binderId);
  const placed = placeInBinder(existing, pagesBefore, cards);
  if (placed.pages !== pagesBefore) {
    saveBinderList(loadBinderList().map((b) => (b.id === binderId ? { ...b, pages: placed.pages } : b)));
  }
  saveBinder(placed.cards, binderId);
  await syncBinder(binderId);
  return { pagesAdded: placed.pages - pagesBefore };
}

// The cards as a list keeps them (with their mana cost and type line)
const asListCards = (cards: BinderCard[]): ListCard[] => cards.map((card) => ({ ...card, ...costAndTypeOf(card) }));

// Put these cards on a list (a printing already on it gets more copies)
export async function moveCardsToList(listId: string, cards: BinderCard[]): Promise<void> {
  if (!addCardsToList(listId, asListCards(cards))) throw new Error('That list could not be saved on this device.');
  if (!isLocalMode() && isSignedIn()) syncList(listId).catch(() => { /* kept on the device; saved next time the list opens */ });
}

