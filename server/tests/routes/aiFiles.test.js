/* =====================================================================
   TESTS: AI SCANNER FILE ROUTES
   The AI files are only handed to accounts with the aiscan role (and
   admins). These tests store tiny fake files in the test database (never
   the real model), then check who may download them and that only the
   five known names exist.
   ===================================================================== */

import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../app.js';
import User from '../../models/User.js';
import { COLLECTIONS } from '../../models/collectionNames.js';
import { AI_ALLOWED } from '../../utils/aiFileNames.js';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../helpers/db.js';
import { makeUser, bearer } from '../helpers/users.js';

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

// Tiny made-up contents for each name (some with bytes that are not text)
const FAKE = {
  'ai.json': Buffer.from(JSON.stringify({ version: 1, builtAt: 'test', files: {} })),
  'model.onnx': Buffer.from([0, 1, 2, 3, 250, 251, 252, 253]),
  'art-vectors.bin': Buffer.from([9, 8, 7, 6, 5]),
  'art-ids.txt': Buffer.from('abc\ndef\n'),
  'projection.bin': Buffer.from([42]),
};

// Put one file's bytes into the test database's file storage
async function store(name, bytes) {
  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: COLLECTIONS.aiFilesBucket });
  await new Promise((resolve, reject) => bucket.openUploadStream(name).on('error', reject).on('finish', resolve).end(bytes));
}

// Put all five fake files in
async function storeFakes() {
  for (const name of AI_ALLOWED) await store(name, FAKE[name]);
}

// Ask for a file with the given account's login (or none), getting the raw bytes back
const download = (url, user) => {
  const req = request(app).get(url).buffer(true).parse((res, done) => {
    const parts = [];
    res.on('data', (part) => parts.push(part));
    res.on('end', () => done(null, Buffer.concat(parts)));
  });
  return user ? req.set('Authorization', bearer(user)) : req;
};

describe('who may download', () => {
  test('no login is 401 for every file', async () => {
    await storeFakes();
    for (const name of AI_ALLOWED) expect((await download(`/ai/${name}`)).status).toBe(401);
  });

  test('an ordinary account and a prism account are 403', async () => {
    await storeFakes();
    for (const role of ['user', 'prism']) {
      const res = await download('/ai/model.onnx', await makeUser({ role }));
      expect(res.status).toBe(403);
      expect(res.body.toString()).toContain('AI scanner access required');
    }
  });

  test('an aiscan account gets every file with the right bytes and length, privately', async () => {
    await storeFakes();
    const person = await makeUser({ role: 'aiscan' });
    for (const name of AI_ALLOWED) {
      const res = await download(`/ai/${name}`, person);
      expect(res.status).toBe(200);
      expect(Buffer.compare(res.body, FAKE[name])).toBe(0);
      expect(res.headers['content-length']).toBe(String(FAKE[name].length));
      expect(res.headers['cache-control']).toBe('private, no-store');
    }
  });

  test('an admin gets a file too', async () => {
    await storeFakes();
    const res = await download('/ai/projection.bin', await makeUser({ role: 'admin' }));
    expect(res.status).toBe(200);
    expect(Buffer.compare(res.body, FAKE['projection.bin'])).toBe(0);
  });
});

describe('only the known names exist', () => {
  test('any other name is 404, even with access', async () => {
    await storeFakes();
    const person = await makeUser({ role: 'aiscan' });
    for (const name of ['secret.txt', 'model.onnx.bak', '..%2Fpackage.json', '%2e%2e%2fapp.js', 'MODEL.ONNX', 'ai.json%00']) {
      expect((await download(`/ai/${name}`, person)).status).toBe(404);
    }
    expect((await download('/ai/model.onnx/extra', person)).status).toBe(404);
    expect((await download('/ai', person)).status).toBe(404);
  });

  test('a known name that was never uploaded is 404', async () => {
    const res = await download('/ai/ai.json', await makeUser({ role: 'aiscan' }));
    expect(res.status).toBe(404);
  });

  test('when a file was uploaded twice, the newest copy is sent', async () => {
    await storeFakes();
    await store('projection.bin', Buffer.from([1, 1]));
    const res = await download('/ai/projection.bin', await makeUser({ role: 'aiscan' }));
    expect([...res.body]).toEqual([1, 1]);
  });
});

describe('giving and taking the role', () => {
  test('an admin can give aiscan and take it away, and the new role works on the files', async () => {
    await storeFakes();
    const admin = await makeUser({ role: 'admin' });
    const other = await makeUser();
    for (const role of ['aiscan', 'user']) {
      const res = await request(app).patch(`/admin/users/${other._id}`).set('Authorization', bearer(admin)).send({ role });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: String(other._id), role });
      const saved = await User.findById(other._id);
      expect(saved.role).toBe(role);
      // The token carries the role, so a fresh token for the changed account shows the effect
      expect((await download('/ai/model.onnx', saved)).status).toBe(role === 'aiscan' ? 200 : 403);
    }
  });

  test('an aiscan account can not change roles', async () => {
    const target = await makeUser();
    const res = await request(app).patch(`/admin/users/${target._id}`).set('Authorization', bearer(await makeUser({ role: 'aiscan' }))).send({ role: 'admin' });
    expect(res.status).toBe(403);
  });
});
