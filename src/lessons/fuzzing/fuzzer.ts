/**
 * Two toy fuzzers for the lesson's own target: a BLIND one (fresh random bytes every time) and a
 * COVERAGE-GUIDED one (keep an input when it reaches a branch edge not seen before, then mutate kept inputs).
 * Both are deterministic from a seed. They only ever call `runTarget`: nothing here touches a real program.
 */
import { mulberry32, pick, randInt, type Rnd } from '../../core/random';
import { BRANCH, edgesOf, runTarget, type BranchId, type Outcome, type TargetOptions } from './target';

export type FuzzerKind = 'blind' | 'guided';

/** Slider range of the executions budget (the spec's 100 to 20,000). */
export const MIN_EXECUTIONS = 100;
export const MAX_EXECUTIONS = 20_000;
export const DEFAULT_EXECUTIONS = 20_000;

/** The corpus both fuzzers start from: one input of four zero bytes, which is not a valid record. */
export const SEED_INPUT: readonly number[] = [0, 0, 0, 0];
/** Blind inputs are random bytes of a random length up to this. */
export const BLIND_MAX_LENGTH = 16;
/** Share of executions that mutate the newest corpus entry (the one that just found something) instead of a uniform pick. */
export const NEWEST_BIAS = 0.5;
/** A mutated input never grows past this (under the target's MAX_INPUT_BYTES). */
export const MUTANT_MAX_LENGTH = 40;
/** Between 1 and this many mutations are stacked on one corpus member. */
export const MAX_STACKED_MUTATIONS = 3;
/** Share of executions that apply a single mutation; the rest stack 2 to MAX_STACKED_MUTATIONS. */
const SINGLE_MUTATION_SHARE = 0.5;

/** Values a byte-replace picks from besides uniform random: boundary values and printable ASCII, as real mutators and dictionaries do. */
const INTERESTING_BYTES = [0, 1, 16, 32, 64, 127, 128, 255] as const;
const PRINTABLE_FIRST = 0x20;
const PRINTABLE_LAST = 0x7e;
/** Of the byte-replace values: this share is a boundary value, this share is printable ASCII, the rest is uniform random. */
const INTERESTING_SHARE = 0.15;
const PRINTABLE_SHARE = 0.6;

export type MutatorName = 'bit flip' | 'byte replace' | 'insert' | 'delete' | 'splice';
const MUTATORS: readonly MutatorName[] = ['bit flip', 'byte replace', 'insert', 'delete', 'splice'];

export interface CorpusEntry {
  id: number;
  /** The corpus entry it was mutated from (null for the seed). */
  parent: number | null;
  bytes: number[];
  /** Execution number (1-based) that produced it; 0 for the seed. */
  at: number;
  /** The edges it reached that nothing before it had. */
  newEdges: number[];
  /** The mutations applied, in order. */
  mutations: MutatorName[];
}

export interface CrashRecord {
  at: number;
  bytes: number[];
  site: BranchId;
}

export type FuzzEvent = { at: number; kind: 'new-coverage'; edges: number[] } | { at: number; kind: 'crash'; site: BranchId };

export interface FuzzOptions {
  kind: FuzzerKind;
  seed: number;
  executions: number;
  target: TargetOptions;
  /** Called with every input the fuzzer executes, in order (the tests replay them independently). */
  observe?: (bytes: readonly number[]) => void;
}

export interface FuzzResult {
  executions: number;
  /** Edges covered after each execution, indexed by execution number minus one. */
  coverage: Uint16Array;
  edges: Set<number>;
  corpus: CorpusEntry[];
  crashes: CrashRecord[];
  events: FuzzEvent[];
  /** Execution at which the magic bytes were first accepted (null if never). */
  magicAt: number | null;
  /** The first execution that crashed (null if none). */
  firstCrashAt: number | null;
  /** Executions that read past the end of the input, thrown or not. */
  overReadRuns: number;
}

function mutate(input: readonly number[], corpus: readonly CorpusEntry[], rnd: Rnd): { bytes: number[]; applied: MutatorName[] } {
  let bytes = [...input];
  const applied: MutatorName[] = [];
  const count = rnd() < SINGLE_MUTATION_SHARE ? 1 : randInt(2, MAX_STACKED_MUTATIONS, rnd);
  for (let k = 0; k < count; k++) {
    const m = pick(MUTATORS, rnd);
    applied.push(m);
    if (m === 'bit flip' && bytes.length > 0) {
      bytes[randInt(0, bytes.length - 1, rnd)] ^= 1 << randInt(0, 7, rnd);
    } else if (m === 'byte replace' && bytes.length > 0) {
      const roll = rnd();
      const value = roll < INTERESTING_SHARE ? pick(INTERESTING_BYTES, rnd) : roll < INTERESTING_SHARE + PRINTABLE_SHARE ? randInt(PRINTABLE_FIRST, PRINTABLE_LAST, rnd) : randInt(0, 255, rnd);
      bytes[randInt(0, bytes.length - 1, rnd)] = value;
    } else if (m === 'insert' && bytes.length < MUTANT_MAX_LENGTH) {
      bytes.splice(randInt(0, bytes.length, rnd), 0, randInt(0, 255, rnd));
    } else if (m === 'delete' && bytes.length > 1) {
      bytes.splice(randInt(0, bytes.length - 1, rnd), 1);
    } else if (m === 'splice') {
      const other = pick(corpus, rnd).bytes;
      bytes = [...bytes.slice(0, randInt(0, bytes.length, rnd)), ...other.slice(randInt(0, other.length, rnd))].slice(0, MUTANT_MAX_LENGTH);
    }
  }
  return { bytes: bytes.map((b) => b & 0xff), applied };
}

/** Random bytes of a random length: what the blind fuzzer tries every time. */
export function blindInput(rnd: Rnd): number[] {
  return Array.from({ length: randInt(0, BLIND_MAX_LENGTH, rnd) }, () => randInt(0, 255, rnd));
}

export function runFuzz({ kind, seed, executions, target, observe }: FuzzOptions): FuzzResult {
  const rnd = mulberry32(seed);
  const edges = new Set<number>();
  const coverage = new Uint16Array(executions);
  const corpus: CorpusEntry[] = [];
  const crashes: CrashRecord[] = [];
  const events: FuzzEvent[] = [];
  let magicAt: number | null = null;
  let firstCrashAt: number | null = null;
  let overReadRuns = 0;

  const addEdges = (path: readonly number[]): number[] => {
    const fresh: number[] = [];
    for (const e of edgesOf(path)) {
      if (!edges.has(e)) {
        edges.add(e);
        fresh.push(e);
      }
    }
    return fresh;
  };
  const seedRun = runTarget(SEED_INPUT, target);
  corpus.push({ id: 0, parent: null, bytes: [...SEED_INPUT], at: 0, newEdges: addEdges(seedRun.path), mutations: [] });

  for (let at = 1; at <= executions; at++) {
    let bytes: number[];
    let parent: CorpusEntry | null = null;
    let mutations: MutatorName[] = [];
    if (kind === 'blind') {
      bytes = blindInput(rnd);
    } else {
      parent = rnd() < NEWEST_BIAS ? corpus[corpus.length - 1] : pick(corpus, rnd);
      ({ bytes, applied: mutations } = mutate(parent.bytes, corpus, rnd));
    }
    observe?.(bytes);
    const run = runTarget(bytes, target);
    if (run.overReads > 0) overReadRuns++;
    const fresh = addEdges(run.path);
    if (magicAt === null && run.path.includes(BRANCH.magicOk)) magicAt = at;
    if (fresh.length > 0) {
      events.push({ at, kind: 'new-coverage', edges: fresh });
      if (kind === 'guided' && parent) corpus.push({ id: corpus.length, parent: parent.id, bytes, at, newEdges: fresh, mutations });
    }
    if (run.outcome.kind === 'crash') {
      crashes.push({ at, bytes, site: run.outcome.site });
      firstCrashAt ??= at;
      events.push({ at, kind: 'crash', site: run.outcome.site });
    }
    coverage[at - 1] = edges.size;
  }
  return { executions, coverage, edges, corpus, crashes, events, magicAt, firstCrashAt, overReadRuns };
}

/** Crashes grouped by the branch that threw: the "few buckets" a triager looks at. */
export function bucketCrashes(crashes: readonly CrashRecord[]): { site: BranchId; count: number; first: CrashRecord }[] {
  const buckets = new Map<BranchId, { site: BranchId; count: number; first: CrashRecord }>();
  for (const c of crashes) {
    const b = buckets.get(c.site);
    if (b) b.count++;
    else buckets.set(c.site, { site: c.site, count: 1, first: c });
  }
  return [...buckets.values()].sort((a, b) => a.site - b.site);
}

export const describeOutcome = (o: Outcome): string => (o.kind === 'crash' ? `crash at b${o.site}` : o.kind === 'accepted' ? 'accepted' : `rejected (${o.reason})`);
