import { compile, runVm } from './bytecode';
import { SUM_SQUARES, treeWalk, type Value } from './lang';
import { runNative } from './native';

/**
 * The race between the four strategies is a cost model, not a benchmark: each strategy's
 * operations are counted by really running it (lang.ts, bytecode.ts, native.ts), then priced
 * with the illustrative per-operation costs below. Start-up of the runtime or the process is
 * left out of every lane, so the lanes compare only the work on this one function.
 */

/** Illustrative costs, in nanoseconds. */
export const COST = {
  /** Source text to AST, once per run (tree-walker, VM and JIT all parse). */
  parse: 50_000,
  /** AST to bytecode, once per run. */
  bytecodeCompile: 20_000,
  /** One AST node visit by the tree-walker: a recursive call that switches on the node type. */
  treeVisit: 6,
  /** One bytecode instruction: an array step and a switch. */
  vmOp: 2,
  /** One machine instruction. */
  nativeOp: 0.3,
  /** The JIT compiling the hot function to machine code (the pause). */
  jitCompile: 1_000_000,
  /** Throwing compiled code away and rebuilding the VM's state when a guard fails. */
  deopt: 20_000,
  /** An ahead-of-time compiler building the program before it ever runs. */
  aotBuild: 60_000_000,
} as const;

/** The JIT compiles once its counter (calls + loop iterations) reaches this. */
export const HOT_THRESHOLD = 100_000;

/** Above this many iterations, op counts are extrapolated from the measured per-iteration count. */
export const RUN_LIMIT = 10_000;

/** Every iteration of sumSquares runs the same operations, so a count is entry + perIter·n + exit. */
export interface Linear {
  entry: number;
  perIter: number;
  exit: number;
}

const FN = SUM_SQUARES;
const BYTECODE = compile(FN);

/** Measured from real runs at n = 1 and n = 2. */
function measure(run: (n: number) => { executed: number; entry: number }): Linear {
  const one = run(1);
  const two = run(2);
  const perIter = two.executed - one.executed;
  return { entry: one.entry, perIter, exit: one.executed - one.entry - perIter };
}

export const COUNTS = {
  tree: measure((n) => {
    const r = treeWalk(FN, n);
    return { executed: r.visits, entry: 0 };
  }),
  vm: measure((n) => runVm(BYTECODE, FN.param, n)),
  native: measure((n) => runNative(n)),
};

/** How many times the loop body runs for this argument: i goes 1, 2, … while i <= n. */
export function iterationsFor(arg: Value): number {
  const n = Number(arg);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 0;
}

export const linearCount = (c: Linear, iters: number) => c.entry + c.perIter * iters + c.exit;

/* ---------- lanes ---------- */

export type LaneId = 'tree' | 'vm' | 'jit' | 'aot';
export type SegKind = 'compile' | 'interp' | 'native' | 'deopt';

export interface Segment {
  kind: SegKind;
  start: number;
  end: number;
  /** Operations this segment executes, in its lane's unit. */
  ops: number;
  /** Loop iterations this segment completes. */
  iters: number;
  /** What it is: 'parse', 'JIT compile', 'call 2 in the VM'… */
  what: string;
  /** Call index (0-based) it belongs to, if any. */
  call?: number;
}

export interface Lane {
  id: LaneId;
  name: string;
  /** What `ops` counts. */
  unit: string;
  segments: Segment[];
  total: number;
  ops: number;
  /** Set when the lane can't run the workload at all (AOT and a string argument). */
  failed?: string;
}

export interface JitEvent {
  kind: 'hot' | 'deopt';
  at: number;
  call: number;
}

export interface Race {
  lanes: Lane[];
  jitEvents: JitEvent[];
  /** The JIT's hotness counter as a step function: [time, value] after each change. */
  counter: [number, number][];
}

export interface Workload {
  id: 'short' | 'long' | 'deopt';
  label: string;
  calls: Value[];
}

export const WORKLOADS: Workload[] = [
  { id: 'short', label: 'Short script · n = 10', calls: [10] },
  { id: 'long', label: 'Long server · n = 1,000,000', calls: [1_000_000] },
  { id: 'deopt', label: 'Deopt · 1M, then "3", then 1M', calls: [1_000_000, '3', 1_000_000] },
];

class LaneBuilder {
  t = 0;
  segments: Segment[] = [];
  readonly perOp: number;
  constructor(perOp: number) {
    this.perOp = perOp;
  }
  add(kind: SegKind, what: string, cost: number, ops = 0, iters = 0, call?: number) {
    const seg: Segment = { kind, what, start: this.t, end: this.t + cost, ops, iters, call };
    this.segments.push(seg);
    this.t = seg.end;
  }
  run(kind: 'interp' | 'native', what: string, ops: number, iters: number, call: number) {
    this.add(kind, what, ops * this.perOp, ops, iters, call);
  }
  lane(id: LaneId, name: string, unit: string, failed?: string): Lane {
    return { id, name, unit, segments: this.segments, total: this.t, ops: this.segments.reduce((a, s) => a + s.ops, 0), failed };
  }
}

const callName = (calls: readonly Value[], i: number) => `sumSquares(${typeof calls[i] === 'string' ? `"${calls[i]}"` : calls[i]})`;

function interpreterLane(id: 'tree' | 'vm', calls: readonly Value[]): Lane {
  const b = new LaneBuilder(id === 'tree' ? COST.treeVisit : COST.vmOp);
  const counts = id === 'tree' ? COUNTS.tree : COUNTS.vm;
  b.add('compile', 'parse', COST.parse);
  if (id === 'vm') b.add('compile', 'compile to bytecode', COST.bytecodeCompile);
  calls.forEach((arg, i) => {
    const iters = iterationsFor(arg);
    b.run('interp', callName(calls, i), linearCount(counts, iters), iters, i);
  });
  return id === 'tree' ? b.lane('tree', 'Tree-walker', 'AST nodes visited') : b.lane('vm', 'Bytecode VM', 'bytecode instructions');
}

function aotLane(calls: readonly Value[], countBuild: boolean): Lane {
  const b = new LaneBuilder(COST.nativeOp);
  const unit = 'machine instructions';
  const stringCall = calls.findIndex((c) => typeof c === 'string');
  if (countBuild || stringCall >= 0) b.add('compile', 'build (before the run)', COST.aotBuild);
  if (stringCall >= 0) {
    return b.lane('aot', 'AOT compiled', unit, `${callName(calls, stringCall)} is a type error: a statically typed AOT language such as Go or Rust rejects it at build time, so nothing runs`);
  }
  calls.forEach((arg, i) => {
    const iters = iterationsFor(arg);
    b.run('native', callName(calls, i), linearCount(COUNTS.native, iters), iters, i);
  });
  return b.lane('aot', 'AOT compiled', unit);
}

/**
 * Starts in the bytecode VM. The counter adds one per call and one per loop iteration; when it
 * reaches HOT_THRESHOLD mid-loop, the JIT compiles and the rest of that loop continues in machine
 * code (real JITs call that on-stack replacement). Machine code is guarded on "n is a number": a
 * string fails the guard, the code is thrown away (deoptimised), that call runs in the VM, and the
 * counter starts again from zero.
 */
function jitLane(calls: readonly Value[], events: JitEvent[], counter: [number, number][]): Lane {
  const vm = new LaneBuilder(COST.vmOp);
  vm.add('compile', 'parse', COST.parse);
  vm.add('compile', 'compile to bytecode', COST.bytecodeCompile);
  let hot = 0;
  let compiled = false;
  const bump = (by: number) => {
    hot += by;
    counter.push([vm.t, Math.min(hot, HOT_THRESHOLD)]);
  };
  counter.push([vm.t, 0]);
  calls.forEach((arg, i) => {
    const iters = iterationsFor(arg);
    const name = callName(calls, i);
    if (compiled) {
      const guarded = runNative(arg);
      if (!guarded.deopt) {
        vm.add('native', `${name} in machine code`, linearCount(COUNTS.native, iters) * COST.nativeOp, linearCount(COUNTS.native, iters), iters, i);
        return;
      }
      // The guard ran, failed and jumped out: those instructions, then the bail-out itself.
      vm.add('native', `${name}: the guard`, guarded.executed * COST.nativeOp, guarded.executed, 0, i);
      events.push({ kind: 'deopt', at: vm.t, call: i });
      vm.add('deopt', 'deoptimise', COST.deopt, 0, 0, i);
      compiled = false;
      hot = 0;
      counter.push([vm.t, 0]);
    }
    bump(1);
    const room = Math.max(0, HOT_THRESHOLD - hot);
    if (hot >= HOT_THRESHOLD || iters > room) {
      // Hot: the VM runs `room` iterations, then the loop carries on in machine code.
      const inVm = Math.min(room, iters);
      vm.run('interp', `${name} in the VM`, COUNTS.vm.entry + COUNTS.vm.perIter * inVm, inVm, i);
      bump(inVm);
      events.push({ kind: 'hot', at: vm.t, call: i });
      vm.add('compile', 'JIT compile', COST.jitCompile, 0, 0, i);
      compiled = true;
      const rest = iters - inVm;
      const nativeOps = COUNTS.native.perIter * rest + COUNTS.native.exit;
      vm.add('native', `${name} in machine code`, nativeOps * COST.nativeOp, nativeOps, rest, i);
    } else {
      vm.run('interp', `${name} in the VM`, linearCount(COUNTS.vm, iters), iters, i);
      bump(iters);
    }
  });
  return vm.lane('jit', 'JIT', 'VM + machine instructions');
}

export function race(workload: Workload, { countBuild }: { countBuild: boolean }): Race {
  const events: JitEvent[] = [];
  const counter: [number, number][] = [];
  const lanes = [interpreterLane('tree', workload.calls), interpreterLane('vm', workload.calls), jitLane(workload.calls, events, counter), aotLane(workload.calls, countBuild)];
  return { lanes, jitEvents: events, counter };
}

/* ---------- reading a race at a moment ---------- */

/** Operations a lane has done by time t (linear inside a segment). */
export function opsAt(lane: Lane, t: number): number {
  return lane.segments.reduce((sum, s) => sum + (t >= s.end ? s.ops : t <= s.start ? 0 : (s.ops * (t - s.start)) / (s.end - s.start)), 0);
}

export function itersAt(lane: Lane, t: number): number {
  return lane.segments.reduce((sum, s) => sum + (t >= s.end ? s.iters : t <= s.start ? 0 : (s.iters * (t - s.start)) / (s.end - s.start)), 0);
}

export function segmentAt(lane: Lane, t: number): Segment | null {
  return lane.segments.find((s) => t >= s.start && t < s.end) ?? null;
}

export function counterAt(r: Race, t: number): number {
  let v = 0;
  for (const [at, value] of r.counter) if (at <= t) v = value;
  return v;
}

/**
 * The live counter between steps: inside a VM segment it climbs with the iterations done.
 * (The counter table only records the value at the end of each segment.)
 */
export function liveCounterAt(r: Race, t: number): number {
  const jit = r.lanes.find((l) => l.id === 'jit')!;
  const seg = segmentAt(jit, t);
  const base = counterAt(r, seg ? seg.start : t);
  if (!seg || seg.kind !== 'interp') return base;
  const done = (seg.iters * (t - seg.start)) / (seg.end - seg.start);
  return Math.min(HOT_THRESHOLD, base + done);
}

/* ---------- crossover ---------- */

/** Single-call totals for n, from the same lane builders the race uses. */
export function singleCallTotals(n: number, countBuild = true): Record<LaneId, number> {
  const r = race({ id: 'long', label: '', calls: [n] }, { countBuild });
  return Object.fromEntries(r.lanes.map((l) => [l.id, l.total])) as Record<LaneId, number>;
}

/** The smallest n (searched by doubling, then bisection) from which `a` is faster than `b`. */
export function crossover(a: LaneId, b: LaneId, countBuild = true, limit = 1e9): number | null {
  const faster = (n: number) => {
    const t = singleCallTotals(n, countBuild);
    return t[a] < t[b];
  };
  let hi = 1;
  while (!faster(hi)) {
    hi *= 2;
    if (hi > limit) return null;
  }
  let lo = Math.floor(hi / 2);
  if (lo < 1 || faster(lo)) return lo < 1 ? hi : lo;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (faster(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** Three significant figures in the right unit: '50.8 µs', '5.02 ms'. */
export function fmtTime(ns: number): string {
  const [v, u] = ns >= 1e9 ? [ns / 1e9, 's'] : ns >= 1e6 ? [ns / 1e6, 'ms'] : ns >= 1e3 ? [ns / 1e3, 'µs'] : [ns, 'ns'];
  return `${Number(v.toPrecision(3))} ${u}`;
}

export const fmtCount = (n: number) => Math.round(n).toLocaleString('en-US');
