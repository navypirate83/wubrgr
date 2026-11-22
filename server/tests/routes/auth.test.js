/* =====================================================================
   TESTS: SIGN UP, LOG IN, TOKENS AND STAYING SIGNED IN
   Each test sends a pretend request straight to the app (no real port)
   and checks the answer. The test database is emptied after every test.
   ===================================================================== */

import request from 'supertest';
import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import app from '../../app.js';
import User from '../../models/User.js';
import RefreshToken from '../../models/RefreshToken.js';
import Binder from '../../models/Binder.js';
import List from '../../models/List.js';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../helpers/db.js';
import { makeUser, bearer, TEST_PASSWORD } from '../helpers/users.js';
import { hashToken } from '../../utils/tokens.js';

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

const signup = (body) => request(app).post('/auth/signup').send(body);
const good = { email: 'Ann@Example.com', password: 'long-enough-12', name: 'Ann' };

describe('signup', () => {
  test('201 with exactly the right keys, nothing secret, email lowercased, username defaults to email', async () => {
    const res = await signup(good);
    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual(['accessToken', 'refreshToken', 'user']);
    expect(Object.keys(res.body.user).sort()).toEqual(['email', 'id', 'name', 'roles', 'username']);
    expect(JSON.stringify(res.body).toLowerCase()).not.toContain('password');
    expect(res.body.user.email).toBe('ann@example.com');
    expect(res.body.user.username).toBe('ann@example.com');
  });

  test('a chosen username is saved lowercase, and a sneaky role or roles list is ignored', async () => {
    const res = await signup({ ...good, username: 'Ann.Smith', role: 'admin', roles: ['admin'] });
    expect(res.status).toBe(201);
    expect(res.body.user.username).toBe('ann.smith');
    expect((await User.findOne({ email: 'ann@example.com' })).roles).toEqual([]);
    expect(res.body.user.roles).toEqual([]);
  });

  test.each([
    ['empty body', {}],
    ['missing name', { email: 'a@b.com', password: 'long-enough-12' }],
    ['bad email', { ...good, email: 'not-an-email' }],
    ['5-character password', { ...good, password: '12345' }],
    ['11-character password', { ...good, password: 'only-11-ch1' }],
    ['password with no number or symbol', { ...good, password: 'onlylettershere' }],
    ['password with no letter', { ...good, password: '9081726354-+' }],
    ['password of one repeated character', { ...good, password: 'aaaaaaaaaaaa1' }],
    ['password with a well-known piece', { ...good, password: 'MyPassword-2026' }],
    ['password holding the email name', { ...good, email: 'annabel@example.com', password: 'annabel-rocks-12' }],
    ['password holding the username', { ...good, username: 'ann.one', password: 'x-ann.one-x-12' }],
    ['email as an object', { ...good, email: { $ne: null } }],
    ['username as an object', { ...good, username: { $ne: null } }],
    ['username with an @', { ...good, username: 'a@b.com' }],
    ['too-short username', { ...good, username: 'ab' }],
    ['reserved username', { ...good, username: 'admin' }],
    ['80-byte password', { ...good, password: 'x'.repeat(80) }],
  ])('400 for %s', async (label, body) => {
    const res = await signup(body);
    expect(res.status).toBe(400);
    expect(await User.countDocuments()).toBe(0);
  });

  test('the short-password message says exactly what is needed', async () => {
    const res = await signup({ ...good, password: '1234' });
    expect(res.body.error).toBe('Password must be at least 12 characters long');
  });

  test('409 for a duplicate email in another capitalization, and a duplicate username', async () => {
    await signup({ ...good, username: 'ann.one' });
    const sameEmail = await signup({ ...good, email: 'ANN@example.com' });
    expect(sameEmail.status).toBe(409);
    const sameName = await signup({ email: 'other@example.com', password: 'long-enough-12', name: 'B', username: 'ANN.ONE' });
    expect(sameName.status).toBe(409);
  });

  test('10 signups at the same instant with one email: exactly one succeeds', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => signup(good)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(9);
  });
});

describe('password storage', () => {
  test('the stored password is scrambled, and saving again does not scramble it twice', async () => {
    const user = await makeUser();
    const saved = await User.findById(user._id).select('+password');
    expect(saved.password.startsWith('$2')).toBe(true);
    expect(saved.password).not.toContain(TEST_PASSWORD);
    const before = saved.password;
    saved.name = 'New Name';
    await saved.save();
    expect((await User.findById(user._id).select('+password')).password).toBe(before);
  });
});

describe('login', () => {
  // Send the same login several times, one after another, and give back the last answer
  const tryLogin = async (user, password, times = 1) => {
    let last;
    for (let i = 0; i < times; i++) last = await request(app).post('/auth/login').send({ email: user.email, password });
    return last;
  };

  test('5 wrong passwords pause the account for 30 minutes, even for the right password', async () => {
    const user = await makeUser();
    expect((await tryLogin(user, 'wrong-wrong-1', 5)).status).toBe(401);
    const paused = await tryLogin(user, TEST_PASSWORD);
    expect(paused.status).toBe(429);
    expect(paused.body.error).toMatch(/Try again in 30 minutes/);
    const saved = await User.findById(user._id);
    expect(saved.failedLogins).toBe(5);
    expect(saved.lockedUntil.getTime()).toBeGreaterThan(Date.now() + 29 * 60 * 1000);
    // Guesses made during the pause are refused without being counted
    await tryLogin(user, 'wrong-wrong-1', 3);
    expect((await User.findById(user._id)).failedLogins).toBe(5);
  });

  test('once the pause is over the right password works and clears the count', async () => {
    const user = await makeUser();
    await tryLogin(user, 'wrong-wrong-1', 5);
    await User.updateOne({ _id: user._id }, { $set: { lockedUntil: new Date(Date.now() - 1000) } });
    expect((await tryLogin(user, TEST_PASSWORD)).status).toBe(200);
    const saved = await User.findById(user._id);
    expect(saved.failedLogins).toBe(0);
    expect(saved.lockedUntil).toBeUndefined();
  });

  test('4 wrong passwords then the right one: no pause, and the count starts again', async () => {
    const user = await makeUser();
    await tryLogin(user, 'wrong-wrong-1', 4);
    expect((await tryLogin(user, TEST_PASSWORD)).status).toBe(200);
    expect((await User.findById(user._id)).failedLogins).toBe(0);
  });

  test('5 more wrong passwords after the pause: the password must be reset, and a reset lets the person back in', async () => {
    process.env.RESEND_API_KEY = 'fake';
    process.env.MAIL_FROM = 'Test <test@example.com>';
    const sent = [];
    const spy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => { sent.push(JSON.parse(options.body)); return { ok: true, status: 200 }; });
    try {
      const user = await makeUser();
      await tryLogin(user, 'wrong-wrong-1', 5);
      await User.updateOne({ _id: user._id }, { $set: { lockedUntil: new Date(Date.now() - 1000) } });
      expect((await tryLogin(user, 'wrong-wrong-1', 5)).status).toBe(401);
      const blocked = await tryLogin(user, TEST_PASSWORD);
      expect(blocked.status).toBe(403);
      expect(blocked.body.error).toMatch(/Reset your password/);

      await request(app).post('/auth/forgot').send({ email: user.email });
      const code = /code is: (\d{6})/.exec(sent[0].text)[1];
      expect((await request(app).post('/auth/reset').send({ email: user.email, code, password: 'brand-new-pass1' })).status).toBe(200);
      expect((await tryLogin(user, 'brand-new-pass1')).status).toBe(200);
      const saved = await User.findById(user._id);
      expect(saved.failedLogins).toBe(0);
      expect(saved.mustResetPassword).toBeUndefined();
    } finally {
      spy.mockRestore();
      delete process.env.RESEND_API_KEY;
      delete process.env.MAIL_FROM;
    }
  });

  test('where email is not set up, the 10th wrong password pauses again instead of asking for a reset nobody could do', async () => {
    delete process.env.RESEND_API_KEY;
    const user = await makeUser();
    await tryLogin(user, 'wrong-wrong-1', 5);
    await User.updateOne({ _id: user._id }, { $set: { lockedUntil: new Date(Date.now() - 1000) } });
    await tryLogin(user, 'wrong-wrong-1', 5);
    expect((await tryLogin(user, TEST_PASSWORD)).status).toBe(429);
    expect((await User.findById(user._id)).mustResetPassword).toBeUndefined();
  });

  test('wrong passwords for an account that does not exist change nothing', async () => {
    const user = await makeUser();
    for (let i = 0; i < 6; i++) await request(app).post('/auth/login').send({ email: 'ghost@example.com', password: 'wrong-wrong-1' });
    expect((await tryLogin(user, TEST_PASSWORD)).status).toBe(200);
  });

  test('works with the username and with the email', async () => {
    const user = await makeUser({ username: 'login.user' });
    const byName = await request(app).post('/auth/login').send({ username: 'LOGIN.user', password: TEST_PASSWORD });
    const byEmail = await request(app).post('/auth/login').send({ email: user.email, password: TEST_PASSWORD });
    expect(byName.status).toBe(200);
    expect(byEmail.status).toBe(200);
    expect(JSON.stringify(byName.body)).not.toMatch(/\$2[aby]\$/);
  });

  test('a wrong password and an unknown account give the identical 401', async () => {
    const user = await makeUser();
    const wrong = await request(app).post('/auth/login').send({ email: user.email, password: 'nope-nope-nope' });
    const unknown = await request(app).post('/auth/login').send({ email: 'ghost@example.com', password: 'nope-nope-nope' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.text).toBe(unknown.text);
    expect(wrong.body.error).toBe('Invalid username or password');
  });

  test('login with an object instead of text is refused', async () => {
    await makeUser();
    const res = await request(app).post('/auth/login').send({ username: { $ne: null }, password: { $ne: null } });
    expect(res.status).toBe(400);
  });
});

describe('sessions', () => {
  test('the access token holds sub, email and a roles list and lives 900 seconds; another secret fails', async () => {
    const res = await signup(good);
    const payload = jwt.verify(res.body.accessToken, process.env.JWT_SECRET);
    expect(payload.sub).toBe(res.body.user.id);
    expect(payload.email).toBe('ann@example.com');
    expect(payload.roles).toEqual([]);
    expect(payload.exp - payload.iat).toBe(900);
    expect(() => jwt.verify(res.body.accessToken, 'a-different-secret')).toThrow();
  });

  test('refresh gives a new pair; the database holds only fingerprints', async () => {
    const first = (await signup(good)).body;
    expect(await RefreshToken.countDocuments({ tokenHash: first.refreshToken })).toBe(0);
    const second = await request(app).post('/auth/refresh').send({ refreshToken: first.refreshToken });
    expect(second.status).toBe(200);
    expect(second.body.refreshToken).not.toBe(first.refreshToken);
  });

  // The swap worked but the new token never reached the app (it was closed or switched away from mid-reply):
  // the app tries again with the old token, and that must not sign the person out
  test('a token that was just swapped works again, so a lost reply does not sign anyone out', async () => {
    const first = (await signup(good)).body;
    await request(app).post('/auth/refresh').send({ refreshToken: first.refreshToken });    // the reply that never arrived
    const retry = await request(app).post('/auth/refresh').send({ refreshToken: first.refreshToken });
    expect(retry.status).toBe(200);
    // ...and the pair it gives keeps working
    const next = await request(app).post('/auth/refresh').send({ refreshToken: retry.body.refreshToken });
    expect(next.status).toBe(200);
  });

  test('a swapped token coming back weeks later is treated as theft and cancels the whole login', async () => {
    const first = (await signup(good)).body;
    const second = (await request(app).post('/auth/refresh').send({ refreshToken: first.refreshToken })).body;
    // Pretend the swap happened 15 days ago (the grace period is 14)
    await RefreshToken.updateMany({ usedAt: { $ne: null } }, { usedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000) });
    const replay = await request(app).post('/auth/refresh').send({ refreshToken: first.refreshToken });
    expect(replay.status).toBe(401);
    const newer = await request(app).post('/auth/refresh').send({ refreshToken: second.refreshToken });
    expect(newer.status).toBe(401);
  });

  test('two refreshes at the same instant (two browser tabs) both succeed and neither is signed out', async () => {
    const first = (await signup(good)).body;
    const both = await Promise.all([1, 2].map(() => request(app).post('/auth/refresh').send({ refreshToken: first.refreshToken })));
    expect(both.filter((r) => r.status === 200)).toHaveLength(2);
  });

  test('expired, made-up and deleted-account tokens all give 401', async () => {
    const first = (await signup(good)).body;
    await RefreshToken.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });
    expect((await request(app).post('/auth/refresh').send({ refreshToken: first.refreshToken })).status).toBe(401);
    expect((await request(app).post('/auth/refresh').send({ refreshToken: 'made-up' })).status).toBe(401);

    const other = (await signup({ ...good, email: 'zed@example.com' })).body;
    await User.deleteOne({ email: 'zed@example.com' });
    expect((await request(app).post('/auth/refresh').send({ refreshToken: other.refreshToken })).status).toBe(401);
  });

  test('logout makes the token fail; logout-all kills every token of the user', async () => {
    const a = (await signup(good)).body;
    expect((await request(app).post('/auth/logout').send({ refreshToken: a.refreshToken })).status).toBe(204);
    expect((await request(app).post('/auth/refresh').send({ refreshToken: a.refreshToken })).status).toBe(401);

    const login1 = (await request(app).post('/auth/login').send({ email: good.email, password: good.password })).body;
    const login2 = (await request(app).post('/auth/login').send({ email: good.email, password: good.password })).body;
    const all = await request(app).post('/auth/logout-all').set('Authorization', `Bearer ${login1.accessToken}`);
    expect(all.status).toBe(204);
    expect((await request(app).post('/auth/refresh').send({ refreshToken: login1.refreshToken })).status).toBe(401);
    expect((await request(app).post('/auth/refresh').send({ refreshToken: login2.refreshToken })).status).toBe(401);
  });

  test('logout always answers 204, even for nonsense', async () => {
    expect((await request(app).post('/auth/logout').send({ refreshToken: 'nonsense' })).status).toBe(204);
    expect((await request(app).post('/auth/logout').send({})).status).toBe(204);
  });

  test('only a fingerprint of the refresh token is stored', async () => {
    const a = (await signup(good)).body;
    const row = await RefreshToken.findOne();
    expect(row.tokenHash).toBe(hashToken(a.refreshToken));
    expect(row.tokenHash).not.toBe(a.refreshToken);
  });
});

describe('google sign-in', () => {
  // Put the switch back to "off" after each test, so one test can't leave it on for the next
  afterEach(() => { delete process.env.GOOGLE_LOGIN; });

  test('is switched off: everyone is turned away with 403, with or without a token', async () => {
    expect((await request(app).post('/auth/google').send({ accessToken: 'abc' })).status).toBe(403);
    expect((await request(app).post('/auth/google').send({})).status).toBe(403);
  });

  test('switched on (GOOGLE_LOGIN=on): answers 503 when it is not set up, and 400 without a token', async () => {
    process.env.GOOGLE_LOGIN = 'on';
    expect((await request(app).post('/auth/google').send({ accessToken: 'abc' })).status).toBe(503);
    expect((await request(app).post('/auth/google').send({})).status).toBe(400);
  });
});

describe('logout-all needs sign-in', () => {
  test('401 without a token', async () => {
    expect((await request(app).post('/auth/logout-all')).status).toBe(401);
    const user = await makeUser();
    expect((await request(app).post('/auth/logout-all').set('Authorization', bearer(user))).status).toBe(204);
  });
});

// Deleting an account (DELETE /auth/account)
describe('delete account', () => {
  test('401 without sign-in', async () => {
    expect((await request(app).delete('/auth/account').send({ password: TEST_PASSWORD })).status).toBe(401);
  });

  test('needs the right password, and keeps everything when it is wrong or missing', async () => {
    const user = await makeUser();
    expect((await request(app).delete('/auth/account').set('Authorization', bearer(user)).send({})).status).toBe(400);
    expect((await request(app).delete('/auth/account').set('Authorization', bearer(user)).send({ password: 'wrong-pass-1' })).status).toBe(403);
    expect(await User.countDocuments()).toBe(1);
  });

  test('deletes the account, its binders, lists and logins, and nobody else', async () => {
    const mine = await makeUser();
    const other = await makeUser();
    const auth = { Authorization: bearer(mine) };
    await Binder.create({ name: 'Mine', owner: mine._id });
    await List.create({ name: 'My list', owner: mine._id });
    await Binder.create({ name: 'Theirs', owner: other._id });
    await RefreshToken.create({ user: mine._id, tokenHash: 'a', family: 'f', expiresAt: new Date(Date.now() + 1e6) });

    const res = await request(app).delete('/auth/account').set(auth).send({ password: TEST_PASSWORD });
    expect(res.status).toBe(204);
    expect(await User.countDocuments({ _id: mine._id })).toBe(0);
    expect(await RefreshToken.countDocuments({ user: mine._id })).toBe(0);
    expect(await Binder.countDocuments({ owner: mine._id })).toBe(0);
    expect(await List.countDocuments({ owner: mine._id })).toBe(0);
    expect(await Binder.countDocuments({ owner: other._id })).toBe(1);
    expect(await User.countDocuments({ _id: other._id })).toBe(1);
  });
});
