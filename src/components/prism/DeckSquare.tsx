/* =====================================================================
   A DECK'S SQUARE
   A small rounded square in a deck's PRISM color with its slot number in
   it (white, with a faint shadow so it reads on every color). It's the
   deck's mark everywhere in the PRISM section: beside a card (which decks
   use it), in the list of marks to paint, and on the Decks tab.
   ===================================================================== */

import { StyleSheet, Text, View } from 'react-native';
import { colorForSlot } from '@/lib/prismStorage';

type Props = { slot: number; size?: number };

export default function DeckSquare({ slot, size = 22 }: Props) {
  return (
    <View
      accessible
      accessibilityLabel={`Slot ${slot}`}
      style={[styles.square, { width: size, height: size, borderRadius: Math.round(size * 0.27), backgroundColor: colorForSlot(slot) }]}
    >
      <Text style={[styles.number, { fontSize: Math.round(size * 0.46) }]} maxFontSizeMultiplier={1.2}>{slot}</Text>
    </View>
  );
}

// The look: a colored square with a bold white number in the middle
const styles = StyleSheet.create({
  square: { alignItems: 'center', justifyContent: 'center' },
  number: { color: '#ffffff', fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1 },
});
