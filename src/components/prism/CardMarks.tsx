/* =====================================================================
   THE CARD WITH ITS MARKS
   A large picture of the card with the PRISM marks drawn along its two long
   edges, like the paint you put on the inner sleeve:
     - Each slot is a thin line across the edge, half on the card and half
       sticking out past it. The slots to paint are filled with each deck's
       color and show their number beside the line. The slots that aren't
       needed are small ticks, numbered every fourth one.
     - There are 24 slots on a side. The first line is level with the middle
       of the card's name box and the last is the same distance up from the
       bottom; the rest are evenly spaced between them. (The distances are
       measured from the modern card frame.)
     - Side A (slots 1 to 24) is on one edge and Side B (25 to 48) on the
       opposite edge, both showing at once.
     - The corner chosen for the set (which corner is slot 1) decides which
       edge Side A is on and whether slot 1 is at the top or the bottom.
   ===================================================================== */

import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useColors } from '@/hooks/useTheme';
import { pictureSource } from '@/lib/http';
import { CORNERS, SLOTS_PER_SIDE, colorForSlot, type PrismSet } from '@/lib/prismStorage';

type Props = {
  image: string;              // the card's picture
  slots: number[];            // the slots to paint (1 to 48)
  corner: PrismSet['corner']; // which corner is slot 1
};

// Where the first and last lines sit, as a share of the card's height: the
// middle of the name box, and the same distance up from the bottom
const FIRST_LINE = 7.65;
// How far a line reaches in from the edge and out past it (points)
const REACH = 16;
// How much room the numbers need outside each edge (points)
const NUMBER_ROOM = 44;
// How thick one line is (points)
const LINE_THICKNESS = 4;

export default function CardMarks({ image, slots, corner }: Props) {
  const colors = useColors();

  // Side A is on the edge the corner names; Side B is on the opposite one
  const cornerName = CORNERS[corner];
  const sideAOnRight = cornerName.endsWith('right');
  // A corner at the bottom means slot 1 is at the bottom and the numbers climb upward
  const fromBottom = cornerName.startsWith('bottom');
  const painted = new Set(slots);

  // The 24 lines of one side, down one edge of the card
  function sideLines(first: number, onRight: boolean) {
    return Array.from({ length: SLOTS_PER_SIDE }, (_, i) => {
      const slot = first + i;
      const on = painted.has(slot);
      // How far down the card this slot is, as a share of its height
      const along = fromBottom ? SLOTS_PER_SIDE - 1 - i : i;
      const top = FIRST_LINE + (along / (SLOTS_PER_SIDE - 1)) * (100 - 2 * FIRST_LINE);
      const edge = onRight ? { right: -REACH } : { left: -REACH };
      return (
        <View key={slot} pointerEvents="none" style={[styles.slot, { top: `${top}%` }]}>
          {on ? (
            <View style={[styles.line, edge, { backgroundColor: colorForSlot(slot) }]} />
          ) : (
            <View style={[styles.tick, onRight ? { right: -7 } : { left: -7 }, { backgroundColor: colors.muted }]} />
          )}
          {(on || i % 4 === 0) && (
            <Text
              maxFontSizeMultiplier={1}
              style={[
                styles.number,
                onRight ? { left: '100%', marginLeft: REACH + 4 } : { right: '100%', marginRight: REACH + 4, textAlign: 'right' },
                on ? { color: colors.text, fontWeight: '800', fontSize: 11 } : { color: colors.muted, fontSize: 10 },
              ]}
            >
              {slot}
            </Text>
          )}
        </View>
      );
    });
  }

  return (
    <View style={styles.wrap}>
      {/* The card, with room beside both edges for the numbers */}
      <View style={styles.stage}>
        <View
          accessible
          accessibilityLabel={slots.length > 0
            ? `Card with its marks. Paint slots ${[...slots].sort((a, b) => a - b).join(', ')}. Slot 1 is the ${cornerName} corner. Side A is on the ${sideAOnRight ? 'right' : 'left'} edge and Side B on the ${sideAOnRight ? 'left' : 'right'} edge.`
            : 'Card with its marks. Nothing to paint.'}
          style={styles.card}
        >
          <Image source={pictureSource(image)} style={[StyleSheet.absoluteFill, { borderRadius: 12 }]} contentFit="cover" />
          {sideLines(1, sideAOnRight)}
          {sideLines(SLOTS_PER_SIDE + 1, !sideAOnRight)}
        </View>
      </View>

      <Text style={[styles.caption, { color: colors.muted }]}>
        Slot 1 is the {cornerName} corner. Side A (1 to 24) is on the {sideAOnRight ? 'right' : 'left'} edge, Side B (25 to 48) on the {sideAOnRight ? 'left' : 'right'}.
      </Text>
    </View>
  );
}

// The look: the card (a standard card's shape) with its lines, and room on both sides for the numbers
const styles = StyleSheet.create({
  wrap: { gap: 8 },
  stage: { width: '100%', maxWidth: 420, alignSelf: 'center', paddingHorizontal: NUMBER_ROOM },
  card: { width: '100%', aspectRatio: 63 / 88, borderRadius: 12, overflow: 'visible' },
  // One slot: a zero-size spot on the card's edge that the line, tick and number are placed from
  slot: { position: 'absolute', left: 0, right: 0, height: 0 },
  line: { position: 'absolute', top: -LINE_THICKNESS / 2, width: REACH * 2, height: LINE_THICKNESS, borderRadius: 1 },
  tick: { position: 'absolute', top: -0.75, width: 7, height: 1.5, opacity: 0.55 },
  number: { position: 'absolute', top: -7, width: 24, lineHeight: 14 },
  caption: { fontSize: 12, textAlign: 'center' },
});
