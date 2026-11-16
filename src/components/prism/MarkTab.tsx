/* =====================================================================
   A PRISM SET: THE MARK TAB
   Marking the sleeves, one copy of a card at a time. The copies still to
   paint come in order (shared cards first), and the one showing says what to
   paint: a large picture of the card with the marks drawn along its edge
   (CardMarks), the "Marked" button right under it, the list of marks, and
   the flat drawing of the sleeve edge. "Marked" notes that it's painted (and moves
   on); "Skip" puts it at the back of the line. A card that's already painted
   (opened from the Cards tab) can be noted as not painted.
   "Copy the undone list" puts the copies still to paint on the clipboard, as
   text, to take to the table. What's noted is saved on the device as you go,
   so you can stop and come back.
   ===================================================================== */

import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Button from '@/components/Button';
import DeckSquare from './DeckSquare';
import SleeveEdge from './SleeveEdge';
import CardMarks from './CardMarks';
import { useColors } from '@/hooks/useTheme';
import { RADIUS } from '@/theme/colors';
import { copyIsDone, sleeveTipFor, undoneCopies, undoneText, type Change, type PlanCard } from '@/lib/prismPlan';
import { setPainted, type PrismSet } from '@/lib/prismStorage';
import type { Deck } from '@/lib/deckStorage';
import { showMessage } from '@/lib/dialogs';

type Props = {
  set: PrismSet;
  plan: PlanCard[];
  decks: Deck[];
  changes: Change[];
  selected: { key: string; copy: number } | null;    // a card opened from the Cards tab
  onChanged: () => void;                              // something was noted: read the set again
};

export default function MarkTab({ set, plan, decks, changes, selected, onChanged }: Props) {
  const colors = useColors();
  // Copies put at the back of the line for now (not remembered)
  const [skipped, setSkipped] = useState<string[]>([]);

  const slotOf = (deckId: string): number | null => set.decks.find((d) => d.deckId === deckId)?.slot ?? null;
  const total = plan.reduce((sum, card) => sum + card.copies, 0);

  // The copies still to paint, with the skipped ones last
  const undone = useMemo(() => {
    const all = undoneCopies(set, plan);
    const id = (u: { card: PlanCard; copy: number }) => `${u.card.key}#${u.copy}`;
    return [...all.filter((u) => !skipped.includes(id(u))), ...all.filter((u) => skipped.includes(id(u)))];
  }, [set, plan, skipped]);

  // The copy showing: the card opened from the Cards tab (its first unpainted
  // copy, or its first copy), otherwise the front of the line
  const current = useMemo(() => {
    if (selected) {
      const card = plan.find((c) => c.key === selected.key);
      if (card) {
        const copy = undone.find((u) => u.card.key === card.key)?.copy ?? 0;
        return { card, copy };
      }
    }
    return undone[0] ?? null;
  }, [selected, plan, undone]);

  if (plan.length === 0) {
    return <Text style={[styles.empty, { color: colors.muted }]}>Nothing to mark yet. Put some Commander decks in this set on the Decks tab.</Text>;
  }

  const doneCount = total - undoneCopies(set, plan).length;
  const required = current ? current.card.required[current.copy] ?? [] : [];
  const slots = required.map(slotOf).filter((s): s is number => s !== null);
  const isDone = current ? copyIsDone(set, current.card, current.copy) : false;
  const tip = current && !isDone ? sleeveTipFor(set, plan, changes, current.card.key, current.copy) : null;

  function note(painted: boolean) {
    if (!current) return;
    setPainted(set.id, current.card.key, current.card.name, current.copy, painted ? required : []);
    setSkipped((s) => s.filter((id) => id !== `${current.card.key}#${current.copy}`));
    onChanged();
  }
  function skip() {
    if (current) setSkipped((s) => [...s, `${current.card.key}#${current.copy}`]);
  }
  async function copyList() {
    try {
      await Clipboard.setStringAsync(undoneText(undoneCopies(set, plan), slotOf));
      showMessage('Copied', 'The cards still to paint, with their slots, are on your clipboard.');
    } catch (err) {
      showMessage('Couldn\'t copy', (err as Error).message);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.line, { color: colors.muted }]}>
        <Text style={{ color: colors.text, fontWeight: '700' }}>{doneCount}</Text> of <Text style={{ color: colors.text, fontWeight: '700' }}>{total}</Text> copies painted
        {undone.length > 0 ? ' · shared cards come first' : ''}
      </Text>
      <View style={[styles.bar, { backgroundColor: colors.surfaceHover }]}>
        <View style={[styles.barFill, { backgroundColor: colors.accent, width: `${total ? Math.round((doneCount / total) * 100) : 0}%` }]} />
      </View>

      {!current || (undone.length === 0 && !selected) ? (
        <View style={[styles.done, { borderColor: colors.border }]}>
          <Text style={[styles.doneTitle, { color: colors.text }]}>Everything is painted ✓</Text>
          <Text style={[styles.line, { color: colors.muted, textAlign: 'center' }]}>If you change a deck, the Changes tab says which sleeves need touching.</Text>
        </View>
      ) : (
        <View style={[styles.current, { backgroundColor: colors.surface }]}>
          <View style={styles.head}>
            <Text style={[styles.name, { color: colors.text }]}>{current.card.name}</Text>
            <Text style={[styles.line, { color: colors.muted }]}>
              {current.card.copies > 1 ? `Copy ${current.copy + 1} of ${current.card.copies} · ` : ''}
              {isDone ? 'painted ✓' : `paint ${slots.length} ${slots.length === 1 ? 'mark' : 'marks'} on its inner sleeve`}
            </Text>
          </View>

          {/* The big card with its marks, and the button right under it */}
          <CardMarks image={current.card.sample.image} marks={slots.map((slot) => ({ slot, kind: 'paint' as const }))} corner={set.corner} />

          <View style={styles.buttons}>
            {isDone ? (
              <Button label="Not painted" kind="secondary" onPress={() => note(false)} />
            ) : (
              <>
                {undone.length > 1 && <Button label="Skip" kind="secondary" onPress={skip} />}
                <Button label="Marked ✓" onPress={() => note(true)} />
              </>
            )}
          </View>

          <View style={styles.marks}>
            {/* The decks to paint, lowest slot number first */}
            {[...required].sort((a, b) => (slotOf(a) ?? 99) - (slotOf(b) ?? 99)).map((deckId) => {
              const slot = slotOf(deckId);
              const deck = decks.find((d) => d.id === deckId);
              return slot === null ? null : (
                <View key={deckId} style={styles.mark}>
                  <DeckSquare slot={slot} size={24} />
                  <Text style={[styles.markName, { color: colors.text }]} numberOfLines={1}>{deck?.name ?? 'A deck'}</Text>
                  <Text style={[styles.markSlot, { color: colors.muted }]}>slot {slot}</Text>
                </View>
              );
            })}
          </View>

          <SleeveEdge slots={slots} corner={set.corner} />

          {tip && <Text style={[styles.tip, { backgroundColor: `${colors.accent}22`, color: colors.text }]}>{tip}</Text>}
        </View>
      )}

      {undone.length > 0 && <Button label="Copy the undone list" icon="copy-outline" kind="secondary" onPress={copyList} />}
    </View>
  );
}

// The look: the progress line and bar, then the card to paint in a rounded box
const styles = StyleSheet.create({
  wrap: { gap: 10 },
  empty: { fontSize: 14, textAlign: 'center', paddingVertical: 24 },
  line: { fontSize: 13 },
  bar: { height: 8, borderRadius: 99, overflow: 'hidden' },
  barFill: { height: '100%' },
  done: { alignItems: 'center', gap: 6, padding: 24, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: RADIUS * 1.4 },
  doneTitle: { fontSize: 18, fontWeight: '700' },
  current: { borderRadius: RADIUS * 1.2, padding: 12, gap: 12 },
  head: { gap: 2 },
  name: { fontSize: 17, fontWeight: '800' },
  marks: { gap: 6 },
  mark: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  markName: { flex: 1, fontSize: 14 },
  markSlot: { fontSize: 12 },
  tip: { fontSize: 13, borderRadius: 8, padding: 8, overflow: 'hidden' },
  buttons: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
});
