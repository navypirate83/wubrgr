/* =====================================================================
   THE STACK LIST
   The running list of cards scanned in stack mode. Each row has the card's
   picture, name, set and number, and small tags: the language when it isn't
   English, FOIL or ETCHED, and ×N for several copies. A card the scanner wasn't
   sure of has an orange dashed border and a PICK tag (a printing to choose) or a
   FIX tag (one that couldn't be read); tapping it opens the picker. Tapping any
   other row opens the confirm sheet to change it. The cross takes a row off the
   list, and "Clear all" at the top right empties the whole list in one go (the
   page that owns the list asks "are you sure?" first). At the bottom: "Keep
   scanning" and "Add N to binder".
   ===================================================================== */

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import Button from '@/components/Button';
import { useColors } from '@/hooks/useTheme';
import type { ScanItem } from '@/lib/scanner/scanItems';

type Props = {
  items: ScanItem[];
  onOpen: (item: ScanItem) => void;       // a row was tapped
  onRemove: (item: ScanItem) => void;
  onClear: () => void;                    // "Clear all" was tapped
  onAdd: () => void;
  onClose: () => void;
};

export default function StackList({ items, onOpen, onRemove, onClear, onAdd, onClose }: Props) {
  const colors = useColors();
  const copies = items.reduce((sum, item) => sum + item.count, 0);
  const flagged = items.filter((item) => item.flag).length;
  return (
    <View style={[styles.page, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to the camera" hitSlop={10} onPress={onClose}>
          <Ionicons name="arrow-back" size={22} color={colors.muted} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Scanned · {copies}</Text>
        {/* "Clear all", pushed to the right end of the bar. Only there when the list has something in it. */}
        {items.length > 0 && (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear all: take every card off the list" hitSlop={10} onPress={onClear} style={styles.clear}>
            <Text style={[styles.clearText, { color: colors.error }]}>Clear all</Text>
          </Pressable>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
        {items.length === 0 && <Text style={[styles.empty, { color: colors.muted }]}>Nothing scanned yet.</Text>}
        {items.map((item) => (
          <View key={item.id} style={[styles.row, { borderBottomColor: colors.border }, item.flag && { backgroundColor: `${colors.accent}12` }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.printing.name}, ${item.printing.setName} number ${item.printing.collectorNumber}${item.flag ? ', needs a look' : ''}`}
              onPress={() => onOpen(item)}
              style={styles.open}
            >
              <View>
                {item.printing.image ? <Image source={{ uri: item.printing.image }} style={styles.picture} contentFit="cover" /> : <View style={styles.picture} />}
                {item.flag && <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dashed, { borderColor: colors.accent }]} />}
              </View>
              <View style={styles.text}>
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{item.printing.name}</Text>
                <Text style={[styles.line, { color: colors.muted }]} numberOfLines={1}>
                  {item.flag === 'fix' ? 'Couldn\'t read it' : item.flag === 'pick' ? 'Not sure which printing' : `${item.printing.setCode.toUpperCase()} #${item.printing.collectorNumber}`}
                </Text>
              </View>
              {item.flag && <Text style={[styles.tag, { color: colors.accent, backgroundColor: `${colors.accent}33` }]}>{item.flag === 'fix' ? 'FIX' : 'PICK'}</Text>}
              {item.lang !== 'en' && <Text style={[styles.tag, { color: colors.muted, backgroundColor: colors.surfaceHover }]}>{item.lang.toUpperCase()}</Text>}
              {item.finish !== 'nonfoil' && <Text style={[styles.tag, { color: colors.muted, backgroundColor: colors.surfaceHover }]}>{item.finish === 'etched' ? 'ETCHED' : 'FOIL'}</Text>}
              {item.count > 1 && <Text style={[styles.tag, { color: colors.muted, backgroundColor: colors.surfaceHover }]}>×{item.count}</Text>}
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Take ${item.printing.name} off the list`} hitSlop={8} onPress={() => onRemove(item)} style={styles.remove}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>
        ))}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <Button label="Keep scanning" kind="secondary" onPress={onClose} />
        <View style={styles.grow}>
          <Button label={`Add ${copies} to binder`} disabled={items.length === 0} onPress={onAdd} />
        </View>
      </View>
      {flagged > 0 && <Text style={[styles.note, { color: colors.muted, backgroundColor: colors.surface }]}>{flagged} {flagged === 1 ? 'card needs' : 'cards need'} a look. Tap {flagged === 1 ? 'it' : 'them'}, or add the list as it is.</Text>}
    </View>
  );
}

// The look: a full page over the scanner, rows with a thin line under each
const styles = StyleSheet.create({
  page: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 20 },
  header: { height: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 16, fontWeight: '700' },
  // "Clear all": at the right end of the top bar ("marginLeft: auto" pushes it there), in the warning color
  clear: { marginLeft: 'auto', paddingVertical: 6, paddingHorizontal: 4 },
  clearText: { fontSize: 14, fontWeight: '700' },
  list: { maxWidth: 700, width: '100%', alignSelf: 'center' },
  empty: { padding: 24, textAlign: 'center', fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  open: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingLeft: 14, minWidth: 0 },
  picture: { width: 40, aspectRatio: 63 / 88, borderRadius: 4 },
  dashed: { borderWidth: 2, borderStyle: 'dashed', borderRadius: 5 },
  text: { flex: 1, minWidth: 0, gap: 1 },
  name: { fontSize: 14.5, fontWeight: '700' },
  line: { fontSize: 12.5 },
  tag: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  remove: { padding: 12 },
  footer: { flexDirection: 'row', gap: 10, padding: 12, borderTopWidth: StyleSheet.hairlineWidth },
  grow: { flex: 1 },
  note: { position: 'absolute', left: 0, right: 0, bottom: 72, textAlign: 'center', fontSize: 12.5, paddingVertical: 4 },
});
