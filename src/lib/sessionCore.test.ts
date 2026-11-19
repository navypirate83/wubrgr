/* =====================================================================
   CHECKS FOR THE SIGN-IN DECISIONS
   Run with:  node --test src/lib/sessionCore.test.ts
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { isLoginOver, normalizeUser, parseSavedUser, restorePlan } from './sessionCore.ts';

const good = { id: 'u1', username: 'jd', email: 'a@b.c', name: 'JD', roles: ['admin'] };

test('a saved account that is fine comes back as it was', () => {
  assert.deepEqual(parseSavedUser(JSON.stringify(good)), good);
});

test('a saved account from an older version (no rights list) counts as having none', () => {
  const { roles, ...old } = good;
  assert.deepEqual(parseSavedUser(JSON.stringify(old))?.roles, []);
});

test('nothing saved, damaged text and the wrong shape all give null', () => {
  assert.equal(parseSavedUser(null), null);
  assert.equal(parseSavedUser(''), null);
  assert.equal(parseSavedUser('{not json'), null);
  assert.equal(parseSavedUser('42'), null);
  assert.equal(parseSavedUser('{"id":5}'), null);
});

test('rights that are not text are dropped', () => {
  assert.deepEqual(normalizeUser({ ...good, roles: ['a', 3 as unknown as string] }).roles, ['a']);
});

test('start-up: a login code with no saved details asks the server instead of signing out', () => {
  assert.equal(restorePlan({ hasToken: true, vaultFailed: false, hasSavedUser: false }), 'ask-server');
  assert.equal(restorePlan({ hasToken: true, vaultFailed: false, hasSavedUser: true }), 'use-saved');
  assert.equal(restorePlan({ hasToken: false, vaultFailed: false, hasSavedUser: true }), 'signed-out');
  assert.equal(restorePlan({ hasToken: false, vaultFailed: true, hasSavedUser: true }), 'keep-waiting');
  assert.equal(restorePlan({ hasToken: false, vaultFailed: true, hasSavedUser: false }), 'keep-waiting');
});

test('only a 401 means the login is over', () => {
  assert.equal(isLoginOver(401), true);
  for (const status of [400, 403, 404, 429, 500, 502, 503, null, undefined]) assert.equal(isLoginOver(status), false);
});
