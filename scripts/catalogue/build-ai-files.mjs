/* =====================================================================
   GATHER THE AI FILES FOR THE SCANNER (for trying them out)
   The scanner's "AI art matching" option downloads four files (see
   src/lib/scanner/ai/aiConfig.ts). This copies them from where the experiment
   made them, under the names the app asks for, into ./out-ai, and writes
   ai.json: a list of each file's size and checksum, so the app can check a
   download is whole.
       cache/models/dinov2-small-q.onnx      ->  out-ai/model.onnx
       cache/embed-index/art-vectors.bin     ->  out-ai/art-vectors.bin
       cache/embed-index/art-ids.txt         ->  out-ai/art-ids.txt
       cache/embed-index/projection.bin      ->  out-ai/projection.bin
   Nothing is published: serve.mjs shares out-ai at http://localhost:4200/ai/.
   Run it with:  node build-ai-files.mjs
   ===================================================================== */

import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'out-ai');

// Where each file comes from, and what the app calls it
const sources = {
  'model.onnx': join(here, 'cache', 'models', 'dinov2-small-q.onnx'),
  'art-vectors.bin': join(here, 'cache', 'embed-index', 'art-vectors.bin'),
  'art-ids.txt': join(here, 'cache', 'embed-index', 'art-ids.txt'),
  'projection.bin': join(here, 'cache', 'embed-index', 'projection.bin'),
};

await mkdir(out, { recursive: true });
const files = {};
for (const [name, from] of Object.entries(sources)) {
  await copyFile(from, join(out, name));
  files[name] = { bytes: (await stat(join(out, name))).size, sha256: createHash('sha256').update(await readFile(join(out, name))).digest('hex') };
  console.log(`${name}: ${files[name].bytes} bytes`);
}
// "version" 1 is the design of these files the app understands (see SUPPORTED_AI_VERSION in aiConfig.ts)
await writeFile(join(out, 'ai.json'), JSON.stringify({ version: 1, builtAt: new Date().toISOString(), files }, null, 2));
console.log(`Wrote ${join(out, 'ai.json')}`);
