/* =====================================================================
   TESTS: HOW MUCH ONE ACCOUNT MAY KEEP
   An account may have only so many binders, lists and decks, and only so
   many cards across all of them (see utils/accountLimits.js), so one
   account can't fill the database everybody shares. The real limits are
   large (200 binders, 100,000 cards), so each test sets a small one with
   the server's own settings and puts it back afterwards.
   ===================================================================== */

import request from 'supertest';
import app from '../../app.js';
import Binder from '../../models/Binder.js';
import Card from '../../models/Card.js';
import List from '../../models/List.js';
import Deck from '../../models/Deck.js';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../helpers/db.js';
import { makeUser, bearer, aCard } from '../helpers/users.js';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
afterEach(async () => {
  await clearTestDb();
  for (const name of ['MAX_BINDERS', 'MAX_LISTS', 'MAX_DECKS', 'MAX_ACCOUNT_CARDS', 'DB_LIMIT_MB']) delete process.env[name];
});

// A signed-in person, with short ways to send requests as them
async function person(overrides) {
  const user = await makeUser(overrides);
  const auth = bearer(user);
  return {
    user,
    get: (url) => request(app).get(url).set('Authorization', auth),
    post: (url, body) => request(app).post(url).set('Authorization', auth).send(body),
    put: (url, body) => request(app).put(url).set('Authorization', auth).send(body),
  };
}
// "howMany" cards, each in its own pocket
const cards = (howMany) => Array.from({ length: howMany }, (_, i) => aCard(Math.floor(i / 9) + 1, (i % 9) + 1));
const newBinder = (name) => ({ name, cover: 'black', pages: 10 });

describe('how many binders, lists and decks', () => {
  test('the binder past the limit is refused with a plain sentence, and another account is not affected', async () => {
    process.env.MAX_BINDERS = '2';
    const me = await person();
    expect((await me.post('/binders', newBinder('One'))).status).toBe(201);
    expect((await me.post('/binders', newBinder('Two'))).status).toBe(201);
    const third = await me.post('/binders', newBinder('Three'));
    expect(third.status).toBe(400);
    expect(third.body.error).toBe('You have reached the limit of 2 binders. Delete one you no longer need, then try again.');
    expect(await Binder.countDocuments({ owner: me.user._id })).toBe(2);
    // Somebody else has their own count
    const other = await person();
    expect((await other.post('/binders', newBinder('Theirs'))).status).toBe(201);
  });

  test('deleting one makes room again', async () => {
    process.env.MAX_BINDERS = '1';
    const me = await person();
    const first = await me.post('/binders', newBinder('One'));
    expect((await me.post('/binders', newBinder('Two'))).status).toBe(400);
    await request(app).delete(`/binders/${first.body._id}`).set('Authorization', bearer(me.user));
    expect((await me.post('/binders', newBinder('Two'))).status).toBe(201);
  });

  test('lists and decks have their own limits', async () => {
    process.env.MAX_LISTS = '1';
    process.env.MAX_DECKS = '1';
    const me = await person();
    expect((await me.post('/lists', { name: 'Wants' })).status).toBe(201);
    const list = await me.post('/lists', { name: 'More' });
    expect(list.status).toBe(400);
    expect(list.body.error).toMatch(/limit of 1 lists/);
    expect((await me.post('/decks', { name: 'Deck', format: 'commander' })).status).toBe(201);
    const deck = await me.post('/decks', { name: 'Another', format: 'commander' });
    expect(deck.status).toBe(400);
    expect(deck.body.error).toMatch(/limit of 1 decks/);
    expect(await List.countDocuments()).toBe(1);
    expect(await Deck.countDocuments()).toBe(1);
  });
});

describe('how many cards across the whole account', () => {
  test('saving cards past the limit is refused and the binder keeps what it had', async () => {
    process.env.MAX_ACCOUNT_CARDS = '10';
    const me = await person();
    const a = (await me.post('/binders', newBinder('A'))).body._id;
    const b = (await me.post('/binders', newBinder('B'))).body._id;
    expect((await me.put(`/binders/${a}/cards`, { cards: cards(6) })).status).toBe(200);
    // 6 already, 5 more would be 11
    const over = await me.put(`/binders/${b}/cards`, { cards: cards(5) });
    expect(over.status).toBe(400);
    expect(over.body.error).toBe('That would be 11 cards in your account, and the limit is 10 across all your binders, lists and decks. Remove some cards, then try again.');
    expect(await Card.countDocuments({ binder: b })).toBe(0);
    // 4 more is exactly 10: fine
    expect((await me.put(`/binders/${b}/cards`, { cards: cards(4) })).status).toBe(200);
  });

  test('replacing the cards of a binder does not count the ones being replaced', async () => {
    process.env.MAX_ACCOUNT_CARDS = '10';
    const me = await person();
    const a = (await me.post('/binders', newBinder('A'))).body._id;
    expect((await me.put(`/binders/${a}/cards`, { cards: cards(9) })).status).toBe(200);
    // Saving the same binder again with 10 cards replaces the 9: 10 in all, not 19
    expect((await me.put(`/binders/${a}/cards`, { cards: cards(10) })).status).toBe(200);
    expect((await me.put(`/binders/${a}/cards`, { cards: cards(11) })).status).toBe(400);
    expect(await Card.countDocuments({ binder: a })).toBe(10);
  });

  test('cards in lists and decks count towards the same limit', async () => {
    process.env.MAX_ACCOUNT_CARDS = '5';
    const me = await person();
    const binder = (await me.post('/binders', newBinder('A'))).body._id;
    const list = (await me.post('/lists', { name: 'Wants' })).body._id;
    expect((await me.put(`/binders/${binder}/cards`, { cards: cards(3) })).status).toBe(200);
    // (a list card is a card without a page and pocket)
    const { page, pocket, ...listCard } = aCard(1, 1, { name: 'Sol Ring' });
    expect((await me.put(`/lists/${list}/cards`, { cards: [listCard, listCard] })).status).toBe(200);
    const over = await me.put(`/lists/${list}/cards`, { cards: [listCard, listCard, listCard] });
    expect(over.status).toBe(400);
    expect(over.body.error).toMatch(/That would be 6 cards/);
  });
});

describe('how full the database is (admins only)', () => {
  test('an admin gets megabytes used, of how many, and the percentage', async () => {
    process.env.DB_LIMIT_MB = '1000';
    const admin = await person({ roles: ['admin'] });
    const res = await admin.get('/admin/storage');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['limitMb', 'percent', 'usedMb']);
    expect(res.body.limitMb).toBe(1000);
    expect(res.body.usedMb).toBeGreaterThanOrEqual(0);
    expect(res.body.percent).toBe(Math.round((res.body.usedMb / 1000) * 100));
  });

  test('nobody else can ask', async () => {
    const me = await person();
    expect((await me.get('/admin/storage')).status).toBe(403);
    expect((await request(app).get('/admin/storage')).status).toBe(401);
  });
});
