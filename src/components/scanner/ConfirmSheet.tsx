/* =====================================================================
   THE CONFIRM SHEET
   Slides up from the bottom after a card is scanned (in one-card mode), or
   when a card in the stack's list is tapped to change it. It shows the card's
   picture, its name, its set and collector number, then one row to adjust it:
   how many (a "− 1 +" box), the finish button (not foil / foil / etched, like
   the Card Finder's) and the language box (just its letters; the list has the
   full names). Under that: the main button (which says where it goes, or "Done"
   when changing a card in the list) and "Wrong printing?" to pick another
   printing of the card. A "LIKELY" tag says the scanner wasn't sure.
   ===================================================================== */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import Button from '@/components/Button';
import FinishButton from './FinishButton';
import LanguageBox from './LanguageBox';
import { useColors } from '@/hooks/useTheme';
import { MAX_COPIES } from '@/lib/binderStorage';
import { RADIUS } from '@/theme/colors';
import type { ScanItem } from '@/lib/scanner/scanItems';

type Props = {
  item: ScanItem;
  likely?: boolean;                       // the scanner wasn't sure: show the tag
  primaryLabel: string;                   // "Add to binder", or "Done"
  onChange: (item: ScanItem) => void;
  onPrimary: () => void;
  onWrongPrinting?: () => void;           // shown when there are other printings to pick
  onClose: () => void;
};

export default function ConfirmSheet({ item, likely, primaryLabel, onChange, onPrimary, onWrongPrinting, onClose }: Props) {
  const colors = useColors();
  const p = item.printing;
  return (
    <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border, boxShadow: colors.shadow }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={onClose} style={styles.close}>
        <Ionicons name="close" size={22} color={colors.muted} />
      </Pressable>

      <View style={styles.top}>
        {p.image ? <Image source={{ uri: p.image }} style={styles.picture} contentFit="cover" /> : <View style={styles.picture} />}
        <View style={styles.info}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>{p.name}</Text>
          <Text style={[styles.line, { color: colors.muted }]} numberOfLines={2}>{p.setName} ({p.setCode.toUpperCase()}) #{p.collectorNumber}</Text>
          <Text style={[styles.line, { color: colors.muted }]} numberOfLines={1}>{p.rarity ? `${p.rarity[0].toUpperCase()}${p.rarity.slice(1)} · ` : ''}{p.typeLine.split('//')[0].trim()}</Text>
          {likely && <Text style={[styles.likely, { color: colors.accent, backgroundColor: `${colors.accent}33` }]}>LIKELY</Text>}
        </View>
      </View>

      <View style={styles.options}>
        {/* How many */}
        <View style={[styles.stepper, { borderColor: colors.border }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="One fewer" disabled={item.count <= 1} onPress={() => onChange({ ...item, count: item.count - 1 })} style={[styles.step, item.count <= 1 && styles.faded]}>
            <Ionicons name="remove" size={20} color={colors.text} />
          </Pressable>
          <Text style={[styles.count, { color: colors.text, borderColor: colors.border }]} accessibilityLabel={`${item.count} copies`}>{item.count}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="One more" disabled={item.count >= MAX_COPIES} onPress={() => onChange({ ...item, count: item.count + 1 })} style={[styles.step, item.count >= MAX_COPIES && styles.faded]}>
            <Ionicons name="add" size={20} color={colors.text} />
          </Pressable>
        </View>
        <FinishButton printing={p} finish={item.finish} onChange={(finish) => onChange({ ...item, finish })} />
        <LanguageBox value={item.lang} onChange={(lang) => onChange({ ...item, lang })} />
      </View>

      <Button label={primaryLabel} onPress={onPrimary} />
      {onWrongPrinting && (
        <Pressable accessibilityRole="button" onPress={onWrongPrinting} hitSlop={8}>
          <Text style={[styles.wrong, { color: colors.accent }]}>Wrong printing?</Text>
        </Pressable>
      )}
    </View>
  );
}

// The look: a rounded sheet at the bottom, never wider than a phone
const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxWidth: 560, width: '100%', alignSelf: 'center', borderTopLeftRadius: RADIUS * 1.5, borderTopRightRadius: RADIUS * 1.5, borderWidth: 1, borderBottomWidth: 0, padding: 14, gap: 12 },
  close: { position: 'absolute', top: 8, right: 10, zIndex: 2 },
  top: { flexDirection: 'row', gap: 12, paddingRight: 24 },
  picture: { width: 84, aspectRatio: 63 / 88, borderRadius: 6 },
  info: { flex: 1, gap: 3, minWidth: 0 },
  name: { fontSize: 17, fontWeight: '800' },
  line: { fontSize: 13 },
  likely: { alignSelf: 'flex-start', fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden', marginTop: 2 },
  options: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 10, height: 36, overflow: 'hidden' },
  step: { width: 34, height: '100%', alignItems: 'center', justifyContent: 'center' },
  count: { minWidth: 32, textAlign: 'center', fontSize: 16, fontWeight: '800', borderLeftWidth: 1.5, borderRightWidth: 1.5, lineHeight: 33 },
  faded: { opacity: 0.35 },
  wrong: { textAlign: 'center', fontSize: 14, fontWeight: '700' },
});
