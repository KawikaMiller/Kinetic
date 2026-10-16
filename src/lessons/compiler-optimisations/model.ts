/** What each scene shows, computed from the IR, the passes and the interpreter: the scenes only draw it. */
import { lineDiff, type LineDiff } from '../../core/lineDiff';
import { defOf, listing, run, staticCount, usesOf, type Listing, type Program, type RunResult } from './ir';
import { ADDR } from './opening';
import { forwardLoads, optimiseLoop, runPipeline, type LoopOptions, type PassId, type Pipeline, type PassResult } from './passes';
import { ALIAS_PROGRAM, LEFT_ASSOC, loopProgram, P1, RIGHT_ASSOC, SSA_PROGRAM, ssaSourceResult, timesZero } from './programs';

export interface Compared {
  before: Program;
  after: Program;
  beforeListing: Listing;
  afterListing: Listing;
  diff: LineDiff;
  beforeRun: RunResult;
  afterRun: RunResult;
  /** The optimised program returned what the original returned (Object.is, so NaN equals NaN and 0 differs from -0). */
  same: boolean;
}

export function compare(before: Program, after: Program, args: number[]): Compared {
  const beforeListing = listing(before);
  const afterListing = listing(after);
  const beforeRun = run(before, args);
  const afterRun = run(after, args);
  return {
    before, after, beforeListing, afterListing,
    diff: lineDiff(beforeListing.lines, afterListing.lines),
    beforeRun, afterRun,
    same: Object.is(beforeRun.value, afterRun.value),
  };
}

/* ---------- the SSA scene ---------- */

export interface SsaView {
  sourceResult: number;
  ssaResult: number;
  listing: Listing;
  /** For a name: the one line that defines it and the lines that read it. */
  where: (name: string) => { def: number | null; uses: number[] };
}

export function ssaView(branchTaken: boolean): SsaView {
  const c = branchTaken ? 1 : 0;
  const l = listing(SSA_PROGRAM);
  const where = (name: string) => {
    const defs: number[] = [];
    const uses: number[] = [];
    SSA_PROGRAM.blocks.forEach((b, bi) =>
      b.instrs.forEach((i, ii) => {
        if (defOf(i) === name) defs.push(l.at(bi, ii));
        if (usesOf(i).includes(name)) uses.push(l.at(bi, ii));
      }),
    );
    return { def: defs.length === 1 ? defs[0] : null, uses };
  };
  return { sourceResult: ssaSourceResult(c), ssaResult: run(SSA_PROGRAM, [c]).value, listing: l, where };
}

/* ---------- the pass scene ---------- */

export interface PassView extends Compared {
  pipeline: Pipeline;
  /** The ordered passes that are switched on. */
  active: PassId[];
}

export function passView(order: readonly PassId[], enabled: ReadonlySet<PassId>, fixedPoint: boolean, input: number): PassView {
  const active = order.filter((p) => enabled.has(p));
  const pipeline = runPipeline(P1, active, fixedPoint);
  return { ...compare(P1, pipeline.program, [input]), pipeline, active };
}

/** The number of instructions a pass changed in the first round, by pass. */
export const firstRoundChanges = (v: PassView): Partial<Record<PassId, number>> =>
  Object.fromEntries((v.pipeline.rounds[0]?.steps ?? []).map((s) => [s.pass, s.changed]));

/* ---------- the loop scene ---------- */

export interface LoopView extends Compared {
  hoisted: string[];
  blocker: string | null;
  /** Instructions executed per extra iteration, read off the interpreter, and the same for the original. */
  perIterationBefore: number;
  perIterationAfter: number;
  /** Instructions executed when the loop runs zero times. */
  zeroTripBefore: number;
  zeroTripAfter: number;
}

const perIteration = (p: Program, x: number) => run(p, [x, 2]).executed - run(p, [x, 1]).executed;

export function loopView(options: LoopOptions, resultUsed: boolean, x: number, n: number): LoopView {
  const before = loopProgram(resultUsed);
  const optimised = optimiseLoop(before, options);
  return {
    ...compare(before, optimised.program, [x, n]),
    hoisted: optimised.hoisted,
    blocker: optimised.blocker,
    perIterationBefore: perIteration(before, x),
    perIterationAfter: perIteration(optimised.program, x),
    zeroTripBefore: run(before, [x, 0]).executed,
    zeroTripAfter: run(optimised.program, [x, 0]).executed,
  };
}

/* ---------- the refusals scene ---------- */

export interface AliasCell {
  promise: boolean;
  same: boolean;
  original: number;
  optimised: number;
  agree: boolean;
}

export interface AliasView {
  pass: PassResult;
  compared: Compared;
  /** All four cells, promise off then on, distinct then same. */
  cells: AliasCell[];
}

const aliasArgs = (same: boolean) => [ADDR.p, same ? ADDR.p : ADDR.q];

export function aliasView(same: boolean, promise: boolean): AliasView {
  const pass = forwardLoads(ALIAS_PROGRAM, { noAlias: promise });
  const cells = [false, true].flatMap((p) =>
    [false, true].map((s) => {
      const optimised = forwardLoads(ALIAS_PROGRAM, { noAlias: p }).program;
      const original = run(ALIAS_PROGRAM, aliasArgs(s)).value;
      const got = run(optimised, aliasArgs(s)).value;
      return { promise: p, same: s, original, optimised: got, agree: original === got };
    }),
  );
  return { pass, compared: compare(ALIAS_PROGRAM, pass.program, aliasArgs(same)), cells };
}

export interface FloatRow {
  x: number;
  /** What real JavaScript gives for x * 0 at the chosen type. */
  actual: number;
  /** What folding to 0 would give. */
  folded: 0;
  agree: boolean;
}

export const floatRow = (ty: 'i32' | 'f64', x: number): FloatRow => {
  const actual = run(timesZero(ty), [x]).value;
  return { x, actual, folded: 0, agree: Object.is(actual, 0) };
};

/** How a number prints, keeping -0 and NaN visible. */
export const show = (v: number): string => (Object.is(v, -0) ? '-0' : String(v));

export function reassocView(a: number, b: number, c: number) {
  const left = run(LEFT_ASSOC, [a, b, c]).value;
  const right = run(RIGHT_ASSOC, [a, b, c]).value;
  return { left, right, differ: !Object.is(left, right) };
}

/** Static and executed counts of a compared pair, for the stat rows. */
export const counts = (c: Compared) => ({
  staticBefore: staticCount(c.before),
  staticAfter: staticCount(c.after),
  executedBefore: c.beforeRun.executed,
  executedAfter: c.afterRun.executed,
});
