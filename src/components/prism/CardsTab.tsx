/* =====================================================================
   A PRISM SET: THE CARDS TAB
   Every card the set's decks use, once each. For each: its picture, its
   name, how many physical copies are needed and how many you own, a small
   square for every deck that uses it (with that deck's slot number), and
   whether it's shared (POOL: two or more decks) or used by one deck (CORE).
   The picture has a red border when you don't own enough copies: solid when
   you own none, dashed when you own some. A check mark says every copy is
   painted. Tap a card to go and mark it.
   A search box and four buttons narrow the list: All, Shared, One deck, To buy.
   (What's typed and the button chosen are kept by the screen, so they're still
   there when you come back to this tab with the back arrow.) The rows are
   laid out all at once, not in a scrolling list of their own, so the page can
   return to exactly where you were scrolled.
   ===================================================================== */

import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import TextField from '@/components/TextField';
import DeckSquare from './DeckSquare';
import { useColors } from '@/hooks/useTheme';
import { pictureSource } from '@/lib/http';
import { RADIUS } from '@/theme/colors';
import type { OwnedMap } from '@/lib/deckOwnership';
import { copyIsDone, type PlanCard } from '@/lib/prismPlan';
import type { PrismSet } from '@/lib/prismStorage';

type Props = {
  set: PrismSet;
  plan: PlanCard[];
  owned: OwnedMap;
  header: string;                       // the totals line shown above the cards
  text: string;                         // what's typed in the search box
  onText: (text: string) => void;
  filter: FilterId;                     // which button is chosen
  onFilter: (filter: FilterId) => void;
  onOpenCard: (key: string) => void;    // a card was tapped: go and mark it
};

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'shared', label: 'Shared' },
  { id: 'single', label: 'One deck' },
  { id: 'buy', label: 'To buy' },
] as const;
export type FilterId = (typeof FILTERS)[number]['id'];

// How many of this card you own (any printing)
export function ownedTotal(owned: OwnedMap, key: string): number {
  return (owned.get(key) ?? []).reduce((sum, print) => sum + print.count, 0);
}

export default function CardsTab({ set, plan, owned, header, text, onText, filter, onFilter, onOpenCard }: Props) {
  const colors = useColors();

  const shown = useMemo(() => {
    const typed = text.trim().toLowerCase();
    return plan.filter((card) => {
      if (typed && !card.key.includes(typed)) return false;
      if (filter === 'shared') return card.pool;
      if (filter === 'single') return !card.pool;
      if (filter === 'buy') return ownedTotal(owned, card.key) < card.copies;
      return true;
    });
  }, [plan, owned, text, filter]);

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
      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <Pressable key={f.id} accessibilityRole="radio" accessibilityState={{ selected: filter === f.id }} onPress={() => onFilter(f.id)}
                     style={[styles.chip, { borderColor: filter === f.id ? colors.accent : colors.border, backgroundColor: filter === f.id ? colors.accent : 'transparent' }]}>
            <Text style={[styles.chipText, { color: filter === f.id ? colors.bg : colors.text }]}>{f.label}</Text>
          </Pressable>
        ))}
      </View>

      {plan.length === 0 ? (
        <Text style={[styles.empty, { color: colors.muted }]}>No cards yet. Put some Commander decks in this set on the Decks tab.</Text>
      ) : shown.length === 0 ? (
        <Text style={[styles.empty, { color: colors.muted }]}>No cards match.</Text>
      ) : (
        <View>
          {shown.map((card) => (
            <CardRow key={card.key} set={set} card={card} have={ownedTotal(owned, card.key)} onOpen={onOpenCard} />
          ))}
        </View>
      )}
    </View>
  );
}

// One card
const CardRow = memo(function CardRow({ set, card, have, onOpen }: { set: PrismSet; card: PlanCard; have: number; onOpen: (key: string) => void }) {
  const colors = useColors();
  const need = card.copies;
  const done = Array.from({ length: need }, (_, copy) => copyIsDone(set, card, copy)).every(Boolean);
  const border = have >= need ? undefined : have === 0 ? 'solid' : 'dashed';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${card.name}, ${card.pool ? 'shared' : 'one deck'}, ${need} ${need === 1 ? 'copy' : 'copies'} needed, you own ${have}${done ? ', painted' : ''}. Opens it to mark.`}
      onPress={() => onOpen(card.key)}
      style={({ pressed }) => [styles.card, { borderBottomColor: colors.border }, pressed && { backgroundColor: colors.surfaceHover }]}
    >
      <View>
        <Image source={pictureSource(card.sample.image)} style={styles.thumb} contentFit="cover" />
        {border && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderWidth: 2, borderStyle: border, borderColor: colors.error, borderRadius: 4 }]} />}
      </View>
      <View style={styles.cardText}>
        <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>{card.name}{need > 1 ? ` ×${need}` : ''}</Text>
        <Text style={[styles.cardSub, { color: have >= need ? colors.muted : colors.error }]} numberOfLines={1}>
          You own {have} of {need}{done ? ' · painted ✓' : ''}
        </Text>
        <View style={styles.squares}>
          {card.deckNeeds.map(({ deckId }) => {
            const slot = set.decks.find((d) => d.deckId === deckId)?.slot;
            return slot === undefined ? null : <DeckSquare key={deckId} slot={slot} size={19} />;
          })}
        </View>
      </View>
      <View style={[styles.tag, { backgroundColor: card.pool ? `${colors.accent}33` : colors.surfaceHover }]}>
        <Text style={[styles.tagText, { color: card.pool ? colors.accent : colors.muted }]}>{card.pool ? 'POOL' : 'CORE'}</Text>
      </View>
    </Pressable>
  );
});

// The look: a search box and buttons on top, then rows with a thin line under each
const styles = StyleSheet.create({
  wrap: { gap: 10 },
  header: { fontSize: 13 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1.5 },
  chipText: { fontSize: 13, fontWeight: '600' },
  empty: { fontSize: 14, textAlign: 'center', paddingVertical: 24 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS - 4 },
  thumb: { width: 34, height: 48, borderRadius: 4 },
  cardText: { flex: 1, gap: 2, minWidth: 0 },
  cardName: { fontSize: 15, fontWeight: '700' },
  cardSub: { fontSize: 12.5 },
  squares: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginTop: 3 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  tagText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6 },
});
