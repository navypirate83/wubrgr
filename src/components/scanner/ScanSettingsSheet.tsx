/* =====================================================================
   THE SCANNER OPTIONS SHEET (the little gear button on the scan screen)
   Slides up from the bottom with every option for scanning. They are all
   optional: leave them alone and the scanner works as it always has.
   - LOCK TO A SET: pick the set you're sorting through ("Dominaria") and
     the scanner only looks for printings from it. Quicker and surer when a
     whole pile is from one set. Choose "Off" to go back to any set.
   - WHEN IT ISN'T SURE: "Ask me" shows the printing choices (or marks the card
     in the stack list to check later). "Best guess" takes the most likely
     printing and carries on; you can still change a card in the list.
   - START CARDS AS: non-foil or foil, so a pile of foils isn't fixed one by one.
   - SHOW SCAN TIMES: the "Read in 1.2 s" line after each scan.
   Each change is saved straight away, on this device (see lib/scanner/scanSettings.ts).
   ===================================================================== */

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PickerButton, PickerSheet, type Anchor } from '@/components/search/PickerSheet';
import { SettingBlock, SwitchRow } from '@/components/settings/SettingsParts';
import { useColors } from '@/hooks/useTheme';
import { allSets } from '@/lib/scanner/catalogue/catalogue';
import type { SetInfo } from '@/lib/scanner/core/catalogueTypes';
import type { ScanOptions } from '@/lib/scanner/core/scanOptions';
import { RADIUS } from '@/theme/colors';

type Props = {
  options: ScanOptions;
  onChange: (changes: Partial<ScanOptions>) => void;
  onClose: () => void;
};

// A bar of side-by-side choices as one rounded box, the chosen one filled in orange (like the
// Theme choice in Settings). Screen readers hear it as a group of radio buttons.
function Choice<T extends string>({ label, value, choices, onChange }: {
  label: string;
  value: T;
  choices: { value: T; name: string }[];
  onChange: (value: T) => void;
}) {
  const colors = useColors();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.choiceBar, { borderColor: colors.border, backgroundColor: colors.bg }]}>
      {choices.map((choice) => {
        const picked = value === choice.value;
        return (
          <Pressable
            key={choice.value}
            accessibilityRole="radio"
            accessibilityLabel={choice.name}
            accessibilityState={{ checked: picked }}
            onPress={() => onChange(choice.value)}
            style={({ pressed }) => [styles.choice, picked && { backgroundColor: colors.accent }, pressed && !picked && { backgroundColor: colors.surfaceHover }]}
          >
            <Text style={[styles.choiceText, { color: picked ? colors.accentText : colors.text }]}>{choice.name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// One set's row: its symbol, its code and its name (the symbol pictures are black, so in dark mode they're tinted light)
function SetRow({ set, bold }: { set: Pick<SetInfo, 'code' | 'name' | 'icon'>; bold?: boolean }) {
  const colors = useColors();
  return (
    <>
      {set.icon ? <Image source={{ uri: set.icon }} style={styles.setIcon} contentFit="contain" tintColor={colors.iconTint} /> : <View style={styles.setIcon} />}
      <Text style={[styles.setCode, { color: colors.text }]}>{set.code.toUpperCase()}</Text>
      <Text style={[styles.setName, { color: colors.text }, bold && styles.bold]} numberOfLines={1}>{set.name}</Text>
    </>
  );
}

export default function ScanSettingsSheet({ options, onChange, onClose }: Props) {
  const colors = useColors();
  // Every set in the catalogue (read once when the sheet opens), and whether the set list is open
  const [sets, setSets] = useState<SetInfo[]>([]);
  const [listOpen, setListOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | undefined>(undefined);
  useEffect(() => { allSets().then(setSets).catch(() => { /* the lock just can't be changed until the catalogue is there */ }); }, []);

  const locked = options.lockedSet;
  // The locked set with its symbol picture, if the catalogue has it
  const current = locked ? sets.find((s) => s.code === locked.code) ?? { code: locked.code, name: locked.name, released: '', icon: null } : null;

  return (
    <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border, boxShadow: colors.shadow }]}>
      {/* The heading, and a button to put the sheet away */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">Scanner options</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={onClose}>
          <Ionicons name="close" size={24} color={colors.muted} />
        </Pressable>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Lock to a set: the box shows the locked set (or "Off"); tapping it drops the list of sets down */}
        <SettingBlock name="Lock to a set" description="Only look for printings from this set. Optional: leave it off to scan cards from any set.">
          <PickerButton
            accessibilityLabel={current ? `Locked to ${current.name}` : 'Lock to a set: off'}
            onPress={(box) => { setAnchor(box); setListOpen(true); }}
          >
            {current ? <SetRow set={current} /> : <Text style={[styles.setName, { color: colors.muted }]}>Off: any set</Text>}
          </PickerButton>
        </SettingBlock>

        <SettingBlock name="When it isn't sure" description="Ask me shows the printing choices. Best guess takes the most likely printing and carries on; you can still change it in the list.">
          <Choice
            label="When it isn't sure" value={options.unsure} onChange={(unsure) => onChange({ unsure })}
            choices={[{ value: 'ask', name: 'Ask me' }, { value: 'guess', name: 'Best guess' }]}
          />
        </SettingBlock>

        <SettingBlock name="Start cards as" description="Every scanned card starts with this finish (a card that doesn't come in foil stays non-foil). You can still change each one.">
          <Choice
            label="Start cards as" value={options.startFinish} onChange={(startFinish) => onChange({ startFinish })}
            choices={[{ value: 'nonfoil', name: 'Non-foil' }, { value: 'foil', name: 'Foil' }]}
          />
        </SettingBlock>

        <SwitchRow name="Show how long each scan took" value={options.showTimings} onChange={(showTimings) => onChange({ showTimings })} />
      </ScrollView>

      {/* The list of sets, drawn only while it's open: "Off" at the top, then every set, newest first */}
      {listOpen && (
        <PickerSheet
          anchor={anchor}
          filterable
          title={`Lock to a set (${sets.length} sets)`}
          items={sets}
          current={sets.find((s) => s.code === locked?.code) ?? null}
          keyOf={(set) => set.code}
          labelOf={(set) => `${set.name}, ${set.code.toUpperCase()}`}
          renderRow={(set, isCurrent) => <SetRow set={set} bold={isCurrent} />}
          onPick={(set) => { onChange({ lockedSet: { code: set.code, name: set.name } }); setListOpen(false); }}
          onClose={() => setListOpen(false)}
          header={
            <Pressable
              accessibilityRole="button" accessibilityLabel="Off: any set" onPress={() => { onChange({ lockedSet: null }); setListOpen(false); }}
              style={({ pressed }) => [styles.offRow, pressed && { backgroundColor: colors.surfaceHover }]}
            >
              <Text style={[styles.setName, { color: colors.text }, !locked && styles.bold]}>Off: any set</Text>
            </Pressable>
          }
        />
      )}
    </View>
  );
}

// The look: a rounded sheet at the bottom (never wider than a phone), the options scrolling if the screen is short
const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxWidth: 560, width: '100%', maxHeight: '85%', alignSelf: 'center', borderTopLeftRadius: RADIUS * 1.5, borderTopRightRadius: RADIUS * 1.5, borderWidth: 1, borderBottomWidth: 0, paddingTop: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 4 },
  title: { fontSize: 18, fontWeight: '800' },
  scroll: { flexGrow: 0 },
  content: { paddingBottom: 18 },
  choiceBar: { flexDirection: 'row', borderWidth: 1, borderRadius: RADIUS, overflow: 'hidden' },
  choice: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  choiceText: { fontSize: 15, fontWeight: '700' },
  setIcon: { width: 20, height: 20, flexShrink: 0 },
  setCode: { flexShrink: 0, fontSize: 15, fontWeight: '600', fontFamily: 'monospace', marginHorizontal: 8 },
  setName: { flex: 1, minWidth: 0, fontSize: 15 },
  bold: { fontWeight: '700' },
  offRow: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' },
});
