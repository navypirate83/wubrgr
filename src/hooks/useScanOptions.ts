/* =====================================================================
   THE SCANNER'S OPTIONS, FOR A SCREEN
   A hook that gives a screen the scanner's current options (see
   lib/scanner/scanSettings.ts) and draws the screen again whenever they
   change.
   ===================================================================== */

import { useSyncExternalStore } from 'react';
import { getScanOptions, onScanOptionsChange, scanOptionsVersion } from '@/lib/scanner/scanSettings';

export function useScanOptions() {
  // "useSyncExternalStore" listens with onScanOptionsChange, and redraws when
  // scanOptionsVersion() comes back different
  useSyncExternalStore(onScanOptionsChange, scanOptionsVersion);
  return getScanOptions();
}
