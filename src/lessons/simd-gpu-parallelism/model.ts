/**
 * The toy models behind the SIMD and GPU lesson: a lane/tail cycle model, a loop-carried
 * dependence checked by running both loops, GPU warp divergence, and latency hiding on the
 * shared tick sim. One instruction per cycle, no pipelining, no cache: a roofline-style toy.
 */
import { parseBoundedInt, type FieldParse } from '../../core/parse';
import { createTickSim, type TickSim } from '../../core/simTick';
import { mulberry32 } from '../../core/random';

// ── lanes and tails ──────────────────────────────────────────────────────

export const ELEMENT_BITS = 32;
/** `c[i] = a[i] + b[i]` moves two 32-bit loads and one 32-bit store per element. */
export const BYTES_PER_ELEMENT = 12;
export const N_RANGE = { min: 1, max: 64 } as const;
export const DEFAULT_N = 20;

const N_RANGE_MESSAGE = `Keep it between ${N_RANGE.min} and ${N_RANGE.max}.`;
/** The array-length field: a whole number from 1 to 64, or the sentence to show instead (decimals, `1e3` and empty text are refused). */
export const parseN = (text: string): FieldParse<number> =>
  parseBoundedInt(text, {
    ...N_RANGE,
    messages: {
      empty: `Type a number of elements, ${N_RANGE.min} to ${N_RANGE.max}.`,
      tooSmall: () => N_RANGE_MESSAGE,
      tooBig: () => N_RANGE_MESSAGE,
    },
  });

/** Register widths in bits; 32 is the scalar baseline (one lane). */
export const REGISTER_BITS = [32, 128, 256, 512] as const;
export type RegisterBits = (typeof REGISTER_BITS)[number];
export const DEFAULT_BITS: RegisterBits = 256;
export const lanesOf = (bits: number): number => bits / ELEMENT_BITS;

/** Memory bandwidth choices, bytes per cycle (a toy), and the slider's exponent range. */
export const BANDWIDTHS = [4, 8, 16, 32, 64] as const;
export const DEFAULT_BANDWIDTH = 64;

export type TailMode = 'scalar' | 'masked';

/** One instruction the loop emits: which elements it touches and how many lanes the instruction has. */
export interface Instr {
  kind: 'vector' | 'tail' | 'masked';
  from: number;
  /** Elements actually handled. */
  active: number;
  /** Lanes the instruction occupies (a masked op occupies all of them). */
  lanes: number;
}

/** The instructions of `for i: c[i] = a[i] + b[i]` over n elements at `lanes` lanes, in order. */
export function emit(n: number, lanes: number, tail: TailMode): Instr[] {
  const out: Instr[] = [];
  let i = 0;
  while (i + lanes <= n) {
    out.push({ kind: 'vector', from: i, active: lanes, lanes });
    i += lanes;
  }
  if (i < n && tail === 'masked') out.push({ kind: 'masked', from: i, active: n - i, lanes });
  else for (; i < n; i++) out.push({ kind: 'tail', from: i, active: 1, lanes: 1 });
  return out;
}

export type Bound = 'compute' | 'memory' | 'balanced';

export interface CycleReport {
  instrs: Instr[];
  vectorOps: number;
  tailElements: number;
  compute: number;
  memory: number;
  cycles: number;
  bound: Bound;
}

/** Compute cycles are instructions issued; memory cycles are the bytes moved over the bandwidth. Cycles = the larger. */
export function cycleReport(n: number, bits: number, tail: TailMode, bandwidth: number): CycleReport {
  const lanes = lanesOf(bits);
  const instrs = emit(n, lanes, tail);
  const compute = instrs.length;
  const memory = Math.ceil((instrs.reduce((s, ins) => s + ins.active, 0) * BYTES_PER_ELEMENT) / bandwidth);
  const cycles = Math.max(compute, memory);
  return {
    instrs,
    vectorOps: instrs.filter((i) => i.kind === 'vector').length,
    tailElements: n - instrs.filter((i) => i.kind === 'vector').length * lanes,
    compute,
    memory,
    cycles,
    bound: compute > memory ? 'compute' : memory > compute ? 'memory' : 'balanced',
  };
}

/** The next register width up the picker, or null at the top. */
export const nextWider = (bits: RegisterBits): RegisterBits | null => REGISTER_BITS[REGISTER_BITS.indexOf(bits) + 1] ?? null;

// ── loop-carried dependence ──────────────────────────────────────────────

export const DEP_LENGTH = 24;
export const D_RANGE = { min: 1, max: 8 } as const;
export const DEFAULT_D = 4;
/** Vector widths the dependence scene offers, in lanes. */
export const DEP_WIDTHS = [1, 4, 8, 16] as const;

/** The loop's starting array: distinct multiples of ten, so a stale read can never match by luck. */
export const depInput = (): number[] => Array.from({ length: DEP_LENGTH }, (_, i) => 10 * ((i * 5 + 3) % DEP_LENGTH));

/** `for i = d..n-1: a[i] = a[i - d] + 1`, one element at a time. */
export function runScalar(a: readonly number[], d: number): number[] {
  const out = a.slice();
  for (let i = d; i < out.length; i++) out[i] = out[i - d] + 1;
  return out;
}

export interface Chunk {
  start: number;
  /** Elements this chunk handles (the last one may be short). */
  size: number;
  readFrom: number;
  readTo: number;
  writeFrom: number;
  writeTo: number;
  /** Indices the chunk reads that it also writes: read before the same chunk wrote them. */
  staleReads: number[];
}

export interface VectorRun {
  chunks: Chunk[];
  /** states[k] is the array after k chunks. */
  states: number[][];
}

/** The loop as hardware runs it at `width` lanes: read `width` elements, add one, write `width` elements. */
export function runVector(a: readonly number[], d: number, width: number): VectorRun {
  let cur = a.slice();
  const states = [cur];
  const chunks: Chunk[] = [];
  for (let start = d; start < a.length; start += width) {
    const size = Math.min(width, a.length - start);
    const read = Array.from({ length: size }, (_, k) => cur[start + k - d]);
    const next = cur.slice();
    read.forEach((v, k) => {
      next[start + k] = v + 1;
    });
    const staleReads = Array.from({ length: size }, (_, k) => start + k - d).filter((j) => j >= start && j < start + size);
    chunks.push({ start, size, readFrom: start - d, readTo: start - d + size - 1, writeFrom: start, writeTo: start + size - 1, staleReads });
    cur = next;
    states.push(cur);
  }
  return { chunks, states };
}

export interface DepVerdict {
  vectorisable: boolean;
  scalar: number[];
  vector: number[];
  /** Indices whose vector result differs from the scalar loop. */
  wrong: number[];
  firstWrong: number | null;
}

/** Runs both loops and compares them element by element: "vectorisable" is what the comparison finds. */
export function depVerdict(a: readonly number[], d: number, width: number): DepVerdict {
  const scalar = runScalar(a, d);
  const run = runVector(a, d, width);
  const vector = run.states[run.states.length - 1];
  const wrong = scalar.flatMap((v, i) => (v === vector[i] ? [] : [i]));
  return { vectorisable: wrong.length === 0, scalar, vector, wrong, firstWrong: wrong[0] ?? null };
}

// ── warp divergence ──────────────────────────────────────────────────────

export const WARP_SIZE = 32;
export const PATH_A_COST = 6;
export const PATH_B_COST = 4;
export const TRIP_MAX = 64;

export type Predicate = readonly boolean[];

export interface BranchReport {
  aLanes: number;
  bLanes: number;
  /** Instructions the warp issues: A when any lane takes it, then B when any lane takes it. */
  issued: number;
  /** Lane-slots that did useful work over lane-slots issued. */
  utilisation: number;
}

export function branchReport(pred: Predicate): BranchReport {
  const aLanes = pred.filter(Boolean).length;
  const bLanes = pred.length - aLanes;
  const issued = (aLanes > 0 ? PATH_A_COST : 0) + (bLanes > 0 ? PATH_B_COST : 0);
  const useful = aLanes * PATH_A_COST + bLanes * PATH_B_COST;
  return { aLanes, bLanes, issued, utilisation: useful / (pred.length * issued) };
}

export interface BranchPreset {
  id: string;
  label: string;
  pred: Predicate;
}

const lanes32 = (f: (lane: number) => boolean): boolean[] => Array.from({ length: WARP_SIZE }, (_, i) => f(i));
export const BRANCH_PRESETS: BranchPreset[] = [
  { id: 'all', label: 'all true', pred: lanes32(() => true) },
  { id: 'even', label: 'even lanes', pred: lanes32((i) => i % 2 === 0) },
  { id: 'one', label: 'one lane', pred: lanes32((i) => i === 0) },
  { id: 'half', label: 'first half', pred: lanes32((i) => i < WARP_SIZE / 2) },
];
export const DEFAULT_PRED: Predicate = BRANCH_PRESETS[3].pred;

/** The loop `for (k = 0; k < n[lane]; k++) work`: the warp runs until its longest lane is done. */
export interface TripReport {
  total: number;
  longest: number;
  /** Lockstep steps the warp issues: the longest lane's count. */
  issued: number;
  /** Useful lane-slots over issued lane-slots; null when no lane has any work. */
  utilisation: number | null;
}

export function tripReport(trips: readonly number[]): TripReport {
  const total = trips.reduce((s, n) => s + n, 0);
  const longest = Math.max(...trips);
  return { total, longest, issued: longest, utilisation: longest === 0 ? null : total / (trips.length * longest) };
}

export const TRIP_PRESETS: { id: string; label: string; trips: number[] }[] = [
  { id: 'equal', label: 'all equal (8)', trips: Array.from({ length: WARP_SIZE }, () => 8) },
  { id: 'one-long', label: 'one long lane', trips: Array.from({ length: WARP_SIZE }, (_, i) => (i === 0 ? 32 : 4)) },
  { id: 'ramp', label: 'a ramp', trips: Array.from({ length: WARP_SIZE }, (_, i) => 1 + (i % 16)) },
  { id: 'seeded', label: 'seeded random', trips: seededTrips(7) },
];
export const DEFAULT_TRIPS = TRIP_PRESETS[1].trips;

/** Trip counts 1..16 from a seed, so the "random" preset is the same every visit. */
export function seededTrips(seed: number): number[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: WARP_SIZE }, () => 1 + Math.floor(rnd() * 16));
}

export type TripParse = { ok: true; trips: number[] } | { ok: false; error: string };

/** A typed list of 32 trip counts, each a whole number from 0 to 64, or the sentence to show instead. */
export function parseTrips(text: string): TripParse {
  const parts = text.split(/[\s,]+/).filter(Boolean);
  if (parts.length === 0) return { ok: false, error: `Type ${WARP_SIZE} trip counts, one for each lane.` };
  if (parts.length !== WARP_SIZE) return { ok: false, error: `A warp has ${WARP_SIZE} lanes, so type exactly ${WARP_SIZE} counts (you typed ${parts.length}).` };
  const trips: number[] = [];
  for (const p of parts) {
    if (!/^-?\d+$/.test(p)) return { ok: false, error: `"${p}" isn't a whole number.` };
    const v = Number(p);
    if (v < 0) return { ok: false, error: "A trip count can't be negative." };
    if (v > TRIP_MAX) return { ok: false, error: `A trip count goes up to ${TRIP_MAX}.` };
    trips.push(v);
  }
  return { ok: true, trips };
}

// ── latency hiding ───────────────────────────────────────────────────────

export const HIDE = {
  warps: { min: 1, max: 16 },
  stall: { min: 10, max: 100, step: 10 },
  compute: { min: 1, max: 8 },
} as const;
export const DEFAULT_HIDE = { warps: 4, stall: 40, compute: 4 };
export const HIDE_SEED = 1;
export const STALL_CURVES = [10, 40, 100] as const;
/** The Gantt shows this many ticks; steady-state utilisation is read from the window after warm-up. */
export const GANTT_TICKS = 60;
export const WARMUP_TICKS = 200;
export const WINDOW_TICKS = 1000;

export interface HideParams {
  warps: number;
  stall: number;
  compute: number;
}

export type WarpStatus = 'run' | 'wait' | 'stall';
interface WarpState {
  /** Compute ticks left in the current burst, or stall ticks left while waiting for memory. */
  left: number;
  stalled: boolean;
}
export interface HideState {
  warps: WarpState[];
  /** The warp that issued this tick, or -1 when the issue slot sat idle. */
  issued: number;
  /** The warp that issued most recently (kept across idle ticks): it keeps the slot while it can run. */
  last: number;
  /** What each warp did this tick. */
  status: WarpStatus[];
  /** Ticks (so far) in which an instruction issued. */
  issuedTicks: number;
}

export function hideInit(p: HideParams): HideState {
  return {
    warps: Array.from({ length: p.warps }, () => ({ left: p.compute, stalled: false })),
    issued: -1,
    last: -1,
    status: Array.from({ length: p.warps }, () => 'wait'),
    issuedTicks: 0,
  };
}

/**
 * One tick, greedy then round-robin: the warp that issued last keeps the slot while it can run, else the
 * next ready warp after it takes over, and stalled warps count down. (A toy scheduler, not any real GPU's.)
 */
export function hideStep(s: HideState, p: HideParams): HideState {
  const warps = s.warps.map((w) => ({ ...w }));
  const status: WarpStatus[] = warps.map((w) => (w.stalled ? 'stall' : 'wait'));
  let issued = -1;
  for (let k = 0; k < warps.length && issued < 0; k++) {
    const w = (Math.max(s.last, 0) + k) % warps.length;
    if (!warps[w].stalled) issued = w;
  }
  warps.forEach((w, i) => {
    if (i === issued) {
      status[i] = 'run';
      w.left -= 1;
      if (w.left === 0) {
        w.stalled = true;
        w.left = p.stall;
      }
    } else if (w.stalled) {
      w.left -= 1;
      if (w.left === 0) {
        w.stalled = false;
        w.left = p.compute;
      }
    }
  });
  return { warps, issued, last: issued >= 0 ? issued : s.last, status, issuedTicks: s.issuedTicks + (issued >= 0 ? 1 : 0) };
}

/** A tick sim of the warp scheduler (the seed fixes the trace; this model has no randomness of its own). */
export function createHideSim(p: HideParams, seed = HIDE_SEED): TickSim<HideState> {
  return createTickSim<HideState>({
    seed,
    init: () => hideInit(p),
    step: (s) => hideStep(s, p),
  });
}

/** Fraction of ticks in [from, to) in which an instruction issued, read from a sim's history. */
export function windowUtilisation(sim: TickSim<HideState>, from: number, to: number): number {
  sim.at(to);
  return (sim.history[to].issuedTicks - sim.history[from].issuedTicks) / (to - from);
}

/** Utilisation after warm-up over the steady window, from running the scheduler (no history kept: the sweep calls this many times). */
export function steadyUtilisation(p: HideParams): number {
  let s = hideInit(p);
  let atWarmup = 0;
  for (let t = 1; t <= WARMUP_TICKS + WINDOW_TICKS; t++) {
    s = hideStep(s, p);
    if (t === WARMUP_TICKS) atWarmup = s.issuedTicks;
  }
  return (s.issuedTicks - atWarmup) / WINDOW_TICKS;
}

/** The formula the run is checked against: a warp keeps the slot busy c of every c + L ticks, so W warps give W c / (c + L), up to 1. */
export const idealUtilisation = (p: HideParams): number => Math.min(1, (p.warps * p.compute) / (p.compute + p.stall));

/** Warps needed to keep the slot busy: the compute burst plus the stall, over the burst, rounded up. */
export const warpsToHide = (compute: number, stall: number): number => Math.ceil((compute + stall) / compute);

export interface GanttSegment {
  warp: number;
  start: number;
  end: number;
  status: WarpStatus;
}

/** The first `ticks` ticks as merged per-warp segments, for the lane Gantt. */
export function hideSegments(sim: TickSim<HideState>, ticks: number): GanttSegment[] {
  sim.at(ticks);
  const out: GanttSegment[] = [];
  const warps = sim.history[0].warps.length;
  for (let w = 0; w < warps; w++) {
    let open: GanttSegment | null = null;
    for (let t = 1; t <= ticks; t++) {
      const status = sim.history[t].status[w];
      if (open && open.status === status) open.end = t;
      else {
        open = { warp: w, start: t - 1, end: t, status };
        out.push(open);
      }
    }
  }
  return out;
}
