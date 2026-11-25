/* =====================================================================
   TESTS: SCANNER TRAINING PHOTOS (/training)
   Only accounts with the trainer right (and admins) may send photos, each
   person sees only their own, a scan sent again replaces its older copy, and
   bad input (not a JPEG, an unknown reason, a huge photo) is refused.
   ===================================================================== */

import request from 'supertest';
import app from '../../app.js';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../helpers/db.js';
import { makeUser, bearer } from '../helpers/users.js';
import { hasRight, cleanRoles } from '../../utils/roles.js';

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

// A tiny made-up "JPEG": the three bytes every JPEG starts with, then filler
const jpeg = (size = 300) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(size, 7)]);

// A good request body
const photoBody = (extra = {}) => ({
  scanId: 'scan-abc-1',
  reason: 'unsure',
  photo: jpeg().toString('base64'),
  said: { printingId: 'p1', name: 'Exotic Orchard', set: 'cmr', number: '123', lang: 'en', finish: 'nonfoil', extra: 'ignored' },
  final: null,
  reading: { nameText: 'Exotic Orchard', infoText: 'C 0123', bottomText: '' },
  status: 'pick',
  card: { x: 0.1, y: 0.1, w: 0.5, h: 0.7 },
  width: 1280,
  height: 720,
  takenAt: 1700000000000,
  timings: { text: 120, lookup: 30, bad: 'x' },
  ...extra,
});

const send = (user, body) => request(app).post('/training').set('Authorization', bearer(user)).send(body);

describe('who may send photos', () => {
  test('no login is 401; an ordinary, prism and aiscan account are 403', async () => {
    expect((await request(app).post('/training').send(photoBody())).status).toBe(401);
    for (const roles of [[], ['prism'], ['aiscan']]) {
      const res = await send(await makeUser({ roles }), photoBody());
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Trainer access required');
    }
  });

  test('a trainer may, and so may an admin (who has every right)', async () => {
    for (const roles of [['trainer'], ['admin']]) {
      expect((await send(await makeUser({ roles }), photoBody())).status).toBe(201);
    }
  });

  test('the trainer right is a real right: admins have it, and an admin can hand it out', async () => {
    expect(hasRight(['admin'], 'trainer')).toBe(true);
    expect(hasRight(['prism', 'aiscan'], 'trainer')).toBe(false);
    expect(cleanRoles(['trainer', 'prism', 'trainer'])).toEqual({ roles: ['prism', 'trainer'] });
    const admin = await makeUser({ roles: ['admin'] });
    const other = await makeUser();
    const res = await request(app).patch(`/admin/users/${other._id}`).set('Authorization', bearer(admin)).send({ roles: ['trainer'] });
    expect(res.status).toBe(200);
    expect(res.body.roles).toEqual(['trainer']);
    expect((await send(other, photoBody())).status).toBe(201);
  });
});

describe('sending a photo', () => {
  test('it is kept with its record, and the person can read back the record and the picture', async () => {
    const user = await makeUser({ roles: ['trainer'] });
    const sent = await send(user, photoBody());
    expect(sent.status).toBe(201);
    const list = await request(app).get('/training').set('Authorization', bearer(user));
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({
      id: sent.body.id, scanId: 'scan-abc-1', reason: 'unsure', status: 'pick',
      said: { printingId: 'p1', name: 'Exotic Orchard', set: 'cmr', number: '123', lang: 'en', finish: 'nonfoil' },
      reading: { nameText: 'Exotic Orchard', infoText: 'C 0123' }, timings: { text: 120, lookup: 30 }, width: 1280,
    });
    expect(list.body[0].owner).toBeUndefined();
    expect(list.body[0].said.extra).toBeUndefined();   // only the known pieces are kept
    const picture = await request(app).get(`/training/${sent.body.id}/photo`).set('Authorization', bearer(user)).buffer(true).parse((res, done) => {
      const parts = [];
      res.on('data', (part) => parts.push(part));
      res.on('end', () => done(null, Buffer.concat(parts)));
    });
    expect(picture.status).toBe(200);
    expect(picture.headers['content-type']).toContain('image/jpeg');
    expect(Buffer.compare(picture.body, jpeg())).toBe(0);
  });

  test('sending the same scan again replaces the older copy (and keeps one record)', async () => {
    const user = await makeUser({ roles: ['trainer'] });
    await send(user, photoBody());
    const again = await send(user, photoBody({ reason: 'changed', final: { printingId: 'p2', name: 'Exotic Orchard', set: 'cmm', number: '9', lang: 'en', finish: 'foil' } }));
    expect(again.status).toBe(201);
    const list = await request(app).get('/training').set('Authorization', bearer(user));
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ reason: 'changed', final: { set: 'cmm' } });
  });

  test('a scan can be taken back out', async () => {
    const user = await makeUser({ roles: ['trainer'] });
    await send(user, photoBody({ reason: 'wrong' }));
    expect((await request(app).delete('/training/scan/scan-abc-1').set('Authorization', bearer(user))).status).toBe(204);
    expect((await request(app).get('/training').set('Authorization', bearer(user))).body).toHaveLength(0);
  });

  test('nobody can see or remove somebody else\'s photos, not even an admin', async () => {
    const owner = await makeUser({ roles: ['trainer'] });
    const admin = await makeUser({ roles: ['admin'] });
    const sent = await send(owner, photoBody());
    expect((await request(app).get('/training').set('Authorization', bearer(admin))).body).toHaveLength(0);
    expect((await request(app).get(`/training/${sent.body.id}/photo`).set('Authorization', bearer(admin))).status).toBe(404);
    await request(app).delete('/training/scan/scan-abc-1').set('Authorization', bearer(admin));
    expect((await request(app).get('/training').set('Authorization', bearer(owner))).body).toHaveLength(1);
  });
});

describe('bad input is refused', () => {
  test('a missing or odd scan id, an unknown reason, a missing photo', async () => {
    const user = await makeUser({ roles: ['trainer'] });
    expect((await send(user, photoBody({ scanId: '../etc' }))).status).toBe(400);
    expect((await send(user, photoBody({ scanId: undefined }))).status).toBe(400);
    expect((await send(user, photoBody({ reason: 'because' }))).status).toBe(400);
    expect((await send(user, photoBody({ photo: undefined }))).status).toBe(400);
  });

  test('something that is not a JPEG is refused', async () => {
    const user = await makeUser({ roles: ['trainer'] });
    const res = await send(user, photoBody({ photo: Buffer.from('<script>alert(1)</script>'.repeat(10)).toString('base64') }));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('The photo must be a JPEG');
  });

  test('a photo over 2 MB is refused', async () => {
    const user = await makeUser({ roles: ['trainer'] });
    const res = await send(user, photoBody({ photo: jpeg(2 * 1024 * 1024 + 10).toString('base64') }));
    expect(res.status).toBe(413);
  });
});
