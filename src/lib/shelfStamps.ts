/* =====================================================================
   WHEN A BINDER, LIST, DECK OR PRISM SET WAS LAST OPENED, AND FIRST SEEN
   The shelf's "Recently opened" and "Newest first" sorts (see shelfSort.ts)
   need two times for each item, but the items themselves don't keep them.
   So this keeps a small note per item, on THIS device only:
   - "used": the last time the item was opened
   - "made": the first time this device saw the item. Items already there
     when this started count as made in the order they were saved in, the
     later ones newer.
   Nothing here is sent to the account, so each device has its own notes.
   ===================================================================== */

import { storageGet, storageSet } from './storage';

// Where the notes are kept on this device
const KEY = 'shelfStamps';

// One item's two times (milliseconds)
export type Stamp = { made: number; used: number };
type Stamps = Record<string, Stamp>;

// Every note (none if nothing was saved, or what's saved can't be read)
function load(): Stamps {
  try {
    const saved = JSON.parse(storageGet(KEY) ?? '{}');
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? (saved as Stamps) : {};
  } catch {
    return {};
  }
}

// The notes for these items, in the order they're saved in. An item with no
// note yet gets one now (its "made" time put in saved order), so the same
// item always gets the same time afterwards.
export function stampsFor(ids: string[]): Stamps {
  const stamps = load();
  const result: Stamps = {};
  const base = Date.now() - ids.length * 1000;
  let added = false;
  ids.forEach((id, index) => {
    if (!stamps[id]) {
      stamps[id] = { made: base + index * 1000, used: 0 };
      added = true;
    }
    result[id] = stamps[id];
  });
  if (added) storageSet(KEY, JSON.stringify(stamps));
  return result;
}

// An item was opened: note the time (this also counts as the first time it was seen)
export function markOpened(id: string): void {
  const stamps = load();
  const now = Date.now();
  stamps[id] = { made: stamps[id]?.made ?? now, used: now };
  storageSet(KEY, JSON.stringify(stamps));
}
