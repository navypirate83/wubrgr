/* =====================================================================
   TESTS: DECK IMPORT FROM A LINK (/import/deck)
   A fake "other site" stands in for Archidekt and Moxfield (these tests
   never touch the internet). The things to prove: only logged-in people
   get in, only deck links on those two sites are followed (nothing else
   can be reached through us), and each way the site can answer becomes
   a plain answer.
   ===================================================================== */

import express from 'express';
import request from 'supertest';
import app from '../../app.js';
import { requireAuth } from '../../middleware/auth.js';
import { createImportRouter, readDeckLink } from '../../routes/importDeck.js';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../helpers/db.js';
import { makeUser, bearer } from '../helpers/users.js';

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

// An app with the import route and a fake site behind it. "answer" is what
// the site sends back ({ status, body }) or an Error to throw.
function appWith(answer) {
  const asked = [];
  const fakeFetch = async (url) => {
    asked.push(url);
    if (answer instanceof Error) throw answer;
    return { ok: answer.status >= 200 && answer.status < 300, status: answer.status, json: async () => answer.body };
  };
  const small = express();
  small.use('/import', requireAuth, createImportRouter(fakeFetch));
  return { small, asked };
}

test('which links are understood', () => {
  expect(readDeckLink('https://archidekt.com/decks/123456/some-name')).toMatchObject({ source: 'archidekt', id: '123456' });
  expect(readDeckLink('https://www.moxfield.com/decks/AbCdEf12345')).toMatchObject({ source: 'moxfield', id: 'AbCdEf12345' });
  // Not https, another site, not a deck page, a sneaky address
  expect(readDeckLink('http://archidekt.com/decks/123')).toBeNull();
  expect(readDeckLink('https://example.com/decks/123456')).toBeNull();
  expect(readDeckLink('https://archidekt.com/users/123456')).toBeNull();
  expect(readDeckLink('https://archidekt.com.evil.com/decks/123')).toBeNull();
  expect(readDeckLink('https://archidekt.com/decks/12ab')).toBeNull();
  expect(readDeckLink('not a link')).toBeNull();
});

test('you must be logged in', async () => {
  const response = await request(app).get('/import/deck').query({ url: 'https://archidekt.com/decks/1' });
  expect(response.status).toBe(401);
});

test('a deck is fetched from the site and sent back with where it came from', async () => {
  const user = await makeUser();
  const { small, asked } = appWith({ status: 200, body: { name: 'Goblins', cards: [] } });
  const response = await request(small).get('/import/deck').set('Authorization', bearer(user))
    .query({ url: 'https://archidekt.com/decks/123456/goblins' });
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ source: 'archidekt', data: { name: 'Goblins', cards: [] } });
  expect(asked).toEqual(['https://archidekt.com/api/decks/123456/']);
});

test('a link to anywhere else is turned away without asking anyone', async () => {
  const user = await makeUser();
  const { small, asked } = appWith({ status: 200, body: {} });
  const response = await request(small).get('/import/deck').set('Authorization', bearer(user))
    .query({ url: 'https://evil.example.com/decks/123456' });
  expect(response.status).toBe(400);
  expect(asked).toEqual([]);
});

test('the site\'s troubles become plain answers', async () => {
  const user = await makeUser();
  const ask = async (answer, url = 'https://archidekt.com/decks/1') => {
    const { small } = appWith(answer);
    return request(small).get('/import/deck').set('Authorization', bearer(user)).query({ url });
  };
  expect((await ask({ status: 404, body: {} })).status).toBe(404);
  const blocked = await ask({ status: 403, body: {} }, 'https://moxfield.com/decks/AbCdEf12345');
  expect(blocked.status).toBe(502);
  expect(blocked.body.error).toMatch(/paste/i);
  expect((await ask({ status: 500, body: {} })).status).toBe(502);
  expect((await ask(new Error('offline'))).status).toBe(502);
});
