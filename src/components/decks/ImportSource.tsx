/* =====================================================================
   WHERE A DECKLIST COMES FROM
   The part of the import windows where the decklist is given: a big box to
   paste a list (or a link to a deck on Archidekt or Moxfield) into, and a
   button to choose a file instead (.csv, .json or .txt). A chosen file's
   text is put in the box, so what will be imported is always what's showing.
   It only collects the text: "onChange" is called with it, and the window
   around it does the importing.
   ===================================================================== */

import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import TextField from '@/components/TextField';
import Button from '@/components/Button';
import { useColors } from '@/hooks/useTheme';
import { pickTextFile } from '@/lib/pickFile';
import { showMessage } from '@/lib/dialogs';

type Props = {
  value: string;
  onChange: (text: string) => void;
  disabled?: boolean;
};

export default function ImportSource({ value, onChange, disabled }: Props) {
  const colors = useColors();
  // The name of the file whose text is in the box (shown under it)
  const [fileName, setFileName] = useState<string | null>(null);

  // "Choose a file": pick it, read its text and put it in the box
  async function chooseFile() {
    try {
      const file = await pickTextFile();
      if (!file) return;   // the picker was closed without a file
      onChange(file.text);
      setFileName(file.name);
    } catch (err) {
      showMessage('Couldn\'t read that file', (err as Error).message);
    }
  }

  return (
    <View style={styles.wrap}>
      <TextField
        label="Decklist or link"
        value={value}
        onChangeText={(text) => { onChange(text); setFileName(null); }}
        editable={!disabled}
        multiline
        numberOfLines={6}
        placeholder={`Paste a list, like\n1 Sol Ring\n1x Arcane Signet (CMM) 400\n\nor a link to a deck on Archidekt or Moxfield`}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.box}
      />
      <Button label="Choose a file…" icon="document-outline" kind="secondary" disabled={disabled} onPress={chooseFile} />
      <Text style={[styles.note, { color: colors.muted }]}>
        {fileName ? `Loaded ${fileName}. ` : ''}A text list, a .csv or a .json file (from this app, ManaBox, Archidekt or Moxfield) all work.
      </Text>
    </View>
  );
}

// The look: a tall box for the list, then the file button and a small note
const styles = StyleSheet.create({
  wrap: { gap: 8 },
  box: { minHeight: 130, maxHeight: 220, paddingVertical: 10, textAlignVertical: 'top' },
  note: { fontSize: 13 },
});
