/* =====================================================================
   THE HOME SCREEN'S "LATEST CHANGES" LIST
   A rounded box with one block per version of the app, newest first:
   the version number and its day on one line, then what changed, one
   line each with a dot in front. It shows the newest few versions; when
   there are older ones, a plain button under the box shows them all (and
   hides them again).
   The versions themselves are written in lib/changes.ts: adding one there
   is all it takes for it to show up here.
   ===================================================================== */

import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useTheme';
import { CHANGES, changeDay } from '@/lib/changes';
import { RADIUS, SPACE } from '@/theme/colors';
import Button from '@/components/Button';

// How many versions show before "Show older changes" is tapped
const SHOWN_AT_FIRST = 5;

export default function LatestChanges() {
  const colors = useColors();
  // Showing every version, or just the newest few?
  const [all, setAll] = useState(false);
  const shown = all ? CHANGES : CHANGES.slice(0, SHOWN_AT_FIRST);
  return (
    <View>
      <View style={[styles.box, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {shown.map((change, index) => (
          // One version. A thin line separates it from the one above (not on the first).
          <View
            key={change.version}
            style={[styles.version, index > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}
          >
            {/* The version number (in the accent color) and its day */}
            <View style={styles.heading}>
              <Text style={[styles.number, { color: colors.accent }]} accessibilityRole="header">Version {change.version}</Text>
              <Text style={[styles.day, { color: colors.muted }]}>{changeDay(change.date)}</Text>
            </View>
            {/* What changed, one line each */}
            {change.lines.map((line) => (
              <View key={line} style={styles.line}>
                <Text style={[styles.dot, { color: colors.muted }]}>•</Text>
                <Text style={[styles.words, { color: colors.text }]}>{line}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
      {/* Older versions: only offered when there are more than the first few */}
      {CHANGES.length > SHOWN_AT_FIRST && (
        <Button label={all ? 'Show fewer changes' : 'Show older changes'} kind="plain" onPress={() => setAll((now) => !now)} style={styles.more} />
      )}
    </View>
  );
}

// The box's look: rounded like the app's other boxes, with room inside each version's block
const styles = StyleSheet.create({
  box: { borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS, overflow: 'hidden' },
  version: { paddingHorizontal: SPACE.l, paddingVertical: SPACE.m, gap: 4 },
  // The number on the left, the day on the right (it drops under the number if the box is very narrow)
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: SPACE.m, marginBottom: 2 },
  number: { fontSize: 16, fontWeight: '700' },
  day: { fontSize: 13 },
  line: { flexDirection: 'row', gap: SPACE.s },
  dot: { fontSize: 14, lineHeight: 20 },
  words: { flex: 1, fontSize: 14, lineHeight: 20 },
  more: { marginTop: SPACE.s, alignSelf: 'center' },
});
