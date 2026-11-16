/* =====================================================================
   A PRISM SET: THE DECKS TAB
   Which decks share their cards in this set. Tick a Commander deck to put it
   in (it gets the lowest free slot and that slot's color); untick it to take
   it out. Tap a deck's slot to give it another one. Only Commander decks can
   be ticked (PRISM is for Commander for now).
   Below the decks: which corner of the sleeve is slot 1, and a button to
   forget everything noted as painted (to start the marking over).
   A deck's slot, and the corner, can't change once something is painted,
   because paint doesn't move.
   A deck that is already in ANOTHER Prism shows an outlined pill under its name
   for each one (its name, and the side and slot its marks use there). Ticking
   such a deck asks first: "Add anyway" always works, and when its marks there
   are all on one side, the window suggests a slot on the opposite side here.
   ===================================================================== */

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import PopupWindow from '@/components/PopupWindow';
import Button from '@/components/Button';
import DeckSquare from './DeckSquare';
import SymbolText from '@/components/SymbolText';
import { useColors } from '@/hooks/useTheme';
import { askYesNo, showMessage } from '@/lib/dialogs';
import { hapticTap } from '@/lib/haptics';
import { RADIUS } from '@/theme/colors';
import { deckFormat } from '@/lib/deckFormats';
import type { Deck } from '@/lib/deckStorage';
import {
  CORNERS, MAX_SLOTS, addDeckToSet, addDeckToSetAt, changePrismSet, deckHasPaint, freeSlot, freeSlotOnSide, loadPrismSets, moveDeckSlot,
  removeDeckFromSet, setCorner, sideOfSlot,
  type PrismSet,
} from '@/lib/prismStorage';
import { cardCountText } from '@/lib/binderStorage';

type Props = {
  set: PrismSet;
  decks: Deck[];            // all your decks
  onChange: () => void;     // something changed: read the set again
};

export default function DecksTab({ set, decks, onChange }: Props) {
  const colors = useColors();
  // The deck whose slot is being picked (its id), or null
  const [picking, setPicking] = useState<string | null>(null);
  // A deck that is already in another Prism and was just ticked (waiting for the answer to "add it here too?")
  const [asking, setAsking] = useState<Deck | null>(null);

  // The OTHER Prisms each deck is in (and its slot there), so the deck can say so
  const otherSets = loadPrismSets().filter((s) => s.id !== set.id);
  const elsewhere = (deckId: string) => otherSets.flatMap((s) => {
    const entry = s.decks.find((d) => d.deckId === deckId);
    return entry ? [{ name: s.name, slot: entry.slot }] : [];
  });

  const painted = Object.keys(set.painted).length > 0;
  const slotOf = (deckId: string) => set.decks.find((d) => d.deckId === deckId)?.slot;
  // In the set first (by slot), then the other Commander decks, then the rest
  const inSet = [...set.decks].sort((a, b) => a.slot - b.slot).map((d) => decks.find((deck) => deck.id === d.deckId)).filter((d): d is Deck => d !== undefined);
  const others = decks.filter((d) => slotOf(d.id) === undefined);
  const ordered = [...inSet, ...others.filter((d) => d.format === 'commander'), ...others.filter((d) => d.format !== 'commander')];

  // Tick or untick a deck
  async function toggle(deck: Deck) {
    if (deck.format !== 'commander') return;
    hapticTap();
    if (slotOf(deck.id) === undefined) {
      if (freeSlot(set) === null) { showMessage('The set is full', `A sleeve edge has ${MAX_SLOTS} slots, so a set holds up to ${MAX_SLOTS} decks.`); return; }
      // Already in another Prism: ask first (it can always go ahead), with a suggestion
      if (elsewhere(deck.id).length > 0) { setAsking(deck); return; }
      addDeckToSet(set.id, deck.id);
    } else {
      if (deckHasPaint(set, deck.id)) {
        const yes = await askYesNo(`Take ${deck.name} out?`,
          'Its marks are already painted on sleeves. They stay there until you clear them (the Changes tab lists them). Its slot is free again, but don\'t give the slot to another deck until those marks are cleared.',
          'Take it out', 'Cancel');
        if (!yes) return;
      }
      removeDeckFromSet(set.id, deck.id);
    }
    onChange();
  }

  function pickSlot(deck: Deck) {
    if (deckHasPaint(set, deck.id)) {
      showMessage('Its marks are painted', `${deck.name} already has marks painted on sleeves, and paint doesn't move, so its slot can't change. Clear its marks first.`);
      return;
    }
    setPicking(deck.id);
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.hint, { color: colors.muted }]}>
        Tick the Commander decks that share cards. Each gets a slot and a color. A slot can't change once its marks are painted.
      </Text>

      {ordered.map((deck) => {
        const slot = slotOf(deck.id);
        const commander = deck.format === 'commander';
        return (
          <View key={deck.id} style={[styles.deck, { backgroundColor: colors.surface, opacity: commander || slot !== undefined ? 1 : 0.55 }]}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: slot !== undefined, disabled: !commander }}
              accessibilityLabel={`${deck.name}${commander ? '' : ', not a Commander deck'}`}
              onPress={() => toggle(deck)}
              style={styles.deckMain}
            >
              <View style={[styles.check, { borderColor: slot !== undefined ? colors.accent : colors.border, backgroundColor: slot !== undefined ? colors.accent : 'transparent' }]}>
                {slot !== undefined && <Text style={[styles.checkMark, { color: colors.bg }]}>✓</Text>}
              </View>
              <View style={styles.deckText}>
                <SymbolText style={[styles.deckName, { color: colors.text }]} numberOfLines={1}>{deck.name}</SymbolText>
                <Text style={[styles.deckSub, { color: colors.muted }]}>
                  {commander ? `${cardCountText(deck.cards.reduce((sum, c) => sum + (c.count ?? 1), 0))} · ${deckFormat(deck.format).name}` : 'Not a Commander deck'}
                </Text>
                {/* One pill for each OTHER Prism this deck is already in, with the side its marks are on there */}
                {elsewhere(deck.id).map((other) => (
                  <View key={other.name + other.slot} style={[styles.pill, { borderColor: colors.accent }]}>
                    <SymbolText inline style={[styles.pillText, { color: colors.text }]} numberOfLines={1}>{`In Prism: ${other.name} · side ${sideOfSlot(other.slot)}, slot ${other.slot}`}</SymbolText>
                  </View>
                ))}
              </View>
            </Pressable>
            {slot !== undefined && (
              <Pressable accessibilityRole="button" accessibilityLabel={`${deck.name} is in slot ${slot}. Change its slot.`} onPress={() => pickSlot(deck)} style={styles.slotButton}>
                <DeckSquare slot={slot} size={26} />
                <Text style={[styles.slotText, { color: colors.muted }]}>Slot {slot}</Text>
              </Pressable>
            )}
          </View>
        );
      })}
      {decks.length === 0 && (
        <Text style={[styles.hint, { color: colors.muted }]}>You have no decks yet. Make a Commander deck on the Decks page, then come back.</Text>
      )}

      {/* Which corner of the sleeve is slot 1 */}
      <View style={[styles.setting, { borderColor: colors.border }]}>
        <View style={styles.settingText}>
          <Text style={[styles.deckName, { color: colors.text }]}>Sleeve corner</Text>
          <Text style={[styles.deckSub, { color: colors.muted }]}>Slot 1 is the {CORNERS[set.corner]} corner{painted ? ' (it can\'t change once paint is noted)' : ''}</Text>
        </View>
        <Button label="Change" kind="secondary" disabled={painted}
                onPress={() => { setCorner(set.id, ((set.corner + 1) % 4) as 0 | 1 | 2 | 3); onChange(); }} />
      </View>

      {/* Start the marking over */}
      {painted && (
        <Button label="Forget what's painted" icon="refresh-outline" kind="secondary" onPress={async () => {
          const yes = await askYesNo('Forget what\'s painted?',
            'The app will stop counting any card as painted, so everything shows as still to do, and slots and the corner can change again. Your sleeves aren\'t touched.',
            'Forget it', 'Cancel');
          if (!yes) return;
          changePrismSet(set.id, (s) => ({ ...s, painted: {}, names: {} }));
          onChange();
        }} />
      )}

      {/* A deck that is already in another Prism: add it here anyway, or (suggested) on the other side of the sleeve */}
      {asking && (() => {
        const others = elsewhere(asking.id);
        // The sides its marks are already on; the suggestion is the side that none of them use
        const used = new Set(others.map((o) => sideOfSlot(o.slot)));
        const opposite = used.size === 1 ? (used.has('A') ? 'B' : 'A') : null;
        const oppositeSlot = opposite ? freeSlotOnSide(set, opposite) : null;
        const names = others.map((o) => o.name).join(' and ');
        const close = () => setAsking(null);
        const add = (slot: number | null) => {
          if (slot === null) addDeckToSet(set.id, asking.id); else addDeckToSetAt(set.id, asking.id, slot);
          close();
          onChange();
        };
        return (
          <PopupWindow title="Already in a Prism" onClose={close}
                       buttons={[
                         { label: 'Cancel', onPress: close, kind: 'secondary' },
                         { label: 'Add anyway', onPress: () => add(null), kind: oppositeSlot === null ? 'primary' : 'secondary' },
                         ...(oppositeSlot !== null && opposite ? [{ label: `Use side ${opposite} (slot ${oppositeSlot})`, onPress: () => add(oppositeSlot) }] : []),
                       ]}>
            <Text style={[styles.hint, { color: colors.text }]}>
              {asking.name} is already in {names}, with its marks on side {[...used].join(' and ')}.
              {opposite && oppositeSlot !== null
                ? ` Suggestion: give it a slot on side ${opposite} here, so its marks here sit on the other side of the sleeve from its marks there.`
                : opposite ? ` Side ${opposite} is full in this set, so it would have to share the same side.` : ' It would have to share a side with marks it already has.'}
            </Text>
          </PopupWindow>
        );
      })()}

      {/* The slot picker */}
      {picking && (
        <PopupWindow title="Choose a slot" onClose={() => setPicking(null)}
                     buttons={[{ label: 'Cancel', onPress: () => setPicking(null), kind: 'secondary' }]}>
          <View style={styles.slotGrid}>
            {Array.from({ length: MAX_SLOTS }, (_, i) => i + 1).map((slot) => {
              const taken = set.decks.some((d) => d.slot === slot);
              const mine = slotOf(picking) === slot;
              return (
                <Pressable
                  key={slot}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: taken && !mine }}
                  accessibilityLabel={`Slot ${slot}${taken && !mine ? ', taken' : ''}`}
                  disabled={taken && !mine}
                  onPress={() => { moveDeckSlot(set.id, picking, slot); setPicking(null); onChange(); }}
                  style={[styles.slotCell, { opacity: taken && !mine ? 0.25 : 1, borderColor: mine ? colors.accent : 'transparent' }]}
                >
                  <DeckSquare slot={slot} size={34} />
                </Pressable>
              );
            })}
          </View>
        </PopupWindow>
      )}
    </View>
  );
}

// The look: a column of deck rows, then the corner setting
const styles = StyleSheet.create({
  wrap: { gap: 10 },
  hint: { fontSize: 14 },
  deck: { flexDirection: 'row', alignItems: 'center', borderRadius: RADIUS, paddingRight: 10 },
  deckMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 56 },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkMark: { fontSize: 14, fontWeight: '800' },
  deckText: { flex: 1, gap: 1 },
  deckName: { fontSize: 15, fontWeight: '700' },
  deckSub: { fontSize: 13 },
  // The little outlined pill that says which other Prism a deck is in
  pill: { alignSelf: 'flex-start', borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2, marginTop: 4 },
  pillText: { fontSize: 12, fontWeight: '600' },
  slotButton: { alignItems: 'center', gap: 2, padding: 4 },
  slotText: { fontSize: 11 },
  setting: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: RADIUS, padding: 12 },
  settingText: { flex: 1, gap: 2 },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  slotCell: { borderWidth: 2, borderRadius: 8, padding: 2 },
});
