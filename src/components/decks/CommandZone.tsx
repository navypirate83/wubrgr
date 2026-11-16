/* =====================================================================
   THE COMMAND ZONE (at the top of a deck, for formats that have one)
   A heading and one or two spots for the cards a deck keeps outside its
   main deck: a commander (and, only if its abilities call for it, a
   partner or a Background), or an Oathbreaker and its signature spell
   (see lib/deckZones.ts for which cards each takes).
   - A spot with a card shows its picture, name, what it is and its rules text (no
     flavor text; in a box as tall as the (larger) picture, which scrolls if the
     text is longer), with
     "Change" (pick another card for the spot) and "Move to deck" (the card
     goes back into the main deck). Tap the card for its window.
   - An empty spot is a dashed outline that says what it needs; tap it to
     choose a card. (The signature spell waits for an Oathbreaker.)
   The deck screen opens the search window and does the changing.
   ===================================================================== */

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useColors } from '@/hooks/useTheme';
import ManaCost from '@/components/lists/ManaCost';
import SymbolText from '@/components/SymbolText';
import FoilFrame from '@/components/binder/FoilFrame';
import MissingOutline from './MissingOutline';
import BannedSlash from './BannedSlash';
import GameChangerBadge from './GameChangerBadge';
import { commandCard, type Deck, type DeckCard } from '@/lib/deckStorage';
import { deckFormat } from '@/lib/deckFormats';
import { secondSpotShows, slotHint, slotName } from '@/lib/deckZones';
import { pictureSource } from '@/lib/http';
import { loadRulesText } from '@/lib/scryfall';

// How big a card's picture is: as tall as the spot's text box (the old 76-point picture plus three
// lines of 13 points), and as wide as a card's shape makes it (the old 54 by 76 shape)
const PICTURE_HEIGHT = 76 + 3 * 13;
const PICTURE_WIDTH = Math.round((PICTURE_HEIGHT * 54) / 76);

type Props = {
  deck: Deck;
  onChoose: (slot: 0 | 1) => void;          // an empty spot (or "Change") was tapped
  onOpenCard: (index: number) => void;      // a spot's card was tapped: its window
  onMoveToDeck: (slot: 0 | 1) => void;      // "Move to deck"
  missing?: (card: DeckCard) => false | 'card' | 'printing';   // not in your binders (solid red border) or not that printing (dashed)
  banned?: (name: string) => boolean;       // is this card banned in the format? (black "BANNED" slash)
  gameChanger?: (name: string) => boolean;  // is this card a Game Changer? (yellow border)
};

export default function CommandZone({ deck, onChoose, onOpenCard, onMoveToDeck, missing, banned, gameChanger }: Props) {
  const colors = useColors();
  const format = deckFormat(deck.format);
  if (!format.command) return null;
  const first = commandCard(deck, 0);
  const slots: (0 | 1)[] = secondSpotShows(format, first) ? [0, 1] : [0];
  const filled = slots.filter((slot) => commandCard(deck, slot)).length;

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: colors.muted }]}>COMMAND ZONE</Text>
        <Text style={[styles.title, { color: colors.muted }]}>{filled} of {slots.length}</Text>
      </View>
      <View style={styles.slots}>
        {slots.map((slot) => {
          const card = commandCard(deck, slot);
          const name = slotName(format, slot, first);
          // Waiting for something else first (the signature spell needs an Oathbreaker)
          if (!card) {
            return (
              <Pressable key={slot} accessibilityRole="button" accessibilityLabel={`${name}, empty. ${slotHint(format, slot, first)}`}
                         onPress={() => onChoose(slot)}
                         style={({ pressed }) => [styles.slot, styles.empty, { borderColor: colors.accent }, pressed && { backgroundColor: colors.surfaceHover }]}>
                <View style={[styles.picture, styles.plusPicture, { borderColor: colors.accent }]}>
                  <Text style={[styles.plus, { color: colors.accent }]}>+</Text>
                </View>
                <View style={styles.what}>
                  <Text style={[styles.role, { color: colors.text }]}>{name}</Text>
                  <Text style={[styles.hint, { color: colors.muted }]}>{slotHint(format, slot, first)}</Text>
                </View>
              </Pressable>
            );
          }
          return (
            <View key={slot} style={[styles.slot, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Pressable accessibilityRole="button" accessibilityLabel={`${card.name}${gameChanger?.(card.name) ? ', Game Changer' : ''}, your ${name.toLowerCase()}. Opens its menu.`}
                         onPress={() => onOpenCard(deck.cards.indexOf(card))} style={styles.cardPress}>
                <View>
                  <FoilFrame foil={card.foil === true} width={PICTURE_WIDTH} height={PICTURE_HEIGHT} radius={6}>
                    <Image source={pictureSource(card.image)} style={styles.thumb} contentFit="cover" />
                  </FoilFrame>
                  {banned?.(card.name) && <BannedSlash radius={6} />}
                  {gameChanger?.(card.name) && <MissingOutline radius={6} width={3} yellow />}
                  {missing?.(card) && <MissingOutline radius={6} width={3} dashed={missing(card) === 'printing'} inset={gameChanger?.(card.name) ? 3 : 0} />}
                  {gameChanger?.(card.name) && <GameChangerBadge size={8} />}
                </View>
                {/* The name, the role and cost on one line, then the card's rules text (no flavor text) in
                    a box as tall as the picture (it scrolls if the text is longer) */}
                <View style={[styles.what, styles.whatFilled]}>
                  <Text style={[styles.role, { color: colors.text }]} numberOfLines={1}>{card.name}</Text>
                  <View style={styles.roleRow}>
                    <Text style={[styles.hint, { color: colors.muted }]} numberOfLines={1}>{name}</Text>
                    {card.manaCost ? <ManaCost cost={card.manaCost} size={13} /> : null}
                  </View>
                  <RulesText card={card} />
                </View>
              </Pressable>
              <View style={styles.buttons}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Change the ${name.toLowerCase()}`} onPress={() => onChoose(slot)}
                           style={[styles.button, { backgroundColor: colors.surfaceHover }]}>
                  <Text style={[styles.buttonText, { color: colors.text }]}>Change</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`Move ${card.name} back into the deck`} onPress={() => onMoveToDeck(slot)}
                           style={[styles.button, { backgroundColor: colors.surfaceHover }]}>
                  <Text style={[styles.buttonText, { color: colors.text }]}>Move to deck</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// A card's rules text (the words on it, without the flavor text), in a box that
// fills the room under its name and scrolls when the text is longer. A card with no
// text (or while it's being looked up) leaves the box empty.
function RulesText({ card }: { card: DeckCard }) {
  const colors = useColors();
  const rules = useQuery({
    queryKey: ['rules', card.set, card.number],
    queryFn: () => loadRulesText(card.set, card.number),
    staleTime: Infinity,
  });
  const text = (rules.data ?? []).map((face) => (face.name ? `${face.name}: ${face.text}` : face.text)).join('\n\n');
  if (!text) return <View style={styles.rulesBox} />;
  return (
    <ScrollView style={styles.rulesBox} nestedScrollEnabled showsVerticalScrollIndicator={false}>
      <SymbolText inline style={[styles.rules, { color: colors.text }]}>{text}</SymbolText>
    </ScrollView>
  );
}

// The look: a small heading, then the spots side by side (wrapping on a narrow screen)
const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingBottom: 6, gap: 6 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between' },
  title: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  slot: { flex: 1, minWidth: 240, borderWidth: 1, borderRadius: 12, padding: 8, gap: 6 },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 2, borderStyle: 'dashed' },
  cardPress: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  picture: { width: PICTURE_WIDTH, height: PICTURE_HEIGHT, borderRadius: 6 },
  plusPicture: { borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  plus: { fontSize: 28, fontWeight: '300' },
  thumb: { width: '100%', height: '100%' },
  what: { flex: 1, minWidth: 0, gap: 1 },
  // With a card in the spot: as tall as the picture
  whatFilled: { height: PICTURE_HEIGHT, alignSelf: 'flex-start' },
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rulesBox: { flex: 1, minHeight: 0 },
  rules: { fontSize: 11, lineHeight: 13 },
  role: { fontSize: 15, fontWeight: '700' },
  hint: { fontSize: 12.5 },
  buttons: { flexDirection: 'row', gap: 6 },
  button: { borderRadius: 7, paddingHorizontal: 10, paddingVertical: 5 },
  buttonText: { fontSize: 12.5, fontWeight: '600' },
});
