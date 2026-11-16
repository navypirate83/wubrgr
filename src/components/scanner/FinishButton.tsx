/* =====================================================================
   THE FINISH BUTTON (not foil / foil / etched)
   The same button as in the Card Finder (see components/search/CardPanel.tsx):
   "Foil" looks ghosted (see-through, with a dashed outline) when the card is
   not foil, is filled with a rainbow when it's foil and with silver ("Etched")
   when it's an etched foil, always with black text. Each tap steps to the next
   finish the printing really comes in. If it comes in only one finish the button
   can't be tapped (very faint if that's not foil).
   ===================================================================== */

import { Pressable, StyleSheet, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FOIL_COLORS } from '@/components/binder/FoilFrame';
import { useColors } from '@/hooks/useTheme';
import { hapticTap } from '@/lib/haptics';
import type { Finish } from '@/lib/cards';
import type { Printing } from '@/lib/scanner/core/catalogueTypes';
import { finishesOf, nextFinishOf } from '@/lib/scanner/scanItems';

export default function FinishButton({ printing, finish, onChange }: { printing: Printing; finish: Finish; onChange: (finish: Finish) => void }) {
  const colors = useColors();
  const choices = finishesOf(printing);
  const canChange = choices.length > 1;
  const name = finish === 'etched' ? 'etched foil' : finish === 'foil' ? 'foil' : 'not foil';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Finish: ${name}`}
      accessibilityHint={canChange ? `Tap to change it to ${nextFinishOf(printing, finish) === 'etched' ? 'etched foil' : nextFinishOf(printing, finish) === 'foil' ? 'foil' : 'not foil'}` : 'This printing only comes in one finish'}
      disabled={!canChange}
      onPress={() => { hapticTap(); onChange(nextFinishOf(printing, finish)); }}
      style={({ pressed }) => [
        styles.pill,
        finish === 'nonfoil' && [styles.off, { borderColor: colors.border }],
        finish === 'nonfoil' && !canChange && styles.none,
        pressed && { opacity: 0.6 },
      ]}
    >
      {finish === 'foil' && <LinearGradient colors={[...FOIL_COLORS]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
      {finish === 'etched' && <LinearGradient colors={['#f4f5f7', '#aeb3bc', '#e6e8ec', '#8f959f']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
      <Text style={[styles.text, { color: finish === 'nonfoil' ? colors.text : '#000000' }]}>{finish === 'etched' ? 'Etched' : 'Foil'}</Text>
    </Pressable>
  );
}

// The look: a rounded pill; not foil is see-through with a dashed edge
const styles = StyleSheet.create({
  pill: { height: 34, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  off: { borderWidth: 1.5, borderStyle: 'dashed', opacity: 0.55 },
  none: { opacity: 0.25 },
  text: { fontSize: 14, fontWeight: '600' },
});
