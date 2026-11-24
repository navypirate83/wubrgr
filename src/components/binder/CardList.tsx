/* =====================================================================
   A BINDER'S CARDS AS A LIST OR A GRID
   The List and Grid views of an opened binder (the Binder view, with its
   pockets, is drawn by the binder screen itself).
   - LIST: one row per card: a small picture (with a rainbow border if
     it's a foil or etched), and beside it three lines: the name; then
     the casting cost (Scryfall's own mana symbols), the set's symbol, the
     set code and number, with a "*" after the number for a foil or "**"
     for an etched foil; then the type line. To the right: the "− 3 +"
     copies bar (− and + change how many copies you have), centered up and
     down in the row, and a column of three price lines for ONE copy: what
     it is worth today at the store chosen in Settings (a dash when it has no
     price), how many percent that has moved since the card was added (green
     with a + going up, red with a - going down), and the price it had on the
     day it was added.
   Above both, one quiet line: how many cards, how many different, and the
   total value.
   - GRID: card pictures side by side (a foil has a rainbow border), each
     with the same "− 3 +" copies bar (see CopiesBar.tsx) along its bottom.
     (− on the last copy asks about removing the card.)
     On the website the pictures can be zoomed in and out (see
     ViewSwitch.tsx), and on any touch screen by pinching; "minTile" is how
     wide they are at least. While two fingers pinch, the whole grid is
     stretched or shrunk live under them (cards may run off the screen or
     leave gaps), with a dashed outline showing about how big a card will
     be and the zoom level (1 to 7) in the middle of the screen; when the fingers lift, the grid snaps to the nearest zoom size,
     keeping the card that was under the fingers in view (see
     usePinchZoom.ts).
   HEADER BARS: when "headerOf" is given, a small bar goes in above each
   group of cards (A, B, C ... for the name sort; mana symbols for color
   and mana value; the type's name; the set's symbol, code and name). See
   SortHeaderBar.tsx. To lay these out, the cards are first split into
   screen rows (a header bar, or a row of cards), and the list draws those.
   Tapping a card calls "onPick" (the binder screen opens that card's
   menu: copies, open in the Card Finder, move, remove).
   The cards come in already sorted. Rows are drawn only as they scroll
   into view, so a binder with thousands of cards stays quick.
   ===================================================================== */

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { useColors } from '@/hooks/useTheme';
import { usePinchZoom } from '@/hooks/usePinchZoom';
import { GRID_ZOOM_WIDTHS, binderGridZoom, setBinderGridZoom, zoomStepForWidth } from '@/lib/binderView';
import { pictureSource } from '@/lib/http';
import { cardCount, sameNameCount, type BinderCard } from '@/lib/binderStorage';
import { useQuery } from '@tanstack/react-query';
import { formatPrice } from '@/lib/prices';
import { directionOf, percentText, priceChangeOf } from '@/lib/priceChange';
import { costAndTypeOf, finishOf } from '@/lib/cardDetails';
import { loadSetIcons } from '@/lib/scryfall';
import ManaCost from '@/components/lists/ManaCost';
import FoilFrame from './FoilFrame';
import CopiesBar from './CopiesBar';
import SortHeaderBar, { HEADER_HEIGHT } from './SortHeaderBar';
import MissingOutline from '@/components/decks/MissingOutline';
import BannedSlash from '@/components/decks/BannedSlash';
import GameChangerBadge from '@/components/decks/GameChangerBadge';
import type { SortHeader } from '@/lib/binderSort';
import type { BinderPrices } from '@/hooks/useBinderPrices';
import { SPACE } from '@/theme/colors';

// A card and the pocket it sits in
export type CardEntry = { key: string; card: BinderCard };

type Props = {
  entries: CardEntry[];
  mode: 'list' | 'grid';
  width: number;                       // the room beside the side menu, in points
  onPick: (key: string) => void;
  onCopies: (key: string, step: number) => void;   // one more (1) or one fewer (-1) copy
  minTile: number;                     // grid pictures are at least this wide (points)
  prices: BinderPrices;                // what the cards are worth
  empty: ReactElement;                 // what to show when there are no cards
  // While searching: how many cards there are before narrowing, so the line
  // above can say "3 of 42 match"; and a hint to add after it
  searchOf?: number;
  hint?: string;
  // A card just added (by dropping a picture on the list): its key, which is
  // scrolled to and highlighted for a moment, and a short note for the line above
  flashKey?: string | null;
  note?: string | null;
  // A deck that is not legal: why ("101 cards, at most 100"). It ends the line of totals in red as "Not legal: ..."
  warn?: string;
  // Something to put at the very top of the list, above the line of totals (a deck's command zone). It's part
  // of the list, so it scrolls up out of the way with the cards instead of staying put and taking up the screen.
  header?: ReactElement;
  // Cards that are counted in the line of totals (the number of cards, how many different, how many names and
  // what they're worth) but aren't in the list itself: a deck's commanders. They must be among the cards the
  // prices were worked out for (see useBinderPrices). Left out while searching, because the line then
  // only talks about the matching cards.
  alsoCounted?: CardEntry[];
  // Which group a card falls under for the sort in use (see "headerFor" in
  // lib/binderSort.ts). A header bar goes in wherever the group changes.
  // Leave it out (or give back null) for no header bars.
  headerOf?: (entry: CardEntry) => SortHeader | null;
  // Is this card to be marked with a bold solid red border? (A deck marks the
  // cards that aren't in your binders; leave it out for no marks.)
  // Gives 'card' (not owned: solid red), 'printing' (the card is owned, but not
  // this printing: dashed red) or false.
  missing?: (card: BinderCard) => false | 'card' | 'printing';
  // Is this card banned in the deck's format? (A deck draws a black "BANNED"
  // slash across those pictures; leave it out for no slashes.)
  banned?: (card: BinderCard) => boolean;
  // Is this card a Game Changer? (A Commander deck draws a yellow border around
  // those pictures; leave it out for none.)
  gameChanger?: (card: BinderCard) => boolean;
};

// What the FlatList draws, one item per screen row: a header bar, or a
// row of cards (one card in the List view, as many as fit across in the
// Grid view). "first" is the place in the sorted cards of the row's first card.
type Row =
  | { kind: 'header'; id: string; header: SortHeader }
  | { kind: 'cards'; id: string; entries: CardEntry[]; first: number };

// A card's picture is 63 by 88 millimeters
const CARD_RATIO = 88 / 63;
// The space between grid pictures
const GRID_GAP = 10;
// Below this width (points) the List view is "narrow" (a phone): the copies bar moves under the card's text
const NARROW_LIST = 520;

export default function CardList({ entries, mode, width, onPick, onCopies, minTile, prices, empty, searchOf, hint, flashKey, note, warn, header, alsoCounted, headerOf, missing, banned, gameChanger }: Props) {
  const colors = useColors();
  const listRef = useRef<FlatList<Row>>(null);
  // Each set's symbol picture (downloaded once, shared with the Card Finder),
  // for the List view and for set header bars
  const setIcons = useQuery({ queryKey: ['set-icons'], queryFn: loadSetIcons, enabled: mode === 'list' || !!headerOf });
  // The grid's columns, and how wide each picture is
  const room = width - 2 * SPACE.l;
  const columns = mode === 'grid' ? Math.max(1, Math.floor((room + GRID_GAP) / (minTile + GRID_GAP))) : 1;
  const tile = Math.floor((room - (columns - 1) * GRID_GAP) / columns);
  const cardHeight = Math.round(tile * CARD_RATIO);

  // The cards split into screen rows, with a header bar before each new
  // group. (Without header bars it is just the cards, "columns" to a row.)
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let group: string | undefined;
    let current: Extract<Row, { kind: 'cards' }> | null = null;
    entries.forEach((entry, index) => {
      const header = headerOf ? headerOf(entry) : null;
      if (header && header.id !== group) {
        group = header.id;
        out.push({ kind: 'header', id: `header-${index}-${header.id}`, header });
        current = null;
      }
      if (!current || current.entries.length >= columns) {
        current = { kind: 'cards', id: `row-${entry.key}`, entries: [], first: index };
        out.push(current);
      }
      current.entries.push(entry);
    });
    return out;
  }, [entries, headerOf, columns]);
  // Where each row starts (counted from the first row) and how tall it is,
  // for the Grid view, where every row's height is known exactly
  const layout = useMemo(() => {
    const lengths = rows.map((row) => (row.kind === 'header' ? HEADER_HEIGHT : cardHeight));
    const starts: number[] = [];
    let at = 0;
    lengths.forEach((length) => { starts.push(at); at += length + GRID_GAP; });
    return { lengths, starts };
  }, [rows, cardHeight]);
  // The row a card (by its place in the sorted cards) is in
  const rowOf = (index: number) => rows.findIndex((row) => row.kind === 'cards' && index >= row.first && index < row.first + row.entries.length);

  /* ----- Pinching the grid (see the top of this file) ----- */
  // How much the grid is stretched right now, and the point it stretches from
  const scale = useSharedValue(1);
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const stretched = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    transformOrigin: `${originX.value}px ${originY.value}px`,
  }));
  // While two fingers are down: the list doesn't scroll, and a dashed
  // outline shows the card size it would snap to (which zoom step, and where)
  const [pinching, setPinching] = useState(false);
  const [preview, setPreview] = useState<{ step: number; x: number; y: number } | null>(null);
  // The zoom step when the pinch began, and the card that was under the
  // fingers (its place in the list, and how far down the screen it was)
  const startStep = useRef(0);
  const anchor = useRef<{ index: number; y: number } | null>(null);
  // How far the list is scrolled, and where its cards start (below the summary line)
  const scrollY = useRef(0);
  const summary = useRef({ y: 0, height: 0 });

  // The card under a point of the screen (the one the fingers cover most)
  function cardAt(x: number, y: number): number {
    const top = summary.current.y + summary.current.height + GRID_GAP;
    const down = scrollY.current + y - top;
    // The row under that height (the last one starting above it)...
    let row = 0;
    layout.starts.forEach((start, i) => { if (start <= down) row = i; });
    // ...and if that's a header bar, the first row of cards after it (or before it, at the end)
    while (rows[row] && rows[row].kind === 'header' && row < rows.length - 1) row++;
    while (rows[row] && rows[row].kind === 'header' && row > 0) row--;
    const found = rows[row];
    if (!found || found.kind !== 'cards') return 0;
    const column = Math.min(found.entries.length - 1, Math.max(0, Math.floor((x - SPACE.l) / (tile + GRID_GAP))));
    return found.first + column;
  }
  // The zoom step that stretching by this much would land on
  const stepFor = (by: number) => zoomStepForWidth(GRID_ZOOM_WIDTHS[startStep.current] * by);

  const pinch = usePinchZoom(mode === 'grid', {
    onStart: ({ x, y }) => {
      startStep.current = binderGridZoom();
      anchor.current = entries.length > 0 ? { index: cardAt(x, y), y } : null;
      originX.value = x;
      originY.value = y;
      scale.value = 1;
      setPinching(true);
      setPreview({ step: startStep.current, x, y });
    },
    // The grid follows the fingers smoothly; only the outline changes size in steps
    onMove: (by) => {
      scale.value = by;
      const step = stepFor(by);
      setPreview((now) => (now && now.step !== step ? { ...now, step } : now));
    },
    // Fingers lifted: really change the zoom, once
    onEnd: (by) => {
      const step = stepFor(by);
      setPinching(false);
      setPreview(null);
      if (step === startStep.current) { scale.value = 1; anchor.current = null; return; }
      setBinderGridZoom(step);
    },
  });

  // The zoom really changed: take the stretch off, and scroll so the card
  // that was under the fingers is at the same height on the screen
  useLayoutEffect(() => {
    scale.value = 1;
    const target = anchor.current;
    if (!target || mode !== 'grid') return;
    anchor.current = null;
    const top = summary.current.y + summary.current.height + GRID_GAP;
    const row = Math.max(0, rowOf(target.index));
    const offset = Math.max(0, top + (layout.starts[row] ?? 0) + cardHeight / 2 - target.y);
    // The list is rebuilt for the new columns, so try again once it has laid out
    const timers = [60, 350].map((wait) => setTimeout(() => listRef.current?.scrollToOffset({ offset, animated: false }), wait));
    return () => timers.forEach(clearTimeout);
  }, [minTile]);   // eslint-disable-line react-hooks/exhaustive-deps

  // The outline for the card size the pinch would land on: how big, and how many fit across
  let outline: { size: number; across: number } | null = null;
  if (preview) {
    const across = Math.max(1, Math.floor((room + GRID_GAP) / (GRID_ZOOM_WIDTHS[preview.step] + GRID_GAP)));
    outline = { size: Math.floor((room - (across - 1) * GRID_GAP) / across), across };
  }

  // A card was just added: scroll to where it sits in the sorted cards (it
  // may move once its price arrives, so this runs again whenever the order
  // changes, until the highlight ends)
  useEffect(() => {
    if (!flashKey) return;
    const index = entries.findIndex((entry) => entry.key === flashKey);
    if (index < 0) return;
    const row = rowOf(index);
    if (row < 0) return;
    const timer = setTimeout(() => {
      listRef.current?.scrollToIndex({ index: row, animated: true, viewPosition: 0.3 });
    }, 250);
    return () => clearTimeout(timer);
  }, [flashKey, entries, rows]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View {...pinch} style={[styles.fill, pinch.style]}>
    <Animated.View style={[styles.fill, stretched]}>
    <FlatList
      ref={listRef}
      // In the grid every row is the same height, so say exactly where each
      // row is. Then scrolling to a card after a zoom lands exactly, instead
      // of on a guess for rows that haven't been drawn yet. (Each "item" here
      // is a row of cards; the cards start below the summary line.)
      getItemLayout={mode === 'grid' && summary.current.height > 0
        ? (_rows, row) => ({
            length: layout.lengths[row] ?? cardHeight,
            offset: summary.current.y + summary.current.height + GRID_GAP + (layout.starts[row] ?? 0),
            index: row,
          })
        : undefined}
      scrollEnabled={!pinching}
      scrollEventThrottle={16}
      onScroll={(event) => { scrollY.current = event.nativeEvent.contentOffset.y; }}
      // If the row isn't drawn yet, guess its place, then try again
      onScrollToIndexFailed={(info) => {
        listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
        setTimeout(() => listRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.3 }), 350);
      }}
      // A new key when the columns change, because a list can't change its
      // number of columns on the fly
      key={`${mode}-${columns}`}
      data={rows}
      keyExtractor={(row) => row.id}
      contentContainerStyle={[styles.content, mode === 'grid' && { gap: GRID_GAP }]}
      ListEmptyComponent={empty}
      // The top of the list: the screen's own header (the command zone) if it gave one, then the line of totals.
      // (The grid works out where its rows are from how tall this whole top part is.)
      ListHeaderComponent={entries.length > 0 || header
        ? <View onLayout={(event) => { summary.current = { y: event.nativeEvent.layout.y, height: event.nativeEvent.layout.height }; }}>
            {header}
            {entries.length > 0 && <Summary entries={entries} prices={prices} searchOf={searchOf} hint={hint} note={note ?? undefined} warn={warn} alsoCounted={alsoCounted} />}
          </View>
        : undefined}
      renderItem={({ item: row }) => {
        // A header bar between groups
        if (row.kind === 'header') {
          return <SortHeaderBar header={row.header} setIcon={row.header.kind === 'set' ? setIcons.data?.get(row.header.code.toLowerCase()) : undefined} />;
        }
        // The List view: one card to a row
        if (mode === 'list') {
          const item = row.entries[0];
          return <ListRow entry={item} onPick={onPick} onCopies={onCopies} border={colors.border} price={prices.eachByKey.get(item.key)} currency={prices.currency} narrow={width < NARROW_LIST}
                          setIcon={setIcons.data?.get(item.card.set.toLowerCase())} highlighted={item.key === flashKey} missing={missing?.(item.card) ?? false} banned={banned?.(item.card) ?? false} gold={gameChanger?.(item.card) ?? false} />;
        }
        // The Grid view: a row of pictures side by side
        return (
          <View style={styles.gridRow}>
            {row.entries.map((item) => (
              <GridTile key={item.key} entry={item} onPick={onPick} onCopies={onCopies} size={tile} highlighted={item.key === flashKey} missing={missing?.(item.card) ?? false} banned={banned?.(item.card) ?? false} gold={gameChanger?.(item.card) ?? false} />
            ))}
          </View>
        );
      }}
    />
    </Animated.View>
    {/* While pinching: the zoom level, in the middle of the screen (1 is the smallest cards, 7 the biggest) */}
    {preview && (
      <View pointerEvents="none" style={styles.levelBox}>
        <Text style={[styles.levelText, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}>
          {preview.step + 1} / {GRID_ZOOM_WIDTHS.length}
        </Text>
      </View>
    )}
    {/* While pinching: a dashed outline of the card size the grid will snap to */}
    {outline && preview && (
      <View pointerEvents="none" style={[styles.outline, {
        left: preview.x - outline.size / 2, top: preview.y - (outline.size * CARD_RATIO) / 2,
        width: outline.size, height: Math.round(outline.size * CARD_RATIO), borderColor: colors.accent,
      }]}>
        <Text style={[styles.outlineText, { color: colors.accent, backgroundColor: colors.bg }]}>{outline.across} across</Text>
      </View>
    )}
    </View>
  );
}

/* ---------------------------------------------------------------------
   THE SUMMARY LINE above the cards: "42 cards · 31 different · 9
   distinct · $118.40"
   - cards: every card, counting each copy
   - different: how many separate cards are in the list (a stack of
     copies is one; each printing is its own)
   - distinct: how many different card NAMES there are, however the
     cards look (another printing, set, foil or art counts as the same
     name) and however many copies there are
   (also shown above the pockets in the Binder view: the binder screen uses it,
   and the lists use it too)
   --------------------------------------------------------------------- */
export function Summary({ entries, prices, searchOf, hint, note, warn, alsoCounted }: { entries: CardEntry[]; prices: BinderPrices; searchOf?: number; hint?: string; note?: string; warn?: string; alsoCounted?: CardEntry[] }) {
  const colors = useColors();
  // The cards in the list, plus any that are counted but not listed (a deck's commanders)
  const extra = searchOf === undefined ? alsoCounted ?? [] : [];
  const counted = extra.length > 0 ? [...entries, ...extra] : entries;
  const cards = counted.reduce((sum, { card }) => sum + cardCount(card), 0);
  // What the cards showing are worth (all of them, or just those matching a search)
  const total = prices.total === null ? null
    : searchOf === undefined ? prices.total
      : Math.round(entries.reduce((sum, { key }) => sum + (prices.byKey.get(key) ?? 0), 0) * 100) / 100;
  const worth = total !== null ? formatPrice(total, prices.currency)
    : prices.failed ? 'prices unavailable' : prices.loading ? 'loading prices…' : '';
  const parts = searchOf !== undefined
    ? [`${entries.length} of ${searchOf} ${searchOf === 1 ? 'card' : 'cards'} match`, worth, hint, note].filter(Boolean)
    : [`${cards} ${cards === 1 ? 'card' : 'cards'}`, `${counted.length} different`, `${sameNameCount(counted.map((entry) => entry.card)).toLocaleString()} distinct`, worth, note].filter(Boolean);
  // A deck that is not legal ends the line with the reason, in red
  return (
    <Text style={[styles.summary, { color: colors.muted }]} accessibilityLiveRegion="polite">
      {parts.join(' · ')}
      {warn ? <Text style={{ color: colors.error, fontWeight: '700' }}>{` · Not legal: ${warn}`}</Text> : null}
    </Text>
  );
}

/* ---------------------------------------------------------------------
   ONE LINE OF THE LIST. "memo" redraws it only when its card changes.
   --------------------------------------------------------------------- */
const ListRow = memo(function ListRow({ entry, onPick, onCopies, border, price, currency, narrow, setIcon, highlighted, missing, banned, gold }: {
  entry: CardEntry; onPick: (key: string) => void; onCopies: (key: string, step: number) => void; border: string;
  setIcon: string | undefined;         // the set's symbol picture, once it has downloaded
  highlighted: boolean;                // just added: tinted for a moment
  missing: false | 'card' | 'printing';   // a deck: not in your binders (solid red border) or not that printing (dashed)
  banned: boolean;                     // banned in the deck's format: black "BANNED" slash
  gold: boolean;                       // a Game Changer: yellow border
  price: number | null | undefined;    // one copy's price. undefined: not loaded yet; null: the store has none
  currency: 'USD' | 'EUR';
  narrow: boolean;                     // a phone-sized screen: the copies bar goes on its own line under the card's text
}) {
  const colors = useColors();
  const { card, key } = entry;
  const count = cardCount(card);
  // "ONE · #123", with a "*" after the number for a foil, "**" for etched
  const finish = finishOf(card);
  const about = `${card.set.toUpperCase()} · #${card.number}${finish === 'etched' ? '**' : finish === 'foil' ? '*' : ''}`;
  // The casting cost and the type line (either can be empty, like a land's cost)
  const { manaCost, typeLine } = costAndTypeOf(card);
  // How the price has moved since the card was added (null when it has no added price), and the color
  // for that: green for up, red for down, plain grey for no change
  const change = priceChangeOf(card.extra, price, currency);
  const direction = change && change.percent !== null ? directionOf(change.percent) : 'same';
  const changeColor = direction === 'up' ? colors.success : direction === 'down' ? colors.error : colors.muted;
  // The picture and name: tap them for the card's menu
  const mainPart = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${card.name}${finish === 'etched' ? ', etched foil' : finish === 'foil' ? ', foil' : ''}${typeLine ? `, ${typeLine}` : ''}, ${card.set.toUpperCase()} number ${card.number}, ${count} ${count === 1 ? 'copy' : 'copies'}${typeof price === 'number' ? `, worth ${formatPrice(price, currency)} each` : ''}${gold ? ', Game Changer' : ''}. Opens its menu.`}
      onPress={() => onPick(key)}
      style={({ pressed }) => [styles.rowMain, pressed && { backgroundColor: colors.surfaceHover }]}
    >
      <View>
        <FoilFrame foil={card.foil === true} width={34} height={48} radius={4}>
          <Image source={pictureSource(card.image)} style={styles.thumbPicture} contentFit="cover" />
        </FoilFrame>
        {banned && <BannedSlash radius={4} />}
        {gold && <MissingOutline radius={4} width={2} yellow />}
        {missing && <MissingOutline radius={4} width={2} dashed={missing === 'printing'} inset={gold ? 2 : 0} />}
        {gold && <GameChangerBadge size={7} />}
      </View>
      <View style={styles.rowText}>
        {/* The name, with a small gold "GC" tag after it for a Game Changer */}
        <View style={styles.nameRow}>
          <Text style={[styles.name, styles.nameText, { color: colors.text }]} numberOfLines={1}>{card.name}</Text>
          {gold && <Text style={[styles.gcTag, { backgroundColor: colors.gameChanger }]}>GC</Text>}
        </View>
        {/* The casting cost, then the set's symbol, then the set code and number */}
        <View style={styles.aboutRow}>
          {manaCost ? <ManaCost cost={manaCost} size={13} /> : null}
          {setIcon ? <Image source={{ uri: setIcon }} style={styles.setIcon} contentFit="contain" tintColor={colors.iconTint} /> : null}
          <Text style={[styles.about, { color: colors.muted }]} numberOfLines={1}>{about}</Text>
        </View>
        {/* The type line (one line, with "…" if it's too long) */}
        {typeLine ? <Text style={[styles.type, { color: colors.muted }]} numberOfLines={1}>{typeLine}</Text> : null}
      </View>
    </Pressable>
  );
  // How many copies: the "− 3 +" bar
  const copiesPart = (
    <CopiesBar name={card.name} count={count} style={styles.rowBar}
               onFewer={() => onCopies(key, -1)} onMore={() => onCopies(key, 1)} />
  );
  // The prices of ONE copy, not the whole stack, in three lines: today's price (a dash if the store
  // has no price), then how far the price has moved since the card was added (green with a +
  // going up, red with a - going down), then the price it had when it was added. A card with no
  // added price shows just today's price. The total for everything is in the summary line above.
  const pricesPart = (
    <View style={styles.priceBox}>
      <Text style={[styles.price, { color: colors.muted }]} numberOfLines={1}>{price === undefined ? '' : formatPrice(price, currency)}</Text>
      {change && change.percent !== null ? (
        <Text style={[styles.price, { color: changeColor }]} numberOfLines={1} adjustsFontSizeToFit>{percentText(change.percent)}</Text>
      ) : null}
      {change ? <Text style={[styles.price, { color: colors.muted }]} numberOfLines={1}>{formatPrice(change.added, change.addedCurrency)}</Text> : null}
    </View>
  );
  // On a wide screen everything is on one line. On a phone-sized screen the card's picture and text take the
  // left and the prices the right, and the copies bar goes on its own line under the text, so the card's
  // name isn't squeezed into the little room left between the bar and the prices.
  const rowStyle = [styles.row, { borderBottomColor: border }, highlighted && { backgroundColor: `${colors.accent}2e` }];
  if (narrow) {
    return (
      <View style={[rowStyle, styles.rowNarrow]}>
        <View style={styles.rowTop}>
          {mainPart}
          {pricesPart}
        </View>
        <View style={styles.barUnder}>{copiesPart}</View>
      </View>
    );
  }
  return (
    <View style={rowStyle}>
      {mainPart}
      {copiesPart}
      {pricesPart}
    </View>
  );
});

/* ---------------------------------------------------------------------
   ONE PICTURE IN THE GRID
   --------------------------------------------------------------------- */
const GridTile = memo(function GridTile({ entry, onPick, onCopies, size, highlighted, missing, banned, gold }: {
  entry: CardEntry; onPick: (key: string) => void; onCopies: (key: string, step: number) => void; size: number;
  highlighted: boolean;                // just added: outlined for a moment
  missing: false | 'card' | 'printing';   // a deck: not in your binders (solid red border) or not that printing (dashed)
  banned: boolean;                     // banned in the deck's format: black "BANNED" slash
  gold: boolean;                       // a Game Changer: yellow border
}) {
  const colors = useColors();
  const { card, key } = entry;
  const count = cardCount(card);
  return (
    <View style={[{ width: size }, highlighted && { borderRadius: 8, boxShadow: `0px 0px 0px 3px ${colors.accent}` }]}>
      {/* The picture: tap it for the card's menu */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${card.name}${card.foil ? ', foil' : ''}${gold ? ', Game Changer' : ''}, ${count} ${count === 1 ? 'copy' : 'copies'}. Opens its menu.`}
        onPress={() => onPick(key)}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <FoilFrame foil={card.foil === true} width={size} height={Math.round(size * CARD_RATIO)} radius={6} border={3}>
          <Image source={pictureSource(card.image)} style={styles.thumbPicture} contentFit="cover" />
        </FoilFrame>
        {banned && <BannedSlash radius={6} />}
        {gold && <MissingOutline radius={6} width={3} yellow />}
        {missing && <MissingOutline radius={6} width={3} dashed={missing === 'printing'} inset={gold ? 3 : 0} />}
        {gold && <GameChangerBadge size={Math.max(8, Math.round(size * 0.1))} lift={26} />}
      </Pressable>

      {/* The "− 3 +" bar along the bottom of the card: how many copies you
          own (a bar laid over the card, the same as in a binder pocket) */}
      <CopiesBar name={card.name} count={count} style={styles.tileBar}
                 onFewer={() => onCopies(key, -1)} onMore={() => onCopies(key, 1)} />
    </View>
  );
});

// The look: rows with a thin line under each, and grid tiles with a tag
const styles = StyleSheet.create({
  // A card's name with its small gold "GC" tag after it (a Game Changer)
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nameText: { flexShrink: 1 },
  gcTag: { color: '#1a1206', fontSize: 10, fontWeight: '800', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, overflow: 'hidden' },
  // The view around the list and grid (it catches the two-finger pinch)
  fill: { flex: 1, overflow: 'hidden' },
  // The zoom level number in the middle of the screen while pinching
  levelBox: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  levelText: { fontSize: 34, fontWeight: '800', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 14, borderWidth: 1, overflow: 'hidden', opacity: 0.92 },
  // The dashed outline shown while pinching
  outline: { position: 'absolute', borderWidth: 2, borderStyle: 'dashed', borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  outlineText: { fontSize: 12, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  // A row of grid pictures, side by side
  gridRow: { flexDirection: 'row', gap: GRID_GAP },
  content: { paddingHorizontal: SPACE.l, paddingTop: SPACE.s, paddingBottom: 90, flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  // The part of a line you tap for the menu: the picture and the name
  rowMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: SPACE.m },
  thumbPicture: { width: '100%', height: '100%' },
  rowText: { flex: 1, minWidth: 0 },
  // The three lines are packed a little tighter (not smaller) so they fit
  // beside the picture without making the row taller
  name: { fontSize: 15, fontWeight: '600', lineHeight: 17 },
  aboutRow: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 15 },
  about: { fontSize: 12, lineHeight: 15, flexShrink: 1 },
  setIcon: { width: 13, height: 13 },
  type: { fontSize: 12, lineHeight: 15 },
  rowBar: { width: 84 },
  // The phone-sized List row: picture, text and prices on top, the copies bar under the text (lined up with it)
  rowNarrow: { flexDirection: 'column', alignItems: 'stretch', gap: 6 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m },
  barUnder: { paddingLeft: 34 + SPACE.m },
  // The three price lines stacked, right-aligned; wide enough for a percent like "+1234.56%"
  priceBox: { width: 76, alignItems: 'flex-end', justifyContent: 'center' },
  price: { textAlign: 'right', fontSize: 13, lineHeight: 15, fontVariant: ['tabular-nums'] },
  summary: { fontSize: 13, paddingBottom: SPACE.s, paddingTop: 2 },
  pressed: { opacity: 0.6 },
  // A grid tile's bar sits over the bottom of the card
  tileBar: { position: 'absolute', left: 4, right: 4, bottom: 4 },
});
