import { levelById } from '../../core/latencyLadder';
import { power } from '../../core/format';
import { parseBoundedDecimal, parseBoundedInt, type FieldParse } from '../../core/parse';

/* ---------- unit algebra: a number with units that multiply, divide and refuse to add the wrong things ---------- */

/** Exponent of each unit: users/day is { user: 1, day: -1 }. Zero exponents are dropped. */
export type Dims = Readonly<Record<string, number>>;

export interface Quantity {
  value: number;
  dims: Dims;
}

const clean = (d: Record<string, number>): Dims => Object.fromEntries(Object.entries(d).filter(([, e]) => e !== 0));

export const quantity = (value: number, dims: Dims = {}): Quantity => ({ value, dims: clean({ ...dims }) });

export function mul(a: Quantity, b: Quantity): Quantity {
  const dims: Record<string, number> = { ...a.dims };
  for (const [u, e] of Object.entries(b.dims)) dims[u] = (dims[u] ?? 0) + e;
  return { value: a.value * b.value, dims: clean(dims) };
}

export function div(a: Quantity, b: Quantity): Quantity {
  if (b.value === 0) throw new RangeError('division by zero');
  const dims: Record<string, number> = { ...a.dims };
  for (const [u, e] of Object.entries(b.dims)) dims[u] = (dims[u] ?? 0) - e;
  return { value: a.value / b.value, dims: clean(dims) };
}

/** A quantity's dimension as text: "req/s", "B", "B/s", "bit/s". */
export function dimsText(d: Dims): string {
  const top = Object.entries(d).filter(([, e]) => e > 0);
  const bottom = Object.entries(d).filter(([, e]) => e < 0);
  const part = (xs: [string, number][]) => xs.map(([u, e]) => (Math.abs(e) === 1 ? u : `${u}^${Math.abs(e)}`)).join('·');
  if (!top.length && !bottom.length) return 'a plain number';
  return `${part(top) || '1'}${bottom.length ? `/${part(bottom)}` : ''}`;
}

export const sameDims = (a: Dims, b: Dims): boolean => dimsText(a) === dimsText(b);

export function add(a: Quantity, b: Quantity): Quantity {
  if (!sameDims(a.dims, b.dims)) throw new TypeError(`can't add ${dimsText(a.dims)} to ${dimsText(b.dims)}`);
  return { value: a.value + b.value, dims: a.dims };
}

/* ---------- constants ---------- */

export const SECONDS_PER_DAY = 86_400;
/** The shortcut: 100,000 s/day. It overstates the rate by 1/0.864 − 1. */
export const ROUND_SECONDS_PER_DAY = 100_000;
export const BITS_PER_BYTE = 8;
export const NIC_GBIT = 10;
export const TB_DECIMAL = 10 ** 12;
export const TIB_BINARY = 2 ** 40;
export const LATENCY_TARGET_MS = 200;
export const BIG_NUMBER = 1e21;

/* ---------- scene 1: users to requests per second ---------- */

export interface TrafficInput {
  dau: number;
  actionsPerUser: number;
  peakFactor: number;
  /** Reads per write, e.g. 10 means 10 reads for every write. */
  readsPerWrite: number;
  round: boolean;
}

export interface Traffic {
  average: Quantity;
  peak: Quantity;
  reads: Quantity;
  writes: Quantity;
  /** Seconds per day used: 86,400 exactly, or the 100,000 shortcut. */
  secondsPerDay: number;
}

export function traffic(i: TrafficInput): Traffic {
  const users = quantity(i.dau, { user: 1, day: -1 });
  const actions = quantity(i.actionsPerUser, { req: 1, user: -1 });
  const secondsPerDay = i.round ? ROUND_SECONDS_PER_DAY : SECONDS_PER_DAY;
  const average = div(mul(users, actions), quantity(secondsPerDay, { s: 1, day: -1 }));
  const peak = mul(average, quantity(i.peakFactor));
  const writeShare = 1 / (1 + i.readsPerWrite);
  return {
    average,
    peak,
    writes: mul(peak, quantity(writeShare)),
    reads: mul(peak, quantity(1 - writeShare)),
    secondsPerDay,
  };
}

/** The exact shortcut error 100,000 / 86,400 − 1 (+15.7%), independent of any input. */
export const SHORTCUT_ERROR = ROUND_SECONDS_PER_DAY / SECONDS_PER_DAY - 1;

/* ---------- scene 2: storage and bandwidth ---------- */

export interface StorageInput {
  recordBytes: number;
  writesPerDay: number;
  retentionDays: number;
  replicas: number;
  overhead: number;
  binary: boolean;
}

export interface Storage {
  total: Quantity;
  /** Bytes in the chosen unit (TB or TiB). */
  inUnit: number;
  unitName: 'TB' | 'TiB';
  /** TiB and TB differ by this factor: 2^40 / 10^12. */
  unitGap: number;
}

export function storage(i: StorageInput): Storage {
  const record = quantity(i.recordBytes, { B: 1, req: -1 });
  const writes = quantity(i.writesPerDay, { req: 1, day: -1 });
  const retention = quantity(i.retentionDays, { day: 1 });
  const total = mul(mul(mul(record, writes), retention), quantity(i.replicas * i.overhead));
  const unit = i.binary ? TIB_BINARY : TB_DECIMAL;
  return { total, inUnit: total.value / unit, unitName: i.binary ? 'TiB' : 'TB', unitGap: TIB_BINARY / TB_DECIMAL };
}

export interface Bandwidth {
  bytesPerSecond: Quantity;
  bitsPerSecond: Quantity;
  megabitsPerSecond: number;
  /** Share of a NIC of NIC_GBIT Gbit/s. */
  nicShare: number;
}

export function bandwidth(payloadBytes: number, requestsPerSecond: number): Bandwidth {
  const bytesPerSecond = mul(quantity(payloadBytes, { B: 1, req: -1 }), quantity(requestsPerSecond, { req: 1, s: -1 }));
  const bitsPerSecond = mul(bytesPerSecond, quantity(BITS_PER_BYTE, { bit: 1, B: -1 }));
  return {
    bytesPerSecond,
    bitsPerSecond,
    megabitsPerSecond: bitsPerSecond.value / 1e6,
    nicShare: bitsPerSecond.value / (NIC_GBIT * 1e9),
  };
}

/** A 10 Gbit/s NIC in bytes per second: 1.25 GB/s. */
export const NIC_BYTES_PER_SECOND = (NIC_GBIT * 1e9) / BITS_PER_BYTE;

/* ---------- scene 3: servers ---------- */

export type Redundancy = 'none' | 'n+1' | 'zones';

export interface ServerInput {
  peak: number;
  cores: number;
  cpuMs: number;
  target: number;
  redundancy: Redundancy;
}

export interface Servers {
  perServerAtFull: number;
  perServerAtTarget: number;
  base: number;
  extra: number;
  total: number;
}

export function servers(i: ServerInput): Servers {
  const perServerAtFull = (i.cores * 1000) / i.cpuMs;
  const perServerAtTarget = perServerAtFull * i.target;
  const base = Math.ceil(i.peak / perServerAtTarget);
  const total = i.redundancy === 'none' ? base : i.redundancy === 'n+1' ? base + 1 : Math.ceil((base * 3) / 2);
  return { perServerAtFull, perServerAtTarget, base, extra: total - base, total };
}

/* ---------- scene 4: the latency ladder ---------- */

export const PATH_STEPS = ['l1', 'ram', 'nvme', 'dc', 'wan'] as const;
export type PathStep = (typeof PATH_STEPS)[number];

export const stepMs = (id: PathStep): number => levelById(id).ns / 1e6;

export interface PathResult {
  totalMs: number;
  parts: { id: PathStep; ms: number }[];
  inBudget: boolean;
}

export function pathBudget(counts: Readonly<Record<PathStep, number>>, targetMs = LATENCY_TARGET_MS): PathResult {
  const parts = PATH_STEPS.map((id) => ({ id, ms: counts[id] * stepMs(id) }));
  const totalMs = parts.reduce((s, p) => s + p.ms, 0);
  return { totalMs, parts, inBudget: totalMs <= targetMs };
}

/* ---------- scene 5: guess first ---------- */

export interface Scenario {
  id: string;
  name: string;
  dau: number;
  actionsPerUser: number;
}

export const SCENARIOS: readonly Scenario[] = [
  { id: 'chat', name: 'A chat app: 100 million users, 10 messages each a day', dau: 100_000_000, actionsPerUser: 10 },
  { id: 'photos', name: 'A photo site: 20 million users, 3 uploads or views each a day', dau: 20_000_000, actionsPerUser: 3 },
  { id: 'internal', name: 'An internal tool: 5,000 users, 40 requests each a day', dau: 5_000, actionsPerUser: 40 },
];
export const GUESS_EXPONENTS = [0, 1, 2, 3, 4, 5, 6, 7] as const;

export const scenarioQps = (s: Scenario): number => traffic({ dau: s.dau, actionsPerUser: s.actionsPerUser, peakFactor: 1, readsPerWrite: 1, round: false }).average.value;

/** log₁₀(guess ÷ truth): how many orders of magnitude off the guess is (negative: too low). */
export const orderError = (guessExponent: number, truth: number): number => guessExponent - Math.log10(truth);

export const withinTenfold = (guessExponent: number, truth: number): boolean => Math.abs(orderError(guessExponent, truth)) < 1;

/* ---------- reading and showing numbers ---------- */

const countField = (name: string, min: number, max: number) => (text: string): FieldParse<number> =>
  parseBoundedInt(text, {
    min,
    max,
    thousands: true,
    underscores: true,
    messages: {
      empty: `Type ${name}.`,
      invalid: (typed) => `"${typed}" isn't plain digits for ${name}: type the digits (5k and 1e6 are not read).`,
      tooSmall: () => (min > 0 ? `${name} has to be at least ${min.toLocaleString('en-US')}.` : `${name} can't be negative.`),
      tooBig: () => `${name} can't be more than ${max.toLocaleString('en-US')}.`,
    },
  });

export const parseDau = countField('the daily users', 1, 1e12);
export const parseWrites = countField('the writes per day', 1, 1e12);
export const parsePeak = countField('the peak requests per second', 1, 1e12);
export const parseRecord = countField('the record size in bytes', 1, 1e9);

export const parseCpuMs = (text: string): FieldParse<number> => {
  const r = parseBoundedDecimal(text, {
    min: 0,
    max: 1e6,
    messages: {
      empty: 'Type the CPU milliseconds per request.',
      invalid: (typed) => `"${typed}" isn't a plain number like 5 or 0.5.`,
      tooBig: () => "CPU time per request can't be more than 1,000,000 ms.",
      tooSmall: () => "CPU time per request can't be negative.",
    },
  });
  if (r.ok && r.value === 0) return { ok: false, error: "CPU time per request has to be above 0: zero would divide by zero." };
  return r;
};

/** A count for display: grouped digits, and a power of ten from 10²¹ up. */
export function bigText(x: number): string {
  if (!Number.isFinite(x)) return '∞';
  if (Math.abs(x) >= BIG_NUMBER) {
    const exp = Math.floor(Math.log10(Math.abs(x)));
    return `${(x / 10 ** exp).toFixed(2)} × ${power(exp, 10)}`;
  }
  const digits = Math.abs(x) >= 100 ? 0 : Math.abs(x) >= 10 ? 2 : 3;
  return x.toLocaleString('en-US', { maximumFractionDigits: digits });
}

export const TRAFFIC_DEFAULT = { dau: '100,000,000', actions: 10, peak: 3, reads: 10, round: false };
export const STORAGE_DEFAULT = { record: '1000', writes: '1,000,000', retention: 365, replicas: 3, overhead: 1, binary: false, payload: 2000 };
export const SERVER_DEFAULT = { peak: '50000', cores: 8, cpuMs: '5', target: 0.6, redundancy: 'none' as Redundancy };
export const PATH_DEFAULT: Record<PathStep, number> = { l1: 100, ram: 50, nvme: 2, dc: 20, wan: 0 };
