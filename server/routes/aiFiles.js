/* =====================================================================
   AI SCANNER FILE ROUTES (/ai/...)
   The website scanner's optional "AI art matching" needs four big files.
   They are kept in MongoDB (GridFS) and handed out ONLY to accounts with
   the aiscan right, and admins (app.js mounts this behind requireAuth AND
   requireAiScan, like PRISM).
   - GET /ai/ai.json   the list of the files: their sizes, checksums and when they were built
   - GET /ai/:file     one of the four files, streamed straight from the database
   Only the five names in utils/aiFileNames.js exist; any other name is a
   plain 404, so there is no way to ask for anything else. The answers are
   marked "private, no-store" so nothing in between (a shared cache) keeps a
   copy that other people could get.
   ===================================================================== */

import { Router } from 'express';
import mongoose from 'mongoose';
import { COLLECTIONS } from '../models/collectionNames.js';
import { AI_ALLOWED, AI_CONTENT_TYPES } from '../utils/aiFileNames.js';
import { handleDbError } from '../middleware/errorHandler.js';

const router = Router();

// Open the shelf the files are kept on (null if the database isn't connected)
function openBucket() {
  const db = mongoose.connection.db;
  return db ? new mongoose.mongo.GridFSBucket(db, { bucketName: COLLECTIONS.aiFilesBucket }) : null;
}

// Send one stored file: look up its newest copy, say how long it is, then stream the bytes
async function sendFile(name, res) {
  const bucket = openBucket();
  if (!bucket) return res.status(503).json({ error: 'The database is not ready' });
  try {
    const found = await bucket.find({ filename: name }).sort({ uploadDate: -1 }).limit(1).toArray();
    if (found.length === 0) return res.status(404).json({ error: 'File not found' });
    res.set({
      'Content-Type': AI_CONTENT_TYPES[name],
      'Content-Length': String(found[0].length),
      'Cache-Control': 'private, no-store',
    });
    const stream = bucket.openDownloadStream(found[0]._id);
    // If the database stops halfway, just end the answer (the app checks the size and tries again)
    stream.on('error', () => res.destroy());
    return stream.pipe(res);
  } catch (err) {
    return handleDbError(err, res);
  }
}

// One route covers ai.json and the four files; the name must be on the list exactly
router.get('/:file', (req, res) => {
  const name = req.params.file;
  if (!AI_ALLOWED.includes(name)) return res.status(404).json({ error: 'File not found' });
  return sendFile(name, res);
});

export default router;
