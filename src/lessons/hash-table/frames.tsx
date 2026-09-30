import { plural } from '../../core/format';
import type { Frame } from '../../core/types';

export type Table = string[][];
export type OpKind = 'insert' | 'lookup' | 'delete';

// Keep hashes to 16 bits so the numbers stay readable on screen.
const MOD = 65536;
const MULTIPLIER = 31;
export const MAX_BUCKETS = 16;
export const MAX_KEYS = 16;
/** Grow (double the buckets) once keys / buckets goes above this. */
export const THRESHOLD = 0.75;

/** Running hash after each character (good) or just the length (bad). */
function hashSteps(key: string, bad: boolean): number[] {
  if (bad) return [key.length];
  let h = 0;
  return [...key].map((c) => (h = (h * MULTIPLIER + c.charCodeAt(0)) % MOD));
}
const hashOf = (key: string, bad: boolean) => hashSteps(key, bad).at(-1)!;

/** Put every key in its bucket for a table of `n` buckets. */
export function build(keys: string[], n: number, bad: boolean): Table {
  const t: Table = Array.from({ length: n }, () => []);
  for (const k of keys) t[hashOf(k, bad) % n].push(k);
  return t;
}

export interface HashView {
  key: string;
  steps: number[];
  bad: boolean;
  n: number;
  showMod: boolean;
}

export interface HtFrame extends Frame {
  table: Table;
  incoming: { key: string; kind: OpKind; fresh: boolean } | null;
  hash: HashView | null;
  bucket: number | null;
  probe: { index: number; hit: boolean } | null;
  collide: boolean;
  warn: boolean;
  probes: number;
}

/** A frame showing just the table, nothing in flight. */
export const blank = (table: Table): HtFrame => ({
  table, incoming: null, hash: null, bucket: null, probe: null, collide: false, warn: false, probes: 0,
});

/** Frames for one insert / lookup / delete: hash, pick the bucket, walk the chain, then act (and maybe grow). */
export function opFrames(table: Table, kind: OpKind, key: string, bad: boolean): HtFrame[] {
  const n = table.length;
  const size = table.flat().length;
  const exists = table.flat().includes(key);
  const fresh = kind === 'insert' && !exists;

  if (fresh && size >= MAX_KEYS) {
    return [{ ...blank(table), say: <>This demo table is full ({MAX_KEYS} keys). Delete a few, or reset.</> }];
  }

  const steps = hashSteps(key, bad);
  const h = steps.at(-1)!;
  const idx = h % n;
  const chain = table[idx];
  const incoming = { key, kind, fresh };
  const view: HashView = { key, steps, bad, n, showMod: false };
  const K = <span className="hl">{key}</span>;
  const frames: HtFrame[] = [];

  frames.push({
    ...blank(table), incoming, hash: view,
    say: bad ? (
      <>Bad hash: just use the <b>length</b> of {K} → <span className="hl violet">{h}</span>. What could go wrong?</>
    ) : (
      <>Hash {K}: fold each letter in with <span className="mono">h = h×31 + code</span> → <span className="hl violet">{h}</span></>
    ),
  });
  frames.push({
    ...blank(table), incoming, hash: { ...view, showMod: true }, bucket: idx,
    say: <><span className="hl violet">{h}</span> % {n} buckets = bucket <span className="hl">{idx}</span>. No searching, just arithmetic.</>,
  });

  let probes = 0;
  let hitAt = -1;
  for (let i = 0; i < chain.length; i++) {
    probes++;
    const hit = chain[i] === key;
    const first = i === 0 && kind === 'insert' && !hit;
    frames.push({
      ...blank(table), incoming, hash: { ...view, showMod: true }, bucket: idx, probe: { index: i, hit }, collide: first, probes,
      say: hit ? (
        <><span className="hl ok">{chain[i]}</span> = {key}. Match on probe {probes}.</>
      ) : first ? (
        <>Bucket {idx} is taken: a <span className="hl bad">collision</span>. Walk the chain: {chain[i]} ≠ {key}…</>
      ) : (
        <>Compare with <span className="hl">{chain[i]}</span>. Not it. Next node…</>
      ),
    });
    if (hit) {
      hitAt = i;
      break;
    }
  }

  const done = { bucket: idx, probes, hash: { ...view, showMod: true } };

  if (kind === 'insert') {
    if (!fresh) {
      frames.push({ ...blank(table), ...done, probe: { index: hitAt, hit: true },
        say: <>{K} is already here, so just update its value in place. Hash tables never store duplicates.</> });
      return frames;
    }
    const next = table.map((c, i) => (i === idx ? [...c, key] : c));
    frames.push({
      ...blank(next), ...done, collide: chain.length > 0,
      say: chain.length ? (
        <>Chain {K} onto bucket {idx}. That chain is now <b>{chain.length + 1}</b> long.</>
      ) : (
        <>Bucket {idx} was empty. Drop {K} straight in. <span className="hl ok">O(1)</span>.</>
      ),
    });
    const load = (size + 1) / n;
    if (load > THRESHOLD) {
      if (n < MAX_BUCKETS) {
        frames.push({
          ...blank(next), warn: true, probes,
          say: <>Load factor {(size + 1)}/{n} = <span className="hl bad">{load.toFixed(2)}</span> &gt; {THRESHOLD}. Chains are getting long. Time to grow.</>,
        });
        frames.push({
          ...blank(build(next.flat(), n * 2, bad)), probes, hold: 1.6,
          say: <>Double to <b>{n * 2}</b> buckets. Every index is now <span className="mono">h % {n * 2}</span>, so <b>every key rehashes</b> and moves.</>,
        });
      } else {
        frames.push({
          ...blank(next), warn: true, probes,
          say: <>Load factor <span className="hl bad">{load.toFixed(2)}</span>. A real table would double again here; this demo stops at {MAX_BUCKETS}.</>,
        });
      }
    }
    return frames;
  }

  if (hitAt < 0) {
    frames.push({ ...blank(table), ...done,
      say: chain.length ? (
        <>End of chain: <span className="hl bad">{key}</span> isn't in the table. And we never touched the other {n - 1} buckets.</>
      ) : (
        <>Bucket {idx} is empty, so <span className="hl bad">{key}</span> isn't here. Zero probes needed.</>
      ) });
    return frames;
  }

  if (kind === 'lookup') {
    frames.push({ ...blank(table), ...done, probe: { index: hitAt, hit: true },
      say: <>Found <span className="hl ok">{key}</span> in {plural(probes, 'probe')}, without scanning the whole table.</> });
    return frames;
  }

  const next = table.map((c, i) => (i === idx ? c.filter((k) => k !== key) : c));
  frames.push({ ...blank(next), ...done,
    say: <>Unlink {K} from bucket {idx}'s chain. Its neighbours close the gap.</> });
  return frames;
}

/** Two frames that rehash every key with the other hash function. */
export function switchHashFrames(table: Table, bad: boolean): HtFrame[] {
  return [
    { ...blank(table), say: <>Same keys, new hash function. Rehashing everything…</> },
    { ...blank(build(table.flat(), table.length, bad)), hold: 1.6,
      say: bad ? (
        <>Length hash: every word with the same length collides. <span className="hl bad">Long chains = O(n) lookups.</span></>
      ) : (
        <>A good hash scatters keys evenly. <span className="hl ok">Short chains = O(1) lookups.</span></>
      ) },
  ];
}
