/* =====================================================================
   TESTS: FORGOT USERNAME / PASSWORD
   The email service is faked (no real email is ever sent): the test
   catches the request the server would send and reads the code out of it.
   ===================================================================== */

import request from 'supertest';
import { jest } from '@jest/globals';
import app from '../../app.js';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../helpers/db.js';
import { makeUser, TEST_PASSWORD } from '../helpers/users.js';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  process.env.RESEND_API_KEY = 'fake';
  process.env.MAIL_FROM = 'Test <test@example.com>';
});
afterEach(() => jest.restoreAllMocks());

// Pretend to be the mail service, and keep what was sent
function fakeMail() {
  const sent = [];
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
    sent.push(JSON.parse(options.body));
    return { ok: true, status: 200 };
  });
  return sent;
}

test('forgot sends the username and a code, and reset sets the new password', async () => {
  const user = await makeUser();
  const sent = fakeMail();
  const forgot = await request(app).post('/auth/forgot').send({ email: user.email });
  expect(forgot.status).toBe(200);
  expect(sent).toHaveLength(1);
  expect(sent[0].text).toContain(user.username);
  const code = /code is: (\d{6})/.exec(sent[0].text)[1];

  const reset = await request(app).post('/auth/reset').send({ email: user.email, code, password: 'brand-new-pass1' });
  expect(reset.status).toBe(200);
  expect((await request(app).post('/auth/login').send({ username: user.username, password: 'brand-new-pass1' })).status).toBe(200);
  expect((await request(app).post('/auth/login').send({ username: user.username, password: TEST_PASSWORD })).status).toBe(401);
  // The code works only once
  expect((await request(app).post('/auth/reset').send({ email: user.email, code, password: 'another-pass-2' })).status).toBe(400);
});

test('an unknown email gets the same answer and nothing is sent', async () => {
  const sent = fakeMail();
  const res = await request(app).post('/auth/forgot').send({ email: 'nobody@example.com' });
  expect(res.status).toBe(200);
  expect(sent).toHaveLength(0);
});

test('five wrong codes throw the code away', async () => {
  const user = await makeUser();
  const sent = fakeMail();
  await request(app).post('/auth/forgot').send({ email: user.email });
  const code = /code is: (\d{6})/.exec(sent[0].text)[1];
  const wrong = code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i += 1) {
    expect((await request(app).post('/auth/reset').send({ email: user.email, code: wrong, password: 'brand-new-pass1' })).status).toBe(400);
  }
  // Even the right code fails now
  expect((await request(app).post('/auth/reset').send({ email: user.email, code, password: 'brand-new-pass1' })).status).toBe(400);
});

test('a burst of wrong codes at the same instant still only gets 5 guesses, and the right code fails after', async () => {
  const user = await makeUser();
  const sent = fakeMail();
  await request(app).post('/auth/forgot').send({ email: user.email });
  const code = /code is: (\d{6})/.exec(sent[0].text)[1];
  // 20 different wrong codes, all sent together
  const wrongs = Array.from({ length: 21 }, (_, i) => String(100000 + i)).filter((guess) => guess !== code).slice(0, 20);
  const answers = await Promise.all(wrongs.map((guess) => request(app).post('/auth/reset').send({ email: user.email, code: guess, password: 'brand-new-pass1' })));
  expect(answers.every((res) => res.status === 400)).toBe(true);
  // The code is used up: even the right one fails, and the old password still works
  expect((await request(app).post('/auth/reset').send({ email: user.email, code, password: 'brand-new-pass1' })).status).toBe(400);
  expect((await request(app).post('/auth/login').send({ username: user.username, password: TEST_PASSWORD })).status).toBe(200);
});

test('the right code with a new password that holds the username does not use up the code', async () => {
  const user = await makeUser();
  const sent = fakeMail();
  await request(app).post('/auth/forgot').send({ email: user.email });
  const code = /code is: (\d{6})/.exec(sent[0].text)[1];
  // Six tries with a password that holds the username: all refused for the password, none uses a guess
  for (let i = 0; i < 6; i += 1) {
    const res = await request(app).post('/auth/reset').send({ email: user.email, code, password: `${user.username}-pass-1!` });
    expect(res.status).toBe(400);
  }
  expect((await request(app).post('/auth/reset').send({ email: user.email, code, password: 'brand-new-pass1' })).status).toBe(200);
});

test('an account is sent at most 5 forgot-password emails an hour; the answer stays the same', async () => {
  const user = await makeUser();
  const sent = fakeMail();
  for (let i = 0; i < 7; i += 1) {
    const res = await request(app).post('/auth/forgot').send({ email: user.email });
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('If that email has an account');
  }
  expect(sent).toHaveLength(5);
  // The last code that WAS sent still works
  const code = /code is: (\d{6})/.exec(sent[4].text)[1];
  expect((await request(app).post('/auth/reset').send({ email: user.email, code, password: 'brand-new-pass1' })).status).toBe(200);
});

test('once the hour is over, forgot-password emails are sent again', async () => {
  const user = await makeUser();
  const sent = fakeMail();
  for (let i = 0; i < 6; i += 1) await request(app).post('/auth/forgot').send({ email: user.email });
  expect(sent).toHaveLength(5);
  // Pretend that hour began 61 minutes ago
  const { default: User } = await import('../../models/User.js');
  await User.updateOne({ _id: user._id }, { resetEmailsSince: new Date(Date.now() - 61 * 60 * 1000) });
  await request(app).post('/auth/forgot').send({ email: user.email });
  expect(sent).toHaveLength(6);
});

test('without mail settings, forgot says email is not set up', async () => {
  delete process.env.RESEND_API_KEY;
  const user = await makeUser();
  expect((await request(app).post('/auth/forgot').send({ email: user.email })).status).toBe(503);
});

test('a short new password is refused', async () => {
  const user = await makeUser();
  expect((await request(app).post('/auth/reset').send({ email: user.email, code: '123456', password: 'short' })).status).toBe(400);
});

// The new rules are only for NEW passwords: an account whose password was made
// under the old rule (8 characters) still logs in, and a reset must meet the new ones.
test('an old 8-character password still logs in, but a reset needs 12 characters with a number or symbol', async () => {
  const user = await makeUser();
  // Put an old-style password straight into the database, scrambled the same way (the model would refuse to make one now)
  const bcrypt = (await import('bcryptjs')).default;
  const { default: User } = await import('../../models/User.js');
  await User.updateOne({ _id: user._id }, { $set: { password: await bcrypt.hash('old8char', 10) } });
  expect((await request(app).post('/auth/login').send({ email: user.email, password: 'old8char' })).status).toBe(200);

  const sent = fakeMail();
  await request(app).post('/auth/forgot').send({ email: user.email });
  const code = /code is: (\d{6})/.exec(sent[0].text)[1];
  const weak = await request(app).post('/auth/reset').send({ email: user.email, code, password: 'elevenchar1' });
  expect(weak.status).toBe(400);
  expect(weak.body.error).toBe('Password must be at least 12 characters long');
  const noNumber = await request(app).post('/auth/reset').send({ email: user.email, code, password: 'justletterslong' });
  expect(noNumber.status).toBe(400);
  // Refusing a weak new password does not use up the code, and the old password still works
  expect((await request(app).post('/auth/login').send({ email: user.email, password: 'old8char' })).status).toBe(200);
  expect((await request(app).post('/auth/reset').send({ email: user.email, code, password: 'brand-new-pass1' })).status).toBe(200);
});
