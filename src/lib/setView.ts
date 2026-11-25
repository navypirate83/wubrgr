/* =====================================================================
   HOW A SET'S CARDS ARE SHOWN (the Card Finder's Sets tab)
   The view (a list or a grid) and the sort chosen on a set's page are
   remembered, like a binder's, so every set opens the way you left the
   last one, even after closing the app. One choice for all sets. The sorts
   are the binder's without "Newest added" (these cards were never added),
   "Set" (they're all in the same set) and "Price change" (not tracked for
   every card in every set), plus "Card number" (their order in the set) and
   "Owned first" (the cards in your binders first). The view can also be the
   gray-out grid ("checklist"): a grid with the cards you don't own grayed out.
   They're kept on this device. (A binder's choices also travel with your
   account; these could be added to that later.)
   Plain TypeScript with no React in it.
   ===================================================================== */

import { storageGet, storageSet } from './storage';
import { listViewMode } from './binderView';
import { BINDER_SORTS, NUMBER_SORT, OWNED_SORT, canReverse, type BinderSort, type SortOption } from './binderSort';
import type { ViewMode } from './binderViewTypes';

// The sorts a set's page offers: the binder's, without "Newest added" (these cards were never added),
// "Set" (they're all in the same set) and "Price change" (price changes aren't tracked for every card
// in every set), plus "Card number" (their place in the set) and "Owned first" (what's in your binders), which sit after Price. A saved choice that's no longer offered falls back to A to Z (see setCardsSort).
export const SET_SORTS: SortOption[] = BINDER_SORTS
  .filter((sort) => sort.value !== 'added' && sort.value !== 'set' && sort.value !== 'change')
  .flatMap((sort) => (sort.value === 'price' ? [sort, NUMBER_SORT, OWNED_SORT] : [sort]));

const VIEW_KEY = 'finderSetView';
const SORT_KEY = 'finderSetSort';
const REVERSED_KEY = 'finderSetSortReversed';

// Who to tell when a choice changes (the page redraws)
const listeners = new Set<() => void>();
export function onSetViewChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function changed(): void {
  for (const listener of listeners) listener();
}

// The view: what was chosen last; before any choice, the same as the card lists use
export type SetView = 'list' | 'grid' | 'checklist';
export function setCardsView(): SetView {
  const saved = storageGet(VIEW_KEY);
  if (saved === 'list' || saved === 'grid' || saved === 'checklist') return saved;
  return listViewMode() === 'grid' ? 'grid' : 'list';
}
export function chooseSetView(mode: ViewMode): void {
  if (mode === 'binder') return;   // no pockets here
  storageSet(VIEW_KEY, mode);
  changed();
}

// The sort (A to Z until another is chosen) and whether it's the other way round
export function setCardsSort(): BinderSort {
  const saved = storageGet(SORT_KEY);
  return SET_SORTS.some((sort) => sort.value === saved) ? (saved as BinderSort) : 'name';
}
export function setCardsSortReversed(): boolean {
  return storageGet(REVERSED_KEY) === '1' && canReverse(setCardsSort());
}
// Choose a sort. Choosing the one in use turns it round (if it can be); another one starts the usual way.
export function chooseSetSort(sort: BinderSort): void {
  if (sort === setCardsSort() && canReverse(sort)) {
    storageSet(REVERSED_KEY, setCardsSortReversed() ? '0' : '1');
  } else {
    storageSet(SORT_KEY, sort);
    storageSet(REVERSED_KEY, '0');
  }
  changed();
}
