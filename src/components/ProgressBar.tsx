/* =====================================================================
   PROGRESS BAR
   A thin rounded track with a colored part that grows from left to right
   as something (a download) gets further along. "fraction" is how far it
   is, from 0 (nothing yet) to 1 (done). Screen readers read it out as a
   percentage.
   ===================================================================== */

import { StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useTheme';

export default function ProgressBar({ fraction, label }: { fraction: number; label: string }) {
  const colors = useColors();
  // Kept between 0 and 100, in case a caller hands over something odd
  const percent = Math.max(0, Math.min(100, Math.round(fraction * 100)));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      style={[styles.track, { backgroundColor: colors.surfaceHover, borderColor: colors.border }]}
    >
      {/* The filled part: as wide as the percentage */}
      <View style={[styles.fill, { width: `${percent}%`, backgroundColor: colors.accent }]} />
    </View>
  );
}

// The look: a 10-point-tall rounded track, as wide as whatever it sits in
const styles = StyleSheet.create({
  track: { alignSelf: 'stretch', height: 10, borderRadius: 5, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5 },
});
