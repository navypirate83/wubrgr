/* =====================================================================
   THE GAME CHANGER BADGE
   A small bright orange circle with a bright yellow star in it, laid over the lower left corner of
   a Game Changer card's picture (a Commander deck). It goes with the yellow
   border, and it's still easy to see where the border isn't: on a tiny
   picture, on a card with a light frame, or for someone who can't tell the
   colors apart. Put it inside the box that holds the picture; it doesn't
   catch any taps. (A screen reader hears "Game Changer" in the card's own
   label instead, so the badge itself is skipped.)
   ===================================================================== */

import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

// The badge's own colors (the same in light and dark): a bright orange dot, a bright yellow star
const DOT = '#ff8a00';
const STAR = '#ffe600';

// "lift" raises it off the bottom edge (the grid's copies bar sits along the bottom of a picture)
export default function GameChangerBadge({ size = 8, lift = 0 }: { size?: number; lift?: number }) {
  return (
    <View
      pointerEvents="none"
      accessible={false}
      style={[styles.badge, { width: size, height: size, borderRadius: size / 2, bottom: 2 + lift, backgroundColor: DOT }]}
    >
      <Ionicons name="star" size={Math.round(size * 0.66)} color={STAR} />
    </View>
  );
}

// Over the picture's lower left corner, with a thin dark ring so it shows on any picture
const styles = StyleSheet.create({
  badge: { position: 'absolute', left: 2, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.55)' },
});
