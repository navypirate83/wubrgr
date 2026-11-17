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
  test('an ordinary account and a prism account are turned away from every admin route', async () => {
    const target = await makeUser();
    for (const role of ['user', 'prism']) {
      const me = as(await makeUser({ role }));
      expect((await me.get('/admin/users')).status).toBe(403);
      expect((await me.patch(`/admin/users/${target._id}`, { role: 'admin' })).status).toBe(403);
      expect((await me.del(`/admin/users/${target._id}`, { name: target.name })).status).toBe(403);
    }
    expect((await User.findById(target._id)).role).toBe('user');
  });
});

describe('changing rights', () => {
  test('an admin can give PRISM, give admin, and take them away again', async () => {
    const admin = await makeUser({ role: 'admin' });
    const other = await makeUser();
    const me = as(admin);
    for (const role of ['prism', 'admin', 'user']) {
      const res = await me.patch(`/admin/users/${other._id}`, { role });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: String(other._id), role });
      expect((await User.findById(other._id)).role).toBe(role);
    }
  });

  test('a role that does not exist, a missing person and a bad id are refused', async () => {
    const admin = await makeUser({ role: 'admin' });
    const other = await makeUser();
    const me = as(admin);
    expect((await me.patch(`/admin/users/${other._id}`, { role: 'owner' })).status).toBe(400);
    expect((await me.patch(`/admin/users/${other._id}`, {})).status).toBe(400);
    expect((await me.patch('/admin/users/64b000000000000000000000', { role: 'user' })).status).toBe(404);
    expect((await me.patch('/admin/users/not-an-id', { role: 'user' })).status).toBe(404);
    expect((await User.findById(other._id)).role).toBe('user');
  });

  test('an admin cannot change their own rights', async () => {
    const admin = await makeUser({ role: 'admin' });
    const second = await makeUser({ role: 'admin' });
    const res = await as(admin).patch(`/admin/users/${admin._id}`, { role: 'user' });
    expect(res.status).toBe(403);
    expect((await User.findById(admin._id)).role).toBe('admin');
    // ...though another admin can
    expect((await as(second).patch(`/admin/users/${admin._id}`, { role: 'user' })).status).toBe(200);
  });

  test('the last admin cannot be taken down', async () => {
    const admin = await makeUser({ role: 'admin' });
    // Not by themselves (blocked above), and not by an account that has since lost its admin right either:
    // here a second admin demotes the first, then the second is the last one and is protected
    const second = await makeUser({ role: 'admin' });
    expect((await as(second).patch(`/admin/users/${admin._id}`, { role: 'user' })).status).toBe(200);
    const third = await makeUser({ role: 'admin' });
    expect((await as(third).patch(`/admin/users/${second._id}`, { role: 'user' })).status).toBe(200);
    // third is now the only admin; a stale token for the demoted second admin still says admin, and must not remove the last one
    const staleSecond = as(second);
    const res = await staleSecond.patch(`/admin/users/${third._id}`, { role: 'user' });
    expect(res.status).toBe(409);
    expect((await User.findById(third._id)).role).toBe('admin');
  });
});

describe('listing people', () => {
  test('an admin sees everyone, never passwords', async () => {
    const admin = await makeUser({ role: 'admin' });
    await makeUser();
    const res = await as(admin).get('/admin/users?limit=100');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toEqual(expect.objectContaining({ email: expect.any(String), role: expect.any(String) }));
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });

  // Someone who has never signed in has no "last used" date; signing in sets it
  test('the list shows when each account was last used, set by signing in', async () => {
    const admin = await makeUser({ role: 'admin' });
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
    const admin = await makeUser({ role: 'admin' });
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
    const admin = await makeUser({ role: 'admin' });
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
    const admin = await makeUser({ role: 'admin', name: 'Boss' });
    expect((await as(admin).del(`/admin/users/${admin._id}`, { name: 'Boss' })).status).toBe(403);
    // A second admin deleting the first is fine; the second is then the last and is protected from a stale admin token
    const second = await makeUser({ role: 'admin', name: 'Second' });
    expect((await as(second).del(`/admin/users/${admin._id}`, { name: 'Boss' })).status).toBe(204);
    const stale = as(admin);
    // (the deleted admin's token no longer works at all)
    expect((await stale.del(`/admin/users/${second._id}`, { name: 'Second' })).status).toBe(401);
    expect(await User.findById(second._id)).not.toBeNull();
  });

  test('the last admin is protected even from another admin whose rights were just removed', async () => {
    const first = await makeUser({ role: 'admin', name: 'First' });
    const second = await makeUser({ role: 'admin', name: 'Second' });
    // second demotes first; first's old token still says "admin" for up to 15 minutes
    expect((await as(second).patch(`/admin/users/${first._id}`, { role: 'user' })).status).toBe(200);
    const res = await as(first).del(`/admin/users/${second._id}`, { name: 'Second' });
    expect(res.status).toBe(409);
    expect(await User.findById(second._id)).not.toBeNull();
  });

  test('a missing person and a bad id are 404', async () => {
    const admin = await makeUser({ role: 'admin' });
    expect((await as(admin).del('/admin/users/64b000000000000000000000', { name: 'x' })).status).toBe(404);
    expect((await as(admin).del('/admin/users/nope', { name: 'x' })).status).toBe(404);
  });
});
