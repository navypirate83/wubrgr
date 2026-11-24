/* =====================================================================
   THE CARD FINDER'S TWO TABS: CARDS AND SETS
   Two buttons side by side at the very top of the Card Finder. "Cards" is
   the card search (type a name, see pictures). "Sets" is the list of every
   set (see SetsTab.tsx). The one showing has an orange line under it.
   ===================================================================== */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useTheme';
import { MAX_CONTENT_WIDTH, SPACE } from '@/theme/colors';

export type FinderTab = 'cards' | 'sets';

const TABS: { id: FinderTab; label: string }[] = [
  { id: 'cards', label: 'Cards' },
  { id: 'sets', label: 'Sets' },
];

export default function FinderTabs({ tab, onChange }: { tab: FinderTab; onChange: (tab: FinderTab) => void }) {
  const colors = useColors();
  return (
    <View style={styles.wrap}>
      <View style={[styles.row, { borderBottomColor: colors.border }]} accessibilityRole="tablist">
        {TABS.map((item) => {
          const on = item.id === tab;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => onChange(item.id)}
              style={({ pressed }) => [styles.tab, { borderBottomColor: on ? colors.accent : 'transparent' }, pressed && { opacity: 0.6 }]}
            >
              <Text style={[styles.label, { color: on ? colors.text : colors.muted }]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', paddingHorizontal: SPACE.l, paddingTop: 4 },
  row: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  // Each tab shares the width; its underline sits on the line under the row
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 46, borderBottomWidth: 3, marginBottom: -StyleSheet.hairlineWidth },
  label: { fontSize: 16, fontWeight: '700' },
});
