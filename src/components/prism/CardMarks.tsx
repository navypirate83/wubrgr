/* =====================================================================
   THE CARD WITH ITS MARKS
   A large picture of the card with the PRISM marks drawn along one long
   edge, like the paint you put on the inner sleeve:
     - Each slot is a thin line across the edge, half on the card and half
       sticking out past it. The slots to paint are filled with each deck's
       color and show their number beside the line. The slots that aren't
       needed are small ticks, numbered every fourth one.
     - There are 24 slots on a side. The first line is level with the middle
       of the card's name box and the last is the same distance up from the
       bottom; the rest are evenly spaced between them. (The distances are
       measured from the modern card frame.)
     - "Side A" is slots 1 to 24, "Side B" is 25 to 48, drawn on the opposite
       edge, so you can flip between the two sides of the sleeve.
     - The corner chosen for the set (which corner is slot 1) decides which
       edge Side A is on and whether slot 1 is at the top or the bottom.
   ===================================================================== */

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useColors } from '@/hooks/useTheme';
import { pictureSource } from '@/lib/http';
import { CORNERS, SLOTS_PER_SIDE, colorForSlot, type PrismSet } from '@/lib/prismStorage';

type Props = {
  image: string;              // the card's picture
  cardId: string;             // which card and copy is showing (the side to show starts over for a new one)
  slots: number[];            // the slots to paint (1 to 48)
  corner: PrismSet['corner']; // which corner is slot 1
};

// Where the first and last lines sit, as a share of the card's height: the
// middle of the name box, and the same distance up from the bottom
const FIRST_LINE = 7.65;
// How far a line reaches in from the edge and out past it (points)
const REACH = 16;
// How much room the numbers need outside the edge (points)
const NUMBER_ROOM = 52;
// How thick one line is (points)
const LINE_THICKNESS = 4;

export default function CardMarks({ image, cardId, slots, corner }: Props) {
  const colors = useColors();
  // The side shown first is the one holding a slot to paint (Side A if both or neither does)
  const firstSide: 'A' | 'B' = slots.some((s) => s <= SLOTS_PER_SIDE) || slots.length === 0 ? 'A' : 'B';
  const [chosen, setChosen] = useState<{ id: string; side: 'A' | 'B' } | null>(null);
  const side = chosen && chosen.id === cardId ? chosen.side : firstSide;

  // Side A is on the edge the corner names; Side B is on the opposite one
  const cornerName = CORNERS[corner];
  const sideAOnRight = cornerName.endsWith('right');
  const onRight = side === 'A' ? sideAOnRight : !sideAOnRight;
  // A corner at the bottom means slot 1 is at the bottom and the numbers climb upward
  const fromBottom = cornerName.startsWith('bottom');
  const first = side === 'A' ? 1 : SLOTS_PER_SIDE + 1;
  const painted = new Set(slots);
  const onOtherSide = slots.filter((s) => (s > SLOTS_PER_SIDE) !== (side === 'B'));

  return (
    <View style={styles.wrap}>
      {/* The two sides of the sleeve */}
      <View style={styles.sides}>
        {(['A', 'B'] as const).map((s) => (
          <Pressable key={s} accessibilityRole="radio" accessibilityState={{ selected: side === s }}
                     onPress={() => setChosen({ id: cardId, side: s })}
                     style={[styles.sideButton, { borderColor: side === s ? colors.accent : colors.border, backgroundColor: side === s ? colors.accent : 'transparent' }]}>
            <Text style={[styles.sideText, { color: side === s ? colors.bg : colors.text }]}>
              Side {s} · {s === 'A' ? '1 to 24' : '25 to 48'}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* The card, with room beside the edge for the numbers */}
      <View style={[styles.stage, onRight ? { paddingLeft: 8, paddingRight: NUMBER_ROOM } : { paddingLeft: NUMBER_ROOM, paddingRight: 8 }]}>
        <View
          accessible
          accessibilityLabel={slots.length > 0
            ? `Card with its marks. Paint slots ${[...slots].sort((a, b) => a - b).join(', ')}. Showing side ${side}. Slot 1 is the ${cornerName} corner.`
            : 'Card with its marks. Nothing to paint.'}
          style={styles.card}
        >
          <Image source={pictureSource(image)} style={[StyleSheet.absoluteFill, { borderRadius: 12 }]} contentFit="cover" />
          {Array.from({ length: SLOTS_PER_SIDE }, (_, i) => {
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
                      onRight ? { left: '100%', marginLeft: REACH + 5 } : { right: '100%', marginRight: REACH + 5, textAlign: 'right' },
                      on ? { color: colors.text, fontWeight: '800', fontSize: 11 } : { color: colors.muted, fontSize: 10 },
                    ]}
                  >
                    {slot}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      </View>

      <Text style={[styles.caption, { color: colors.muted }]}>
        Slot 1 is the {cornerName} corner.
        {onOtherSide.length > 0 ? ` Also paint ${onOtherSide.length === 1 ? 'slot' : 'slots'} ${[...onOtherSide].sort((a, b) => a - b).join(', ')} on Side ${side === 'A' ? 'B' : 'A'}.` : ''}
      </Text>
    </View>
  );
}

// The look: the two side buttons, then the card (a standard card's shape) with its lines
const styles = StyleSheet.create({
  wrap: { gap: 8 },
  sides: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  sideButton: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, borderWidth: 1.5 },
  sideText: { fontSize: 12.5, fontWeight: '700' },
  stage: { width: '100%', maxWidth: 420, alignSelf: 'center' },
  card: { width: '100%', aspectRatio: 63 / 88, borderRadius: 12, overflow: 'visible' },
  // One slot: a zero-size spot on the card's edge that the line, tick and number are placed from
  slot: { position: 'absolute', left: 0, right: 0, height: 0 },
  line: { position: 'absolute', top: -LINE_THICKNESS / 2, width: REACH * 2, height: LINE_THICKNESS, borderRadius: 1 },
  tick: { position: 'absolute', top: -0.75, width: 7, height: 1.5, opacity: 0.55 },
  number: { position: 'absolute', top: -7, width: 28, lineHeight: 14 },
  caption: { fontSize: 12, textAlign: 'center' },
});
