/* =====================================================================
   TESTS: IS THE SIGNING SECRET SAFE TO USE?
   The check that runs when the server starts (utils/secretCheck.js).
   ===================================================================== */

import crypto from 'node:crypto';
import { secretProblem } from '../../utils/secretCheck.js';

test('a real secret is fine: the kind .env.example makes, and any other long random text', () => {
  expect(secretProblem(crypto.randomBytes(64).toString('hex'))).toBeNull();
  expect(secretProblem(crypto.randomBytes(32).toString('base64url'))).toBeNull();
});

test('a missing or empty secret is refused', () => {
  expect(secretProblem(undefined)).toMatch(/not set/);
  expect(secretProblem('')).toMatch(/not set/);
  expect(secretProblem('    ')).toMatch(/not set/);
});

test('a short secret is refused, and told how long it was', () => {
  expect(secretProblem('secret')).toMatch(/too short \(6 characters/);
  expect(secretProblem('a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d')).toMatch(/too short \(31 characters/);
});

test('a long secret made of one character, or of placeholder words, is refused', () => {
  expect(secretProblem('a'.repeat(64))).toMatch(/too simple/);
  expect(secretProblem('secretsecretsecretsecretsecretsecretsecret')).toMatch(/placeholder|too simple/);
  expect(secretProblem('changeme-changeme-changeme-changeme-changeme')).toMatch(/placeholder|too simple/);
  expect(secretProblem('your-secret-jwt-secret-password-example-12345')).toMatch(/placeholder/);
});
