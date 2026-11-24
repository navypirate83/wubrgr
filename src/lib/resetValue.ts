/* =====================================================================
   RESET VALUE (on the Shelf)
   Makes the price every card in a binder or a list was "added at" become
   today's price, so the % change on each card starts again from 0.00%.
   Only the added PRICE changes: the added date, copies, finish, language
   and condition stay. A card the store has no price for keeps its old
   price (and is counted as skipped). It can't be undone, so the screens
   ask first. See addedPrice.ts for the price itself.
   ===================================================================== */

import { hasBinderCopy, isLocalMode, loadBinder, saveBinder, type BinderCards } from '@/lib/binderStorage';
import { resetPrices } from '@/lib/addedPrice';
import { isSignedIn, syncBinder, syncList } from '@/lib/googleDrive';
import { changeListCards, findList } from '@/lib/listStorage';

export type ResetResult = { reset: number; skipped: number };

// A binder's cards (from this device, or from Drive if this device doesn't have them yet)
async function cardsOfBinder(id: string): Promise<BinderCards> {
  return hasBinderCopy(id) ? loadBinder(id) : syncBinder(id);
}

// Reset the value of every card in these binders
export async function resetBinders(ids: string[]): Promise<ResetResult> {
  let reset = 0;
  let skipped = 0;
  for (const id of ids) {
    const cards = await cardsOfBinder(id);
    const keys = Object.keys(cards);
    const result = await resetPrices(keys.map((key) => cards[key]));
    saveBinder(Object.fromEntries(keys.map((key, i) => [key, result.cards[i]])), id);   // kept on this device (marked "needs saving")...
    await syncBinder(id);                                                              // ...and saved to Drive
    reset += result.reset;
    skipped += result.skipped;
  }
  return { reset, skipped };
}

// Reset the value of every card on these lists
export async function resetLists(ids: string[]): Promise<ResetResult> {
  let reset = 0;
  let skipped = 0;
  for (const id of ids) {
    const list = findList(id);
    if (!list) continue;
    const result = await resetPrices(list.cards);
    changeListCards(id, () => result.cards);
    if (!isLocalMode() && isSignedIn()) await syncList(id).catch(() => { /* kept on the device; saved next time the list opens */ });
    reset += result.reset;
    skipped += result.skipped;
  }
  return { reset, skipped };
}

// How many cards are in these binders (for the question before resetting)
export function cardsInBinders(ids: string[]): number {
  return ids.reduce((sum, id) => sum + Object.keys(loadBinder(id)).length, 0);
}

// How many cards are on these lists
export function cardsOnLists(ids: string[]): number {
  return ids.reduce((sum, id) => sum + (findList(id)?.cards.length ?? 0), 0);
}
