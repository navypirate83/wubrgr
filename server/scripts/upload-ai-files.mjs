/* =====================================================================
   UPLOAD THE AI SCANNER FILES TO MONGODB
   Reads the four AI files and ai.json that scripts/catalogue/build-ai-files.mjs
   made (in scripts/catalogue/out-ai/) and stores them in the database the
   server's .env points at (in GridFS, a way of keeping big files in MongoDB).
   Older copies of the same names are replaced. It only ever prints file
   names and sizes, never the connection address or any other .env setting.

   To run it (from the server folder), the "--yes" is required so it can
   never run by accident:
     node scripts/upload-ai-files.mjs --yes
   Optional: "--test" uses the test database (the name the tests use)
   instead of the real one; "--from <folder>" reads the files elsewhere.
   ===================================================================== */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { COLLECTIONS } from '../models/collectionNames.js';
import { AI_ALLOWED, AI_FILE_NAMES, AI_MANIFEST_NAME } from '../utils/aiFileNames.js';

// Read the choices typed after the command
const args = process.argv.slice(2);
const useTestDb = args.includes('--test');
const fromAt = args.indexOf('--from');
const here = path.dirname(fileURLToPath(import.meta.url));
const folder = path.resolve(fromAt >= 0 && args[fromAt + 1] ? args[fromAt + 1] : path.join(here, '..', '..', 'scripts', 'catalogue', 'out-ai'));

// A short message and a stop (the message never contains a secret)
function stop(message) {
  console.error(message);
  process.exit(1);
}

// Refuse to do anything unless "--yes" was typed
if (!args.includes('--yes')) stop('Nothing done. This writes into the database; run it again with --yes to go ahead.');

// Check every file is there, and that the sizes and checksums in ai.json are true, BEFORE touching the database
const files = {};
for (const name of AI_ALLOWED) {
  const file = path.join(folder, name);
  if (!fs.existsSync(file)) stop(`Missing file: ${name} (looked in ${folder})`);
  files[name] = file;
}
const manifest = JSON.parse(fs.readFileSync(files[AI_MANIFEST_NAME], 'utf8'));
for (const name of AI_FILE_NAMES) {
  const listed = manifest.files?.[name];
  const bytes = fs.readFileSync(files[name]);
  if (!listed || listed.bytes !== bytes.length) stop(`${name}: its size does not match ai.json`);
  if (listed.sha256 && crypto.createHash('sha256').update(bytes).digest('hex') !== listed.sha256.toLowerCase()) stop(`${name}: its checksum does not match ai.json`);
}

// Connect. The address comes from .env (MONGODB_URI, or MONGODB_TEST_URI for --test) and is never printed.
const uri = useTestDb ? process.env.MONGODB_TEST_URI || process.env.MONGODB_URI : process.env.MONGODB_URI;
if (!uri) stop('No database address is set in .env');
const dbName = useTestDb ? process.env.TEST_DB_NAME || 'wubgr-test' : undefined;
await mongoose.connect(uri, dbName ? { dbName } : {});
console.log(`Connected to the database "${mongoose.connection.name}"`);

const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: COLLECTIONS.aiFilesBucket });

// Store one file: put the new copy in first, then delete the older copies, so there is never a moment with no file
for (const name of AI_ALLOWED) {
  const older = await bucket.find({ filename: name }).toArray();
  await new Promise((resolve, reject) => {
    fs.createReadStream(files[name]).pipe(bucket.openUploadStream(name)).on('error', reject).on('finish', resolve);
  });
  for (const old of older) await bucket.delete(old._id);
  console.log(`Stored ${name} (${fs.statSync(files[name]).size} bytes)${older.length ? `, replaced ${older.length} older` : ''}`);
}

await mongoose.disconnect();
console.log('Done.');
