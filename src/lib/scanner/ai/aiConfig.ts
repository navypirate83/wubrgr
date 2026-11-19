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
   They are NOT public. They are kept on the WUBRG'r server and only handed to
   signed-in accounts with the "aiscan" role (and admins), at the server's
   /ai/ addresses (the login token is sent with each download, see
   downloadAiFiles in aiFiles.ts). Putting them there is done once with
   server/scripts/upload-ai-files.mjs.
   (scripts/catalogue/serve.mjs, which serves the same files without a login,
   is still there for trying things out on your own computer.)
   ===================================================================== */

// The place on the server the files are downloaded from (added to the server's address, see api.ts)
export const AI_PATH = '/ai';

// The four files, by the name they have on the server (and on the device)
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
