/* =====================================================================
   THE SCANNER'S OPTIONS, SAVED ON THIS DEVICE
   Keeps the choices behind the gear button on the scan screen (lock to a
   set, what to do when unsure, which finish to start with, whether to show
   timings; see core/scanOptions.ts for what each one means).
   They're saved on this device only, not with your account: which set you
   are sorting through today is a thing for this phone, right now, and not
   something to follow you around.
   Plain TypeScript with no React in it. Screens follow changes with
   hooks/useScanOptions.ts.
   ===================================================================== */

import { storageGet, storageSet } from '../storage';
import { DEFAULT_SCAN_OPTIONS, cleanScanOptions, type ScanOptions } from './core/scanOptions';

// The name the options are saved under
const KEY = 'scanOptions';

// The options in use. Read from the saved copy the first time they're asked for.
let current: ScanOptions | null = null;
// Screens that want to know when the options change, and a number that goes up with each change
const listeners = new Set<() => void>();
let version = 0;

// The options in use now
export function getScanOptions(): ScanOptions {
  if (!current) {
    const saved = storageGet(KEY);
    try { current = saved ? cleanScanOptions(JSON.parse(saved)) : DEFAULT_SCAN_OPTIONS; } catch { current = DEFAULT_SCAN_OPTIONS; }
  }
  return current;
}

// Change some of the options (the rest stay as they are), save them and tell the screens
export function changeScanOptions(changes: Partial<ScanOptions>): void {
  current = cleanScanOptions({ ...getScanOptions(), ...changes });
  storageSet(KEY, JSON.stringify(current));
  version++;
  listeners.forEach((listener) => listener());
}

// For useSyncExternalStore (see the hook): listen for changes, and say which version we're on
export function onScanOptionsChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export const scanOptionsVersion = (): number => version;
