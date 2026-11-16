/* =====================================================================
   SCAN (the card scanner's tab)
   Point the camera at a Magic card and the scanner works out the exact
   printing (set and collector number), then you pick which binder to add
   it to. It reads the card from a catalogue kept on the device (Settings →
   Card catalogue), so it works with no internet. The camera, the
   reading and the adding are still being built, one stage at a time; for now
   this tab holds a place for them.
   ===================================================================== */

import StillBuilding from '@/components/StillBuilding';

export default function ScanScreen() {
  return <StillBuilding title="Card scanner" message="Scan a card and add it to a binder. It's still being built." />;
}
