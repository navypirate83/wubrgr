/* =====================================================================
   THE SLEEVE EDGE
   A drawing of the edge of a card's inner sleeve, with its 48 slots:
   Side A has slots 1 to 24, Side B has 25 to 48. The slots this card needs
   a mark in are filled with each deck's color, so you can see where to paint.
   The corner chosen in the set (which corner is slot 1) is written under
   the drawing, because the sleeve can be held four ways.
   It's drawn with plain boxes (no pictures), so it follows the theme.
   ===================================================================== */

import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useTheme';
import { CORNERS, SLOTS_PER_SIDE, colorForSlot, type PrismSet } from '@/lib/prismStorage';

type Props = {
  slots: number[];            // the slots to paint (1 to 48)
  corner: PrismSet['corner']; // which corner is slot 1
};

export default function SleeveEdge({ slots, corner }: Props) {
  const colors = useColors();
  const painted = new Set(slots);
  // One row of 24 slots: the numbers from "first" to "first + 23"
  const row = (first: number) => (
    <View style={styles.row}>
      {Array.from({ length: SLOTS_PER_SIDE }, (_, i) => {
        const slot = first + i;
        const on = painted.has(slot);
        return (
          <View
            key={slot}
            style={[styles.slot, { borderColor: colors.border, backgroundColor: on ? colorForSlot(slot) : 'transparent' }, on && styles.slotOn]}
          >
            {/* Every fourth slot, and any slot to paint, shows its number */}
            {(on || (slot - first) % 4 === 0) && (
              <Text style={[styles.slotNumber, { color: on ? '#ffffff' : colors.muted }]} maxFontSizeMultiplier={1}>{slot}</Text>
            )}
          </View>
        );
      })}
    </View>
  );

  return (
    <View
      accessible
      accessibilityLabel={slots.length > 0
        ? `Sleeve edge. Paint slots ${[...slots].sort((a, b) => a - b).join(', ')}. Slot 1 is the ${CORNERS[corner]} corner.`
        : 'Sleeve edge. Nothing to paint.'}
      style={[styles.edge, { backgroundColor: colors.surfaceHover, borderColor: colors.border }]}
    >
      <Text style={[styles.label, { color: colors.muted }]}>SIDE A · slots 1 to {SLOTS_PER_SIDE}</Text>
      {row(1)}
      <Text style={[styles.label, { color: colors.muted }]}>SIDE B · slots {SLOTS_PER_SIDE + 1} to {SLOTS_PER_SIDE * 2}</Text>
      {row(SLOTS_PER_SIDE + 1)}
      <Text style={[styles.corner, { color: colors.muted }]}>Slot 1 is the {CORNERS[corner]} corner.</Text>
    </View>
  );
}

// The look: a rounded strip, two rows of 24 small boxes, filled where a mark goes
const styles = StyleSheet.create({
  edge: { borderRadius: 10, borderWidth: 1, padding: 8, gap: 4 },
  row: { flexDirection: 'row', gap: 1 },
  slot: { flex: 1, aspectRatio: 0.42, borderWidth: 1, borderRadius: 2, alignItems: 'center', justifyContent: 'flex-end', overflow: 'visible' },
  slotOn: { borderWidth: 0 },
  slotNumber: { fontSize: 7, fontWeight: '700' },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  corner: { fontSize: 11 },
});
