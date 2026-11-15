/* =====================================================================
   THE NEW DECK WINDOW
   A small window that asks for a new deck's name (a name like "Deck 2"
   is filled in) and its format (Commander, Modern... paper formats only:
   see deckFormats.ts). Formats turned off in Settings (Format legality
   display) are not offered; if every one is off, all of them show. It only collects the answers: "onCreate" is called
   with the name and the format's code, and the screen that opened the
   window makes the deck. Used by the Decks page's "Add deck" and by the
   Card Finder's "+" (New deck, with the card in it).
   The Decks page also turns on "allowImport": an "Import a decklist" part
   to fill the new deck from a pasted list, a link (Archidekt or Moxfield)
   or a file (see ImportSource.tsx). The list is given to "onCreate" as a
   third answer, and the window waits for onCreate to finish (reading the
   list takes a few seconds) before it lets go.
   ===================================================================== */

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import PopupWindow from '@/components/PopupWindow';
import TextField from '@/components/TextField';
import { useColors } from '@/hooks/useTheme';
import { useSettings } from '@/hooks/useSettings';
import { nextDeckName } from '@/lib/deckStorage';
import { DECK_FORMATS, DEFAULT_DECK_FORMAT } from '@/lib/deckFormats';
import ImportSource from './ImportSource';

// The longest a deck's name can be
const NAME_LIMIT = 40;

type Props = {
  confirmLabel?: string;                              // the button's words ("Create" by default)
  // The name, the format's code and (when importing) the decklist text; it may
  // take a while, so it can give back a promise
  onCreate: (name: string, format: string, source?: string) => void | Promise<void>;
  onCancel: () => void;
  allowImport?: boolean;                              // adds the "Import a decklist" part
};

export default function NewDeckDialog({ confirmLabel = 'Create', onCreate, onCancel, allowImport }: Props) {
  const colors = useColors();
  // The name being typed and the format chosen so far
  const [name, setName] = useState(nextDeckName);
  // The formats turned off in Settings are left out (unless every one is off:
  // then they all show, so a deck can still be made)
  const { hiddenFormats } = useSettings();
  const shown = DECK_FORMATS.filter((option) => !hiddenFormats.includes(option.code));
  const choices = shown.length > 0 ? shown : DECK_FORMATS;
  // The format chosen so far: Commander if that's offered, otherwise the first one offered
  const [format, setFormat] = useState(() => (choices.some((c) => c.code === DEFAULT_DECK_FORMAT) ? DEFAULT_DECK_FORMAT : choices[0].code));
  // The decklist to fill the deck from (and whether its box is open), and
  // whether creating is under way
  const [source, setSource] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const create = async () => {
    if (!name.trim() || working) return;
    setWorking(true);
    try {
      await onCreate(name, format, importOpen && source.trim() ? source : undefined);
    } finally {
      setWorking(false);
    }
  };

  return (
    <PopupWindow title="New deck" onClose={onCancel}
                 buttons={[
                   { label: 'Cancel', onPress: onCancel, kind: 'secondary', disabled: working },
                   { label: working ? 'Working…' : confirmLabel, onPress: create, disabled: !name.trim() || working },
                 ]}>
      <View style={styles.body}>
        <TextField
          label="Name"
          value={name}
          onChangeText={setName}
          onSubmitEditing={create}
          returnKeyType="done"
          autoFocus
          selectTextOnFocus
          maxLength={NAME_LIMIT}
          autoCapitalize="words"
        />
        <Text style={[styles.formatLabel, { color: colors.muted }]}>Format</Text>
        <View style={styles.formats}>
          {choices.map((option) => {
            const chosen = option.code === format;
            return (
              <Pressable key={option.code} accessibilityRole="radio" accessibilityState={{ selected: chosen }}
                         onPress={() => setFormat(option.code)}
                         style={[styles.chip, { borderColor: chosen ? colors.accent : colors.border, backgroundColor: chosen ? colors.accent : 'transparent' }]}>
                <Text style={[styles.chipText, { color: chosen ? colors.bg : colors.text }]}>{option.name}</Text>
              </Pressable>
            );
          })}
        </View>
        {/* Import a decklist (optional): opens a box for a list, a link or a file */}
        {allowImport && (
          <>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: importOpen }} onPress={() => setImportOpen(!importOpen)} style={styles.importToggle}>
              <Text style={[styles.importToggleText, { color: colors.accent }]}>{importOpen ? "− Don't import a decklist" : '+ Import a decklist (optional)'}</Text>
            </Pressable>
            {importOpen && <ImportSource value={source} onChange={setSource} disabled={working} />}
          </>
        )}
      </View>
    </PopupWindow>
  );
}

// The look: the name box, then the formats as rounded chips (the chosen one filled in)
const styles = StyleSheet.create({
  body: { gap: 8 },
  formatLabel: { fontSize: 14, fontWeight: '600', marginTop: 4 },
  formats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5 },
  chipText: { fontSize: 14, fontWeight: '600' },
  importToggle: { paddingVertical: 8 },
  importToggleText: { fontSize: 15, fontWeight: '600' },
});
