/* =====================================================================
   THE AI SCANNER'S FILES: THE ONLY NAMES THAT EXIST
   One list, shared by the download route and the upload script, so the two
   can never disagree about which files there are. Nothing else is ever
   read from or written to the AI file storage.
   ===================================================================== */

// The four big files, plus ai.json (the small list of their sizes and checksums)
export const AI_FILE_NAMES = ['model.onnx', 'art-vectors.bin', 'art-ids.txt', 'projection.bin'];
export const AI_MANIFEST_NAME = 'ai.json';
export const AI_ALLOWED = [AI_MANIFEST_NAME, ...AI_FILE_NAMES];

// What kind of file each one is, so a browser knows how to treat it
export const AI_CONTENT_TYPES = {
  'ai.json': 'application/json; charset=utf-8',
  'art-ids.txt': 'text/plain; charset=utf-8',
  'model.onnx': 'application/octet-stream',
  'art-vectors.bin': 'application/octet-stream',
  'projection.bin': 'application/octet-stream',
};
