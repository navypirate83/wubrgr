/* =====================================================================
   ONE SET'S CARDS (the Card Finder's Sets tab, after tapping a set)
   Every card in the set, as a list, a grid or the gray-out grid, with the same buttons as an
   opened binder: the view switch (and the zoom, on the website) and
   the Sort button. The grids stretch with the window, like a binder's. The sorts are the binder's, without "Newest added" (these
   cards were never added) and without "Set" (they're all in the same set).
   The cards are set up like binder cards (so the same List and Grid drawing
   is used), but they're not yours, so there are no copies bars. Tapping a
   card opens the same pop-up a binder's card does, with icons to add it to a
   binder, a list or a deck (for someone using the binders); tapping the
   picture in it opens the card in the Card Finder. Adding puts in one copy
   of that printing, in English, not foil unless it only comes in foil.
   Above the buttons is a card search like a binder's (see SetSearch.tsx).
   The view and the sort are remembered (on this device, like a binder's), so every
   set opens the way you left the last one (see lib/setView.ts).
   WHAT YOU OWN (cards in your binders; see lib/setOwned.ts): the "Owned first" sort puts them first (flip it for the
   missing ones first), with "Owned" / "Not owned" header bars, and a third view button, the gray-out grid (a
   checklist), draws a grid with the cards you don't own grayed out and a small ×2 tag on the ones you have.
   It's worked out again each time this page comes back on screen, so cards just added show.
   There's no "back" button here: the header's back arrow does that (the open set is in the page's address).
   Everything the sorts and prices need is in the downloaded cards already,
   so it's put where the price lookup looks first, instead of asking again.
   ===================================================================== */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useTheme';
import { useBinderPrices } from '@/hooks/useBinderPrices';
import { useContentWidth } from '@/hooks/useMenuStyle';
import CardList, { type CardEntry } from '@/components/binder/CardList';
import ViewSwitch from '@/components/binder/ViewSwitch';
import CardScreen, { BINDER_ICON, DECK_ICON, LIST_ICON } from '@/components/binder/CardScreen';
import MoveCardDialog from '@/components/binder/MoveCardDialog';
import AddToListDialog from '@/components/binder/AddToListDialog';
import AddToDeckDialog from '@/components/binder/AddToDeckDialog';
import SetSearch from '@/components/search/SetSearch';
import { isSearching, makeNameFilter } from '@/lib/nameFilter';
import { showMessage } from '@/lib/dialogs';
import { SearchError } from '@/components/search/SearchStates';
import { headerFor, sortEntries } from '@/lib/binderSort';
import { GRID_ZOOM_WIDTHS, binderGridZoom, onBinderViewChange, onGridZoomChange, sortHeadersOn } from '@/lib/binderView';
import { SET_SORTS, chooseSetSort, chooseSetView, onSetViewChange, setCardsSort, setCardsSortReversed, setCardsView } from '@/lib/setView';
import type { BinderCard } from '@/lib/binderStorage';
import { PRICE_NOTE, CURRENCY_NOTE, ADDED_NOTE } from '@/lib/addedPrice';
import { binderCardFrom } from '@/lib/cardDrop';
import { loadSetCards, type ScryfallCard } from '@/lib/scryfall';
import { ownedCopies, ownedKeyOf } from '@/lib/setOwned';
import { plural } from '@/lib/cards';
import { SPACE } from '@/theme/colors';

// A set's card, set up like a binder card for the List and Grid. Its "added" day and price are left
// off, because the card was never added: no "price when added" line, no percent change.
function asBinderCard(card: ScryfallCard): BinderCard {
  const made = binderCardFrom(card, 0);
  const extra = { ...made.extra };
  delete extra[PRICE_NOTE];
  delete extra[CURRENCY_NOTE];
  delete extra[ADDED_NOTE];
  return { ...made, added: undefined, extra };
}

type Props = {
  set: { code: string; name: string; count: number; icon: string | undefined };
  onPickCard: (card: ScryfallCard) => void;
  visible?: boolean;       // is the Sets tab showing? (It stays drawn, hidden, while another tab shows, so what you own is looked at again when it comes back.)
  usingBinders: boolean;   // can cards be added to binders, lists and decks?
  announce: (text: string) => void;   // say something to screen readers
  jumpTo: string | null;   // a card number to scroll to and highlight (picked in the search)
  onJump: (set: string, number: string) => void;   // a search result was picked (maybe in another set)
  onJumped: () => void;    // the highlight is over
};

export default function SetCardsPage({ set, onPickCard, visible = true, usingBinders, announce, jumpTo, onJump, onJumped }: Props) {
  const colors = useColors();
  const queryClient = useQueryClient();
  // The whole room beside the side menu, with no cap, so the grid stretches with the browser window like a binder's does
  const contentWidth = useContentWidth();
  const gridZoom = useSyncExternalStore(onGridZoomChange, binderGridZoom, binderGridZoom);
  const headersOn = useSyncExternalStore(onBinderViewChange, sortHeadersOn, sortHeadersOn);

  // List or grid, and the sort (saved: see lib/setView.ts)
  const mode = useSyncExternalStore(onSetViewChange, setCardsView, setCardsView);
  const sort = useSyncExternalStore(onSetViewChange, setCardsSort, setCardsSort);
  const reversed = useSyncExternalStore(onSetViewChange, setCardsSortReversed, setCardsSortReversed);

  // The set's cards. They already hold their details and prices, so they're put where the price
  // lookup (useBinderPrices) looks first, so it doesn't ask Scryfall for them all again.
  const cards = useQuery({
    queryKey: ['set-cards', set.code],
    queryFn: async () => {
      const found = await loadSetCards(set.code);
      const printings = new Map(found.map((card) => [`${card.set}/${card.collector_number}`.toLowerCase(), card]));
      const signature = [...printings.keys()].sort().join('|');
      queryClient.setQueryData(['binder-printings', signature], printings);
      return found;
    },
    staleTime: 60 * 60 * 1000,
  });

  // What's typed in the search box, the card whose pop-up is open (its key), which "add to" window is
  // open, and a number that goes up after adding a card so what you own is counted again
  const [query, setQuery] = useState('');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ kind: 'binder' | 'list' | 'deck'; card: BinderCard } | null>(null);
  const [addedCount, setAddedCount] = useState(0);

  // One entry per card (its place in the downloaded list is its key)
  const all = useMemo<CardEntry[]>(
    () => (cards.data ?? []).map((card, index) => ({ key: String(index), card: asBinderCard(card) })),
    [cards.data],
  );
  const prices = useBinderPrices(all);
  // What's in your binders (read again whenever this page comes back on screen)
  const owned = useMemo(() => (visible ? ownedCopies() : new Map<string, number>()), [visible, cards.data, addedCount]);
  // While searching, only the cards whose name matches
  const searching = isSearching(query);
  const nameFilter = useMemo(() => makeNameFilter(all, (entry) => entry.card.name), [all]);
  const matching = useMemo(() => (searching ? nameFilter(query) : all), [searching, nameFilter, query, all]);
  const entries = useMemo(
    () => sortEntries(matching, sort, reversed, { printings: prices.printings, prices: prices.eachByKey, currency: prices.currency, slot: prices.slot, owned }),
    [matching, sort, reversed, prices.printings, prices.eachByKey, prices.currency, owned],
  );
  const headerOf = useMemo(
    () => (headersOn ? (entry: CardEntry) => headerFor(entry, sort, { printings: prices.printings, owned }) : undefined),
    [headersOn, sort, prices.printings, owned],
  );
  // The gray-out grid: how many copies of a card you own
  const ownedOf = useMemo(() => (mode === 'checklist' ? (card: BinderCard) => owned.get(ownedKeyOf(card)) ?? 0 : undefined), [mode, owned]);

  // The card to highlight (once the cards are here), which is let go again after a moment
  const flashIndex = jumpTo ? (cards.data ?? []).findIndex((card) => card.collector_number === jumpTo) : -1;
  useEffect(() => {
    if (flashIndex < 0) return undefined;
    const timer = setTimeout(onJumped, 3000);
    return () => clearTimeout(timer);
  }, [flashIndex, jumpTo]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving the Sets tab closes the pop-up
  useEffect(() => { if (!visible) { setOpenKey(null); setAdding(null); } }, [visible]);

  // The card in the pop-up (a fresh copy after adding, so its "you own" count is read again)
  const openIndex = openKey === null ? -1 : Number(openKey);
  const openCard = useMemo(() => {
    const found = all[openIndex];
    return found ? { ...found.card } : null;
  }, [all, openIndex, addedCount]);

  // An "add to" icon was tapped: make the card as it will be saved (today's date and price), close the
  // pop-up and open the window that asks which binder, list or deck
  function startAdding(kind: 'binder' | 'list' | 'deck') {
    const found = cards.data?.[openIndex];
    if (!found) return;
    setOpenKey(null);
    setAdding({ kind, card: binderCardFrom(found, 0) });
  }

  // The card was added: say so
  function added(note: string) {
    setAdding(null);
    setAddedCount((count) => count + 1);
    announce(note);
    showMessage(note);
  }

  return (
    <View style={styles.fill}>
      {/* This set's symbol and name (the header's back arrow returns to the list of sets) */}
      <View style={styles.titleRow}>
        {set.icon ? <Image source={{ uri: set.icon }} style={styles.symbol} contentFit="contain" tintColor={colors.iconTint} /> : null}
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1} accessibilityRole="header">{set.name}</Text>
      </View>

      {/* Search the cards, in this set or all of them */}
      <SetSearch cards={cards.data ?? []} onQuery={setQuery} onPick={onJump} />

      {/* The same buttons as in a binder: List / Grid, zoom, Sort */}
      <View style={styles.tools}>
        <ViewSwitch mode={mode} sort={sort} reversed={reversed} sorts={SET_SORTS} onSort={chooseSetSort} modes={['list', 'grid', 'checklist']} onView={chooseSetView} />
      </View>

      {cards.isError ? (
        <View style={styles.message}>
          <SearchError title="Couldn't load the cards" message={(cards.error as Error).message || 'Something went wrong.'} onRetry={() => cards.refetch()} retrying={cards.isFetching} />
        </View>
      ) : cards.isPending ? (
        <Text style={[styles.loading, { color: colors.muted }]} accessibilityLiveRegion="polite">
          Loading the cards in {set.name}… ({plural(set.count, 'card')})
        </Text>
      ) : (
        <View style={styles.fill}>
          <CardList
            entries={entries}
            mode={mode === 'list' ? 'list' : 'grid'}
            ownedOf={ownedOf}
            width={contentWidth}
            onPick={setOpenKey}
            flashKey={flashIndex >= 0 ? String(flashIndex) : null}
            searchOf={searching ? all.length : undefined}
            onCopies={() => { /* these cards aren't yours: no copies */ }}
            noCopies
            minTile={GRID_ZOOM_WIDTHS[gridZoom]}
            prices={prices}
            headerOf={headerOf}
            empty={(
              <Text style={[styles.loading, { color: colors.muted }]}>
                {searching ? `No cards in this set match "${query.trim()}".` : 'This set has no cards listed.'}
              </Text>
            )}
          />
        </View>
      )}

      {/* The card's pop-up: the same one as a binder's, with the "add to" icons */}
      {openCard && (
        <CardScreen
          card={openCard}
          onOpenFinder={() => { const found = cards.data![openIndex]; setOpenKey(null); onPickCard(found); }}
          onClose={() => setOpenKey(null)}
          actions={usingBinders ? [
            { label: 'Add to a binder', short: 'Binder', picture: BINDER_ICON, plus: true, onPress: () => startAdding('binder') },
            { label: 'Add to a list', short: 'List', picture: LIST_ICON, plus: true, onPress: () => startAdding('list') },
            { label: 'Add to a deck', short: 'Deck', picture: DECK_ICON, plus: true, onPress: () => startAdding('deck') },
          ] : []}
        />
      )}

      {/* "Which binder / list / deck?" (the binder one has "New binder" at the end) */}
      {adding?.kind === 'binder' && (
        <MoveCardDialog binderId="" card={adding.card} mode="add" onCancel={() => setAdding(null)} onMoved={added} />
      )}
      {adding?.kind === 'list' && <AddToListDialog card={adding.card} onCancel={() => setAdding(null)} onDone={added} />}
      {adding?.kind === 'deck' && <AddToDeckDialog cards={[adding.card]} onCancel={() => setAdding(null)} onDone={added} />}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: SPACE.l, paddingTop: 10, paddingBottom: 8 },
  symbol: { width: 22, height: 22 },
  title: { flex: 1, minWidth: 0, fontSize: 18, fontWeight: '700' },
  tools: { paddingHorizontal: SPACE.l, paddingBottom: 8 },
  message: { paddingHorizontal: SPACE.l },
  loading: { fontSize: 14, paddingHorizontal: SPACE.l, paddingTop: 12 },
});
