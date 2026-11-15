/* =====================================================================
   THE IMPORT WINDOW (for a deck that already exists)
   Opened by the upload button beside the deck's download button. A box
   to paste a decklist or a link into, or a file to choose (see
   ImportSource.tsx). "Import" reads the list and adds its cards to the
   deck (see deckImportRun.ts), then the window closes and the deck screen
   says what happened. Cards already in the deck get more copies.
   ===================================================================== */

import { useState } from 'react';
import PopupWindow from '@/components/PopupWindow';
import ImportSource from './ImportSource';
import { importIntoDeck, readImportSource, type ImportSummary } from '@/lib/deckImportRun';
import { showMessage } from '@/lib/dialogs';

type Props = {
  deckId: string;
  onDone: (summary: ImportSummary) => void;   // it worked: how many cards went in, and any not found
  onCancel: () => void;
};

export default function ImportDeckDialog({ deckId, onDone, onCancel }: Props) {
  // What's in the box, and whether the import is running (Scryfall is asked
  // about every card, which can take a few seconds)
  const [source, setSource] = useState('');
  const [working, setWorking] = useState(false);

  async function run() {
    setWorking(true);
    try {
      const summary = await importIntoDeck(deckId, await readImportSource(source));
      onDone(summary);
    } catch (err) {
      showMessage('Couldn\'t import that', (err as Error).message);
      setWorking(false);
    }
  }

  return (
    <PopupWindow title="Import a decklist" onClose={onCancel}
                 buttons={[
                   { label: 'Cancel', onPress: onCancel, kind: 'secondary', disabled: working },
                   { label: working ? 'Importing…' : 'Import', onPress: run, disabled: working || !source.trim() },
                 ]}>
      <ImportSource value={source} onChange={setSource} disabled={working} />
    </PopupWindow>
  );
}
