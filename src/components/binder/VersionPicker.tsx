/* =====================================================================
   THE VERSIONS PICKER (every printing of a card)
   Opens from the set drop box in the card screen's Edit mode. It shows
   every version of the card, a few across (3 on a narrow phone, up to 5
   on a wide window), each with its picture, its set's symbol in the color
   of its rarity, and its set code and card number. A search box at the top
   narrows the list as you type: type part of a set's name, a set code or a
   card number (see matchesVersion in cardEdit.ts). Tap a version to pick it.
   The version the card is now is outlined.
   ===================================================================== */

import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useColors, useTheme } from '@/hooks/useTheme';
import { pictureSource } from '@/lib/http';
import { matchesVersion } from '@/lib/cardEdit';
import { imageFor } from '@/lib/cards';
import { rarityColor } from '@/lib/rarity';
import { cardBySetPath, loadCard, loadSetIcons, type ScryfallCard } from '@/lib/scryfall';
import { RADIUS } from '@/theme/colors';

type Props = {
  set: string;                              // the card's set code now
  number: string;                           // and its collector number now
  onPick: (version: ScryfallCard) => void;
  onClose: () => void;
};

// A card's shape, for the little pictures
const CARD_RATIO = 63 / 88;

export default function VersionPicker({ set, number, onPick, onClose }: Props) {
  const colors = useColors();
  const dark = useTheme() === 'dark';
  const { width: windowWidth } = useWindowDimensions();
  const [typed, setTyped] = useState('');

  // How many across: 3 on a phone, 4 on a larger one, 5 on a wide window
  const columns = windowWidth < 520 ? 3 : windowWidth < 760 ? 4 : 5;
  // The panel is as wide as the window up to 660, minus its padding
  const panelWidth = Math.min(windowWidth - 24, 660);
  const cellWidth = Math.floor((panelWidth - 24 - (columns - 1) * 8) / columns);

  // Every printing of the card, and the set symbols
  const versions = useQuery({
    queryKey: ['edit-versions', set, number],
    queryFn: async () => (await loadCard(cardBySetPath(set, number))).prints,
    staleTime: Infinity,
  });
  const setIcons = useQuery({ queryKey: ['set-icons'], queryFn: loadSetIcons });

  // The versions that match what's typed (all of them when the box is empty)
  const shown = useMemo(() => (versions.data ?? []).filter((version) => matchesVersion(version, typed)), [versions.data, typed]);

  return (
    <View style={styles.layer}>
      {/* The dimmed area: tapping it closes the picker */}
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close the versions" />
      <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border, boxShadow: colors.shadow, width: panelWidth }]} accessibilityViewIsModal>
        {/* The search box */}
        <View style={[styles.searchBox, { borderColor: colors.border, backgroundColor: colors.bg }]}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            value={typed} onChangeText={setTyped}
            placeholder="Search by set name, set code or number" placeholderTextColor={colors.muted}
            accessibilityLabel="Search the versions by set name, set code or number"
            autoCapitalize="none" autoCorrect={false} autoFocus
            style={[styles.searchInput, { color: colors.text }]}
          />
          {typed.length > 0 && (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear the search" onPress={() => setTyped('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          )}
        </View>

        {versions.isLoading ? (
          <View style={styles.note}><ActivityIndicator color={colors.accent} /></View>
        ) : versions.isError || !versions.data ? (
          <Text style={[styles.noteText, { color: colors.muted }]}>Couldn't load the versions.</Text>
        ) : shown.length === 0 ? (
          <Text style={[styles.noteText, { color: colors.muted }]}>No version matches that.</Text>
        ) : (
          <FlatList
            key={columns}
            data={shown}
            numColumns={columns}
            keyExtractor={(version) => version.id}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            columnWrapperStyle={{ gap: 8 }}
            contentContainerStyle={{ gap: 10, paddingBottom: 4 }}
            renderItem={({ item: version }) => {
              const current = version.set === set && version.collector_number === number;
              const icon = setIcons.data?.get(version.set.toLowerCase());
              const picture = imageFor(version, 0, ['small', 'normal']);
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${version.set_name}, ${version.set.toUpperCase()} number ${version.collector_number}${current ? ', the one you have now' : ''}`}
                  onPress={() => onPick(version)}
                  style={({ pressed }) => [styles.cell, { width: cellWidth, borderColor: current ? colors.accent : 'transparent' }, pressed && styles.pressed]}
                >
                  {picture ? <Image source={pictureSource(picture)} style={{ width: '100%', aspectRatio: CARD_RATIO, borderRadius: 6 }} contentFit="contain" /> : <View style={{ width: '100%', aspectRatio: CARD_RATIO }} />}
                  <View style={styles.cellLine}>
                    {icon ? <Image source={{ uri: icon }} style={styles.cellIcon} contentFit="contain" tintColor={rarityColor(version.rarity, colors, dark)} /> : null}
                    <Text style={[styles.cellText, { color: colors.text }]} numberOfLines={1}>{version.set.toUpperCase()} · #{version.collector_number}</Text>
                  </View>
                </Pressable>
              );
            }}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Covers the card screen, with the panel in the middle
  layer: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 12 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0, 0, 0, 0.5)' },
  panel: { maxHeight: '85%', borderWidth: 1, borderRadius: RADIUS * 2, padding: 12, gap: 10 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: RADIUS, paddingHorizontal: 10, minHeight: 44 },
  searchInput: { flex: 1, minWidth: 0, fontSize: 15, paddingVertical: 8 },
  note: { padding: 24, alignItems: 'center' },
  noteText: { fontSize: 14, padding: 16, textAlign: 'center' },
  cell: { borderWidth: 2, borderRadius: 8, padding: 3, gap: 4 },
  cellLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  cellIcon: { width: 12, height: 12 },
  cellText: { fontSize: 11, fontWeight: '600', flexShrink: 1 },
  pressed: { opacity: 0.7 },
});
