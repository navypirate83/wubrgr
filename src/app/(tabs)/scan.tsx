/* =====================================================================
   SCAN (the card scanner's tab)
   Point the camera at a Magic card and the scanner works out the exact
   printing (set and collector number), then you pick which binder to add
   it to. It reads the card from a catalogue kept on the device (Settings →
   Card catalogue), so it works with no internet.
   The scanner is being built one stage at a time, the website's first:
   right now the website's camera reads a card and this screen shows what it
   read and found (see components/scanner/ScanScreen.tsx); the confirm screen
   and adding to a binder come next, then the phone app's camera.
   ===================================================================== */

import ScanScreen from '@/components/scanner/ScanScreen';

export default function ScanTab() {
  return <ScanScreen />;
}
