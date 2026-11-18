/* =====================================================================
   THE CARD CATALOGUE: THE SHAPES OF THINGS (shared, plain TypeScript)
   The catalogue is a small SQLite database kept on the device (see
   scripts/catalogue/build-catalogue.mjs, which makes it). These are the
   shapes of what's read from it, and of the "store" each platform provides
   to get at it (catalogueDb.native.ts and catalogueDb.web.ts each provide one).
   Imports only the shape of a printing's look (looks.ts), and nothing that belongs to only one platform.
   ===================================================================== */

import type { Look } from './looks';

// One printing of a card: a specific set and collector number
export type Printing = {
  id: string;                 // Scryfall's id for this printing
  name: string;               // "Delver of Secrets // Insectile Aberration" for a two-faced card
  setCode: string;            // lowercase, like "dom"
  setName: string;
  collectorNumber: string;    // text, since it can be "123a" or "45★"
  lang: string;               // "en"
  released: string;           // "2018-04-27"
  year: number;
  border: string;             // black, white, silver, gold, borderless
  frame: string;              // "1993", "1997", "2003", "2015", "future"
  finishes: string[];         // nonfoil, foil, etched
  image: string | null;       // the normal-size picture's address
  imageBack: string | null;   // the back face's picture (a card with two pictures)
  illus: string | null;       // the artwork's id (see the art fingerprints)
  illusBack: string | null;
  colors: string;             // "WU", "" for colourless
  typeLine: string;
  manaCost: string;
  cmc: number;
  rarity: string;
  layout: string;
  // How it looks beyond the ordinary (full art, showcase, ...: see looks.ts). Added after the
  // lookups, from the catalogue's "looks" table; missing on a catalogue built before that existed.
  look?: Look;
};

// One set (expansion), for choosing which set to lock the scanner to
export type SetInfo = {
  code: string;               // lowercase, like "dom"
  name: string;               // "Dominaria"
  released: string;           // "2018-04-27" ("" if unknown)
  icon: string | null;        // the address of the set's symbol picture
};

// What's known about the catalogue that's on the device
export type CatalogueInfo = {
  schemaVersion: number;
  builtAt: string;            // when the database was built (an ISO date)
  sourceUpdatedAt: string;    // when Scryfall's file it was built from was made
  printings: number;
  sets: number;
  artworks: number;           // how many art fingerprints it holds
};

// What the small catalogue.json beside the database says about the newest one
export type RemoteCatalogue = CatalogueInfo & {
  bytes: number;              // the database's size
  gzipBytes: number;          // the size of the download
  sha256: string;
};

// The database version this app understands (the build script's SCHEMA_VERSION)
export const SUPPORTED_SCHEMA = 1;

// What each platform provides: the device's saved copy of the database, and a way to ask it things
export interface CatalogueStore {
  // Open the saved database. False if there isn't one yet.
  open(): Promise<boolean>;
  // Replace the saved database with this one (the whole file's bytes), and open it
  install(bytes: Uint8Array): Promise<void>;
  // Run a SELECT and give back its rows
  all(sql: string, params?: (string | number)[]): Promise<Record<string, unknown>[]>;
  // Close it (the saved copy stays)
  close(): Promise<void>;
  // Delete the saved copy
  remove(): Promise<void>;
}
