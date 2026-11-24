/* =====================================================================
   MOVING SEVERAL CARDS INTO A BINDER AT ONCE
   Used by "Move to" when cards are selected in a binder or a list. The
   cards go in the way the app always adds to a binder: a printing the
   binder already has gets more copies, the rest fill its first empty
   pockets, and pages are added when it is full. The cards keep their own
   details (their added price and so on), because they are moved, not new.
   The caller takes them out of where they came from once this succeeds.
   ===================================================================== */

import { binderPages, isLocalMode, loadBinderList, saveBinder, saveBinderList, type BinderCard } from '@/lib/binderStorage';
import { placeInBinder } from '@/lib/collectionImport';
import { isSignedIn, signInWithGoogle, syncBinder } from '@/lib/googleDrive';

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
