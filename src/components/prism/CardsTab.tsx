/* =====================================================================
   A PRISM SET: THE CARDS TAB
   Every card the set's decks use, once each. For each: its picture, its
   name, how many physical copies are needed and how many you own, a small
   square for every deck that uses it (with that deck's slot number), and
   whether it's shared (POOL: two or more decks) or used by one deck (CORE).
   The picture has a red border when you don't own enough copies: solid when
   you own none, dashed when you own some. A check mark says every copy is
   painted. Tap a card to go and mark it.
   The pin button on a card opens a window to keep it in one deck only: a deck
   that does gets its own copies of it, shown as their own highlighted row (CORE,
   with a filled pin), and no other deck shares them. That's for things like
   a deck's basic lands, or one printing of a card wanted only in its deck.
   A search box and four buttons narrow the list: All, Pool (shared by two or
   more decks), Core (one deck), To Buy. A Sort button beside them orders it:
   "Shared first" (the start: shared cards, then A to Z) or the usual ways
   (name, newest added, color, set, type, rarity, mana value; no price, since a
   card has several printings). PRISM remembers its own sort, separate from
   binders, lists and decks. Under some sorts a header bar goes above each group,
   like everywhere else.
   (What's typed and the button chosen are kept by the screen, so they're still
   there when you come back to this tab with the back arrow.) The rows are
   laid out all at once, not in a scrolling list of their own, so the page can
   return to exactly where you were scrolled.
   ===================================================================== */

import { memo, useMemo, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import TextField from '@/components/TextField';
import SortButton from '@/components/binder/SortButton';
import SortHeaderBar from '@/components/binder/SortHeaderBar';
import { useBinderPrices } from '@/hooks/useBinderPrices';
import type { CardEntry } from '@/components/binder/CardList';
import DeckSquare from './DeckSquare';
import { useColors } from '@/hooks/useTheme';
import { pictureSource } from '@/lib/http';
import { RADIUS } from '@/theme/colors';
import type { OwnedMap } from '@/lib/deckOwnership';
import { copyIsDone, nameKey, type PlanCard } from '@/lib/prismPlan';
import type { PrismSet } from '@/lib/prismStorage';
import type { Deck } from '@/lib/deckStorage';
import { choosePrismSort, onBinderViewChange, prismSort, prismSortReversed, sortHeadersOn } from '@/lib/binderView';
import { PRISM_SORTS, headerFor, sortEntries, type BinderSort, type SortHeader } from '@/lib/binderSort';

type Props = {
  set: PrismSet;
  plan: PlanCard[];
  decks: Deck[];
  owned: OwnedMap;
  header: string;                       // the totals line shown above the cards
  text: string;                         // what's typed in the search box
  onText: (text: string) => void;
  filter: FilterId;                     // which button is chosen
  onFilter: (filter: FilterId) => void;
  onOpenCard: (key: string) => void;    // a card was tapped: go and mark it
  onPin: (name: string) => void;        // a pin was tapped: open the window for this card name (lowercase)
};

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'shared', label: 'Pool' },
  { id: 'single', label: 'Core' },
  { id: 'buy', label: 'To Buy' },
] as const;
export type FilterId = (typeof FILTERS)[number]['id'];

// How many of this card you own (any printing)
export function ownedTotal(owned: OwnedMap, key: string): number {
  return (owned.get(key) ?? []).reduce((sum, print) => sum + print.count, 0);
}

// How many copies you own for each row. A card kept in one deck takes its
// copies first (one printing's first, then any printing), and what's left is
// what the shared row owns, so the same copy is never counted twice.
function ownedByRow(plan: PlanCard[], owned: OwnedMap): Map<string, number> {
  const have = new Map<string, number>();
  const left = new Map<string, Map<string, number>>();
  const leftFor = (name: string) => {
    let prints = left.get(name);
    if (!prints) {
      prints = new Map((owned.get(name) ?? []).map((p) => [p.key, p.count]));
      left.set(name, prints);
    }
    return prints;
  };
  const rank = (card: PlanCard) => (card.pin?.print ? 0 : card.pin ? 1 : 2);
  for (const card of [...plan].sort((a, b) => rank(a) - rank(b))) {
    const prints = leftFor(nameKey(card.name));
    if (card.pin?.print) {
      const here = Math.min(card.copies, prints.get(card.pin.print) ?? 0);
      prints.set(card.pin.print, (prints.get(card.pin.print) ?? 0) - here);
      have.set(card.key, here);
    } else if (card.pin) {
      let want = card.copies;
      for (const [print, count] of prints) {
        const take = Math.min(want, count);
        prints.set(print, count - take);
        want -= take;
      }
      have.set(card.key, card.copies - want);
    } else {
      have.set(card.key, [...prints.values()].reduce((sum, n) => sum + n, 0));
    }
  }
  return have;
}

export default function CardsTab({ set, plan, decks, owned, header, text, onText, filter, onFilter, onOpenCard, onPin }: Props) {
  const colors = useColors();
  const haves = useMemo(() => ownedByRow(plan, owned), [plan, owned]);

  // The sort chosen here (PRISM's own, remembered on this device), and whether
  // the header bars between groups are on
  const sort = useSyncExternalStore(onBinderViewChange, prismSort, prismSort);
  const reversed = useSyncExternalStore(onBinderViewChange, prismSortReversed, prismSortReversed);
  const headersOn = useSyncExternalStore(onBinderViewChange, sortHeadersOn, sortHeadersOn);
  // The cards' details from Scryfall, which the color, set, type, rarity and
  // mana value sorts go by (looked up for the whole set, not just what shows)
  const allEntries = useMemo<CardEntry[]>(() => plan.map((card) => ({ key: card.key, card: card.sample })), [plan]);
  const prices = useBinderPrices(allEntries);

  const shown = useMemo(() => {
    const typed = text.trim().toLowerCase();
    const kept = plan.filter((card) => {
      if (typed && !nameKey(card.name).includes(typed)) return false;
      if (filter === 'shared') return card.pool;
      if (filter === 'single') return !card.pool;
      if (filter === 'buy') return (haves.get(card.key) ?? 0) < card.copies;
      return true;
    });
    // "Shared first" is the order the plan already has; the others use the usual sorting
    if (sort === 'shared') return kept;
    const order = new Map(sortEntries(kept.map((card) => ({ key: card.key, card: card.sample })), sort, reversed, { printings: prices.printings })
      .map((entry, index) => [entry.key, index]));
    return [...kept].sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0));
  }, [plan, haves, text, filter, sort, reversed, prices.printings]);

  // The group each card falls under for this sort (none for "Shared first", or
  // when header bars are turned off in Settings)
  function headerOf(card: PlanCard): SortHeader | null {
    return headersOn && sort !== 'shared' ? headerFor({ key: card.key, card: card.sample }, sort as BinderSort, { printings: prices.printings }) : null;
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.header, { color: colors.muted }]}>{header}</Text>
      <TextField
        accessibilityLabel="Search these cards"
        placeholder="Search these cards…"
        value={text}
        onChangeText={onText}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
      />
      <View style={styles.filterRow}>
        <View style={styles.filters}>
          {FILTERS.map((f) => (
            <Pressable key={f.id} accessibilityRole="radio" accessibilityState={{ selected: filter === f.id }} onPress={() => onFilter(f.id)}
                       style={[styles.chip, { borderColor: filter === f.id ? colors.accent : colors.border, backgroundColor: filter === f.id ? colors.accent : 'transparent' }]}>
              <Text style={[styles.chipText, { color: filter === f.id ? colors.bg : colors.text }]}>{f.label}</Text>
            </Pressable>
          ))}
        </View>
        <SortButton sort={sort} reversed={reversed} options={PRISM_SORTS} onChoose={(value) => choosePrismSort(value as typeof sort)} />
      </View>

      {plan.length === 0 ? (
        <Text style={[styles.empty, { color: colors.muted }]}>No cards yet. Put some Commander decks in this set on the Decks tab.</Text>
      ) : shown.length === 0 ? (
        <Text style={[styles.empty, { color: colors.muted }]}>No cards match.</Text>
      ) : (
        <View>
          {shown.map((card, index) => {
            // A header bar goes in wherever the group changes
            const header = headerOf(card);
            const before = index > 0 ? headerOf(shown[index - 1]) : null;
            return (
              <View key={card.key}>
                {header && header.id !== before?.id && <SortHeaderBar header={header} />}
                <CardRow set={set} card={card} have={haves.get(card.key) ?? 0}
                         deckName={card.pin ? decks.find((d) => d.id === card.pin?.deckId)?.name ?? 'a deck' : ''}
                         onOpen={onOpenCard} onPin={onPin} />
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// One card
const CardRow = memo(function CardRow({ set, card, have, deckName, onOpen, onPin }: {
  set: PrismSet; card: PlanCard; have: number; deckName: string; onOpen: (key: string) => void; onPin: (name: string) => void;
}) {
  const colors = useColors();
  const need = card.copies;
  const done = Array.from({ length: need }, (_, copy) => copyIsDone(set, card, copy)).every(Boolean);
  const border = have >= need ? undefined : have === 0 ? 'solid' : 'dashed';
  // A kept card says whose it is, and which printing if just one
  const kept = card.pin ? `Only in ${deckName}${card.pin.print ? ` · ${card.sample.set.toUpperCase()} ${card.sample.number}` : ' · any printing'}` : '';
  return (
    <View style={[styles.card, { borderBottomColor: colors.border }, card.pin && { backgroundColor: `${colors.accent}14` }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${card.name}, ${card.pool ? 'shared' : kept || 'one deck'}, ${need} ${need === 1 ? 'copy' : 'copies'} needed, you own ${have}${done ? ', painted' : ''}. Opens it to mark.`}
        onPress={() => onOpen(card.key)}
        style={({ pressed }) => [styles.open, pressed && { backgroundColor: colors.surfaceHover }]}
      >
        <View>
          <Image source={pictureSource(card.sample.image)} style={styles.thumb} contentFit="cover" />
          {border && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderWidth: 2, borderStyle: border, borderColor: colors.error, borderRadius: 4 }]} />}
        </View>
        <View style={styles.cardText}>
          <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>{card.name}{need > 1 ? ` ×${need}` : ''}</Text>
          {kept !== '' && <Text style={[styles.cardSub, { color: colors.muted }]} numberOfLines={1}>{kept}</Text>}
          <Text style={[styles.cardSub, { color: have >= need ? colors.muted : colors.error }]} numberOfLines={1}>
            You own {have} of {need}{done ? ' · painted ✓' : ''}
          </Text>
          <View style={styles.squares}>
            {/* The decks' squares, lowest slot number first */}
            {[...card.deckNeeds].sort((a, b) => (set.decks.find((d) => d.deckId === a.deckId)?.slot ?? 99) - (set.decks.find((d) => d.deckId === b.deckId)?.slot ?? 99)).map(({ deckId }) => {
              const slot = set.decks.find((d) => d.deckId === deckId)?.slot;
              return slot === undefined ? null : <DeckSquare key={deckId} slot={slot} size={19} />;
            })}
          </View>
        </View>
        <View style={[styles.tag, { backgroundColor: card.pool ? `${colors.accent}33` : colors.surfaceHover }]}>
          <Text style={[styles.tagText, { color: card.pool ? colors.accent : colors.muted }]}>{card.pool ? 'POOL' : 'CORE'}</Text>
        </View>
      </Pressable>
      {/* The pin: keep this card in one deck only */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={card.pin ? `Pinned: ${card.name} is kept in ${deckName}. Change it.` : `Keep ${card.name} in one deck only`}
        onPress={() => onPin(nameKey(card.name))}
        style={[styles.pin, card.pin ? { backgroundColor: colors.accent, borderColor: colors.accent } : { borderColor: colors.border }]}
      >
        <Ionicons name={card.pin ? 'pin' : 'pin-outline'} size={16} color={card.pin ? colors.bg : colors.muted} />
      </Pressable>
    </View>
  );
});

// The look: a search box and buttons on top, then rows with a thin line under each
const styles = StyleSheet.create({
  wrap: { gap: 10 },
  header: { fontSize: 13 },
  filterRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  filters: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1.5 },
  chipText: { fontSize: 13, fontWeight: '600' },
  empty: { fontSize: 14, textAlign: 'center', paddingVertical: 24 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS - 4 },
  open: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 4, borderRadius: RADIUS - 4, minWidth: 0 },
  pin: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  thumb: { width: 34, height: 48, borderRadius: 4 },
  cardText: { flex: 1, gap: 2, minWidth: 0 },
  cardName: { fontSize: 15, fontWeight: '700' },
  cardSub: { fontSize: 12.5 },
  squares: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginTop: 3 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  tagText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6 },
});
