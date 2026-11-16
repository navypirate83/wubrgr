/* =====================================================================
   WHICH PRINTING?
   Opens when the scanner can't tell which printing a card is (an older card
   with no info line, say), or when "Wrong printing?" is tapped. At the top is
   the artwork as the camera saw it (when there is a photo), then the printings it
   could be, as card pictures with their set, number and year, the scanner's
   best guess first. Tap the one in your hand, then "Use ...". It never adds
   a card by itself from here.
   ===================================================================== */

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import Button from '@/components/Button';
import { useColors } from '@/hooks/useTheme';
import { RADIUS } from '@/theme/colors';
import type { Printing } from '@/lib/scanner/core/catalogueTypes';

type Props = {
  name: string;                      // the card's name, for the heading
  candidates: Printing[];            // the printings to choose from, best guess first
  chosen: Printing | null;           // the one picked now (starts on this)
  artPreview?: string;               // the artwork as the camera saw it
  reason?: string;                   // how the list was narrowed (a small line)
  onPick: (printing: Printing) => void;
  onClose: () => void;
};

export default function PrintingPicker({ name, candidates, chosen, artPreview, reason, onPick, onClose }: Props) {
  const colors = useColors();
  const [selected, setSelected] = useState<Printing | null>(chosen ?? candidates[0] ?? null);
  return (
    <View style={[styles.page, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={onClose}>
          <Ionicons name="arrow-back" size={22} color={colors.muted} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>Which printing?</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* The card's name, with the camera's view of its art beside it */}
        <View style={[styles.mine, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {artPreview ? <Image source={{ uri: artPreview }} style={styles.art} contentFit="cover" /> : null}
          <View style={styles.mineText}>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>{name}</Text>
            <Text style={[styles.line, { color: colors.muted }]}>{artPreview ? 'Your photo\'s art, beside the printings.' : 'Choose the printing you have.'}</Text>
          </View>
        </View>
        {reason ? <Text style={[styles.line, { color: colors.muted }]}>{reason}</Text> : null}

        <View style={styles.grid}>
          {candidates.map((p, index) => {
            const on = selected?.id === p.id;
            return (
              <Pressable
                key={p.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${p.setName}, number ${p.collectorNumber}, ${p.year}`}
                onPress={() => setSelected(p)}
                style={[styles.cell, { borderColor: on ? colors.accent : 'transparent' }]}
              >
                {p.image ? <Image source={{ uri: p.image }} style={styles.picture} contentFit="cover" /> : <View style={styles.picture} />}
                {index === 0 && candidates.length > 1 && <Text style={[styles.likely, { color: colors.accent, backgroundColor: `${colors.accent}33` }]}>LIKELY</Text>}
                <Text style={[styles.label, { color: on ? colors.text : colors.muted }]} numberOfLines={2}>
                  {p.setCode.toUpperCase()} #{p.collectorNumber}{'\n'}{p.year || ''}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <Button
          label={selected ? `Use ${selected.setCode.toUpperCase()} #${selected.collectorNumber}` : 'Choose one'}
          disabled={!selected}
          onPress={() => { if (selected) onPick(selected); }}
        />
      </View>
    </View>
  );
}

// The look: a full page over the scanner, with the printings in rows of three
const styles = StyleSheet.create({
  page: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 20 },
  header: { height: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 16, fontWeight: '700' },
  content: { padding: 14, gap: 12, maxWidth: 700, width: '100%', alignSelf: 'center' },
  mine: { flexDirection: 'row', gap: 12, alignItems: 'center', borderWidth: 1, borderRadius: RADIUS, padding: 10 },
  art: { width: 96, height: 70, borderRadius: 6 },
  mineText: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '800' },
  line: { fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { width: '31.5%', alignItems: 'center', gap: 4, borderWidth: 2, borderRadius: 10, padding: 4 },
  picture: { width: '100%', aspectRatio: 63 / 88, borderRadius: 6 },
  likely: { position: 'absolute', top: 8, left: 8, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.5, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, overflow: 'hidden' },
  label: { fontSize: 12, textAlign: 'center' },
  footer: { padding: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
