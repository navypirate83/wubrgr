/* =====================================================================
   WHERE THE AI FILES ARE DOWNLOADED FROM, AND WHAT THEY ARE
   The "AI art matching" option needs four extra files, downloaded once and
   kept on the device (like the card catalogue, but separate from it):
     model.onnx       the AI model that looks at a picture (about 24 MB)
     art-vectors.bin  the saved "fingerprint" of every artwork (about 14.6 MB)
     art-ids.txt      which artwork each fingerprint belongs to (about 2.1 MB)
     projection.bin   the "recipe" that squeezes the model's answer to the
                      same size as the saved fingerprints (under 1 MB)
   plus a small "ai.json" that lists each file's size and checksum, so a
   download can be checked to be whole and unspoiled.
   They are found in an "ai" folder next to the catalogue files, so they
   use the same download address (see catalogue/catalogueConfig.ts).
   To try them from your own computer, run scripts/catalogue/serve.mjs
   (after scripts/catalogue/build-ai-files.mjs) and start the app with
   EXPO_PUBLIC_CATALOGUE_URL=http://localhost:4200
   ===================================================================== */

import { CATALOGUE_URL } from '../catalogue/catalogueConfig';

// The folder the files are downloaded from
export const AI_URL = `${CATALOGUE_URL}/ai`;

// The four files, by the name they have in the download folder (and on the device)
export const AI_FILE_NAMES = ['model.onnx', 'art-vectors.bin', 'art-ids.txt', 'projection.bin'] as const;
export type AiFileName = (typeof AI_FILE_NAMES)[number];

// The list file: what ai.json says about the files
export type AiManifest = {
  version: number;
  builtAt?: string;
  files: Record<string, { bytes: number; sha256?: string }>;
};

// The newest design of the files this app understands. A newer one is ignored until the app is updated.
export const SUPPORTED_AI_VERSION = 1;
