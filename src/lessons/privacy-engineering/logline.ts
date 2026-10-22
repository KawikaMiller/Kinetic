/**
 * The log-line scene's model: a read-only template whose fields the learner treats one by one (keep, mask, hash,
 * keyed hash or drop), and the five fictional addresses a hashed value is tried against. SHA-256 and HMAC are
 * the real crypto.subtle; the people, addresses and key are invented.
 */
import { hmacSha256, sha256Hex } from '../../core/crypto';
import { fakeSecret } from '../../core/fakeSecret';

export type FieldId = 'time' | 'email' | 'ip' | 'session' | 'latency';
export type Treatment = 'keep' | 'mask' | 'hash' | 'hmac' | 'drop';

export const FIELD_ORDER: readonly FieldId[] = ['time', 'email', 'ip', 'session', 'latency'];
export const TREATMENT_ORDER: readonly Treatment[] = ['keep', 'mask', 'hash', 'hmac', 'drop'];
export const TREATMENT_LABEL: Record<Treatment, string> = { keep: 'Keep', mask: 'Mask', hash: 'Hash', hmac: 'Keyed hash (HMAC)', drop: 'Drop' };

export interface Field {
  id: FieldId;
  label: string;
  /** Personal data (it can point at a person), or not. */
  pii: boolean;
  /** One line on why it counts. */
  note: string;
  /** Its possible values are few enough for an outsider to list (addresses of a small user base, an address block): a plain hash of it can be reversed by trying them. */
  guessable: boolean;
}

export const FIELDS: Record<FieldId, Field> = {
  time: { id: 'time', label: 'time', pii: false, note: 'a moment, on its own', guessable: false },
  email: { id: 'email', label: 'user email', pii: true, note: 'points straight at a person', guessable: true },
  ip: { id: 'ip', label: 'ip address', pii: true, note: 'can point at a household or device', guessable: true },
  session: { id: 'session', label: 'session id', pii: true, note: 'links the requests of one person together', guessable: false },
  latency: { id: 'latency', label: 'latency', pii: false, note: 'a number about the request', guessable: false },
};

/** Three invented log lines: the people, addresses (documentation ranges) and ids are all made up. */
export const SAMPLE_LINES: readonly Record<FieldId, string>[] = [
  { time: '09:14:02', email: 'mara@example.test', ip: '192.0.2.17', session: 's-4f9a21', latency: '41 ms' },
  { time: '09:14:09', email: 'noor@example.test', ip: '192.0.2.44', session: 's-7c03be', latency: '38 ms' },
  { time: '09:14:15', email: 'mara@example.test', ip: '192.0.2.17', session: 's-4f9a21', latency: '52 ms' },
];

/** The five invented addresses a hash is tried against (the learner is shown them). */
export const CANDIDATE_EMAILS: readonly string[] = ['ines@example.test', 'mara@example.test', 'noor@example.test', 'omar@example.test', 'tess@example.test'];
export const CANDIDATE_IPS: readonly string[] = ['192.0.2.9', '192.0.2.17', '192.0.2.44', '192.0.2.61', '192.0.2.120'];

/** The demo key for the keyed hash, joined from parts: a fake. */
const DEMO_KEY = fakeSecret('demo-', 'log-', 'hmac-', 'key');

/** Masking keeps a little: the first character of the local part or the first octet. */
export function mask(field: FieldId, value: string): string {
  if (field === 'email') return `${value[0]}***@${value.split('@')[1]}`;
  if (field === 'ip') return `${value.split('.')[0]}.*.*.*`;
  if (field === 'session') return `${value.slice(0, 3)}***`;
  return '***';
}

export const hashOf = (value: string): Promise<string | null> => sha256Hex(value);
export const hmacOf = (value: string): Promise<string | null> => hmacSha256(DEMO_KEY, value, 'hex');

/** What a treated field looks like in the log line. */
export async function treat(field: FieldId, value: string, t: Treatment): Promise<string | null> {
  if (t === 'keep') return value;
  if (t === 'mask') return mask(field, value);
  if (t === 'drop') return null;
  const digest = t === 'hash' ? await hashOf(value) : await hmacOf(value);
  return digest === null ? '(no crypto here)' : digest.slice(0, 12);
}

export interface Recovery {
  /** The candidate whose plain SHA-256 equals the logged value, or null. */
  recovered: string | null;
  /** Candidates and the first digits of their plain SHA-256. */
  tried: { candidate: string; digest: string | null; match: boolean }[];
}

/** Try each candidate against a logged value of a treated field: a plain hash is reproduced by the guess, a keyed one is not. */
export async function recover(logged: string, candidates: readonly string[]): Promise<Recovery> {
  const tried = await Promise.all(
    candidates.map(async (candidate) => {
      const digest = await hashOf(candidate);
      return { candidate, digest: digest === null ? null : digest.slice(0, 12), match: digest !== null && digest.slice(0, 12) === logged };
    }),
  );
  return { recovered: tried.find((t) => t.match)?.candidate ?? null, tried };
}

export type Exposure = 'identifies' | 'partly' | 'guessable' | 'linkable' | 'gone' | 'not-personal';

/** How exposed a field is under a treatment: computed from what the treatment does to a value an outsider can guess. */
export function exposure(field: FieldId, t: Treatment): Exposure {
  if (!FIELDS[field].pii) return t === 'drop' ? 'gone' : 'not-personal';
  if (t === 'keep') return 'identifies';
  if (t === 'mask') return 'partly';
  if (t === 'hash') return FIELDS[field].guessable ? 'guessable' : 'linkable';
  if (t === 'hmac') return 'linkable';
  return 'gone';
}

export const EXPOSURE_TEXT: Record<Exposure, string> = {
  identifies: 'identifies the person',
  partly: 'still partly identifying',
  guessable: 'pseudonymous: a guess reproduces it',
  linkable: 'pseudonymous: a guess does not reproduce it, but the same person always gets the same value, so lines still link up',
  gone: 'not in the log',
  'not-personal': 'not personal data',
};

/** Personal fields that still point at a person (or can be made to) under the chosen treatments. */
export const stillIdentifying = (choice: Record<FieldId, Treatment>): FieldId[] =>
  FIELD_ORDER.filter((f) => ['identifies', 'partly', 'guessable'].includes(exposure(f, choice[f])));
