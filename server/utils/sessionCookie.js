/* =====================================================================
   THE WEBSITE'S LOGIN, KEPT IN A LOCKED COOKIE
   The long-lived login code (the "refresh token", see tokens.js) has to be kept somewhere so a person
   stays signed in. The phone app keeps it in the phone's secure vault. A website has no vault: if the
   page's own code can read the token, so can any other script that ever gets to run on the page.
   So for the website the SERVER keeps it in a cookie the page's code cannot read at all:
     - HttpOnly      scripts on the page can't see it; only the browser sends it back to us
     - Secure        only ever sent over https
     - SameSite=Strict  only sent by pages of our own site (navypirate83.com), never by another site
     - the name starts with "__Host-": browsers only accept a cookie with that name from this exact
       server address, over https, for the whole address (Path=/). So no other page or address
       under navypirate83.com can plant a cookie of that name or overwrite ours. (The page's code
       still only asks the browser to send it on the sign-in routes: see src/lib/api.ts.)
       A plain-http request only happens on a developer's own computer; browsers refuse "__Host-"
       there, so the older name "wubrgr_refresh" with Path=/auth is used instead.
   WHO GETS A COOKIE: a request that asks for it (the header "X-Session-Store: cookie") AND comes from
   one of our own websites (its Origin is in CORS_ORIGINS). Both are needed. A stranger's website can't
   send that header without the browser first asking us for permission, which it won't get. The phone
   app sends neither, so it carries on exactly as before: tokens in the reply, kept in the vault.
   ===================================================================== */

import { loadConfig } from '../config/db.js';

// The cookie's name, and how long the browser keeps it (the same 60 days a refresh token lives)
const COOKIE_NAME = '__Host-wubrgr_refresh';
// The name used before "__Host-" (and still on plain http, see above). A login kept under it is read once
// more, moved to the new name the next time it is renewed, and the old cookie is thrown away.
const OLD_COOKIE_NAME = 'wubrgr_refresh';
const COOKIE_DAYS = 60;

// Our own websites' addresses (read once)
const ownSites = loadConfig().corsOrigins;

// Does this request want its login kept in the cookie, and is it allowed to? (See "WHO GETS A COOKIE" above.)
export function wantsCookie(req) {
  const asked = String(req.headers['x-session-store'] ?? '').toLowerCase() === 'cookie';
  const origin = req.headers.origin;
  return asked && typeof origin === 'string' && ownSites.includes(origin);
}

// The cookie's settings, written out as the text a browser expects. "Secure" is left off only when the
// request itself was plain http, which only happens on a developer's own computer (localhost).
function cookieText(req, value, seconds) {
  return (req.secure
    ? [`${COOKIE_NAME}=${value}`, 'Path=/', `Max-Age=${seconds}`, 'HttpOnly', 'SameSite=Strict', 'Secure']
    : [`${OLD_COOKIE_NAME}=${value}`, 'Path=/auth', `Max-Age=${seconds}`, 'HttpOnly', 'SameSite=Strict']
  ).join('; ');
}

// Over https: also tell the browser to throw away a cookie kept under the older name
function dropOldCookie(req, res) {
  if (req.secure) res.append('Set-Cookie', `${OLD_COOKIE_NAME}=; Path=/auth; Max-Age=0; HttpOnly; SameSite=Strict; Secure`);
}

// Hand the browser a refresh token to keep
export function setRefreshCookie(req, res, token) {
  res.append('Set-Cookie', cookieText(req, token, COOKIE_DAYS * 24 * 60 * 60));
  dropOldCookie(req, res);
}

// Tell the browser to throw the cookie away (signing out, or the login is over)
export function clearRefreshCookie(req, res) {
  res.append('Set-Cookie', cookieText(req, '', 0));
  dropOldCookie(req, res);
}

// The refresh token the browser sent back in the cookie, or '' when there is none. It is only looked at
// for a request that passes wantsCookie, so a cookie can never be used by a request from somewhere else.
export function readRefreshCookie(req) {
  if (!wantsCookie(req)) return '';
  // The "__Host-" cookie if there is one; otherwise one kept under the older name
  const found = {};
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE_NAME || name === OLD_COOKIE_NAME) found[name] ??= rest.join('=');
  }
  return found[COOKIE_NAME] || found[OLD_COOKIE_NAME] || '';
}

// Answer a sign-in. For the website (wantsCookie) the refresh token goes into the cookie and is left
// OUT of the reply, so the page's code never holds it. Everyone else gets the reply as it always was.
export function sendSession(req, res, status, session) {
  if (!wantsCookie(req)) return res.status(status).json(session);
  setRefreshCookie(req, res, session.refreshToken);
  const { refreshToken, ...rest } = session;
  return res.status(status).json(rest);
}
