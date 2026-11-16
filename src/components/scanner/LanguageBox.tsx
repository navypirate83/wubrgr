/* =====================================================================
   THE LANGUAGE BOX
   A small drop-down that shows just the language's letters ("EN", "FR",
   "ZHS": Scryfall's own codes) and, when opened, lists the full names with their
   letters beside them. It starts on the language the scanner read off the card.
   ===================================================================== */

import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { PickerButton, PickerSheet, SheetRowText, type Anchor } from '@/components/search/PickerSheet';
import { useColors } from '@/hooks/useTheme';
import { languageName } from '@/lib/cards';

// The languages cards are scanned in, in the order the list shows them
const LANGUAGES = ['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'ru', 'zhs', 'zht', 'he', 'la', 'grc', 'ar', 'sa'];

export default function LanguageBox({ value, onChange }: { value: string; onChange: (lang: string) => void }) {
  const colors = useColors();
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  // A language outside the list (one read off a card) is still shown, so it isn't lost
  const choices = LANGUAGES.includes(value) ? LANGUAGES : [value, ...LANGUAGES];
  return (
    <>
      <PickerButton accessibilityLabel={`Language: ${languageName(value)}`} onPress={setAnchor} style={styles.box}>
        <Text style={[styles.letters, { color: colors.text }]}>{value.toUpperCase()}</Text>
      </PickerButton>
      {anchor && (
        <PickerSheet
          title="Language"
          anchor={anchor}
          items={choices}
          current={value}
          keyOf={(code) => code}
          labelOf={(code) => languageName(code)}
          renderRow={(code) => (
            <>
              <SheetRowText text={languageName(code)} bold={code === value} />
              <Text style={[styles.code, { color: colors.muted }]}>{code.toUpperCase()}</Text>
            </>
          )}
          onPick={(code) => { setAnchor(null); onChange(code); }}
          onClose={() => setAnchor(null)}
        />
      )}
    </>
  );
}

// The look: a narrow box with the letters; the list's letters sit at the right of each row
const styles = StyleSheet.create({
  box: { minWidth: 78 },
  letters: { fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
  code: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
});
