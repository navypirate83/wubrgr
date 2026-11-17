/* =====================================================================
   SCAN (the card scanner's tab)
   Point the camera at a Magic card and the scanner works out the exact
   printing (set and collector number), then you pick which binder to add
   it to. It reads the card from a catalogue kept on the device (Settings →
   Card catalogue), so it works with no internet.
   The website's camera and the phone app's camera (ScannerCamera.web.tsx and
   ScannerCamera.native.tsx) each read a card and hand over the text; everything
   after that is shared (see components/scanner/ScanScreen.tsx). The phone app's
   camera also has Auto scan (it looks for a card by itself) for hands-free stacks.
   ===================================================================== */

import ScanScreen from '@/components/scanner/ScanScreen';

export default function ScanTab() {
  return <ScanScreen />;
}
