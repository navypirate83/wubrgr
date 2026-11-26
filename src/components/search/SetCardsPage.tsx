/* =====================================================================
   ONE SET'S CARDS (the Card Finder's Sets tab, after tapping a set)
   Every card in the set, as a list, a grid or the gray-out grid, with the same buttons as an
   opened binder: the view switch (and the zoom, on the website) and
   the Sort button. The grids stretch with the window, like a binder's. The sorts are the binder's, without "Newest added" (these
   cards were never added) and without "Set" (they're all in the same set).
   The cards are set up like binder cards (so the same List and Grid drawing
   is used), but they're not yours, so there are no copies bars. Tapping a
   card hands it to the screen, which opens it in the Card Finder.
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

import { useMemo, useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useTheme';
import { useBinderPrices } from '@/hooks/useBinderPrices';
import { useContentWidth } from '@/hooks/useMenuStyle';
import CardList, { type CardEntry } from '@/components/binder/CardList';
import ViewSwitch from '@/components/binder/ViewSwitch';
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
};

export default function SetCardsPage({ set, onPickCard, visible = true }: Props) {
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

  // One entry per card (its place in the downloaded list is its key)
  const all = useMemo<CardEntry[]>(
    () => (cards.data ?? []).map((card, index) => ({ key: String(index), card: asBinderCard(card) })),
    [cards.data],
  );
  const prices = useBinderPrices(all);
  // What's in your binders (read again whenever this page comes back on screen)
  const owned = useMemo(() => (visible ? ownedCopies() : new Map<string, number>()), [visible, cards.data]);
  const entries = useMemo(
    () => sortEntries(all, sort, reversed, { printings: prices.printings, prices: prices.eachByKey, currency: prices.currency, slot: prices.slot, owned }),
    [all, sort, reversed, prices.printings, prices.eachByKey, prices.currency, owned],
  );
  const headerOf = useMemo(
    () => (headersOn ? (entry: CardEntry) => headerFor(entry, sort, { printings: prices.printings, owned }) : undefined),
    [headersOn, sort, prices.printings, owned],
  );
  // The gray-out grid: how many copies of a card you own
  const ownedOf = useMemo(() => (mode === 'checklist' ? (card: BinderCard) => owned.get(ownedKeyOf(card)) ?? 0 : undefined), [mode, owned]);

  return (
    <View style={styles.fill}>
      {/* This set's symbol and name (the header's back arrow returns to the list of sets) */}
      <View style={styles.titleRow}>
        {set.icon ? <Image source={{ uri: set.icon }} style={styles.symbol} contentFit="contain" tintColor={colors.iconTint} /> : null}
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1} accessibilityRole="header">{set.name}</Text>
      </View>

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
            onPick={(key) => onPickCard(cards.data![Number(key)])}
            onCopies={() => { /* these cards aren't yours: no copies */ }}
            noCopies
            minTile={GRID_ZOOM_WIDTHS[gridZoom]}
            prices={prices}
            headerOf={headerOf}
            empty={<Text style={[styles.loading, { color: colors.muted }]}>This set has no cards listed.</Text>}
          />
        </View>
      )}
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
