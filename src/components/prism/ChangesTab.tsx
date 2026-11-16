/* =====================================================================
   A PRISM SET: THE CHANGES TAB
   What to do to the sleeves after a deck changed. The set remembers what is
   really painted on each copy of each card. When a card is added to a deck
   (a mark to paint), taken out of one, or a deck leaves the set (marks to
   clear), it's listed here, so only the sleeves that need touching are touched.
   There is one row for each physical card (a card with both a mark to scrape
   off and a mark to paint is one row, since it's one sleeve in your hand). Each
   row shows a small picture of the card with its marks along the edges:
   marks that stay are dimmed, marks to scrape off are dashed outlines with a −,
   marks to paint are solid with a +. Tap a row to see the card larger. Done
   notes that the sleeve now has exactly the marks it should.
   Three buttons narrow the list: All, Scrape off, Paint. Rows with something
   to scrape off come first (the messy job), then A to Z.
   Only cards that have been painted at least once are listed here: a card
   never marked is simply still to do on the Mark tab.
   Wet paint wipes off; dry paint means replacing the inner sleeve.
   ===================================================================== */

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Button from '@/components/Button';
import CardMarks, { type CardMark } from './CardMarks';
import { useColors } from '@/hooks/useTheme';
import { RADIUS } from '@/theme/colors';
import { paintedOn, type Change, type PlanCard } from '@/lib/prismPlan';
import { setPainted, type PrismSet } from '@/lib/prismStorage';
import type { Deck } from '@/lib/deckStorage';

type Props = {
  set: PrismSet;
  plan: PlanCard[];
  decks: Deck[];
  changes: Change[];
  onChanged: () => void;
};

// One sleeve to touch up: a copy of a card, with everything that changed on it
type Item = {
  id: string;
  key: string;
  name: string;
  copy: number;
  image: string | null;       // the card's picture (null: no deck has it any more)
  wanted: string[];           // the decks whose marks it should carry
  marks: CardMark[];          // the marks to draw
  removeSlots: number[];      // marks to scrape off
  addSlots: number[];         // marks to paint
  unplaced: number;           // marks to scrape off for a deck that left the set (no slot to draw)
  outDecks: string[];         // names of the decks whose marks leave
  inDecks: string[];          // names of the decks whose marks arrive
  tip?: string;               // a sleeve this card could move into
  leaving: boolean;           // no deck uses this card any more
};

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'remove', label: 'Scrape off' },
  { id: 'add', label: 'Paint' },
] as const;
type FilterId = (typeof FILTERS)[number]['id'];

export default function ChangesTab({ set, plan, decks, changes, onChanged }: Props) {
  const colors = useColors();
  const [filter, setFilter] = useState<FilterId>('all');
  // The row opened to its large card (its id), if any
  const [open, setOpen] = useState<string | null>(null);

  const slotOf = (deckId: string): number | null => set.decks.find((d) => d.deckId === deckId)?.slot ?? null;
  const deckName = (deckId: string): string => decks.find((d) => d.id === deckId)?.name ?? 'A deck that left the set';

  // The changes gathered by sleeve, then worked out into what to draw
  const byId = new Map<string, Change[]>();
  for (const change of changes) {
    const id = `${change.key}#${change.copy}`;
    byId.set(id, [...(byId.get(id) ?? []), change]);
  }
  const items: Item[] = [...byId.entries()].map(([id, list]) => {
    const { key, name, copy } = list[0];
    const card = plan.find((c) => c.key === key);
    const wanted = card?.required[copy] ?? [];
    const painted = paintedOn(set, key, copy);
    const marks: CardMark[] = [];
    const addSlots: number[] = [];
    const removeSlots: number[] = [];
    let unplaced = 0;
    for (const deckId of new Set([...wanted, ...painted])) {
      const slot = slotOf(deckId);
      const kind = wanted.includes(deckId) ? (painted.includes(deckId) ? 'keep' : 'add') : 'remove';
      if (slot === null) { if (kind === 'remove') unplaced++; continue; }
      marks.push({ slot, kind });
      if (kind === 'add') addSlots.push(slot);
      if (kind === 'remove') removeSlots.push(slot);
    }
    return {
      id, key, name, copy, wanted, marks, unplaced,
      image: card?.sample.image ?? null,
      addSlots: addSlots.sort((a, b) => a - b),
      removeSlots: removeSlots.sort((a, b) => a - b),
      outDecks: list.filter((c) => c.kind === 'clear').map((c) => deckName(c.deckId)),
      inDecks: list.filter((c) => c.kind === 'add').map((c) => deckName(c.deckId)),
      tip: list.find((c) => c.sleeveTip)?.sleeveTip,
      leaving: wanted.length === 0,
    };
  });

  // How many rows each button would show, and the rows to show: scrape-offs
  // first, then A to Z
  const hasRemove = (item: Item) => item.removeSlots.length > 0 || item.unplaced > 0;
  const hasAdd = (item: Item) => item.addSlots.length > 0;
  const counts = { all: items.length, remove: items.filter(hasRemove).length, add: items.filter(hasAdd).length };
  const shown = items
    .filter((item) => (filter === 'remove' ? hasRemove(item) : filter === 'add' ? hasAdd(item) : true))
    .sort((a, b) => Number(hasRemove(b)) - Number(hasRemove(a)) || a.name.localeCompare(b.name));

  // Tap Done: the sleeve now has exactly the marks it should
  function done(item: Item) {
    setPainted(set.id, item.key, item.name, item.copy, item.wanted);
    if (open === item.id) setOpen(null);
    onChanged();
  }

  if (changes.length === 0) {
    return (
      <View style={[styles.none, { borderColor: colors.border }]}>
        <Text style={[styles.noneTitle, { color: colors.text }]}>Nothing has changed</Text>
        <Text style={[styles.text, { color: colors.muted, textAlign: 'center' }]}>
          When you change a deck after marking its cards, the sleeves that need touching are listed here.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.text, { color: colors.muted }]}>You changed a deck after marking. These are the only sleeves that need touching.</Text>

      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <Pressable key={f.id} accessibilityRole="radio" accessibilityState={{ selected: filter === f.id }} onPress={() => setFilter(f.id)}
                     style={[styles.chip, { borderColor: filter === f.id ? colors.accent : colors.border, backgroundColor: filter === f.id ? colors.accent : 'transparent' }]}>
            <Text style={[styles.chipText, { color: filter === f.id ? colors.bg : colors.text }]}>{f.label} {counts[f.id]}</Text>
          </Pressable>
        ))}
      </View>

      {/* What the marks mean */}
      <View style={styles.legend}>
        <Text style={[styles.legendText, { color: colors.muted }]}>Dimmed: stays</Text>
        <Text style={[styles.legendText, { color: colors.error }]}>− dashed: scrape off</Text>
        <Text style={[styles.legendText, { color: colors.success }]}>+ solid: paint</Text>
      </View>

      <View style={[styles.box, { backgroundColor: colors.surface }]}>
        {shown.map((item, index) => {
          const jobs = [
            item.leaving ? 'Take out of PRISM' : '',
            !item.leaving && (item.removeSlots.length > 0 || item.unplaced > 0)
              ? `Scrape off ${[...item.removeSlots.map(String), ...(item.unplaced > 0 ? [`${item.unplaced} from a deck that left`] : [])].join(', ')}` : '',
            item.addSlots.length > 0 ? `${item.removeSlots.length > 0 ? 'paint' : 'Paint'} ${item.addSlots.join(', ')}` : '',
          ].filter(Boolean);
          const showCopy = item.copy > 0 || (set.painted[item.key]?.length ?? 0) > 1;
          const decksLine = [
            item.outDecks.length > 0 ? `${item.outDecks.join(', ')} out` : '',
            item.inDecks.length > 0 ? `${item.inDecks.join(', ')} in` : '',
          ].filter(Boolean).join(' · ');
          return (
            <View key={item.id} style={[styles.item, index > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 }]}>
              <View style={styles.row}>
                {/* The picture and the words are tapped to see the card larger; Done is its own button beside them */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name}${showCopy ? `, copy ${item.copy + 1}` : ''}. ${jobs.join(', ')}. Shows the card larger.`}
                  onPress={() => setOpen(open === item.id ? null : item.id)}
                  style={styles.tap}
                >
                <CardMarks image={item.image} marks={item.marks} corner={set.corner} width={80} />
                <View style={styles.itemText}>
                  <Text style={[styles.itemName, { color: colors.text }]}>
                    {item.name}{showCopy ? ` (copy ${item.copy + 1})` : ''}
                  </Text>
                  <Text style={[styles.job, { color: hasRemove(item) ? colors.error : colors.success }]}>{jobs.join(' · ')}</Text>
                  {decksLine !== '' && <Text style={[styles.text, { color: colors.muted }]} numberOfLines={2}>{decksLine}</Text>}
                  {item.tip && <Text style={[styles.tip, { backgroundColor: `${colors.accent}22`, color: colors.text }]}>{item.tip}</Text>}
                </View>
                </Pressable>
                <Button label="Done" kind="secondary" onPress={() => done(item)} />
              </View>
              {/* The large card, when the row is tapped */}
              {open === item.id && <CardMarks image={item.image} marks={item.marks} corner={set.corner} />}
            </View>
          );
        })}
      </View>
      <Text style={[styles.text, { color: colors.muted }]}>Wet paint wipes off. Dry paint: put the card in a fresh inner sleeve and mark it again.</Text>
    </View>
  );
}

// The look: one box holding a row for each sleeve
const styles = StyleSheet.create({
  wrap: { gap: 10 },
  text: { fontSize: 13 },
  none: { alignItems: 'center', gap: 6, padding: 24, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: RADIUS * 1.4 },
  noneTitle: { fontSize: 18, fontWeight: '700' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1.5 },
  chipText: { fontSize: 13, fontWeight: '600' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 2 },
  legendText: { fontSize: 12 },
  box: { borderRadius: RADIUS, padding: 12, gap: 10 },
  item: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  itemText: { flex: 1, gap: 3, minWidth: 0 },
  itemName: { fontSize: 14.5, fontWeight: '700' },
  job: { fontSize: 13, fontWeight: '600' },
  tip: { fontSize: 12.5, borderRadius: 8, padding: 6, overflow: 'hidden' },
});
