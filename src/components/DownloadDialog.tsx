/* =====================================================================
   THE DOWNLOAD WINDOW (for a deck, a list or a binder)
   Opened by the download button. Three ways to take the cards with you:
     - a .CSV file (a spreadsheet: every detail, and the file this app can
       read back in)
     - a .TXT file (a plain list: "1 Sol Ring (CMM) 400", which Archidekt,
       Moxfield and other sites can read; a deck's has headings)
     - Copy: the same list as the .TXT file, put on the device's clipboard
       so it can be pasted anywhere
   The screen says how to do each ("csv", "text", "copy") for what it shows.
   ===================================================================== */

import { StyleSheet, View } from 'react-native';
import PopupWindow from '@/components/PopupWindow';
import Button from '@/components/Button';
import { showMessage } from '@/lib/dialogs';

type Props = {
  title: string;
  csv: () => Promise<void>;
  text: () => Promise<void>;
  copy: () => Promise<void>;
  onClose: () => void;
  onCopied: () => void;   // the list is on the clipboard
};

export default function DownloadDialog({ title, csv, text, copy, onClose, onCopied }: Props) {
  // Run one of the ways, then close the window (or say what went wrong)
  async function run(how: () => Promise<void>, then?: () => void) {
    try {
      await how();
      onClose();
      then?.();
    } catch (err) {
      showMessage('Couldn\'t do that', (err as Error).message);
    }
  }

  return (
    <PopupWindow title={title} onClose={onClose}
                 buttons={[{ label: 'Close', onPress: onClose, kind: 'secondary' }]}>
      <View style={styles.menu}>
        <Button label=".CSV file (a spreadsheet)" icon="grid-outline" kind="secondary" onPress={() => run(csv)} />
        <Button label=".TXT file (a plain list)" icon="document-text-outline" kind="secondary" onPress={() => run(text)} />
        <Button label="Copy the list" icon="copy-outline" kind="secondary" onPress={() => run(copy, onCopied)} />
      </View>
    </PopupWindow>
  );
}

// The look: the three buttons one under another
const styles = StyleSheet.create({
  menu: { gap: 10 },
});
