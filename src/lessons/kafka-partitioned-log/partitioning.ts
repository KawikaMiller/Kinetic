/**
 * kafka-partitioned-log, scene 1: which partition a record lands in, and what changes when partitions are added.
 * Pure. The hash is the shared `hash32` (FNV-1a then murmur3's finaliser), not Kafka's murmur2, and the lesson says so.
 */
import { hash32 } from '../../core/hash';
import { mulberry32 } from '../../core/random';

export const MIN_PARTITIONS = 1;
export const MAX_PARTITIONS = 6;
export const DEFAULT_PARTITIONS = 3;
/** The most records a topic holds in this scene; a burst that would pass it is refused. */
export const MAX_RECORDS = 200;
export const BURST_SIZE = 40;
/** Keys longer than this are cut for display and still hashed whole. */
export const MAX_KEY_DISPLAY = 40;
/** The longest key the field accepts at all, so a paste cannot hold the page. */
export const MAX_KEY_INPUT = 200;
/** Offsets drawn per tape: the newest ones; older cells scroll off the left. */
export const VISIBLE_OFFSETS = 24;
/** Brokers the partition leaders are spread over, in this lesson's round-robin rule. */
export const LEADER_BROKERS = 3;
export const DEFAULT_SEED = 7;

export interface KeySet {
  id: 'users' | 'hot' | 'none';
  label: string;
  keys: readonly string[];
}
export const KEY_SETS: readonly KeySet[] = [
  { id: 'users', label: '5 user ids', keys: ['ada', 'bo', 'cy', 'dee', 'eli'] },
  { id: 'hot', label: '1 hot key', keys: ['hot'] },
  { id: 'none', label: 'no key', keys: [] },
];

export interface PartRecord {
  /** Arrival order across the whole topic, from 0. */
  id: number;
  /** Null for a keyless record. */
  key: string | null;
  partition: number;
  /** Position inside its partition, from 0. */
  offset: number;
  /** The partition count in force when it was sent. */
  p: number;
}

export interface Topic {
  p: number;
  records: readonly PartRecord[];
  /** How many keyless records were sent: the round-robin cursor. */
  keyless: number;
  bursts: number;
}

export const newTopic = (p = DEFAULT_PARTITIONS): Topic => ({ p, records: [], keyless: 0, bursts: 0 });

/** The partition a key goes to: its hash modulo the partition count. */
export const partitionOf = (key: string, p: number): number => hash32(key) % p;

/** An empty key is the keyless case. */
export const normalizeKey = (typed: string): string | null => (typed.length === 0 ? null : typed);

/** The key as shown: cut at MAX_KEY_DISPLAY characters, with an ellipsis when it was cut. */
export const keyShown = (key: string): string => (key.length > MAX_KEY_DISPLAY ? `${key.slice(0, MAX_KEY_DISPLAY)}…` : key);

export const partitionLengths = (t: Topic): number[] => {
  const lengths = new Array<number>(t.p).fill(0);
  for (const r of t.records) lengths[r.partition]++;
  return lengths;
};

export type Appended = { ok: true; topic: Topic } | { ok: false; error: string };

/** Append records in order. A batch that would take the topic past MAX_RECORDS is refused whole. */
export function appendKeys(t: Topic, keys: readonly (string | null)[]): Appended {
  if (t.records.length + keys.length > MAX_RECORDS) {
    return { ok: false, error: `A topic here holds at most ${MAX_RECORDS} records; this would make ${t.records.length + keys.length}. Reset the topic to start again.` };
  }
  const lengths = partitionLengths(t);
  let keyless = t.keyless;
  const added: PartRecord[] = keys.map((key, i) => {
    const partition = key === null ? keyless++ % t.p : partitionOf(key, t.p);
    return { id: t.records.length + i, key, partition, offset: lengths[partition]++, p: t.p };
  });
  return { ok: true, topic: { ...t, records: [...t.records, ...added], keyless } };
}

/** The keys of a seeded burst: BURST_SIZE draws from the key set (keyless when it has no keys). */
export function burstKeys(set: KeySet, seed: number, burst: number): (string | null)[] {
  const rnd = mulberry32(seed * 1_000 + burst);
  return Array.from({ length: BURST_SIZE }, () => (set.keys.length === 0 ? null : set.keys[Math.floor(rnd() * set.keys.length)]));
}

/** Distinct keys seen, in order of first appearance. */
export const distinctKeys = (t: Topic): string[] => [...new Set(t.records.flatMap((r) => (r.key === null ? [] : [r.key])))];

/** Where the newest record of a key sits (the partition its updates were last sent to), or null for a key never sent. */
export const lastPlacement = (t: Topic, key: string): { partition: number; p: number } | null => {
  for (let i = t.records.length - 1; i >= 0; i--) if (t.records[i].key === key) return { partition: t.records[i].partition, p: t.records[i].p };
  return null;
};

/** Keys whose next record would go to a different partition than their latest one did, under the current partition count. */
export const movedKeys = (t: Topic): string[] =>
  distinctKeys(t).filter((k) => partitionOf(k, t.p) !== lastPlacement(t, k)!.partition);

export const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
export const lcm = (a: number, b: number): number => (a / gcd(a, b)) * b;

/**
 * The share of keys expected to change partition when the count goes from `from` to `to`, if hashes are uniform:
 * a hash keeps its partition exactly when it is below min(from, to) modulo the common period, so the keepers are
 * min / lcm of all residues. Adding one partition to P moves P/(P+1) of the keys.
 */
export const expectedMoveShare = (from: number, to: number): number => 1 - Math.min(from, to) / lcm(from, to);

/** The partition count every seen key was last placed under, or null when they differ or nothing was sent. */
export const placedUnder = (t: Topic): number | null => {
  const ps = new Set(distinctKeys(t).map((k) => lastPlacement(t, k)!.p));
  return ps.size === 1 ? [...ps][0] : null;
};

/** The leader broker of a partition in this lesson's rule: partitions take brokers 1, 2, 3, 1, 2, 3. */
export const leaderBroker = (partition: number): number => (partition % LEADER_BROKERS) + 1;

/** Empty slots a tape always shows, so a short tape still reads as a tape. */
export const MIN_SLOTS = 8;

/** The offsets drawn on every tape: the newest VISIBLE_OFFSETS of the longest one, and at least MIN_SLOTS slots. */
export const offsetWindow = (t: Topic): { from: number; cols: number } => {
  const longest = Math.max(0, ...partitionLengths(t));
  const cols = Math.max(MIN_SLOTS, Math.min(VISIBLE_OFFSETS, longest));
  return { from: Math.max(0, longest - cols), cols };
};

/** The partition and offset of every record of one key, in arrival order, for the "order inside a tape" check. */
export const recordsOfKey = (t: Topic, key: string): PartRecord[] => t.records.filter((r) => r.key === key);
