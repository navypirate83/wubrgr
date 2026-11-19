/* =====================================================================
   PUTTING THE AI TO WORK FOR A SCAN (the glue)
   Connects the pieces: the saved AI files (aiFiles.ts), the fingerprint index
   (aiIndex.ts), the model for this device (aiModel) and the clue maker
   (aiClue.ts). scanResolve.ts calls aiScoresForReading when the card has
   several printings to tell apart and the "AI art matching" option is on.
   It answers null whenever the AI can't be used (an account without AI scanner
   access, even if the option was switched on earlier; no pictures from the camera,
   a device with no model, files not downloaded, ...), and the caller also
   wraps it so that anything that goes wrong just means "no AI clue".
   The saved fingerprints are read from the browser's storage once, the first
   time they're needed, and kept in memory after that (about 17 MB).
   ===================================================================== */

import { hasAiScanAccess } from '../../session';
import type { Printing } from '../core/catalogueTypes';
import type { ScanReading } from '../core/scannerTypes';
import { aiScoresFor } from './aiClue';
import { aiReady, readAiFile } from './aiFiles';
import { createAiIndex, type AiIndex } from './aiIndex';
import { aiModel } from './aiModel';

// The index, loaded once (a promise, so two scans asking at the same time share one load)
let index: Promise<AiIndex> | null = null;

export function loadAiIndex(): Promise<AiIndex> {
  if (!index) {
    index = (async () => {
      const [vectors, ids, projection] = await Promise.all([readAiFile('art-vectors.bin'), readAiFile('art-ids.txt'), readAiFile('projection.bin')]);
      if (!vectors || !ids || !projection) throw new Error('The AI files are not all on this device');
      return createAiIndex(vectors, new TextDecoder().decode(ids), projection);
    })();
    index.catch(() => { index = null; });
  }
  return index;
}

// Forget the loaded index (after the files are replaced or deleted)
export function forgetAiIndex(): void {
  index = null;
}

// The AI closeness of the photo to each of these printings (null: the AI can't help here)
export async function aiScoresForReading(reading: ScanReading, printings: Printing[]): Promise<Map<string, number> | null> {
  // Only accounts with AI scanner access may use it, whatever the saved option says
  if (!hasAiScanAccess()) return null;
  if (!reading.aiPictures || !aiModel.available || !(await aiReady())) return null;
  const pictures = await reading.aiPictures();
  if (pictures.length === 0) return null;
  return aiScoresFor(pictures, printings.map((p) => ({ id: p.id, illus: p.illus, illusBack: p.illusBack, frame: p.frame })), { embed: aiModel.embed, index: await loadAiIndex() });
}
