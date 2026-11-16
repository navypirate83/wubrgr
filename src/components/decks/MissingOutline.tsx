/* =====================================================================
   THE "NOT IN YOUR BINDERS" OUTLINE
   In a deck, a card you don't own (it isn't in any of your binders; cards
   on a list don't count: lists are wishes) gets a bold solid red border
   around its picture. If you own the card, but not that printing of it, the
   border is dashed instead. This draws that border: put it inside the box that
   holds the card's picture, and it covers the picture's edge without
   catching any taps.
   The same outline, in yellow, marks a Game Changer card. A card that is both
   gets the yellow one on the outside and the red one just inside it.
   ===================================================================== */

import { StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useTheme';

type Props = {
  radius: number;     // the picture's rounded corners
  width?: number;     // how thick the border is (bold: 3 by default)
  dashed?: boolean;   // dashed (you own the card, just not this printing) instead of solid
  yellow?: boolean;   // yellow instead of red: a Game Changer card (see gameChangers.ts)
  inset?: number;     // how far in from the picture's edge (a red border inside a yellow one)
};

export default function MissingOutline({ radius, width = 3, dashed = false, yellow = false, inset = 0 }: Props) {
  const colors = useColors();
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { top: inset, left: inset, right: inset, bottom: inset, borderWidth: width, borderStyle: dashed ? 'dashed' : 'solid', borderColor: yellow ? colors.gameChanger : colors.error, borderRadius: radius }]}
    />
  );
}
