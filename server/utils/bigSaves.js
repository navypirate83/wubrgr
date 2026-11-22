/* =====================================================================
   ONE BIG SAVE AT A TIME PER ACCOUNT
   Saving a whole binder, list or deck (or importing a file) can be a big
   request. This is a small "take a number" queue: each account's big
   saves are let through ONE AT A TIME, in the order they arrived. The
   others wait their turn BEFORE their contents are read, so a burst of
   big saves from one account cannot fill the server's memory, and two
   saves from one account can never slip past the account limits by
   running at the same instant (see accountLimits.js).
   Other accounts are not held up: each account has its own queue.
   The queue lives in this server's memory. That is right while there is
   one server; the account limits are ALSO re-counted inside each save
   (accountLimits.js), which holds even with several servers.
   ===================================================================== */

// The most saves one account may have WAITING. Far more than the app ever sends at once (it saves its
// binders one after another); past it the request is refused straight away.
const MAX_WAITING = 50;
// A turn is given up after this long whatever happens, so one stuck request can never block an account for good
const LONGEST_TURN_MS = 5 * 60 * 1000;

// Each account's queue: is a save running, and the ones waiting (each a function that starts it)
const lines = new Map();

// The middleware: put it AFTER the sign-in check and BEFORE the request's contents are read
export function oneBigSaveAtATime(req, res, next) {
  const owner = String(req.user.sub);
  let line = lines.get(owner);
  if (!line) { line = { busy: false, waiting: [] }; lines.set(owner, line); }

  // Start this request's turn. When its answer has been sent (or the connection is lost), the next one starts.
  const start = () => {
    line.busy = true;
    let over = false;
    const finish = () => {
      if (over) return;
      over = true;
      clearTimeout(timer);
      const nextOne = line.waiting.shift();
      if (nextOne) nextOne();
      else lines.delete(owner);
    };
    const timer = setTimeout(finish, LONGEST_TURN_MS);
    timer.unref?.();
    // The person gave up while waiting: nothing to do, pass the turn on
    if (res.destroyed) return finish();
    res.once('finish', finish);
    res.once('close', finish);
    return next();
  };

  if (!line.busy) return start();
  if (line.waiting.length >= MAX_WAITING) {
    return res.status(429).json({ error: 'Too many saves at once. Wait a moment, then try again.' });
  }
  line.waiting.push(start);
  // Gave up while waiting: leave the queue
  res.once('close', () => {
    const at = line.waiting.indexOf(start);
    if (at >= 0) line.waiting.splice(at, 1);
  });
  return undefined;
}
