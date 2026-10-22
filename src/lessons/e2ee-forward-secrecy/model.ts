import { hasSubtle } from '../../core/crypto';
import type { AffinePoint } from '../../core/ecc';
import { realAlgebra } from './realAlg';
import { runConversation, type Party, type RatchetMode } from './ratchet';
import { dependsOnFreshKey, reading, symbolicRun } from './symAlg';
import { candidateKeys, cloneReadable, fixedKeyRun, fixedOpens, tryMessage, type RealRun, type Tries } from './thief';

export const MAX_MESSAGES = 10;
export const CHAIN_MESSAGES = 8;
export const DEFAULT_PATTERN = 'AABBAB';
export const DEFAULT_SEED = 11;
export const TEXT_LIMIT = 40;
/** The clone of a stolen party draws its fresh keys from the seed xor this: a different stream, so it diverges where the real party healed. */
export const CLONE_SALT = 0x5eed;

export const NEEDS_SECURE = 'needs https or localhost: this page has no crypto.subtle here, so the real HMAC, HKDF and AES-GCM cannot run. Nothing else on the page is affected.';

export const NAMES: Record<Party, string> = { A: 'Alice', B: 'Bob' };

/** Lesson-authored fake lines: nothing here is a secret, and the page asks the learner never to type a real one. */
export const DEMO_LINES: readonly string[] = [
  'hi Bob, are we still on for Friday',
  'yes, the usual place at noon',
  'I will bring the maps',
  'good, I booked the table for six',
  'see you there then',
  'running five minutes late, sorry',
  'no problem, I will order first',
  'thanks, almost there',
  'the soup is excellent today',
  'save me a seat',
];

export const parsePattern = (text: string): Party[] => [...text].map((c) => (c === 'A' ? 'A' : 'B'));
export const patternText = (pattern: readonly Party[]): string => pattern.join('');
export const textFor = (index: number, custom: readonly (string | undefined)[]): string => custom[index] || DEMO_LINES[index % DEMO_LINES.length];

/** The text field: at most 40 characters of anything, encoded as UTF-8 and never evaluated. */
export const clampText = (raw: string): string => [...raw].slice(0, TEXT_LIMIT).join('');

export type Protection = 'fixed' | RatchetMode;
export const PROTECTION_LABEL: Record<Protection, string> = { fixed: 'One fixed key', symmetric: 'Symmetric ratchet only', full: 'Full ratchet' };

export const hex = (bytes: Uint8Array, count = 8): string => {
  const text = [...bytes.slice(0, count)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return text.replace(/(.{8})(?=.)/g, '$1 ');
};
export const pubTag = (pub: AffinePoint): string => pub.x.toString(16).padStart(64, '0').slice(0, 8);

const runCache = new Map<string, Promise<RealRun>>();

/** The real conversation (HMAC, HKDF, AES-GCM from Web Crypto, P-256 from this page's arithmetic). Null without Web Crypto. */
export function buildRun(pattern: readonly Party[], texts: readonly string[], mode: RatchetMode, seed: number): Promise<RealRun | null> {
  if (!hasSubtle()) return Promise.resolve(null);
  const key = `${patternText(pattern)}|${texts.join('\u0001')}|${mode}|${seed}`;
  let run = runCache.get(key);
  if (!run) {
    run = runConversation(realAlgebra(seed), pattern, texts, mode);
    runCache.set(key, run);
  }
  return run;
}

export interface Analysis {
  protection: Protection;
  party: Party;
  /** Messages 1..k are the ones sent before the copy of the state was made. */
  k: number;
  /** By derivation closure (formulation A): which messages' keys the thief can compute. */
  readable: boolean[];
  /** By clone replay with real AES-GCM (formulation B). */
  cloned: boolean[];
  agree: boolean;
  /** The first message after the theft that is sealed to the thief; null when there is none. */
  healing: number | null;
  /** True when that message's key depends on a private key generated after the theft. */
  healsByFreshKey: boolean;
  /** Real AES-GCM attempts of every key the thief can derive, per message. */
  tries: Tries[];
  candidates: number;
}

/** Everything the page shows about one theft: closure, clone replay, healing point and the real decryption attempts. */
export async function analyse(run: RealRun, pattern: readonly Party[], protection: Protection, party: Party, k: number, seed: number): Promise<Analysis> {
  if (protection === 'fixed') return analyseFixed(run, pattern, party, k);
  const sym = await symbolicRun(pattern, protection);
  const closure = reading(sym, party, k);
  const cloned = await cloneReadable(run, party, k, protection, seed ^ CLONE_SALT);
  const candidates = await candidateKeys(run.after[k - 1][party], run.messages);
  const tries = [];
  for (const m of run.messages) tries.push(await tryMessage(candidates, m));
  return {
    protection,
    party,
    k,
    readable: closure.readable,
    cloned,
    agree: closure.readable.every((r, i) => r === cloned[i]),
    healing: closure.healing,
    healsByFreshKey: closure.healing !== null && dependsOnFreshKey(sym, k, closure.healing),
    tries,
    candidates: candidates.length,
  };
}

async function analyseFixed(run: RealRun, pattern: readonly Party[], party: Party, k: number): Promise<Analysis> {
  const fixed = await fixedKeyRun(run.messages.map((m) => m.text), run.messages.map((m) => m.header.pub));
  const cloned: boolean[] = [];
  const tries: Tries[] = [];
  for (let i = 0; i < pattern.length; i++) {
    const opens = await fixedOpens(fixed, i);
    cloned.push(opens);
    tries.push({ tries: 1, openedBy: opens ? 'the one fixed key' : null });
  }
  return { protection: 'fixed', party, k, readable: pattern.map(() => true), cloned, agree: cloned.every(Boolean), healing: null, healsByFreshKey: false, tries, candidates: 1 };
}

export interface ModeRow {
  protection: Protection;
  /** 1-based numbers of the messages the thief can read. */
  opens: number[];
}

/** The mode comparison under scenes 1 and 2: the same theft against the three protections, by derivation closure. */
export async function compareModes(pattern: readonly Party[], party: Party, k: number): Promise<ModeRow[]> {
  const rows: ModeRow[] = [{ protection: 'fixed', opens: pattern.map((_, i) => i + 1) }];
  for (const protection of ['symmetric', 'full'] as const) {
    const { readable } = reading(await symbolicRun(pattern, protection), party, k);
    rows.push({ protection, opens: readable.flatMap((r, i) => (r ? [i + 1] : [])) });
  }
  return rows;
}

export const opensText = (opens: readonly number[]): string => (opens.length === 0 ? 'none' : opens.map((n) => `m${n}`).join(' '));

/** "N tries, 0 opened" for an earlier message: N is the number of keys tried. */
export const triesText = (t: Tries): string => `${t.tries} ${t.tries === 1 ? 'try' : 'tries'}, ${t.openedBy === null ? 0 : 1} opened`;
