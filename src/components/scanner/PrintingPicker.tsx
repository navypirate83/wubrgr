/* =====================================================================
   WHICH PRINTING?
   Opens when the scanner can't tell which printing a card is (an older card
   with no info line, say), or when "Wrong printing?" is tapped. At the top is
   the artwork as the camera saw it (when there is a photo), then the printings it
   could be, as card pictures with their set, number and year, the scanner's
   best guess first. When the scanner narrowed the list down, the printings that
   fit are shown first and a divider labelled "Other printings" separates them from
   the rest of the card's printings (kept in case a clue was misread).
   Tap the one in your hand, then "Use ...". It never adds a card by itself from here.
   Beside the "Use" button is the finish button (not foil / foil / etched, the same as on
   the confirm sheet), because a card's finish usually can't be told from the photo, so it
   is chosen here together with the printing. It follows the printing tapped: a printing
   that doesn't come in the finish shown switches to one it does, and one that comes in only
   one finish can't be changed.
   ===================================================================== */

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import Button from '@/components/Button';
import { useColors } from '@/hooks/useTheme';
import { RADIUS } from '@/theme/colors';
import FinishButton from './FinishButton';
import { finishesOf, startingFinish } from '@/lib/scanner/scanItems';
import type { Finish } from '@/lib/cards';
import type { Printing } from '@/lib/scanner/core/catalogueTypes';

type Props = {
  name: string;                      // the card's name, for the heading
  candidates: Printing[];            // the printings to choose from, best guess first
  matched?: number;                  // how many of the first ones fit the clues; the rest go under the "Other printings" divider
  chosen: Printing | null;           // the one picked now (starts on this)
  artPreview?: string;               // the artwork as the camera saw it
  reason?: string;                   // how the list was narrowed (a small line)
  finish: Finish;                    // the finish to start on (the card's own, or the scanner option's)
  onPick: (printing: Printing, finish: Finish) => void;
  onClose: () => void;
};

export default function PrintingPicker({ name, candidates, matched, chosen, artPreview, reason, finish: startFinish, onPick, onClose }: Props) {
  const colors = useColors();
  const [selected, setSelected] = useState<Printing | null>(chosen ?? candidates[0] ?? null);
  // The finish picked (not foil, foil or etched). It is kept when the printing tapped comes in it, and
  // otherwise changes to the first finish that printing does come in.
  const [finish, setFinish] = useState<Finish>(() => {
    const first = chosen ?? candidates[0];
    return first && !finishesOf(first).includes(startFinish) ? startingFinish(first) : startFinish;
  });
  // Tap a printing: select it, and fix the finish if it doesn't come in the one shown
  function select(p: Printing) {
    setSelected(p);
    if (!finishesOf(p).includes(finish)) setFinish(startingFinish(p));
  }
  // Where the divider goes: after the printings that fit (no divider if the list wasn't narrowed, or everything fit)
  const split = matched !== undefined && matched > 0 && matched < candidates.length ? matched : candidates.length;

  // One printing: its picture, set, number and year (the first one gets a LIKELY tag)
  function cell(p: Printing, index: number) {
    const on = selected?.id === p.id;
    return (
      <Pressable
        key={p.id}
        accessibilityRole="radio"
        accessibilityState={{ selected: on }}
        accessibilityLabel={`${p.setName}, number ${p.collectorNumber}, ${p.year}`}
        onPress={() => select(p)}
        style={[styles.cell, { borderColor: on ? colors.accent : 'transparent' }]}
      >
        {p.image ? <Image source={{ uri: p.image }} style={styles.picture} contentFit="cover" /> : <View style={styles.picture} />}
        {index === 0 && candidates.length > 1 && <Text style={[styles.likely, { color: colors.accent, backgroundColor: `${colors.accent}33` }]}>LIKELY</Text>}
        <Text style={[styles.label, { color: on ? colors.text : colors.muted }]} numberOfLines={2}>
          {p.setCode.toUpperCase()} #{p.collectorNumber}{'\n'}{p.year || ''}
        </Text>
      </Pressable>
    );
  }
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

        {/* The printings that fit the clues, then (if the list was narrowed) a divider and the rest */}
        <View style={styles.grid}>{candidates.slice(0, split).map((p, index) => cell(p, index))}</View>
        {split < candidates.length && (
          <>
            <View style={styles.divider} accessibilityRole="header">
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              <Text style={[styles.dividerText, { color: colors.muted }]}>Other printings</Text>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            </View>
            <View style={styles.grid}>{candidates.slice(split).map((p, index) => cell(p, split + index))}</View>
          </>
        )}
      </ScrollView>

      {/* The finish button (for the printing tapped), then the button that uses it */}
      <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        {selected && <FinishButton printing={selected} finish={finish} onChange={setFinish} />}
        <View style={styles.use}>
          <Button
            label={selected ? `Use ${selected.setCode.toUpperCase()} #${selected.collectorNumber}${finish === 'foil' ? ' (foil)' : finish === 'etched' ? ' (etched)' : ''}` : 'Choose one'}
            disabled={!selected}
            onPress={() => { if (selected) onPick(selected, finish); }}
          />
        </View>
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
  // The "Other printings" divider: a line, the words, a line
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  cell: { width: '31.5%', alignItems: 'center', gap: 4, borderWidth: 2, borderRadius: 10, padding: 4 },
  picture: { width: '100%', aspectRatio: 63 / 88, borderRadius: 6 },
  likely: { position: 'absolute', top: 8, left: 8, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.5, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, overflow: 'hidden' },
  label: { fontSize: 12, textAlign: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderTopWidth: StyleSheet.hairlineWidth },
  use: { flex: 1 },
});
