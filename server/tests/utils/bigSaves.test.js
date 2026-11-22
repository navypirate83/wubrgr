/* =====================================================================
   TESTS: ONE BIG SAVE AT A TIME PER ACCOUNT (utils/bigSaves.js)
   Each account's big saves take turns; other accounts are not held up.
   The requests and answers here are small stand-ins: just enough of the
   real ones for the queue to work with.
   ===================================================================== */

import { EventEmitter } from 'node:events';
import { oneBigSaveAtATime } from '../../utils/bigSaves.js';

// A stand-in request from this account, and its answer. "finish()" is the answer having been sent.
function save(owner) {
  const res = new EventEmitter();
  res.destroyed = false;
  res.status = (code) => { res.code = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  const call = { started: false, res, finish: () => res.emit('finish') };
  oneBigSaveAtATime({ user: { sub: owner } }, res, () => { call.started = true; });
  return call;
}

test('an account\'s saves start one at a time, in the order they came', () => {
  const first = save('amy');
  const second = save('amy');
  const third = save('amy');
  expect([first.started, second.started, third.started]).toEqual([true, false, false]);
  first.finish();
  expect([second.started, third.started]).toEqual([true, false]);
  second.finish();
  expect(third.started).toBe(true);
  third.finish();
  // Afterwards the account starts straight away again
  const later = save('amy');
  expect(later.started).toBe(true);
  later.finish();
});

test('another account is not held up', () => {
  const amy = save('amy');
  const ben = save('ben');
  expect(ben.started).toBe(true);
  amy.finish();
  ben.finish();
});

test('someone who gives up while waiting leaves the queue, and a lost connection passes the turn on', () => {
  const first = save('amy');
  const gaveUp = save('amy');
  const third = save('amy');
  gaveUp.res.emit('close');          // gave up while waiting
  first.res.emit('close');           // the running one lost its connection
  expect(gaveUp.started).toBe(false);
  expect(third.started).toBe(true);
  third.finish();
});

test('past 50 waiting, the save is refused straight away', () => {
  const running = save('amy');
  const waiting = Array.from({ length: 50 }, () => save('amy'));
  const tooMany = save('amy');
  expect(tooMany.started).toBe(false);
  expect(tooMany.res.code).toBe(429);
  // Let them all through so nothing is left over for other tests
  running.finish();
  for (const call of waiting) call.finish();
});
