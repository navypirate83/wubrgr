/* =====================================================================
   THE ADMIN PAGE'S REQUESTS TO THE SERVER
   Only an account with the Admin right can use these (the server refuses
   everyone else, whatever the app does). They are:
     - listPeople: everyone with an account, with their rights and when they last used it
     - setRights: give or take away PRISM or Admin
     - deletePerson: delete a person and everything they own (the person's
       name has to be sent too: the page makes you type it)
   The server also refuses to change or delete your own account, and to take
   down or delete the last Admin; its plain-English message comes back as the
   error. Plain TypeScript with no React in it.
   ===================================================================== */

import { apiRequest } from './api';

// The three levels of rights. Admin includes PRISM (and everything else).
export type Rights = 'user' | 'prism' | 'admin';

export type Person = {
  id: string;
  email: string;
  username: string;
  name: string;
  role: Rights;
  createdAt: string;      // when the account was made (as the server sends dates)
  lastAccessAt: string;   // when the account was last used (empty if the server has no record yet)
};

// What the server sends for one person
type ServerPerson = { _id: string; email: string; username?: string; name?: string; role?: string; createdAt?: string; lastAccessAt?: string };

// The words for each level, shown on the page
export const RIGHTS_LABEL: Record<Rights, string> = { user: 'No extra rights', prism: 'PRISM', admin: 'Admin' };
export const RIGHTS_ABOUT: Record<Rights, string> = {
  user: 'The normal app: shelf, binders, lists, decks, scanner and Card Finder.',
  prism: 'Everything above, plus the PRISM section.',
  admin: 'Everything, PRISM included, plus the Admin page.',
};

const PAGE = 100;       // the server sends at most 100 people at a time

// Everyone, oldest account first (several requests if there are more than 100 people)
export async function listPeople(): Promise<Person[]> {
  const people: Person[] = [];
  for (let page = 1; page <= 200; page++) {
    const batch = await apiRequest<ServerPerson[]>(`/admin/users?page=${page}&limit=${PAGE}`);
    for (const p of batch) {
      people.push({
        id: p._id,
        email: p.email,
        username: p.username ?? p.email,
        name: p.name?.trim() || p.username || p.email,
        role: p.role === 'admin' || p.role === 'prism' ? p.role : 'user',
        createdAt: p.createdAt ?? '',
        lastAccessAt: p.lastAccessAt ?? '',
      });
    }
    if (batch.length < PAGE) break;
  }
  return people;
}

// Give someone another level of rights
export async function setRights(id: string, role: Rights): Promise<void> {
  await apiRequest(`/admin/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: { role } });
}

// Delete a person and everything they own. "name" is what was typed to confirm.
export async function deletePerson(id: string, name: string): Promise<void> {
  await apiRequest(`/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE', body: { name } });
}

// When an account was last used, in plain words: "just now", "5 min ago", "3 days ago", or
// "Not since tracking began" for an account that hasn't been used since the server started noting it.
// ("now" can be passed in so this can be checked with a made-up clock.)
export function lastAccessText(lastAccessAt: string, now: number = Date.now()): string {
  const then = new Date(lastAccessAt).getTime();
  if (!lastAccessAt || Number.isNaN(then)) return 'Not since tracking began';
  const minutes = Math.max(0, Math.floor((now - then) / 60000));
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  return new Date(then).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// "Mar 2026" from a date the server sent (empty if there isn't one)
export function joinedText(createdAt: string): string {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}
