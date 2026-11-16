/* =====================================================================
   A PRISM SET: THE CHANGES TAB
   What to do to the sleeves after a deck changed. The set remembers what is
   really painted on each copy of each card. When a card is added to a deck
   (a mark to paint), taken out of one, or a deck leaves the set (marks to
   clear), it's listed here under the deck, so only the sleeves that need
   touching are touched. Tap Done on a line once it's done.
   Only cards that have been painted at least once are listed here: a card
   never marked is simply still to do on the Mark tab.
   Wet paint wipes off; dry paint means replacing the inner sleeve.
   ===================================================================== */

import { StyleSheet, Text, View } from 'react-native';
import Button from '@/components/Button';
import DeckSquare from './DeckSquare';
import { useColors } from '@/hooks/useTheme';
import { RADIUS } from '@/theme/colors';
import { paintedOn, type Change } from '@/lib/prismPlan';
import { setPainted, type PrismSet } from '@/lib/prismStorage';
import type { Deck } from '@/lib/deckStorage';

type Props = {
  set: PrismSet;
  decks: Deck[];
  changes: Change[];
  onChanged: () => void;
};

export default function ChangesTab({ set, decks, changes, onChanged }: Props) {
  const colors = useColors();

  // The changes grouped by deck (a deck no longer in the set is its own group)
  const groups = new Map<string, Change[]>();
  for (const change of changes) groups.set(change.deckId, [...(groups.get(change.deckId) ?? []), change]);

  // Tap Done: note that this mark is now painted (or cleared)
  function done(change: Change) {
    const now = paintedOn(set, change.key, change.copy);
    setPainted(set.id, change.key, change.name, change.copy,
      change.kind === 'add' ? [...now, change.deckId] : now.filter((id) => id !== change.deckId));
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
      {[...groups.entries()].map(([deckId, items]) => {
        const member = set.decks.find((d) => d.deckId === deckId);
        const deck = decks.find((d) => d.id === deckId);
        return (
          <View key={deckId} style={[styles.group, { backgroundColor: colors.surface }]}>
            <View style={styles.groupHead}>
              {member ? <DeckSquare slot={member.slot} size={22} /> : null}
              <Text style={[styles.groupName, { color: colors.text }]} numberOfLines={1}>
                {deck?.name ?? 'A deck that left the set'}{member ? '' : ' (marks to clear)'}
              </Text>
            </View>
            {items.map((change) => (
              <View key={`${change.kind}-${change.key}-${change.copy}`} style={[styles.item, { borderTopColor: colors.border }]}>
                <Text style={[styles.sign, { color: change.kind === 'add' ? colors.accent : colors.error }]}>{change.kind === 'add' ? '+' : '−'}</Text>
                <View style={styles.itemText}>
                  <Text style={[styles.itemName, { color: colors.text }]}>
                    {change.name}{change.copy > 0 || (set.painted[change.key]?.length ?? 0) > 1 ? ` (copy ${change.copy + 1})` : ''}
                  </Text>
                  <Text style={[styles.text, { color: colors.muted }]}>
                    {change.kind === 'add' ? 'Paint' : 'Clear'} {member ? `slot ${member.slot}` : 'this deck\'s mark'}
                  </Text>
                  {change.sleeveTip && <Text style={[styles.tip, { backgroundColor: `${colors.accent}22`, color: colors.text }]}>{change.sleeveTip}</Text>}
                </View>
                <Button label="Done" kind="secondary" onPress={() => done(change)} />
              </View>
            ))}
          </View>
        );
      })}
      <Text style={[styles.text, { color: colors.muted }]}>Wet paint wipes off. Dry paint: put the card in a fresh inner sleeve and mark it again.</Text>
    </View>
  );
}

// The look: one box per deck, a line for each change
const styles = StyleSheet.create({
  wrap: { gap: 10 },
  text: { fontSize: 13 },
  none: { alignItems: 'center', gap: 6, padding: 24, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: RADIUS * 1.4 },
  noneTitle: { fontSize: 18, fontWeight: '700' },
  group: { borderRadius: RADIUS, padding: 12, gap: 6 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupName: { flex: 1, fontSize: 15, fontWeight: '700' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  sign: { fontSize: 22, fontWeight: '800', width: 18, textAlign: 'center' },
  itemText: { flex: 1, gap: 2 },
  itemName: { fontSize: 14, fontWeight: '700' },
  tip: { fontSize: 12.5, borderRadius: 8, padding: 6, overflow: 'hidden' },
});
