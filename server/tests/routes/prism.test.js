/* =====================================================================
   TESTS: PRISM ROUTES
   PRISM sets are saved with the account. Only accounts with the prism right
   (and admins) may use the routes, a set is only ever seen and changed by
   its owner, a bad set is refused whole, and deleting the account deletes
   its sets.
   ===================================================================== */

import request from 'supertest';
import app from '../../app.js';
import PrismSet from '../../models/PrismSet.js';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../helpers/db.js';
import { makeUser, bearer, TEST_PASSWORD } from '../helpers/users.js';

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

// A good set, as the app sends it
const SET = {
  name: 'Blue decks',
  corner: 1,
  decks: [{ deckId: 'deckAAAA', slot: 3 }, { deckId: 'deckBBBB', slot: 9 }],
  pins: [{ deckId: 'deckAAAA', key: 'island', print: 'dmu/262' }, { deckId: 'deckBBBB', key: 'swamp' }],
  painted: { 'exotic orchard': [['deckAAAA', 'deckBBBB']], 'sol ring': [[], ['deckAAAA']] },
  scrape: { 'sol ring': [[3], []] },
  names: { 'exotic orchard': 'Exotic Orchard' },
  editedAt: 1700000000000,
};

async function prismPerson() {
  const user = await makeUser({ roles: ['prism'] });
  const auth = bearer(user);
  return {
    user,
    get: (url) => request(app).get(url).set('Authorization', auth),
    put: (url, body) => request(app).put(url).set('Authorization', auth).send(body),
    del: (url) => request(app).delete(url).set('Authorization', auth),
  };
}

describe('who may use it', () => {
  test.each([['get', '/prism'], ['put', '/prism/abc'], ['delete', '/prism/abc']])('%s %s needs a login', async (method, url) => {
    const res = await request(app)[method](url).send({});
    expect(res.status).toBe(401);
  });

  test('an ordinary account is turned away, a prism account and an admin are let in', async () => {
    const plain = await makeUser();
    expect((await request(app).get('/prism').set('Authorization', bearer(plain))).status).toBe(403);
    expect((await request(app).put('/prism/abc').set('Authorization', bearer(plain)).send(SET)).status).toBe(403);
    const prismAccount = await prismPerson();
    expect((await prismAccount.get('/prism')).status).toBe(200);
    const admin = await makeUser({ roles: ['admin'] });
    expect((await request(app).get('/prism').set('Authorization', bearer(admin))).status).toBe(200);
    // and nothing was saved for the one turned away
    expect(await PrismSet.countDocuments()).toBe(0);
  });
});

describe('saving and reading sets', () => {
  test('a set is saved and read back exactly, and saving again replaces it', async () => {
    const me = await prismPerson();
    expect((await me.get('/prism')).body).toEqual([]);
    const saved = await me.put('/prism/set-1', SET);
    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({ clientId: 'set-1', ...SET });
    expect((await me.get('/prism')).body).toEqual([{ clientId: 'set-1', ...SET }]);

    // Saved again with changes: replaced, not added
    const changed = { ...SET, name: 'Renamed', pins: [], painted: {}, editedAt: SET.editedAt + 5000 };
    await me.put('/prism/set-1', changed);
    const all = (await me.get('/prism')).body;
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ name: 'Renamed', pins: [], painted: {}, editedAt: SET.editedAt + 5000 });
  });

  test('a set can be deleted, and deleting one that is gone is fine', async () => {
    const me = await prismPerson();
    await me.put('/prism/set-1', SET);
    await me.put('/prism/set-2', { ...SET, name: 'Other' });
    expect((await me.del('/prism/set-1')).status).toBe(204);
    expect((await me.get('/prism')).body.map((s) => s.clientId)).toEqual(['set-2']);
    expect((await me.del('/prism/set-1')).status).toBe(204);
  });

  test("one person never sees or changes another person's sets", async () => {
    const a = await prismPerson();
    const b = await prismPerson();
    await a.put('/prism/set-1', SET);
    expect((await b.get('/prism')).body).toEqual([]);
    // b saving and deleting the same id only touches b's own
    await b.put('/prism/set-1', { ...SET, name: 'Bs set' });
    await b.del('/prism/set-1');
    expect((await a.get('/prism')).body).toMatchObject([{ name: 'Blue decks' }]);
  });
});

describe('bad sets are refused and nothing is saved', () => {
  test.each([
    ['no name', { ...SET, name: '' }],
    ['a name that is not text', { ...SET, name: 5 }],
    ['a name that is too long', { ...SET, name: 'x'.repeat(61) }],
    ['a corner that does not exist', { ...SET, corner: 4 }],
    ['no time', { ...SET, editedAt: undefined }],
    ['two decks in one slot', { ...SET, decks: [{ deckId: 'a', slot: 3 }, { deckId: 'b', slot: 3 }] }],
    ['a slot past 48', { ...SET, decks: [{ deckId: 'a', slot: 49 }] }],
    ['decks that are not a list', { ...SET, decks: 'many' }],
    ['a pin without a card', { ...SET, pins: [{ deckId: 'a' }] }],
    ['painted that is not an object', { ...SET, painted: [] }],
    ['painted copies that are not lists', { ...SET, painted: { island: 'yes' } }],
    ['painted deck ids that are not text', { ...SET, painted: { island: [[1]] } }],
    ['card names that are not text', { ...SET, names: { island: 5 } }],
    ['scrape that is not an object', { ...SET, scrape: [] }],
    ['a scrape slot past 48', { ...SET, scrape: { island: [[49]] } }],
    ['scrape slots that are not numbers', { ...SET, scrape: { island: [['a']] } }],
  ])('%s', async (_what, body) => {
    const me = await prismPerson();
    expect((await me.put('/prism/set-1', body)).status).toBe(400);
    expect(await PrismSet.countDocuments()).toBe(0);
  });
});

test('deleting the account deletes its PRISM sets too', async () => {
  const me = await prismPerson();
  await me.put('/prism/set-1', SET);
  const other = await prismPerson();
  await other.put('/prism/set-9', SET);
  const gone = await request(app).delete('/auth/account').set('Authorization', bearer(me.user)).send({ password: TEST_PASSWORD });
  expect(gone.status).toBe(204);
  expect((await PrismSet.find().lean()).map((s) => s.clientId)).toEqual(['set-9']);
});
