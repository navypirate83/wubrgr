/* =====================================================================
   THE CARD FINDER'S PICTURE GRID
   Under the search box, cards start filling in as soon as you type the
   first letter: pictures of every card with a name word that starts with
   what you typed, A to Z, in rows of three (the same size as on a phone,
   with more across on a wide screen). Scroll down and more load. Tap a
   card to open it in the Card Finder (the screen decides what that does).
   If nothing matches what you typed (a typo, say), the cards for the
   closest names are shown instead.
   The grid stays on the screen (just hidden) while a card is open, so
   going back finds your results and scroll spot just as you left them.
   ===================================================================== */

import { useEffect, useRef, useState, type ReactElement } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useInfiniteQuery } from '@tanstack/react-query';
import { loadGridPage } from '@/lib/cardGrid';
import type { ScryfallCard } from '@/lib/scryfall';
import type { NameEntry } from '@/lib/nameSearch';
import { CARD_BACK, imageFor } from '@/lib/cards';
import { pictureSource } from '@/lib/http';
import { useColors } from '@/hooks/useTheme';
import { NoCardsFound, SearchError, Searching } from '@/components/search/SearchStates';
import { PAGE_WIDTH } from '@/components/search/SearchBox';

// The gap between cards, and the room at each side of the grid (points)
const GAP = 8;
const SIDE = 16;
// A phone screen's width, which sets the card size: three across with
// those gaps. Bigger screens keep this card size and fit more across.
const PHONE_WIDTH = 390;
const CARD_WIDTH = (PHONE_WIDTH - SIDE * 2 - GAP * 2) / 3;
// A real card is 63 mm wide and 88 mm tall
const CARD_RATIO = 63 / 88;

type Props = {
  // What to search for (already settled: the screen waits for typing to pause)
  text: string;
  // The full list of card names, for the closest-names fallback
  names: NameEntry[] | undefined;
  // A card was tapped
  onPick: (card: ScryfallCard) => void;
  // False while a card is open (the grid is hidden but kept)
  visible: boolean;
  // Tells the screen a message for under the search box ("" for none)
  onHint: (message: string) => void;
};

export default function CardGrid({ text, names, onPick, visible, onHint }: Props) {
  const colors = useColors();
  const searching = text.trim() !== '';
  // How wide the area is, so we know how many cards fit across
  const [width, setWidth] = useState(0);
  const listRef = useRef<FlatList<ScryfallCard>>(null);
  // How far down the grid was scrolled, so coming back can put it there again
  const offset = useRef(0);

  // The pages of cards for what's typed. Each page of 175 is one Scryfall
  // search; scrolling to the end asks for the next. Answers are remembered.
  const query = useInfiniteQuery({
    queryKey: ['card-grid', text.trim().toLowerCase()],
    queryFn: ({ pageParam }) => loadGridPage(text, pageParam, names),
    initialPageParam: 1,
    getNextPageParam: (last, all) => (last.hasMore ? all.length + 1 : undefined),
    enabled: searching,
    staleTime: 5 * 60 * 1000,
  });
  const cards = query.data?.pages.flatMap((page) => page.cards) ?? [];
  const closest = query.data?.pages[0]?.closest ?? false;

  // Say "closest names" under the search box when these aren't exact matches
  useEffect(() => {
    onHint(searching && closest ? 'No exact match. Showing the closest names.' : '');
  }, [searching, closest, onHint]);

  // Each new search starts back at the top
  useEffect(() => {
    offset.current = 0;
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [text]);

  // Coming back from a card: scroll to where the grid was
  useEffect(() => {
    if (visible) {
      const spot = offset.current;
      requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: spot, animated: false }));
    }
  }, [visible]);

  // How many cards fit across: three on a phone, more on a wide screen
  const room = Math.min(width, PAGE_WIDTH + SIDE * 2) - SIDE * 2;
  const columns = Math.max(3, Math.floor((room + GAP) / (CARD_WIDTH + GAP)));
  const cardWidth = columns === 3 ? Math.min(CARD_WIDTH, (room - GAP * 2) / 3) : CARD_WIDTH;
  const gridWidth = columns * cardWidth + (columns - 1) * GAP;

  function measure(event: LayoutChangeEvent) {
    setWidth(event.nativeEvent.layout.width);
  }

  // What to show instead of cards: nothing typed, loading, an error, or no match
  let notice: ReactElement | null = null;
  if (!searching) {
    notice = (
      <View style={styles.notice}>
        <Ionicons name="search" size={36} color={colors.muted} />
        <Text style={[styles.noticeText, { color: colors.muted }]}>Type a card's name and its cards appear here.</Text>
      </View>
    );
  } else if (query.isError) {
    notice = <SearchError title="Couldn't search for cards" message={(query.error as Error).message || 'Something went wrong.'} onRetry={() => query.refetch()} retrying={query.isFetching} />;
  } else if (query.isPending) {
    notice = <Searching />;
  } else if (cards.length === 0) {
    notice = <NoCardsFound message={`No card names match “${text.trim()}”.`} />;
  }

  return (
    <View style={[styles.fill, !visible && styles.hidden]} onLayout={measure}>
      {width > 0 && (
        <FlatList
          ref={listRef}
          // A new number of columns needs a fresh list
          key={columns}
          data={notice ? [] : cards}
          numColumns={columns}
          keyExtractor={(card) => card.id}
          showsVerticalScrollIndicator={false}
          // Taps on a card work while the keyboard is up; dragging puts it away
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScroll={(event) => { offset.current = event.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={64}
          // Near the end: load the next page
          onEndReachedThreshold={1.5}
          onEndReached={() => { if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage(); }}
          columnWrapperStyle={columns > 1 ? { gap: GAP } : undefined}
          contentContainerStyle={[styles.content, { width: gridWidth }]}
          ListHeaderComponent={notice ?? undefined}
          ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator color={colors.accent} style={styles.more} /> : undefined}
          renderItem={({ item }) => <GridCard card={item} width={cardWidth} onPick={onPick} />}
        />
      )}
    </View>
  );
}

// One card in the grid: its picture (the card back if it has none)
function GridCard({ card, width, onPick }: { card: ScryfallCard; width: number; onPick: (card: ScryfallCard) => void }) {
  const colors = useColors();
  const src = imageFor(card, 0, ['small', 'normal']) ?? CARD_BACK;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={card.name}
      onPress={() => onPick(card)}
      style={({ pressed }) => [{ width, opacity: pressed ? 0.7 : 1 }, styles.card]}
    >
      <Image
        source={pictureSource(src)}
        style={[{ width, height: width / CARD_RATIO }, styles.picture, { backgroundColor: colors.surface }]}
        contentFit="cover"
        transition={120}
      />
    </Pressable>
  );
}

// The look: the grid is centered, cards have rounded corners like real ones
const styles = StyleSheet.create({
  fill: { flex: 1 },
  hidden: { display: 'none' },
  content: { alignSelf: 'center', paddingTop: 8, paddingBottom: 48 },
  card: { marginBottom: GAP },
  picture: { borderRadius: 6 },
  notice: { alignItems: 'center', gap: 12, paddingVertical: 40 },
  noticeText: { fontSize: 16, textAlign: 'center' },
  more: { paddingVertical: 16 },
});
