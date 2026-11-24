/* =====================================================================
   ONE SET'S CARDS (the Card Finder's Sets tab, after tapping a set)
   Every card in the set, as a list or a grid, with the same buttons as an
   opened binder: the List / Grid switch (and the zoom, on the website) and
   the Sort button. The sorts are the binder's, without "Newest added" (these
   cards were never added) and without "Set" (they're all in the same set).
   The cards are set up like binder cards (so the same List and Grid drawing
   is used), but they're not yours, so there are no copies bars. Tapping a
   card hands it to the screen, which opens it in the Card Finder.
   The view and the sort are remembered while the app is open, so going
   from set to set keeps what you chose.
   Everything the sorts and prices need is in the downloaded cards already,
   so it's put where the price lookup looks first, instead of asking again.
   ===================================================================== */

import { useMemo, useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useTheme';
import { useBinderPrices } from '@/hooks/useBinderPrices';
import { useContentWidth } from '@/hooks/useMenuStyle';
import CardList, { type CardEntry } from '@/components/binder/CardList';
import ViewSwitch from '@/components/binder/ViewSwitch';
import { SearchError } from '@/components/search/SearchStates';
import { BINDER_SORTS, canReverse, headerFor, sortEntries, type BinderSort } from '@/lib/binderSort';
import { GRID_ZOOM_WIDTHS, binderGridZoom, listViewMode, onBinderViewChange, onGridZoomChange, sortHeadersOn } from '@/lib/binderView';
import type { BinderViewMode } from '@/lib/binderViewTypes';
import type { BinderCard } from '@/lib/binderStorage';
import { PRICE_NOTE, CURRENCY_NOTE } from '@/lib/addedPrice';
import { binderCardFrom } from '@/lib/cardDrop';
import { loadSetCards, type ScryfallCard } from '@/lib/scryfall';
import { plural } from '@/lib/cards';
import { MAX_CONTENT_WIDTH, SPACE } from '@/theme/colors';

// The sorts offered here: the binder's, without "Newest added" and "Set"
const SORTS = BINDER_SORTS.filter((sort) => sort.value !== 'added' && sort.value !== 'set');

// The view and sort last chosen (kept while the app is open)
let lastView: BinderViewMode | null = null;
let lastSort: { sort: BinderSort; reversed: boolean } = { sort: 'name', reversed: false };

// A set's card, set up like a binder card for the List and Grid. Its "added" day and price are left
// off, because the card was never added: no "price when added" line, no percent change.
function asBinderCard(card: ScryfallCard): BinderCard {
  const made = binderCardFrom(card, 0);
  const extra = { ...made.extra };
  delete extra[PRICE_NOTE];
  delete extra[CURRENCY_NOTE];
  return { ...made, added: undefined, extra };
}

type Props = {
  set: { code: string; name: string; count: number; icon: string | undefined };
  onBack: () => void;
  onPickCard: (card: ScryfallCard) => void;
};

export default function SetCardsPage({ set, onBack, onPickCard }: Props) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const contentWidth = Math.min(useContentWidth(), MAX_CONTENT_WIDTH + 2 * SPACE.l);
  const gridZoom = useSyncExternalStore(onGridZoomChange, binderGridZoom, binderGridZoom);
  const headersOn = useSyncExternalStore(onBinderViewChange, sortHeadersOn, sortHeadersOn);

  // List or grid, and the sort
  const [mode, setMode] = useState<BinderViewMode>(lastView ?? (listViewMode() === 'grid' ? 'grid' : 'list'));
  const [{ sort, reversed }, setSort] = useState(lastSort);
  function chooseView(next: BinderViewMode) { lastView = next; setMode(next); }
  // Tapping the sort already in use turns it round (if it can be); another one starts the usual way
  function chooseSort(next: BinderSort) {
    const flip = next === sort && canReverse(next);
    lastSort = flip ? { sort, reversed: !reversed } : { sort: next, reversed: false };
    setSort(lastSort);
  }

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
  const entries = useMemo(
    () => sortEntries(all, sort, reversed, { printings: prices.printings, prices: prices.eachByKey, currency: prices.currency }),
    [all, sort, reversed, prices.printings, prices.eachByKey, prices.currency],
  );
  const headerOf = useMemo(
    () => (headersOn ? (entry: CardEntry) => headerFor(entry, sort, { printings: prices.printings }) : undefined),
    [headersOn, sort, prices.printings],
  );

  return (
    <View style={styles.fill}>
      {/* The way back to the list of sets, with this set's symbol and name */}
      <View style={styles.titleRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to the list of sets" onPress={onBack} hitSlop={8}
                   style={({ pressed }) => [styles.back, pressed && { opacity: 0.6 }]}>
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
          <Text style={[styles.backText, { color: colors.accent }]}>Sets</Text>
        </Pressable>
        {set.icon ? <Image source={{ uri: set.icon }} style={styles.symbol} contentFit="contain" tintColor={colors.iconTint} /> : null}
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1} accessibilityRole="header">{set.name}</Text>
      </View>

      {/* The same buttons as in a binder: List / Grid, zoom, Sort */}
      <View style={styles.tools}>
        <ViewSwitch mode={mode} sort={sort} reversed={reversed} sorts={SORTS} onSort={chooseSort} modes={['list', 'grid']} onView={chooseView} />
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
            mode={mode === 'grid' ? 'grid' : 'list'}
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
  back: { flexDirection: 'row', alignItems: 'center', minHeight: 36, paddingRight: 6 },
  backText: { fontSize: 16, fontWeight: '600' },
  symbol: { width: 22, height: 22 },
  title: { flex: 1, minWidth: 0, fontSize: 18, fontWeight: '700' },
  tools: { paddingHorizontal: SPACE.l, paddingBottom: 8 },
  message: { paddingHorizontal: SPACE.l },
  loading: { fontSize: 14, paddingHorizontal: SPACE.l, paddingTop: 12 },
});
