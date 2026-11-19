/* =====================================================================
   SAVED VALUES (AsyncStorage)
   Everything the app keeps on this device (the list of binders, each
   binder's cards, settings, the theme...) is saved with AsyncStorage:
   React Native's simple store of named text values. It works on phones
   (a small database inside the app) and on the web (the browser's
   localStorage).
   AsyncStorage answers "a moment later" (asynchronously), but most of
   the app wants answers straight away. So:
     - when the app starts, loadStorage() reads every saved value into
       memory (the app waits for it before drawing anything)
     - reading then comes straight from memory
     - saving changes memory straight away, and writes to AsyncStorage
       in the background
   Every name is saved with "wubrgrexpo:" in front. On the web, this app
   and the original WUBRG'r site live at the same address
   (navypirate83.github.io), so they share the browser's localStorage;
   the prefix keeps each app's values apart.
   Plain TypeScript with no React in it.
   ===================================================================== */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { markSession } from './scanner/crashTrail';

// What goes in front of every saved name
const PREFIX = 'wubrgrexpo:';

// Every saved value, by name (without the prefix): the copy in memory
const values = new Map<string, string>();

// Did the last background save fail (e.g. the device is out of space)?
// Then storageSet says so, so the page can warn.
let lastWriteFailed = false;

// Did reading the saved values at start-up fail (even after trying again)? Then the app runs with nothing loaded, and
// to be safe nothing is written to AsyncStorage this time, so the real saved values can't be overwritten by empty ones.
let loadFailed = false;
export function storageLoadFailed(): boolean {
  return loadFailed;
}

// Read every saved value once. Throws if AsyncStorage can't be read.
async function readAll(): Promise<void> {
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(PREFIX));
  const pairs = await AsyncStorage.multiGet(keys);
  for (const [key, value] of pairs) {
    if (value !== null) values.set(key.slice(PREFIX.length), value);
  }
}

// Read every saved value into memory. Called once, when the app starts.
// If AsyncStorage can't be read it is tried once more a moment later. If it still can't be read, that is written in the
// crash diary and the app starts with nothing loaded, but writing is switched off for this run (see loadFailed above).
export async function loadStorage(): Promise<void> {
  try {
    await readAll();
  } catch {
    markSession('saved values unreadable, trying again');
    await new Promise((resolve) => setTimeout(resolve, 400));
    try {
      await readAll();
    } catch {
      loadFailed = true;
      markSession('saved values unreadable: nothing loaded, saving switched off this run');
    }
  }
}

// Read a saved value, or null if there isn't one.
export function storageGet(key: string): string | null {
  return values.get(key) ?? null;
}

// Save a value: in memory straight away, then in AsyncStorage. Returns
// false if the last background save failed, so the page can warn.
export function storageSet(key: string, value: string): boolean {
  values.set(key, value);
  if (loadFailed) return false;
  AsyncStorage.setItem(PREFIX + key, value).then(
    () => { lastWriteFailed = false; },
    () => { lastWriteFailed = true; },
  );
  return !lastWriteFailed;
}

// Save a value and WAIT until AsyncStorage has really written it (for the few values that must survive an app
// crash a moment later, like who is signed in). Gives false if it could not be written.
export async function storageSetNow(key: string, value: string): Promise<boolean> {
  values.set(key, value);
  if (loadFailed) return false;
  try {
    await AsyncStorage.setItem(PREFIX + key, value);
    lastWriteFailed = false;
    return true;
  } catch {
    lastWriteFailed = true;
    return false;
  }
}

// Forget a saved value.
export function storageRemove(key: string): void {
  values.delete(key);
  if (loadFailed) return;
  AsyncStorage.removeItem(PREFIX + key).catch(() => { /* already gone */ });
}

// Every saved name that starts with some text (like every binder's
// cards, "binderCards:..."), without the prefix.
export function storageKeys(startingWith: string): string[] {
  return [...values.keys()].filter((key) => key.startsWith(startingWith));
}
