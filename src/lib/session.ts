/* =====================================================================
   BEING SIGNED IN TO THE WUBRG'R SERVER
   Creating an account, signing in and out, and staying signed in.
   - The server gives two "tokens" (long secret codes) when you sign in:
       access token   works for 15 minutes; kept only in memory (api.ts)
       refresh token  works for 60 days and is swapped for a new pair; kept
                      on the device so you stay signed in. On a phone it
                      goes in the phone's secure vault (expo-secure-store).
                      On the website the SERVER keeps it in a locked cookie that
                      this page's code can't read (so no other script on the page
                      could ever steal it); the app only remembers THAT there is
                      one. A website login saved the old way (in the browser's
                      saved values) is moved into the cookie the first time it is
                      renewed.
   - Who you are (name, username, email, rights) is saved too, so the app knows
     you're signed in even with no internet. Being offline never signs you
     out: only the server saying "that login is finished" does.
   Plain TypeScript with no React in it. Screens follow changes through
   accountChanged() (see accountEvents.ts and hooks/useAccount.ts).
   ===================================================================== */

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { ApiError, apiRequest, refreshOnce, setAccessToken, setAuthHandlers } from './api';
import { accountChanged } from './accountEvents';
import { storageGet, storageRemove, storageSet, storageSetNow } from './storage';
import { isLoginOver, normalizeUser, parseSavedUser, restorePlan, type ServerUser } from './sessionCore';
import { markSession } from './scanner/crashTrail';

// Who is signed in (what the server tells us about the account; defined in sessionCore.ts)
export type { ServerUser };

// What the server sends back after any sign-in
// (On the website the reply has no refreshToken: the server put it in the locked cookie instead.)
type SessionReply = { accessToken: string; refreshToken?: string; user: ServerUser };

// The names things are saved under
const REFRESH_KEY = 'serverRefreshToken';
const USER_KEY = 'serverUser';
// Website only: a note that the login is in the locked cookie (the cookie itself can't be seen from here)
const COOKIE_NOTE_KEY = 'serverLoginInCookie';
// Website only: a note that a log out could not reach the server, so the cookie's login still has to be ended
const LOGOUT_OWED_KEY = 'serverLogoutOwed';

// What "refreshToken" below holds on the website when the real token is in the locked cookie
const IN_COOKIE = '(in the cookie)';

// What to send the server along with a renew or log out: the token itself, or nothing when the browser
// sends it in the cookie
const tokenBody = (token: string) => (token === IN_COOKIE ? {} : { refreshToken: token });

// Who is signed in right now (null = nobody), and the refresh token in memory
let user: ServerUser | null = null;
let refreshToken: string | null = null;

/* ---------- keeping the refresh token safely ---------- */

// Save it (phone: secure vault; website: saved values) and WAIT until it is really written. This is the very first
// thing done with a new sign-in reply, so if the app closes a moment later the newest code is already kept.
// On the website the reply normally has no token (the server put it in the locked cookie): then only a note
// is saved, and a token saved the old way is removed.
async function saveRefreshToken(token: string | undefined): Promise<void> {
  if (Platform.OS === 'web') {
    if (token) {
      // (Only from a server that doesn't use the cookie yet: kept the old way)
      refreshToken = token;
      await storageSetNow(REFRESH_KEY, token);
    } else {
      refreshToken = IN_COOKIE;
      await storageSetNow(COOKIE_NOTE_KEY, '1');
      storageRemove(REFRESH_KEY);
    }
    return;
  }
  if (!token) return;
  refreshToken = token;
  await SecureStore.setItemAsync(REFRESH_KEY, token);
}

// Forget it everywhere
async function forgetRefreshToken(): Promise<void> {
  refreshToken = null;
  if (Platform.OS === 'web') { storageRemove(REFRESH_KEY); storageRemove(COOKIE_NOTE_KEY); }
  else await SecureStore.deleteItemAsync(REFRESH_KEY).catch(() => { /* already gone */ });
}

// Read it back when the app starts. The phone's secure vault can fail to answer the first time (right after
// the phone starts up, say), and that would look exactly like being signed out even though the token is
// still saved, so if it fails it is asked again a couple of times before giving up. The answer says
// whether the vault FAILED (so "no token" can be told apart from "could not look"): a failure must never sign anyone out.
async function readRefreshToken(): Promise<{ token: string | null; failed: boolean }> {
  // The website: a token saved the old way, or else the note that the login is in the locked cookie
  if (Platform.OS === 'web') return { token: storageGet(REFRESH_KEY) ?? (storageGet(COOKIE_NOTE_KEY) ? IN_COOKIE : null), failed: false };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return { token: await SecureStore.getItemAsync(REFRESH_KEY), failed: false };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  return { token: null, failed: true };
}

/* ---------- what screens can ask ---------- */

export function getServerUser(): ServerUser | null {
  return user;
}

// Does this person hold the right? "admin" is the boss right and counts as every other one, so
// an admin passes any check. A missing or damaged list (an old saved account, say) counts as
// no rights at all. (The server checks every right again on each request.)
export function hasRight(roles: unknown, right: 'admin' | 'prism' | 'aiscan'): boolean {
  if (!Array.isArray(roles)) return false;
  return roles.includes('admin') || roles.includes(right);
}
// May this person see the PRISM section? Accounts with the "prism" right may,
// and so may admins. Nobody else sees any sign of it.
export function hasPrismAccess(who: ServerUser | null = user): boolean {
  return hasRight(who?.roles, 'prism');
}
// May this person download and use the AI scanner files? Accounts with the "aiscan" right may,
// and so may admins. (The server checks it again on every download.)
export function hasAiScanAccess(who: ServerUser | null = user): boolean {
  return hasRight(who?.roles, 'aiscan');
}
// Is this an admin? (Only admins see the Admin page; the server checks it again on every request.)
export function isAdminUser(who: ServerUser | null = user): boolean {
  return hasRight(who?.roles, 'admin');
}
export function isServerSignedIn(): boolean {
  return user !== null;
}

/* ---------- starting, signing in, signing out ---------- */

// Take a sign-in reply: remember the tokens and who you are
async function startSession(reply: SessionReply): Promise<ServerUser> {
  setAccessToken(reply.accessToken);
  await saveRefreshToken(reply.refreshToken);
  // A new login replaces the cookie, so an older log out that never reached the server no longer matters
  storageRemove(LOGOUT_OWED_KEY);
  // Make sure the rights are a list of text (anything else counts as no rights)
  user = normalizeUser(reply.user);
  // Who is signed in is written and WAITED for (not left to finish in the background), so an app that closes right after
  // signing in still knows who it is next time. If it can't be written, the app still carries on: the next start
  // asks the server who it is (see loadSession).
  await storageSetNow(USER_KEY, JSON.stringify(user)).catch(() => false);
  accountChanged();
  return user;
}

// Forget the login on this device (the binders and lists stay)
// The marker for "settings changed here and not yet sent to the account"
// (used by settings.ts). Signing out forgets it, so one person's unsent
// change can never be uploaded into the next person's account on this device.
export const SETTINGS_UNSENT_KEY = 'settingsServerDirty';

async function endSession(): Promise<void> {
  setAccessToken(null);
  await forgetRefreshToken();
  user = null;
  storageRemove(USER_KEY);
  storageRemove(SETTINGS_UNSENT_KEY);
  accountChanged();
}

// Make an account and sign in to it. The username is optional (left out,
// it's the email).
export function signUp(details: { email: string; password: string; name: string; username?: string }): Promise<ServerUser> {
  return apiRequest<SessionReply>('/auth/signup', { method: 'POST', body: details, auth: false }).then(startSession);
}

// Sign in with a username or email, and the password
export function logIn(who: string, password: string): Promise<ServerUser> {
  return apiRequest<SessionReply>('/auth/login', { method: 'POST', body: { username: who, password }, auth: false })
    .then(startSession);
}

// (Signing in to an account with Google was taken out of the app on 2026-11-21, and the server's /auth/google
// route is switched off. To bring it back: switch the route on (GOOGLE_LOGIN=on, see server/utils/google.js)
// and add a function here that posts { accessToken } to /auth/google and hands the reply to startSession.)

// Sign out of this device. We tell the server (so the login can't be
// used again) but if it can't be reached we sign out here anyway.
export async function signOut(): Promise<void> {
  const token = refreshToken;
  if (token) {
    await apiRequest('/auth/logout', { method: 'POST', body: tokenBody(token), auth: false }).catch(() => {
      // Signed out here anyway. On the website the cookie is still in the browser, and this page can't remove it
      // (only the server can), so leave a note to finish the log out the next time the app starts.
      if (token === IN_COOKIE) storageSet(LOGOUT_OWED_KEY, '1');
    });
  }
  await endSession();
}

// Sign out of every phone and browser at once. This needs the server,
// so if it can't be reached it says so instead of pretending it worked.
export async function signOutEverywhere(): Promise<void> {
  await apiRequest('/auth/logout-all', { method: 'POST' });
  await endSession();
}

// Delete this account for good: the server removes the account and all its
// binders, lists and logins, then this device forgets the login. It needs
// the password again (an account made with Google only has no password,
// so it just confirms). It needs the server: if it can't be reached this
// says so instead of pretending it worked. The binders and lists on this
// device are NOT touched.
export async function deleteAccount(password: string): Promise<void> {
  await apiRequest('/auth/account', { method: 'DELETE', body: password ? { password } : { confirm: true } });
  await endSession();
}

/* ---------- staying signed in ---------- */

// Swap the saved refresh token for a fresh pair. Returns true on success.
// If the server says the login is finished (401), sign out here too and
// return false. If the server just can't be reached, the error is passed
// on and you stay signed in (offline use must keep working).
async function refreshSession(): Promise<boolean> {
  if (!refreshToken) {
    // Not in memory: ask the vault again (it may have failed to answer at start-up)
    const again = await readRefreshToken();
    refreshToken = again.token;
    if (!refreshToken) {
      if (again.failed) {
        markSession('refresh: secure vault unreadable, staying signed in');
        throw new Error('The saved login could not be read just now. Try again in a moment.');
      }
      markSession('refresh: no refresh token saved');
      return false;
    }
  }
  try {
    await startSession(await apiRequest<SessionReply>('/auth/refresh', { method: 'POST', body: tokenBody(refreshToken), auth: false }));
    return true;
  } catch (err) {
    // Only the server saying "that login is finished" signs you out. Anything else (no signal, a slow or sleeping
    // server, a server error) is passed on, and you stay signed in.
    if (err instanceof ApiError && isLoginOver(err.status)) {
      markSession('refresh rejected 401: signed out');
      await endSession();
      return false;
    }
    markSession(`refresh failed, staying signed in (${(err as Error).message ?? 'no reply'})`.slice(0, 80));
    throw err;
  }
}

// Run once when the app starts: pick up a saved login and renew it in
// the background. It doesn't wait for the internet: the app opens
// straight away as "signed in" if a login was saved.
// Every outcome is written in the diary (markSession) so it can be seen later why the app thought you were signed
// in or out. A missing saved account (the app closed before it was written) or an unreadable vault or saved-values
// store no longer counts as signed out: see restorePlan in sessionCore.ts.
export async function loadSession(): Promise<void> {
  // Let api.ts renew expired access tokens through us, and sign us out
  // here when the server says the login is over
  setAuthHandlers({ refresh: refreshSession, signedOut: () => { void endSession(); } });

  const read = await readRefreshToken();
  refreshToken = read.token;
  // An account saved by an older version has no list of rights: it counts as having none, and the
  // refresh just below fetches the real list from the server
  const saved = parseSavedUser(storageGet(USER_KEY));
  const plan = restorePlan({ hasToken: !!refreshToken, vaultFailed: read.failed, hasSavedUser: !!saved });

  if (plan === 'signed-out') {
    markSession('session restore: no refresh token (signed out)');
    // The website: a log out that couldn't reach the server last time is finished now (the server ends the
    // cookie's login and tells the browser to throw the cookie away). If it fails again, the note stays.
    if (Platform.OS === 'web' && storageGet(LOGOUT_OWED_KEY)) {
      apiRequest('/auth/logout', { method: 'POST', body: {}, auth: false })
        .then(() => { if (!user) storageRemove(LOGOUT_OWED_KEY); })
        .catch(() => { /* still no server: try again next time */ });
    }
    return;
  }
  if (plan === 'keep-waiting') {
    markSession('session restore: secure vault unreadable, keeping the saved account');
    if (saved) { user = saved; accountChanged(); }
    return;
  }
  if (plan === 'use-saved' && saved) {
    markSession('session restore: restored');
    user = saved;
    accountChanged();
    // Get a fresh access token now; if there's no internet it waits until
    // the first request needs one
    // (Through refreshOnce, so it shares a refresh already running instead
    // of starting a second one with the same refresh token)
    refreshOnce().catch(() => { /* offline: stay signed in */ });
    return;
  }
  // The login code is there but who you are was not saved (or can't be read): ask the server, in the background
  // (the app must not wait for the internet), and try again a few times if there is no signal.
  markSession('session restore: no saved user, asking the server');
  void rebuildUserFromServer();
}

// Ask the server who is signed in by renewing the login (the reply carries the account). Without a reply it tries
// again after 5, 20 and 60 seconds. A "login is over" answer signs out (refreshSession does that); nothing else does.
async function rebuildUserFromServer(): Promise<void> {
  for (const wait of [0, 5000, 20000, 60000]) {
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    if (user) return;
    try {
      const ok = await refreshOnce();
      markSession(ok ? 'session restore: account rebuilt from the server' : 'session restore: server said sign in again');
      return;
    } catch {
      /* no reply: try again after the next wait */
    }
  }
  markSession('session restore: server not reached, will retry when a request needs it');
}
