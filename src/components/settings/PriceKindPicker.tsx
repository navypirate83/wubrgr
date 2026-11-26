/* =====================================================================
   WHICH OF A STORE'S PRICES TO SHOW
   A list under the Price store choice, one row per price the chosen store
   has (TCGplayer: Market, Mid, Low; Card Kingdom: Retail, Buy;
   Cardmarket: Trend, Low, 30-day average). The picked one has a filled
   round mark and a light orange tint. Screen readers hear radio buttons.
   ===================================================================== */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PRICE_KINDS, type PriceStore } from '@/lib/prices';
import { useColors } from '@/hooks/useTheme';
import { RADIUS } from '@/theme/colors';

export default function PriceKindPicker({ store, value, onChange }: {
  store: PriceStore;
  value: string;                      // the picked price's name, like "buy"
  onChange: (kind: string) => void;
}) {
  const colors = useColors();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Price to show" style={[styles.box, { borderColor: colors.border }]}>
      {PRICE_KINDS[store].map((kind, index) => {
        const picked = kind.id === value;
        return (
          // One price: its round mark, its name and what it means
          <Pressable
            key={kind.id}
            accessibilityRole="radio"
            accessibilityLabel={`${kind.label}: ${kind.hint}`}
            accessibilityState={{ checked: picked }}
            onPress={() => onChange(kind.id)}
            style={({ pressed }) => [
              styles.row,
              index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
              { backgroundColor: picked ? `${colors.accent}22` : pressed ? colors.surfaceHover : colors.surface },
            ]}
          >
            <View style={[styles.dot, { borderColor: picked ? colors.accent : colors.border }, picked && styles.dotPicked]} />
            <View style={styles.words}>
              <Text style={[styles.label, { color: colors.text }]}>{kind.label}</Text>
              <Text style={[styles.hint, { color: colors.muted }]}>{kind.hint}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

// The look: a rounded outline around the rows
const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: RADIUS, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingHorizontal: 12, paddingVertical: 8 },
  // The round mark: a ring, made thick (so it looks filled) when picked
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2 },
  dotPicked: { borderWidth: 6 },
  words: { flex: 1, minWidth: 0 },
  label: { fontSize: 15, fontWeight: '700' },
  hint: { fontSize: 13 },
});
