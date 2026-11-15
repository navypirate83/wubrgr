/* =====================================================================
   THE IMPORT WINDOW (for a deck, a list or a binder that already exists)
   Opened by the upload button beside the download button. A box to paste a
   list (or, for a deck only, a link to a deck on Archidekt or Moxfield)
   into, or a file to choose (see decks/ImportSource.tsx). "Import" reads
   the list, then "run" (given by the screen) adds its cards to the deck,
   list or binder. The window then closes and the screen says what
   happened. Any card that couldn't be found is skipped, and listed.
   ===================================================================== */

import { useState } from 'react';
import PopupWindow from '@/components/PopupWindow';
import ImportSource from '@/components/decks/ImportSource';
import { readImportSource, type ImportSummary } from '@/lib/deckImportRun';
import type { ImportedDeck } from '@/lib/deckImport';
import { showMessage } from '@/lib/dialogs';

type Props = {
  title?: string;                                          // the window's title
  allowLinks?: boolean;                                    // decks only
  run: (imported: ImportedDeck) => Promise<ImportSummary>; // adds the cards
  onDone: (summary: ImportSummary) => void;                // it worked: how many cards went in, and any not found
  onCancel: () => void;
};

export default function ImportCardsDialog({ title = 'Import cards', allowLinks = false, run, onDone, onCancel }: Props) {
  // What's in the box, and whether the import is running (Scryfall is asked
  // about every card, which can take a few seconds)
  const [source, setSource] = useState('');
  const [working, setWorking] = useState(false);

  async function start() {
    setWorking(true);
    try {
      onDone(await run(await readImportSource(source, allowLinks)));
    } catch (err) {
      showMessage('Couldn\'t import that', (err as Error).message);
      setWorking(false);
    }
  }

  return (
    <PopupWindow title={title} onClose={onCancel}
                 buttons={[
                   { label: 'Cancel', onPress: onCancel, kind: 'secondary', disabled: working },
                   { label: working ? 'Importing…' : 'Import', onPress: start, disabled: working || !source.trim() },
                 ]}>
      <ImportSource value={source} onChange={setSource} disabled={working} noLinks={!allowLinks} />
    </PopupWindow>
  );
}
