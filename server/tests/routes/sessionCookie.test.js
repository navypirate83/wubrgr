/* =====================================================================
   TESTS: THE WEBSITE'S LOGIN IN A LOCKED COOKIE
   The website asks for its long-lived login code (the refresh token) to
   be kept in a cookie its own page can't read (see utils/sessionCookie.js).
   These check that the cookie is only given to, and only read for, a
   request that asks for it AND comes from one of our own websites, and
   that the phone app's way (tokens in the reply and the body) is unchanged.
   ===================================================================== */

import request from 'supertest';
import app from '../../app.js';
import RefreshToken from '../../models/RefreshToken.js';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../helpers/db.js';

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

// One of our own websites (see tests/setup.js), and somebody else's
const OUR_SITE = 'https://navypirate83.github.io';
const OTHER_SITE = 'https://evil.example';
const good = { email: 'ann@example.com', password: 'long-enough-12', name: 'Ann' };

// A request the way the website sends it: from our site, asking for the cookie
const fromWebsite = (method, path) => request(app)[method](path).set('Origin', OUR_SITE).set('X-Session-Store', 'cookie');

// The "wubrgr_refresh=..." part of a reply's Set-Cookie header (what the browser would send back), and the whole line
const cookieLine = (res) => (res.headers['set-cookie'] ?? []).find((line) => line.startsWith('wubrgr_refresh=')) ?? '';
const cookiePair = (res) => cookieLine(res).split(';')[0];

describe('signing in from the website', () => {
  test('the refresh token goes in a locked cookie and is left out of the reply', async () => {
    const res = await fromWebsite('post', '/auth/signup').send(good);
    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual(['accessToken', 'user']);
    const line = cookieLine(res);
    expect(line).toMatch(/^wubrgr_refresh=.{40,}/);
    expect(line).toContain('HttpOnly');
    expect(line).toContain('SameSite=Strict');
    expect(line).toContain('Path=/auth');
    // The browser is allowed to keep it only because the reply names our exact site and says "credentials"
    expect(res.headers['access-control-allow-origin']).toBe(OUR_SITE);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  test('logging in works the same way', async () => {
    await fromWebsite('post', '/auth/signup').send(good);
    const res = await fromWebsite('post', '/auth/login').send({ username: good.email, password: good.password });
    expect(res.status).toBe(200);
    expect(res.body.refreshToken).toBeUndefined();
    expect(cookiePair(res)).toMatch(/^wubrgr_refresh=.+/);
  });
});

describe('who does NOT get a cookie', () => {
  test('the phone app (no Origin, no header): tokens in the reply, as before', async () => {
    const res = await request(app).post('/auth/signup').send(good);
    expect(Object.keys(res.body).sort()).toEqual(['accessToken', 'refreshToken', 'user']);
    expect(cookieLine(res)).toBe('');
  });

  test('our website without the header, and another website with it', async () => {
    const noHeader = await request(app).post('/auth/signup').set('Origin', OUR_SITE).send(good);
    expect(noHeader.body.refreshToken).toBeDefined();
    expect(cookieLine(noHeader)).toBe('');
    const stranger = await request(app).post('/auth/login').set('Origin', OTHER_SITE).set('X-Session-Store', 'cookie')
      .send({ username: good.email, password: good.password });
    expect(cookieLine(stranger)).toBe('');
  });
});

describe('staying signed in with the cookie', () => {
  test('refresh reads the cookie, gives a new access token and swaps the cookie for a new one', async () => {
    const first = await fromWebsite('post', '/auth/signup').send(good);
    const res = await fromWebsite('post', '/auth/refresh').set('Cookie', cookiePair(first)).send({});
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['accessToken', 'user']);
    expect(cookiePair(res)).toMatch(/^wubrgr_refresh=.+/);
    expect(cookiePair(res)).not.toBe(cookiePair(first));
  });

  test('the cookie is ignored for a request from another website, or one without the header', async () => {
    const first = await fromWebsite('post', '/auth/signup').send(good);
    const stranger = await request(app).post('/auth/refresh').set('Origin', OTHER_SITE).set('X-Session-Store', 'cookie')
      .set('Cookie', cookiePair(first)).send({});
    expect(stranger.status).toBe(400);
    const noHeader = await request(app).post('/auth/refresh').set('Origin', OUR_SITE).set('Cookie', cookiePair(first)).send({});
    expect(noHeader.status).toBe(400);
  });

  test('the website with no cookie, or a made-up one, is told to sign in (and a made-up one is thrown away)', async () => {
    expect((await fromWebsite('post', '/auth/refresh').send({})).status).toBe(401);
    const res = await fromWebsite('post', '/auth/refresh').set('Cookie', 'wubrgr_refresh=not-a-real-token').send({});
    expect(res.status).toBe(401);
    expect(cookieLine(res)).toContain('Max-Age=0');
  });

  test('a login from before the cookie (token in the body) is moved into the cookie on its next refresh', async () => {
    const old = (await request(app).post('/auth/signup').send(good)).body;
    const res = await fromWebsite('post', '/auth/refresh').send({ refreshToken: old.refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.refreshToken).toBeUndefined();
    expect(cookiePair(res)).toMatch(/^wubrgr_refresh=.+/);
  });
});

describe('signing out from the website', () => {
  test('logout ends the login in the cookie and tells the browser to throw the cookie away', async () => {
    const first = await fromWebsite('post', '/auth/signup').send(good);
    expect(await RefreshToken.countDocuments()).toBe(1);
    const res = await fromWebsite('post', '/auth/logout').set('Cookie', cookiePair(first)).send({});
    expect(res.status).toBe(204);
    expect(cookieLine(res)).toContain('Max-Age=0');
    expect(await RefreshToken.countDocuments()).toBe(0);
    // The old cookie no longer works
    expect((await fromWebsite('post', '/auth/refresh').set('Cookie', cookiePair(first)).send({})).status).toBe(401);
  });
});
