/* =====================================================================
   TESTS: ADMIN ROUTES
   Only admins may use /admin. An admin can list the people, change one
   person's rights, and delete a person with everything they own (after
   typing their name). Nobody can change or delete their own account there,
   and the last admin can't be taken down or deleted. Ordinary accounts are
   turned away from every one of these.
   ===================================================================== */

import request from 'supertest';
import app from '../../app.js';
import User from '../../models/User.js';
import Binder from '../../models/Binder.js';
import Card from '../../models/Card.js';
import Deck from '../../models/Deck.js';
import PrismSet from '../../models/PrismSet.js';
import RefreshToken from '../../models/RefreshToken.js';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../helpers/db.js';
import { makeUser, bearer, TEST_PASSWORD } from '../helpers/users.js';

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

const as = (user) => ({
  get: (url) => request(app).get(url).set('Authorization', bearer(user)),
  patch: (url, body) => request(app).patch(url).set('Authorization', bearer(user)).send(body),
  del: (url, body) => request(app).delete(url).set('Authorization', bearer(user)).send(body),
});

describe('only admins get in', () => {
  test('an ordinary, a prism and an aiscan account are turned away from every admin route', async () => {
    const target = await makeUser();
    for (const roles of [[], ['prism'], ['aiscan'], ['prism', 'aiscan']]) {
      const me = as(await makeUser({ roles }));
      expect((await me.get('/admin/users')).status).toBe(403);
      expect((await me.patch(`/admin/users/${target._id}`, { roles: ['admin'] })).status).toBe(403);
      expect((await me.del(`/admin/users/${target._id}`, { name: target.name })).status).toBe(403);
    }
    expect([...(await User.findById(target._id)).roles]).toEqual([]);
  });
});

describe('changing rights', () => {
  test('an admin can give PRISM, give admin, and take them away again', async () => {
    const admin = await makeUser({ roles: ['admin'] });
    const other = await makeUser();
    const me = as(admin);
    for (const roles of [['prism'], ['prism', 'aiscan'], ['admin'], []]) {
      const res = await me.patch(`/admin/users/${other._id}`, { roles });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: String(other._id), roles });
      expect([...(await User.findById(other._id)).roles]).toEqual(roles);
    }
  });

  test('repeats are dropped and the rights are put in the standard order', async () => {
    const admin = await makeUser({ roles: ['admin'] });
    const other = await makeUser();
    const res = await as(admin).patch(`/admin/users/${other._id}`, { roles: ['aiscan', 'prism', 'aiscan'] });
    expect(res.status).toBe(200);
    expect(res.body.roles).toEqual(['prism', 'aiscan']);
  });

  test('a body that is not a list of known rights is refused with 400 and nothing changes', async () => {
    const admin = await makeUser({ roles: ['admin'] });
    const other = await makeUser({ roles: ['prism'] });
    const me = as(admin);
    for (const body of [{ roles: 'admin' }, { roles: [1] }, { roles: ['owner'] }, { roles: ['prism', 'user'] }, { role: 'admin' }, {}]) {
      const res = await me.patch(`/admin/users/${other._id}`, body);
      expect(res.status).toBe(400);
      expect(typeof res.body.error).toBe('string');
    }
    expect([...(await User.findById(other._id)).roles]).toEqual(['prism']);
  });

  test('a right that does not exist, a missing person and a bad id are refused', async () => {
    const admin = await makeUser({ roles: ['admin'] });
    const other = await makeUser();
    const me = as(admin);
    expect((await me.patch(`/admin/users/${other._id}`, { roles: ['owner'] })).status).toBe(400);
    expect((await me.patch(`/admin/users/${other._id}`, {})).status).toBe(400);
    expect((await me.patch('/admin/users/64b000000000000000000000', { roles: [] })).status).toBe(404);
    expect((await me.patch('/admin/users/not-an-id', { roles: [] })).status).toBe(404);
    expect([...(await User.findById(other._id)).roles]).toEqual([]);
  });

  test('an admin cannot change their own rights', async () => {
    const admin = await makeUser({ roles: ['admin'] });
    const second = await makeUser({ roles: ['admin'] });
    const res = await as(admin).patch(`/admin/users/${admin._id}`, { roles: [] });
    expect(res.status).toBe(403);
    expect([...(await User.findById(admin._id)).roles]).toEqual(['admin']);
    // ...though another admin can
    expect((await as(second).patch(`/admin/users/${admin._id}`, { roles: [] })).status).toBe(200);
  });

  test('the last admin cannot be taken down', async () => {
    const admin = await makeUser({ roles: ['admin'] });
    // Not by themselves (blocked above), and not by an account that has since lost its admin right either:
    // here a second admin demotes the first, then the second is the last one and is protected
    const second = await makeUser({ roles: ['admin'] });
    expect((await as(second).patch(`/admin/users/${admin._id}`, { roles: [] })).status).toBe(200);
    const third = await makeUser({ roles: ['admin'] });
    expect((await as(third).patch(`/admin/users/${second._id}`, { roles: [] })).status).toBe(200);
    // third is now the only admin. The demoted second admin's token still says admin, but the server goes by
    // the account, so they can't touch the last one (or anything else on the Admin page)
    const staleSecond = as(second);
    const res = await staleSecond.patch(`/admin/users/${third._id}`, { roles: ['prism'] });
    expect(res.status).toBe(403);
    expect([...(await User.findById(third._id)).roles]).toEqual(['admin']);
    // (Nobody else is an admin now and nobody can change their own rights, so the "last admin" answer itself
    // can only come up when two admins act at the same moment: see the two tests for that below.)
  });
});

describe('listing people', () => {
  test('two admins taking each other down at the same moment never leaves zero admins', async () => {
    for (let round = 0; round < 5; round += 1) {
      await User.deleteMany({});
      const a = await makeUser({ roles: ['admin', 'prism'] });
      const b = await makeUser({ roles: ['admin'] });
      const answers = await Promise.all([
        as(a).patch(`/admin/users/${b._id}`, { roles: [] }),
        as(b).patch(`/admin/users/${a._id}`, { roles: [] }),
      ]);
      expect(await User.countDocuments({ roles: 'admin' })).toBeGreaterThanOrEqual(1);
      // Whoever was undone was told so, and has ALL the rights they had before (not just admin)
      for (const [index, person] of [[0, b], [1, a]]) {
        if (answers[index].status === 409) {
          expect([...(await User.findById(person._id)).roles].sort()).toEqual([...person.roles].sort());
        }
      }
    }
  });

  test('an admin sees everyone, never passwords', async () => {
    const admin = await makeUser({ roles: ['admin'] });
    await makeUser();
    const res = await as(admin).get('/admin/users?limit=100');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toEqual(expect.objectContaining({ email: expect.any(String), roles: expect.any(Array) }));
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });

  // Someone who has never signed in has no "last used" date; signing in sets it
  test('the list shows when each account was last used, set by signing in', async () => {
    const admin = await makeUser({ roles: ['admin'] });
    const sam = await makeUser({ email: 'sam@example.com' });
    const before = (await as(admin).get('/admin/users?limit=100')).body.find((p) => p.email === 'sam@example.com');
    expect(before.lastAccessAt).toBeUndefined();

    const started = Date.now();
    const login = await request(app).post('/auth/login').send({ email: sam.email, password: TEST_PASSWORD });
    expect(login.status).toBe(200);

    const after = (await as(admin).get('/admin/users?limit=100')).body.find((p) => p.email === 'sam@example.com');
    expect(new Date(after.lastAccessAt).getTime()).toBeGreaterThanOrEqual(started - 1000);
  });
});

describe('deleting a person', () => {
  async function aFullAccount() {
    const person = await makeUser({ name: 'Sam Rivera' });
    const binder = await Binder.create({ owner: person._id, name: 'Mine' });
    await Card.create({ owner: person._id, binder: binder._id, page: 1, pocket: 1, name: 'Sol Ring', set: 'cmm', number: '400', image: 'https://cards.scryfall.io/x.jpg' });
    await Deck.create({ owner: person._id, name: 'Deck', format: 'commander' });
    await PrismSet.create({ owner: person._id, clientId: 'p1', name: 'Set 1', corner: 1, decks: [], pins: [], painted: {}, names: {}, editedAt: 1 });
    await RefreshToken.create({ user: person._id, tokenHash: 'abc', family: 'f', expiresAt: new Date(Date.now() + 100000) });
    return person;
  }

  test('with the right name, the person and everything they own are gone, and nobody else is touched', async () => {
    const admin = await makeUser({ roles: ['admin'] });
    const bystander = await makeUser();
    await Binder.create({ owner: bystander._id, name: 'Keep me' });
    const person = await aFullAccount();
    const res = await as(admin).del(`/admin/users/${person._id}`, { name: '  sam RIVERA ' });
    expect(res.status).toBe(204);
    expect(await User.findById(person._id)).toBeNull();
    for (const model of [Binder, Card, Deck, PrismSet]) expect(await model.countDocuments({ owner: person._id })).toBe(0);
    expect(await RefreshToken.countDocuments({ user: person._id })).toBe(0);
    expect(await Binder.countDocuments({ owner: bystander._id })).toBe(1);
    expect(await User.findById(admin._id)).not.toBeNull();
  });

  test('the username or the email works as the name, but a wrong or missing name deletes nothing', async () => {
    const admin = await makeUser({ roles: ['admin'] });
    const person = await aFullAccount();
    const me = as(admin);
    expect((await me.del(`/admin/users/${person._id}`, { name: 'Somebody Else' })).status).toBe(400);
    expect((await me.del(`/admin/users/${person._id}`, { name: '' })).status).toBe(400);
    expect((await me.del(`/admin/users/${person._id}`, {})).status).toBe(400);
    expect(await User.findById(person._id)).not.toBeNull();
    expect(await Binder.countDocuments({ owner: person._id })).toBe(1);
    expect((await me.del(`/admin/users/${person._id}`, { name: person.email })).status).toBe(204);
  });

  test('an admin cannot delete themselves, and the last admin cannot be deleted', async () => {
    const admin = await makeUser({ roles: ['admin'], name: 'Boss' });
    expect((await as(admin).del(`/admin/users/${admin._id}`, { name: 'Boss' })).status).toBe(403);
    // A second admin deleting the first is fine; the second is then the last and is protected from a stale admin token
    const second = await makeUser({ roles: ['admin'], name: 'Second' });
    expect((await as(second).del(`/admin/users/${admin._id}`, { name: 'Boss' })).status).toBe(204);
    const stale = as(admin);
    // (the deleted admin's token no longer works at all)
    expect((await stale.del(`/admin/users/${second._id}`, { name: 'Second' })).status).toBe(401);
    expect(await User.findById(second._id)).not.toBeNull();
  });

  test('an admin whose rights were just removed is turned away at once, though their login token still says admin', async () => {
    const first = await makeUser({ roles: ['admin'], name: 'First' });
    const second = await makeUser({ roles: ['admin'], name: 'Second' });
    const third = await makeUser({ name: 'Third' });
    // second demotes first. first's token was made while they were an admin and still says so.
    expect((await as(second).patch(`/admin/users/${first._id}`, { roles: [] })).status).toBe(200);
    // Everything an admin could do is refused on the very next request
    expect((await as(first).get('/admin/users')).status).toBe(403);
    expect((await as(first).patch(`/admin/users/${third._id}`, { roles: ['admin'] })).status).toBe(403);
    expect((await as(first).del(`/admin/users/${second._id}`, { name: 'Second' })).status).toBe(403);
    expect([...(await User.findById(third._id)).roles]).toEqual([]);
    expect(await User.findById(second._id)).not.toBeNull();
    // ...while the ordinary parts of the app still work for them
    expect((await as(first).get('/binders')).status).toBe(200);
  });

  test('two admins deleting each other at the same moment never leaves zero admins', async () => {
    for (let round = 0; round < 5; round += 1) {
      await User.deleteMany({});
      const a = await makeUser({ roles: ['admin'] });
      const b = await makeUser({ roles: ['admin'] });
      await Promise.all([
        as(a).del(`/admin/users/${b._id}`, { name: b.name }),
        as(b).del(`/admin/users/${a._id}`, { name: a.name }),
      ]);
      expect(await User.countDocuments({ roles: 'admin' })).toBeGreaterThanOrEqual(1);
    }
  });

  test('a missing person and a bad id are 404', async () => {
    const admin = await makeUser({ roles: ['admin'] });
    expect((await as(admin).del('/admin/users/64b000000000000000000000', { name: 'x' })).status).toBe(404);
    expect((await as(admin).del('/admin/users/nope', { name: 'x' })).status).toBe(404);
  });
});
