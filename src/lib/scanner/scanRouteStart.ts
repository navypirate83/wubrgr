/* =====================================================================
   THE FIRST STEP OF OPENING THE SCAN SCREEN
   This tiny file is the FIRST thing app/(tabs)/scan.tsx imports. Imports run in the order they are
   written, so this line of the crash diary is written before any of the scanner's heavier code
   has been loaded. If the app closes while the scanner is loading, the diary ends here or
   just after, which tells us the problem was in the loading (not in using the scanner).
   ===================================================================== */

import { mark } from './crashTrail';

mark('scan route loading');
