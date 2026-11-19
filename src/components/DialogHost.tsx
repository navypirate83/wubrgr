/* =====================================================================
   THE APP'S OWN MESSAGE AND QUESTION WINDOW
   Drawn once, by the app's outer frame (app/_layout.tsx), and invisible
   until some code calls showMessage or askYesNo (see lib/dialogs.ts).
   It's the app's own pop-up (not the phone's or browser's plain box), so
   Scryfall symbol codes like {R} in a name are drawn as symbols.
   - A message has one OK button.
   - A question has a "no" button and a "yes" button; tapping outside or
     pressing Back counts as no.
   ===================================================================== */

import { useSyncExternalStore } from 'react';
import { StyleSheet } from 'react-native';
import SymbolText from '@/components/SymbolText';
import { useColors } from '@/hooks/useTheme';
import { answerDialog, currentDialog, onDialogChange } from '@/lib/dialogs';
import PopupWindow from './PopupWindow';

export default function DialogHost() {
  const colors = useColors();
  // Redraws whenever a dialog appears or is answered
  const dialog = useSyncExternalStore(onDialogChange, currentDialog, currentDialog);
  if (!dialog) return null;
  // A question's "yes" is the main button; a plain message just has OK
  const buttons = dialog.no === null
    ? [{ label: dialog.yes, onPress: () => answerDialog(true) }]
    : [
        { label: dialog.no, kind: 'secondary' as const, onPress: () => answerDialog(false) },
        { label: dialog.yes, onPress: () => answerDialog(true) },
      ];
  return (
    <PopupWindow title={dialog.title} onClose={() => answerDialog(false)} buttons={buttons}>
      {dialog.message ? (
        <SymbolText inline style={[styles.text, { color: colors.text }]}>{dialog.message}</SymbolText>
      ) : null}
    </PopupWindow>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 15, lineHeight: 22 },
});
