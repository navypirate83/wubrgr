/* =====================================================================
   WHO'S USING THE APP?
   A hook that tells a screen whether someone is signed in to the
   WUBRG'r server, signed in to Google (the Drive backup), using the app
   locally, or using the binders at all, and draws the screen again
   whenever that changes (signing in or out, "Skip login", or the list of
   binders changing: see lib/accountEvents.ts).
   ===================================================================== */

import { useSyncExternalStore } from 'react';
import { accountVersion, onAccountChange } from '@/lib/accountEvents';
import { isSignedIn, isUsingBinders } from '@/lib/googleDrive';
import { isLocalMode } from '@/lib/binderStorage';
import { getServerUser, hasAiScanAccess, hasPrismAccess, hasTrainerAccess, isAdminUser, isServerSignedIn } from '@/lib/session';

export function useAccount() {
  // "useSyncExternalStore" is React's way to follow something kept
  // outside React: it calls onAccountChange to listen, and redraws when
  // accountVersion() comes back different.
  useSyncExternalStore(onAccountChange, accountVersion);
  return {
    // Signed in to Google (the Drive backup)
    signedIn: isSignedIn(),
    // Signed in to the WUBRG'r server, and who
    serverSignedIn: isServerSignedIn(),
    serverUser: getServerUser(),
    // May see the PRISM section (accounts with the PRISM right, and admins)
    hasPrism: hasPrismAccess(),
    // May use the AI scanner files (accounts with the AI scanner right, and admins)
    hasAiScan: hasAiScanAccess(),
    // The scanner sends its photos for training (accounts with the trainer right, and admins)
    hasTrainer: hasTrainerAccess(),
    // May use the Admin page (only admins)
    isAdmin: isAdminUser(),
    localMode: isLocalMode(),
    usingBinders: isUsingBinders() || isServerSignedIn(),
  };
}
