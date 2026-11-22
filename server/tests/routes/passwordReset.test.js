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
import PasswordReset from '../../models/PasswordReset.js';

// How the code looks in the email: two halves of five letters and digits ("K7QM2-XH4RT")
const CODE = /code is: ([A-Z0-9]{5}-[A-Z0-9]{5})/;

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
  const code = CODE.exec(sent[0].text)[1];

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

test('wrong guesses never throw the code away: after 20 of them the real code still works', async () => {
  const user = await makeUser();
  const sent = fakeMail();
  await request(app).post('/auth/forgot').send({ email: user.email });
  const code = CODE.exec(sent[0].text)[1];
  // 20 wrong codes all sent together (somebody trying to spoil the owner's code), in the old and the new shape
  const wrongs = [...Array.from({ length: 10 }, (_, i) => String(100000 + i)), ...Array.from({ length: 10 }, (_, i) => `AAAAA-BBBB${i}`)].filter((guess) => guess !== code);
  const answers = await Promise.all(wrongs.map((guess) => request(app).post('/auth/reset').send({ email: user.email, code: guess, password: 'brand-new-pass1' })));
  expect(answers.every((res) => res.status === 400)).toBe(true);
  expect((await request(app).post('/auth/login').send({ username: user.username, password: TEST_PASSWORD })).status).toBe(200);
  // The owner's code is untouched
  expect((await request(app).post('/auth/reset').send({ email: user.email, code, password: 'brand-new-pass1' })).status).toBe(200);
});

test('asking for another code does not cancel the earlier one', async () => {
  const user = await makeUser();
  const sent = fakeMail();
  await request(app).post('/auth/forgot').send({ email: user.email });
  await request(app).post('/auth/forgot').send({ email: user.email });   // (somebody else asking, say)
  const [first, second] = sent.map((mail) => CODE.exec(mail.text)[1]);
  expect(first).not.toBe(second);
  expect((await request(app).post('/auth/reset').send({ email: user.email, code: first, password: 'brand-new-pass1' })).status).toBe(200);
  // A reset uses up every code that was waiting
  expect((await request(app).post('/auth/reset').send({ email: user.email, code: second, password: 'another-pass-2' })).status).toBe(400);
});

test('the code can be typed in small letters, without the dash, or with spaces', async () => {
  for (const retype of [(c) => c.toLowerCase(), (c) => c.replace('-', ''), (c) => ` ${c.replace('-', ' ')} `]) {
    await clearTestDb();
    const user = await makeUser();
    const sent = fakeMail();
    await request(app).post('/auth/forgot').send({ email: user.email });
    const code = CODE.exec(sent[0].text)[1];
    expect((await request(app).post('/auth/reset').send({ email: user.email, code: retype(code), password: 'brand-new-pass1' })).status).toBe(200);
    jest.restoreAllMocks();
  }
});

test('the code is 10 letters and digits, works for 90 minutes, and is refused once it has run out', async () => {
  const user = await makeUser();
  const sent = fakeMail();
  await request(app).post('/auth/forgot').send({ email: user.email });
  expect(sent[0].text).toMatch(/works for 90 minutes/);
  const code = CODE.exec(sent[0].text)[1];
  const row = await PasswordReset.findOne({ user: user._id });
  expect(row.codes).toHaveLength(1);
  expect(row.codes[0].expiresAt.getTime()).toBeGreaterThan(Date.now() + 89 * 60 * 1000);
  // Only a fingerprint is kept, never the code
  expect(JSON.stringify(row)).not.toContain(code.replace('-', ''));
  // Pretend the 90 minutes are over
  await PasswordReset.updateOne({ user: user._id }, { $set: { 'codes.0.expiresAt': new Date(Date.now() - 1000) } });
  expect((await request(app).post('/auth/reset').send({ email: user.email, code, password: 'brand-new-pass1' })).status).toBe(400);
});

test('the right code with a new password that holds the username does not use up the code', async () => {
  const user = await makeUser();
  const sent = fakeMail();
  await request(app).post('/auth/forgot').send({ email: user.email });
  const code = CODE.exec(sent[0].text)[1];
  // Six tries with a password that holds the username: all refused for the password, and the code stays good
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
  const code = CODE.exec(sent[4].text)[1];
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
  const code = CODE.exec(sent[0].text)[1];
  const weak = await request(app).post('/auth/reset').send({ email: user.email, code, password: 'elevenchar1' });
  expect(weak.status).toBe(400);
  expect(weak.body.error).toBe('Password must be at least 12 characters long');
  const noNumber = await request(app).post('/auth/reset').send({ email: user.email, code, password: 'justletterslong' });
  expect(noNumber.status).toBe(400);
  // Refusing a weak new password does not use up the code, and the old password still works
  expect((await request(app).post('/auth/login').send({ email: user.email, password: 'old8char' })).status).toBe(200);
  expect((await request(app).post('/auth/reset').send({ email: user.email, code, password: 'brand-new-pass1' })).status).toBe(200);
});
