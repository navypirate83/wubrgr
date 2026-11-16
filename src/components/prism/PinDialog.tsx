/* =====================================================================
   KEEP A CARD IN ONE DECK ONLY (the pin window)
   Opened by the pin button on a card in the PRISM Cards tab. It lists the
   decks in the set that use the card. A deck you tick keeps its own copies
   of the card: no other deck shares them, so they never become a Pool card.
   For a ticked deck, you choose how far that goes:
     - "Any" (by name): every printing of the card in that deck is kept to it
     - "Only the printing I pick": just that printing is kept to it (the deck's
       other printings of the card still share like any other card)
   A line at the bottom says how many copies of the card the set needs with
   and without the choice. If sleeves are already painted for the card, a
   second step says how many will need touching before saving (the Changes
   tab then lists them).
   ===================================================================== */

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import SymbolText from '@/components/SymbolText';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import PopupWindow from '@/components/PopupWindow';
import DeckSquare from './DeckSquare';
import { useColors } from '@/hooks/useTheme';
import { pictureSource } from '@/lib/http';
import { printKey } from '@/lib/deckOwnership';
import { zoneOf, type Deck, type DeckCard } from '@/lib/deckStorage';
import { nameKey, planFor } from '@/lib/prismPlan';
import { setPin, type PinRule, type PrismSet } from '@/lib/prismStorage';

type Props = {
  set: PrismSet;
  decks: Deck[];
  name: string;                 // the card's name, lowercase
  onClose: () => void;
  onSaved: () => void;          // the pins were saved: read the set again
};

// What one deck's choice is: kept to itself or not, and for which printing (null: any)
type Choice = { on: boolean; print: string | null };

// One deck that uses the card, and the printings of it the deck has
type Use = { deckId: string; deckName: string; slot: number; total: number; prints: { key: string; card: DeckCard; count: number }[] };

export default function PinDialog({ set, decks, name, onClose, onSaved }: Props) {
  const colors = useColors();
  const [stage, setStage] = useState<'pick' | 'warn'>('pick');

  // The decks in the set that use this card (lowest slot first), with their printings
  const uses = useMemo(() => {
    const found: Use[] = [];
    for (const member of [...set.decks].sort((a, b) => a.slot - b.slot)) {
      const deck = decks.find((d) => d.id === member.deckId);
      if (!deck) continue;
      const prints = new Map<string, { key: string; card: DeckCard; count: number }>();
      for (const card of deck.cards) {
        if (zoneOf(card) === 'side' || nameKey(card.name) !== name) continue;
        const key = printKey(card);
        const have = prints.get(key);
        prints.set(key, { key, card: have?.card ?? card, count: (have?.count ?? 0) + (card.count ?? 1) });
      }
      if (prints.size === 0) continue;
      const list = [...prints.values()];
      found.push({ deckId: deck.id, deckName: deck.name, slot: member.slot, prints: list, total: list.reduce((n, p) => n + p.count, 0) });
    }
    return found;
  }, [set, decks, name]);

  const shownName = uses[0]?.prints[0].card.name ?? name;

  // Each deck's choice, starting from the pins already saved
  const [choices, setChoices] = useState<Record<string, Choice>>(() => {
    const start: Record<string, Choice> = {};
    for (const use of uses) {
      const pin = set.pins.find((p) => p.deckId === use.deckId && p.key === name);
      start[use.deckId] = { on: !!pin, print: pin?.print ?? null };
    }
    return start;
  });
  const change = (deckId: string, next: Partial<Choice>) => setChoices((c) => ({ ...c, [deckId]: { ...c[deckId], ...next } }));

  // The pins as they'd be: the others as they are, this card's as chosen here
  const wantedPins = useMemo<PinRule[]>(() => {
    const others = set.pins.filter((p) => p.key !== name || !uses.some((u) => u.deckId === p.deckId));
    const mine: PinRule[] = uses.flatMap((u): PinRule[] => {
      const c = choices[u.deckId];
      if (!c?.on) return [];
      return [c.print ? { deckId: u.deckId, key: name, print: c.print } : { deckId: u.deckId, key: name }];
    });
    return [...others, ...mine];
  }, [set.pins, uses, choices, name]);

  // Copies of this card the set needs now, and with these choices
  const copiesNow = planFor(set, decks).filter((c) => nameKey(c.name) === name).reduce((n, c) => n + c.copies, 0);
  const copiesThen = planFor({ ...set, pins: wantedPins }, decks).filter((c) => nameKey(c.name) === name).reduce((n, c) => n + c.copies, 0);

  // How many sleeves already painted would need touching: for a deck whose choice changed,
  // the painted copies carrying its mark (under the shared card, or under its old pin)
  const touched = useMemo(() => {
    let count = 0;
    for (const u of uses) {
      const old = set.pins.find((p) => p.deckId === u.deckId && p.key === name);
      const now = choices[u.deckId];
      const same = (!!old === now.on) && (old?.print ?? null) === now.print;
      if (same) continue;
      const withMark = (key: string) => (set.painted[key] ?? []).filter((decksOn) => decksOn.includes(u.deckId)).length;
      if (now.on) count += withMark(name);
      if (old) count += withMark(old.print ? `${name}|${u.deckId}|${old.print}` : `${name}|${u.deckId}`);
    }
    return count;
  }, [uses, choices, set.pins, set.painted, name]);

  const unchanged = useMemo(() => uses.every((u) => {
    const old = set.pins.find((p) => p.deckId === u.deckId && p.key === name);
    return !!old === choices[u.deckId].on && (old?.print ?? null) === choices[u.deckId].print;
  }), [uses, set.pins, choices, name]);

  // Save every deck's choice
  function save() {
    for (const u of uses) {
      const c = choices[u.deckId];
      setPin(set.id, u.deckId, name, c.on ? (c.print ? { print: c.print } : {}) : null);
    }
    onSaved();
  }
  function tapSave() {
    if (touched > 0) setStage('warn');
    else save();
  }

  if (uses.length === 0) {
    return (
      <PopupWindow title={`Keep ${shownName} in one deck`} onClose={onClose} buttons={[{ label: 'Close', onPress: onClose, kind: 'secondary' }]}>
        <Text style={[styles.text, { color: colors.text }]}>None of the decks in this set use this card now.</Text>
      </PopupWindow>
    );
  }

  if (stage === 'warn') {
    return (
      <PopupWindow title={`This changes ${touched} ${touched === 1 ? 'sleeve' : 'sleeves'}`} onClose={onClose}
                   buttons={[{ label: 'Cancel', onPress: onClose, kind: 'secondary' }, { label: 'Keep it anyway', onPress: save }]}>
        <Text style={[styles.text, { color: colors.text }]}>
          {touched === 1 ? 'A copy of' : `${touched} copies of`} {shownName} {touched === 1 ? 'is' : 'are'} already painted. Changing which decks keep their own copies means {touched === 1 ? 'its sleeve' : 'those sleeves'} no longer {touched === 1 ? 'has' : 'have'} the right marks. The Changes tab will list each one so you can fix it.
        </Text>
      </PopupWindow>
    );
  }

  return (
    <PopupWindow title={`Keep ${shownName} in one deck`} onClose={onClose}
                 buttons={[{ label: 'Cancel', onPress: onClose, kind: 'secondary' }, { label: 'Save', onPress: tapSave, disabled: unchanged }]}>
      <View style={styles.body}>
        <Text style={[styles.text, { color: colors.text }]}>
          {shownName} is used by {uses.length} {uses.length === 1 ? 'deck' : 'decks'}. A deck you tick keeps its own copies, and no other deck shares them.
        </Text>

        {uses.map((use) => {
          const choice = choices[use.deckId];
          return (
            <View key={use.deckId} style={[styles.deck, { borderColor: choice.on ? colors.accent : colors.border }]}>
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: choice.on }}
                         accessibilityLabel={`${use.deckName} keeps its own ${shownName}`}
                         onPress={() => change(use.deckId, { on: !choice.on })} style={styles.deckHead}>
                <Ionicons name={choice.on ? 'checkbox' : 'square-outline'} size={24} color={choice.on ? colors.accent : colors.muted} />
                <DeckSquare slot={use.slot} size={22} />
                <SymbolText style={[styles.deckName, { color: colors.text }]} numberOfLines={1}>{use.deckName}</SymbolText>
                <Text style={[styles.count, { color: colors.muted }]}>×{use.total}</Text>
              </Pressable>

              {choice.on && (
                <View style={styles.modes}>
                  <Pressable accessibilityRole="radio" accessibilityState={{ selected: choice.print === null }}
                             onPress={() => change(use.deckId, { print: null })} style={styles.mode}>
                    <Ionicons name={choice.print === null ? 'radio-button-on' : 'radio-button-off'} size={20} color={choice.print === null ? colors.accent : colors.muted} />
                    <Text style={[styles.modeText, { color: colors.text }]}>Any {shownName} (every printing in this deck)</Text>
                  </Pressable>
                  <Pressable accessibilityRole="radio" accessibilityState={{ selected: choice.print !== null }}
                             onPress={() => change(use.deckId, { print: choice.print ?? use.prints[0].key })} style={styles.mode}>
                    <Ionicons name={choice.print !== null ? 'radio-button-on' : 'radio-button-off'} size={20} color={choice.print !== null ? colors.accent : colors.muted} />
                    <Text style={[styles.modeText, { color: colors.text }]}>Only the printing I pick:</Text>
                  </Pressable>
                  {choice.print !== null && (
                    <View style={styles.prints}>
                      {use.prints.map((p) => (
                        <Pressable key={p.key} accessibilityRole="radio" accessibilityState={{ selected: choice.print === p.key }}
                                   accessibilityLabel={`${p.card.set.toUpperCase()} ${p.card.number}, ${p.count} in this deck`}
                                   onPress={() => change(use.deckId, { print: p.key })}
                                   style={[styles.print, { borderColor: choice.print === p.key ? colors.accent : colors.border }]}>
                          <Image source={pictureSource(p.card.image)} style={styles.printImage} contentFit="cover" />
                          <Text style={[styles.printText, { color: choice.print === p.key ? colors.text : colors.muted }]}>
                            {p.card.set.toUpperCase()} {p.card.number}
                          </Text>
                          <Text style={[styles.printText, { color: colors.muted }]}>×{p.count}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })}

        <Text style={[styles.sum, { backgroundColor: colors.surfaceHover, color: colors.text }]}>
          {copiesThen} {copiesThen === 1 ? 'copy' : 'copies'} of {shownName} needed in all{copiesThen !== copiesNow ? ` (now ${copiesNow})` : ''}.
        </Text>
      </View>
    </PopupWindow>
  );
}

// The look: the explanation, a box for each deck (with its choices inside when ticked), then the summary line
const styles = StyleSheet.create({
  body: { gap: 10 },
  text: { fontSize: 15 },
  deck: { borderWidth: 1.5, borderRadius: 12, padding: 10, gap: 8 },
  deckHead: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  deckName: { flex: 1, fontSize: 15, fontWeight: '700' },
  count: { fontSize: 13 },
  modes: { gap: 8 },
  mode: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modeText: { flex: 1, fontSize: 14 },
  prints: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginLeft: 28 },
  print: { alignItems: 'center', gap: 2, borderWidth: 2, borderRadius: 8, padding: 4 },
  printImage: { width: 54, height: 75, borderRadius: 4 },
  printText: { fontSize: 11 },
  sum: { fontSize: 13, borderRadius: 9, padding: 9, overflow: 'hidden' },
});
