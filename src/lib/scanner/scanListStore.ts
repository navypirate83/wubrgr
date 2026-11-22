/* =====================================================================
   THE SCANNED LIST, KEPT ON THIS DEVICE
   In Stack mode the scanner collects cards on a list before they go into
   a binder. That list used to live only on the screen, so refreshing the
   page, closing the app or leaving the scanner threw it away. Now every
   change to it is also saved on this device, and it is read back when
   the scanner opens.
   What is saved for each card: which printing it is, its language, finish
   and number of copies, whether it still needs checking, and the other
   printings it could be. Two things are left out to keep the saved list
   small:
     - the photo clues (the grey pictures and the little art preview a scan
       carries). They are big, and only help while picking a printing right
       after the scan. A card restored later is picked without the preview.
     - a very long list of "other printings" (a basic land has about a
       thousand). The picker then simply looks the card's printings up
       again by name.
   The list stays on this device only: it is not sent to the account.
   Plain TypeScript with no React in it.
   ===================================================================== */

import { storageGet, storageRemove, storageSet } from '@/lib/storage';
import type { ScanItem } from './scanItems';

// Where the list is kept in this device's saved values
const SCAN_LIST_KEY = 'wubrgr.scanner.list';
// The most "other printings" saved with one card (more than this are looked up again when needed)
const MOST_CANDIDATES = 40;
// The most cards saved (far more than anyone stacks in one go; a safety limit on the saved size)
const MOST_ITEMS = 1000;

// One card as it is saved: without the photo clues, and without an over-long list of other printings
function slim(item: ScanItem): ScanItem {
  const keep = item.candidates.length <= MOST_CANDIDATES;
  return {
    id: item.id,
    printing: item.printing,
    lang: item.lang,
    finish: item.finish,
    count: item.count,
    flag: item.flag,
    candidates: keep ? item.candidates : [],
    matched: keep ? item.matched : undefined,
    // Only the words that were read, not the pictures or the "read more" helpers
    reading: item.reading
      ? { infoText: item.reading.infoText, nameText: item.reading.nameText, bottomText: item.reading.bottomText, takenAt: item.reading.takenAt }
      : null,
  };
}

// Does this saved thing look like a scanned card? (A saved value could be damaged or from an older version.)
function looksRight(item: unknown): item is ScanItem {
  const i = item as ScanItem | null;
  return !!i && typeof i === 'object' && typeof i.id === 'string' && typeof i.lang === 'string'
    && typeof i.finish === 'string' && Number.isInteger(i.count) && i.count >= 1
    && !!i.printing && typeof i.printing.id === 'string' && typeof i.printing.name === 'string'
    && Array.isArray(i.candidates);
}

// The list as it was last saved (empty if there is none, or it can't be read)
export function loadScanList(): ScanItem[] {
  try {
    const saved: unknown = JSON.parse(storageGet(SCAN_LIST_KEY) ?? '[]');
    return Array.isArray(saved) ? saved.filter(looksRight) : [];
  } catch {
    return [];
  }
}

// Save the list as it is now. An empty list is simply forgotten.
export function saveScanList(items: ScanItem[]): void {
  if (items.length === 0) { storageRemove(SCAN_LIST_KEY); return; }
  storageSet(SCAN_LIST_KEY, JSON.stringify(items.slice(0, MOST_ITEMS).map(slim)));
}

// Forget the saved list (when this device's cards are cleared)
export function clearScanList(): void {
  storageRemove(SCAN_LIST_KEY);
}
