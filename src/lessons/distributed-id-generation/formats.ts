// The ID formats, bit for bit. Every generator is pure: the clock and the randomness come in as
// arguments, so the tests can pin exact bits and the page can feed it a real clock and
// crypto.getRandomValues. These are the real layouts, but this code is for teaching, not production.
import type { Bit } from '../../core/bits';
import type { Rnd } from '../../core/random';

// ── Bits and randomness ─────────────────────────────────────────────────────

/** `v` as `width` bits, most significant first (any width, unlike core/bits toBits). */
export function bitsOfBig(v: bigint, width: number): Bit[] {
  if (v < 0n || v >> BigInt(width) !== 0n) throw new RangeError(`${v} does not fit in ${width} bits`);
  return Array.from({ length: width }, (_, i) => Number((v >> BigInt(width - 1 - i)) & 1n) as Bit);
}

export const bigOfBits = (bits: readonly Bit[]): bigint => bits.reduce((acc, b) => (acc << 1n) | BigInt(b), 0n);

/** `n` random bits as a bigint. */
export type RandomBits = (n: number) => bigint;

const CHUNK = 16;

/** Random bits from a seeded Rnd (the tests and the index simulation), 16 at a time. */
export function seededBits(rnd: Rnd): RandomBits {
  return (n) => {
    let v = 0n;
    for (let got = 0; got < n; got += CHUNK) v = (v << BigInt(CHUNK)) | BigInt(Math.floor(rnd() * 2 ** CHUNK));
    const extra = Math.ceil(n / CHUNK) * CHUNK - n;
    return v >> BigInt(extra);
  };
}

/** Random bits from the browser's cryptographic generator. */
export function cryptoBits(): RandomBits {
  return (n) => {
    const bytes = new Uint8Array(Math.ceil(n / 8));
    crypto.getRandomValues(bytes);
    let v = 0n;
    for (const b of bytes) v = (v << 8n) | BigInt(b);
    return v >> BigInt(bytes.length * 8 - n);
  };
}

const TS_BITS = 48;
const MAX_MS = 2 ** TS_BITS - 1;

function checkMs(ms: number) {
  if (!Number.isInteger(ms) || ms < 0 || ms > MAX_MS) throw new RangeError(`a 48-bit millisecond timestamp is 0 to ${MAX_MS}, got ${ms}`);
}

// ── UUIDs (RFC 9562) ────────────────────────────────────────────────────────

export const UUID_BITS = 128;
export const UUID_VERSION_AT = 48;
export const UUID_VARIANT_AT = 64;

/** 8-4-4-4-12 lower-case hex. */
export function uuidText(v: bigint): string {
  const h = v.toString(16).padStart(32, '0');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const parseUuid = (text: string): bigint | null =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text) ? BigInt(`0x${text.replaceAll('-', '')}`) : null;

/** The version (bits 48-51) and variant (bits 64-65) a UUID carries. */
export const uuidVersion = (v: bigint): number => Number((v >> 76n) & 0xfn);
export const uuidVariant = (v: bigint): number => Number((v >> 62n) & 0x3n);

/** UUIDv4 (§5.4): 122 random bits, with the version bits 0100 and the variant bits 10 laid over them. */
export function uuidV4(random: RandomBits): bigint {
  return (random(48) << 80n) | (0x4n << 76n) | (random(12) << 64n) | (0b10n << 62n) | random(62);
}

/** UUIDv7 (§5.7): a 48-bit Unix millisecond timestamp, version 0111, 12 bits rand_a, variant 10, 62 bits rand_b. */
export function uuidV7(ms: number, randA: bigint, randB: bigint): bigint {
  checkMs(ms);
  if (randA >> 12n !== 0n || randB >> 62n !== 0n) throw new RangeError('rand_a is 12 bits and rand_b is 62 bits');
  return (BigInt(ms) << 80n) | (0x7n << 76n) | (randA << 64n) | (0b10n << 62n) | randB;
}

export const uuidV7Millis = (v: bigint): number => Number(v >> 80n);

export interface V7State {
  ms: number;
  counter: number;
}
export type V7Result = { uuid: bigint; state: V7State } | { wait: true; state: V7State };

const COUNTER_MAX = 0xfff;
/** The counter starts below this, so a burst has room before it rolls over (RFC 9562 §6.2). */
const COUNTER_SEED_BITS = 11;

/**
 * UUIDv7 with the counter method (§6.2 method 1): rand_a holds a 12-bit counter, seeded randomly with
 * its top bit clear when the millisecond changes and counted up within one. A clock that goes backwards
 * is ignored (the last timestamp is kept). If the counter would roll over it waits for the next
 * millisecond, as the RFC suggests, rather than break the ordering.
 */
export function nextV7(state: V7State | null, nowMs: number, random: RandomBits): V7Result {
  const prev = state ?? { ms: -1, counter: 0 };
  if (nowMs > prev.ms) {
    const next = { ms: nowMs, counter: Number(random(COUNTER_SEED_BITS)) };
    return { uuid: uuidV7(next.ms, BigInt(next.counter), random(62)), state: next };
  }
  if (prev.counter >= COUNTER_MAX) return { wait: true, state: prev };
  const next = { ms: prev.ms, counter: prev.counter + 1 };
  return { uuid: uuidV7(next.ms, BigInt(next.counter), random(62)), state: next };
}

// ── ULID ────────────────────────────────────────────────────────────────────

/** Crockford's base32: no I, L, O or U. In ASCII order, so text order is numeric order. */
export const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const ULID_CHARS = 26;
export const ULID_TIME_CHARS = 10;

export function ulidValue(ms: number, random80: bigint): bigint {
  checkMs(ms);
  if (random80 >> 80n !== 0n) throw new RangeError('a ULID has 80 random bits');
  return (BigInt(ms) << 80n) | random80;
}

/** 26 characters: the 128 bits in 5-bit groups, most significant first (the first character holds only 3 bits). */
export function ulidText(v: bigint): string {
  let out = '';
  for (let i = ULID_CHARS - 1; i >= 0; i--) out += CROCKFORD[Number((v >> BigInt(i * 5)) & 31n)];
  return out;
}

export function parseUlid(text: string): bigint | null {
  const t = text.toUpperCase();
  if (t.length !== ULID_CHARS || [...t].some((c) => !CROCKFORD.includes(c)) || t[0] > '7') return null;
  return [...t].reduce((acc, c) => (acc << 5n) | BigInt(CROCKFORD.indexOf(c)), 0n);
}

export const ulidMillis = (v: bigint): number => Number(v >> 80n);

// ── Snowflake-style 64-bit IDs ──────────────────────────────────────────────

export const SNOWFLAKE = { signBits: 1, timeBits: 41, machineBits: 10, sequenceBits: 12 } as const;
export const MAX_MACHINE = 2 ** SNOWFLAKE.machineBits - 1;
export const MAX_SEQUENCE = 2 ** SNOWFLAKE.sequenceBits - 1;
export const MAX_SNOWFLAKE_MS = 2 ** SNOWFLAKE.timeBits - 1;
/** Twitter's custom epoch, 2010-11-04T01:42:54.657Z, a common choice for the timestamp's zero. */
export const TWITTER_EPOCH = 1_288_834_974_657;

export interface SnowflakeFields {
  /** Milliseconds since the custom epoch. */
  time: number;
  machine: number;
  sequence: number;
}

export function encodeSnowflake({ time, machine, sequence }: SnowflakeFields): bigint {
  if (!Number.isInteger(time) || time < 0 || time > MAX_SNOWFLAKE_MS) throw new RangeError(`the 41-bit time is 0 to ${MAX_SNOWFLAKE_MS}, got ${time}`);
  if (!Number.isInteger(machine) || machine < 0 || machine > MAX_MACHINE) throw new RangeError(`the 10-bit machine id is 0 to ${MAX_MACHINE}, got ${machine}`);
  if (!Number.isInteger(sequence) || sequence < 0 || sequence > MAX_SEQUENCE) throw new RangeError(`the 12-bit sequence is 0 to ${MAX_SEQUENCE}, got ${sequence}`);
  return (BigInt(time) << 22n) | (BigInt(machine) << 12n) | BigInt(sequence);
}

export function decodeSnowflake(id: bigint): SnowflakeFields {
  if (id < 0n || id >> 63n !== 0n) throw new RangeError('a snowflake id is a positive 63-bit number (the sign bit is 0)');
  return { time: Number(id >> 22n), machine: Number((id >> 12n) & 0x3ffn), sequence: Number(id & 0xfffn) };
}

/** What the generator does when the clock reads earlier than the last ID's time. */
export type ClockBackPolicy = 'refuse' | 'wait' | 'ignore';

export interface SnowflakeState {
  lastTime: number;
  sequence: number;
}

export type SnowflakeEvent = 'ok' | 'new-ms' | 'sequence-full' | 'clock-back-refused' | 'clock-back-wait' | 'clock-back-ignored';
export type SnowflakeResult =
  | { id: bigint; state: SnowflakeState; event: 'ok' | 'new-ms' | 'clock-back-ignored' }
  /** No id this time: try again once the clock reads `until` or later. */
  | { id: null; state: SnowflakeState; event: 'sequence-full' | 'clock-back-wait'; until: number }
  | { id: null; state: SnowflakeState; event: 'clock-back-refused'; until: number };

export const startSnowflake = (): SnowflakeState => ({ lastTime: -1, sequence: 0 });

/**
 * One step of a snowflake generator on machine `machine`, with the clock reading `now` ms since the
 * epoch. Within one millisecond the sequence counts 0 to 4095; the 4,097th id has to wait for the next
 * millisecond. A clock that reads earlier than the last id's time is dangerous: `refuse` says so,
 * `wait` holds until the clock catches up, and `ignore` carries on with the earlier time, which can
 * repeat ids already handed out.
 */
export function nextSnowflake(state: SnowflakeState, machine: number, now: number, policy: ClockBackPolicy): SnowflakeResult {
  if (now < state.lastTime) {
    if (policy === 'refuse') return { id: null, state, event: 'clock-back-refused', until: state.lastTime };
    if (policy === 'wait') return { id: null, state, event: 'clock-back-wait', until: state.lastTime };
    const next = { lastTime: now, sequence: 0 };
    return { id: encodeSnowflake({ time: now, machine, sequence: 0 }), state: next, event: 'clock-back-ignored' };
  }
  if (now === state.lastTime) {
    if (state.sequence >= MAX_SEQUENCE) return { id: null, state, event: 'sequence-full', until: now + 1 };
    const next = { lastTime: now, sequence: state.sequence + 1 };
    return { id: encodeSnowflake({ time: now, machine, sequence: next.sequence }), state: next, event: 'ok' };
  }
  const next = { lastTime: now, sequence: 0 };
  return { id: encodeSnowflake({ time: now, machine, sequence: 0 }), state: next, event: 'new-ms' };
}

// ── Layouts for the bit strips ──────────────────────────────────────────────

export type FormatId = 'autoincrement' | 'uuidv4' | 'uuidv7' | 'ulid' | 'snowflake';

export type FieldKind = 'time' | 'machine' | 'sequence' | 'random' | 'version' | 'counter' | 'sign';

export interface Field {
  kind: FieldKind;
  /** Inclusive bit positions, from the most significant end. */
  from: number;
  to: number;
  label: string;
}

/** Every field of each format, in order, covering every bit exactly once. */
export const LAYOUTS: Record<FormatId, { bits: number; fields: Field[] }> = {
  autoincrement: { bits: 64, fields: [{ kind: 'counter', from: 0, to: 63, label: 'counter (64)' }] },
  uuidv4: {
    bits: 128,
    fields: [
      { kind: 'random', from: 0, to: 47, label: 'random (48)' },
      { kind: 'version', from: 48, to: 51, label: 'ver 4' },
      { kind: 'random', from: 52, to: 63, label: 'random (12)' },
      { kind: 'version', from: 64, to: 65, label: 'var' },
      { kind: 'random', from: 66, to: 127, label: 'random (62)' },
    ],
  },
  uuidv7: {
    bits: 128,
    fields: [
      { kind: 'time', from: 0, to: 47, label: 'Unix ms (48)' },
      { kind: 'version', from: 48, to: 51, label: 'ver 7' },
      { kind: 'random', from: 52, to: 63, label: 'rand_a (12)' },
      { kind: 'version', from: 64, to: 65, label: 'var' },
      { kind: 'random', from: 66, to: 127, label: 'rand_b (62)' },
    ],
  },
  ulid: {
    bits: 128,
    fields: [
      { kind: 'time', from: 0, to: 47, label: 'Unix ms (48)' },
      { kind: 'random', from: 48, to: 127, label: 'random (80)' },
    ],
  },
  snowflake: {
    bits: 64,
    fields: [
      { kind: 'sign', from: 0, to: 0, label: '0' },
      { kind: 'time', from: 1, to: 41, label: 'ms since epoch (41)' },
      { kind: 'machine', from: 42, to: 51, label: 'machine (10)' },
      { kind: 'sequence', from: 52, to: 63, label: 'sequence (12)' },
    ],
  },
};
