/* =====================================================================
   THE SORT BUTTON AND HEADER BARS FOR THE SHELF'S PAGES
   The Binders, Lists, Decks and PRISM pages each list whole items (see
   lib/shelfSort.ts for the ways to sort them). This file has what they
   share:
   - useShelfSort: the page's saved sort, which updates when it changes
   - ShelfSortButton: the small Sort button (the same one the card sorts use)
     with the page's own choices. Picking the sort already in use flips it.
   - ShelfSortBar: that button on a row of its own, at the right
   - ShelfHeaderBar: the bar drawn above a group (a letter, a format...)
   ===================================================================== */

import { useSyncExternalStore } from 'react';
import { View } from 'react-native';
import SortButton from '@/components/binder/SortButton';
import SortHeaderBar from '@/components/binder/SortHeaderBar';
import { changeSettings, onSettingsChange, savedShelfSort, savedSortHeaders, type Settings } from '@/lib/settings';
import { parseShelfSort, pickedShelfSort, SHELF_SORTS, type ShelfArea } from '@/lib/shelfSort';

// Which saved setting belongs to which page
const SETTING_OF: Record<ShelfArea, 'shelfBinders' | 'shelfLists' | 'shelfDecks' | 'shelfPrisms'> = {
  binders: 'shelfBinders', lists: 'shelfLists', decks: 'shelfDecks', prisms: 'shelfPrisms',
};

// The page's saved sort (its text, like "name:r") and whether header bars are on.
// The page redraws when either changes.
export function useShelfSort(area: ShelfArea): { saved: string; headersOn: boolean } {
  const saved = useSyncExternalStore(onSettingsChange, () => savedShelfSort(area), () => savedShelfSort(area));
  const headersOn = useSyncExternalStore(onSettingsChange, savedSortHeaders, savedSortHeaders);
  return { saved, headersOn };
}

// Is the page in "My own order"? (Only then can items be moved by hand.)
export function isOwnOrder(area: ShelfArea, saved: string): boolean {
  return parseShelfSort(area, saved).sort === 'mine';
}

// The Sort button for a page
export function ShelfSortButton({ area }: { area: ShelfArea }) {
  const { saved } = useShelfSort(area);
  const { sort, reversed } = parseShelfSort(area, saved);
  return (
    <SortButton
      sort={sort}
      reversed={reversed}
      options={SHELF_SORTS[area]}
      onChoose={(picked) => {
        const changes: Partial<Settings> = { [SETTING_OF[area]]: pickedShelfSort(area, saved, picked) };
        // If the account can't be reached the choice is kept on this device and sent later
        changeSettings(changes).catch(() => { /* kept on this device */ });
      }}
    />
  );
}

// The row under the Add buttons with the Sort button at its right end
export function ShelfSortBar({ area }: { area: ShelfArea }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
      <ShelfSortButton area={area} />
    </View>
  );
}

// The bar above a group of items. Give "onToggle" and it becomes a button that folds the
// group away (with an arrow, and how many items are in the group).
export function ShelfHeaderBar({ text, collapsed, count, onToggle }: { text: string; collapsed?: boolean; count?: number; onToggle?: () => void }) {
  return <SortHeaderBar header={{ id: `shelf-${text}`, kind: 'text', text }} collapsed={collapsed} count={count} unit="deck" onToggle={onToggle} />;
}
