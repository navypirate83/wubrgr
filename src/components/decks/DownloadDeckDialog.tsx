/* =====================================================================
   THE DOWNLOAD WINDOW (for a deck)
   Opened by the download button on a deck. Three ways to take the deck
   with you:
     - a .CSV file (a spreadsheet: every detail, and the file this app can
       read back in)
     - a .TXT file (a plain list: "1 Sol Ring (CMM) 400", with headings,
       which Archidekt, Moxfield and other sites can read)
     - Copy: the same list as the .TXT file, put on the device's clipboard
       so it can be pasted anywhere
   ===================================================================== */

import { StyleSheet, View } from 'react-native';
import PopupWindow from '@/components/PopupWindow';
import Button from '@/components/Button';
import { downloadDeckCsv, downloadDeckText, copyDeckText } from '@/lib/binderDownload';
import { showMessage } from '@/lib/dialogs';

type Props = {
  deckId: string;
  onClose: () => void;
  onCopied: () => void;   // the list is on the clipboard
};

export default function DownloadDeckDialog({ deckId, onClose, onCopied }: Props) {
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
    <PopupWindow title="Download this deck" onClose={onClose}
                 buttons={[{ label: 'Close', onPress: onClose, kind: 'secondary' }]}>
      <View style={styles.menu}>
        <Button label=".CSV file (a spreadsheet)" icon="grid-outline" kind="secondary" onPress={() => run(() => downloadDeckCsv(deckId))} />
        <Button label=".TXT file (a plain list)" icon="document-text-outline" kind="secondary" onPress={() => run(() => downloadDeckText(deckId))} />
        <Button label="Copy the list" icon="copy-outline" kind="secondary" onPress={() => run(() => copyDeckText(deckId), onCopied)} />
      </View>
    </PopupWindow>
  );
}

// The look: the three buttons one under another
const styles = StyleSheet.create({
  menu: { gap: 10 },
});
