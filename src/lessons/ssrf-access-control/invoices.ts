/** The simulated invoices API: who may read which invoice under each server mode, and the admin export. Fictional users and amounts. */
import { mulberry32 } from '../../core/random';

export interface Person {
  id: number;
  name: string;
}

export const PEOPLE: readonly Person[] = [
  { id: 1001, name: 'Alice Example' },
  { id: 1002, name: 'Bob Example' },
  { id: 1003, name: 'Carol Example' },
  { id: 1004, name: 'Dave Example' },
  { id: 1005, name: 'Erin Example' },
];

/** The signed-in user in the lesson. */
export const SIGNED_IN = PEOPLE[0];

export interface Invoice {
  id: number;
  ownerId: number;
  /** Fake amount in whole pounds. */
  amount: number;
  /** An unguessable id of the same invoice, UUID-shaped, for the "unguessable ids" mode (illustrative). */
  token: string;
}

const OWNERS = [1001, 1001, 1002, 1002, 1002, 1003, 1003, 1004, 1005];
export const FIRST_ID = 1001;
export const LAST_ID = FIRST_ID + OWNERS.length - 1;

const hex = (rnd: () => number, n: number) => Array.from({ length: n }, () => Math.floor(rnd() * 16).toString(16)).join('');
const TOKEN_SEED = 4242;

export const INVOICES: readonly Invoice[] = (() => {
  const rnd = mulberry32(TOKEN_SEED);
  return OWNERS.map((ownerId, i) => ({ id: FIRST_ID + i, ownerId, amount: 100 + 25 * i, token: `${hex(rnd, 8)}-${hex(rnd, 4)}-4${hex(rnd, 3)}-${hex(rnd, 4)}-${hex(rnd, 12)}` }));
})();

export const invoiceById = (id: number) => INVOICES.find((i) => i.id === id);
export const ownerName = (ownerId: number) => PEOPLE.find((p) => p.id === ownerId)!.name;

export type Mode = 'none' | 'owner' | 'unguessable';

export const MODES: readonly { id: Mode; label: string; text: string }[] = [
  { id: 'none', label: 'No ownership check', text: 'The server returns any invoice that exists.' },
  { id: 'owner', label: 'Owner check', text: 'The server compares the invoice\'s owner with the signed-in user.' },
  { id: 'unguessable', label: 'Unguessable ids only', text: 'Ids are random, but anyone who holds one gets the invoice.' },
];

export interface Response {
  status: 200 | 404;
  /** What the server sends back; identical for a missing and a foreign invoice in owner mode. */
  body: string;
  invoice: Invoice | null;
}

const NOT_FOUND: Response = { status: 404, body: 'Not found', invoice: null };

/** The server's answer to GET /invoices/{id} for a signed-in user. `key` is the numeric id, or the unguessable id in that mode. */
export function respond(mode: Mode, userId: number, key: number | string): Response {
  const inv = typeof key === 'number' ? invoiceById(key) : INVOICES.find((i) => i.token === key);
  if (!inv) return NOT_FOUND;
  if (mode === 'owner' && inv.ownerId !== userId) return NOT_FOUND;
  if (mode === 'unguessable' && typeof key === 'number') return NOT_FOUND;
  return { status: 200, body: `Invoice ${inv.id}: ${ownerName(inv.ownerId)}, ${inv.amount}`, invoice: inv };
}

/** The broken owner check the tests reject: it compares the invoice's id with the session's user id. */
export function respondBroken(userId: number, id: number): Response {
  const inv = invoiceById(id);
  if (!inv || inv.id !== userId) return NOT_FOUND;
  return { status: 200, body: `Invoice ${inv.id}: ${ownerName(inv.ownerId)}, ${inv.amount}`, invoice: inv };
}

/** Foreign invoices the user can read by stepping the numeric id. */
export const readableForeign = (mode: Mode, userId: number): number => INVOICES.filter((i) => i.ownerId !== userId && respond(mode, userId, i.id).status === 200).length;

/** The ids the user already holds: one from a shared link, one from a log line. Only the unguessable mode is reachable with them. */
export const KNOWN_FOREIGN = [INVOICES[2], INVOICES[5]] as const;

/** Foreign invoices readable by someone who holds only the unguessable ids the user already knows. */
export const readableWithKnownIds = (mode: Mode, userId: number): number => KNOWN_FOREIGN.filter((i) => respond(mode, userId, i.token).status === 200).length;

/** What a signed-in user can read in a mode: stepping numeric ids, or using the ids they already hold. */
export const reachable = (mode: Mode, userId: number): number => (mode === 'unguessable' ? readableWithKnownIds(mode, userId) : readableForeign(mode, userId));

/** The id after a +/- press. From an opaque id the stepper goes back to the numbered ids, so it is never stuck after a chip press. */
export const stepKey = (key: number | string, delta: number): number =>
  typeof key === 'number' ? Math.min(LAST_ID, Math.max(FIRST_ID, key + delta)) : FIRST_ID;

/** The id to show after a mode change: an opaque id only makes sense in the unguessable mode, so other modes go back to numbered ids. */
export const keyForMode = (key: number | string, mode: Mode): number | string => (mode !== 'unguessable' && typeof key !== 'number' ? FIRST_ID : key);

// ── The admin export (function-level access) ─────────────────────────────

export type Role = 'member' | 'admin';

export interface ExportResponse {
  status: 200 | 403;
  rows: number;
}

/** GET /admin/export: with the role check only admins pass; without it any signed-in user does. */
export const adminExport = (role: Role, roleCheck: boolean): ExportResponse =>
  !roleCheck || role === 'admin' ? { status: 200, rows: INVOICES.length } : { status: 403, rows: 0 };
