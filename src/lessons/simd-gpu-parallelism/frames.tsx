import type { ReactNode } from 'react';
import { pctText, plural, sig, times } from '../../core/format';
import { timeFrames, type TimedFrame } from '../../core/frames';
import type { Frame } from '../../core/types';
import type { TickSim } from '../../core/simTick';
import {
  ELEMENT_BITS, GANTT_TICKS, PATH_A_COST, PATH_B_COST, WARP_SIZE, branchReport, cycleReport, lanesOf, nextWider, tripReport, warpsToHide,
  type Bound, type Chunk, type CycleReport, type DepVerdict, type HideParams, type HideState, type Predicate, type RegisterBits, type TailMode, type VectorRun,
} from './model';

const range = (a: number, b: number) => (a === b ? `${a}` : `${a} to ${b}`);

/** The register, as the division the lesson shows: "256 / 32 = 8 lanes". */
export const laneDivision = (bits: number): string => `${bits} / ${ELEMENT_BITS} = ${plural(lanesOf(bits), 'lane')}`;

const tailText = (r: CycleReport, tail: TailMode): string => {
  if (r.tailElements === 0) return 'no tail';
  return tail === 'scalar' ? `a ${r.tailElements}-element tail, one element at a time` : `one masked op for the ${r.tailElements}-element tail`;
};

/** Which resource binds, derived from the two cycle counts and the next wider register's own cost. */
export function boundSentence(r: CycleReport, wider: CycleReport | null): string {
  const bound: Bound = r.bound;
  if (bound === 'compute') return `compute-bound: the ${plural(r.compute, 'instruction')} take longer than the ${plural(r.memory, 'cycle')} memory needs`;
  if (bound === 'balanced') return `balanced: compute and memory both take ${plural(r.cycles, 'cycle')}`;
  const next = wider
    ? `the next wider register would cost ${plural(wider.cycles, 'cycle')}, not fewer`
    : 'this is already the widest register';
  return `memory-bound: wider lanes stopped helping, since memory needs ${plural(r.memory, 'cycle')} at any width and ${next}`;
}

export interface LaneFrame extends Frame {
  /** Instructions executed so far; the one just executed is `done - 1`. */
  done: number;
}

export function lanesIntro(n: number, bits: RegisterBits, r: CycleReport, tail: TailMode): ReactNode {
  return (
    <>
      {plural(n, 'float')}, and the loop <code>c[i] = a[i] + b[i]</code>. A {bits}-bit register holds {laneDivision(bits)}, so one instruction handles {plural(lanesOf(bits), 'element')} at once.
      The loop issues {plural(r.vectorOps, 'vector op')} and {tailText(r, tail)}.
    </>
  );
}

export function lanesSummary(n: number, bits: RegisterBits, tail: TailMode, bandwidth: number, r: CycleReport): ReactNode {
  const scalar = cycleReport(n, ELEMENT_BITS, tail, bandwidth);
  const wider = nextWider(bits);
  const widerReport = wider ? cycleReport(n, wider, tail, bandwidth) : null;
  return (
    <>
      <span className="hl">{plural(r.compute, 'instruction')}</span> of compute against <span className="hl info">{plural(r.memory, 'cycle')}</span> of memory, so{' '}
      <span className="hl ok">{plural(r.cycles, 'cycle')}</span>: {boundSentence(r, widerReport)}. One lane at a time takes {plural(scalar.cycles, 'cycle')}, so this is{' '}
      {times(sig(scalar.cycles / r.cycles, 3))}.
    </>
  );
}

export function lanesStep(k: number, total: number, r: CycleReport): ReactNode {
  const ins = r.instrs[k - 1];
  const where = range(ins.from, ins.from + ins.active - 1);
  if (ins.kind === 'vector') return <>Instruction {k} of {total}: one vector op on elements {where}, {plural(ins.lanes, 'lane')} at once.</>;
  if (ins.kind === 'tail') return <>Instruction {k} of {total}: tail element {ins.from} on its own, the scalar epilogue: one lane, one element.</>;
  return (
    <>
      Instruction {k} of {total}: one masked vector op. {ins.active} of its {ins.lanes} lanes are on for elements {where}; the other {ins.lanes - ins.active} are masked off.
    </>
  );
}

export function lanesFrames(n: number, bits: RegisterBits, tail: TailMode, bandwidth: number, r: CycleReport): LaneFrame[] {
  const frames: LaneFrame[] = [{ done: 0, say: lanesIntro(n, bits, r, tail) }];
  for (let k = 1; k <= r.compute; k++) frames.push({ done: k, say: lanesStep(k, r.compute, r) });
  frames.push({ done: r.compute, say: lanesSummary(n, bits, tail, bandwidth, r), hold: 2.5 });
  return frames;
}

// ── dependence ───────────────────────────────────────────────────────────

export interface DepFrame extends Frame {
  /** Chunks executed so far. */
  done: number;
}

export function depIntro(d: number, lanes: number): ReactNode {
  return (
    <>
      <code>a[i] = a[i - {d}] + 1</code>: each element needs the value written {plural(d, 'place')} earlier. A {plural(lanes, 'lane')} vector op reads {lanes === 1 ? 'one element' : `${lanes} elements`} first, adds 1, then
      writes {lanes === 1 ? 'one' : lanes} back. The scalar loop (right) is the reference.
    </>
  );
}

function depStep(k: number, c: Chunk): ReactNode {
  const reads = range(c.readFrom, c.readTo);
  const writes = range(c.writeFrom, c.writeTo);
  if (c.staleReads.length === 0) {
    return <>Chunk {k} reads a[{reads}] and writes a[{writes}]. Everything it reads was written by an earlier chunk, so these elements are right.</>;
  }
  return (
    <>
      Chunk {k} reads a[{reads}] and writes a[{writes}]. a[{range(c.staleReads[0], c.staleReads.at(-1)!)}] are read before this same chunk writes them, so they are{' '}
      <span className="hl bad">stale</span> values.
    </>
  );
}

export function depSummary(d: number, lanes: number, v: DepVerdict): ReactNode {
  if (v.vectorisable) {
    return (
      <>
        <span className="hl ok">Every element matches the scalar loop.</span> {lanes} lanes {lanes <= d ? '≤' : '>'} d = {d}: no chunk reads an element its own chunk writes.
      </>
    );
  }
  return (
    <>
      <span className="hl bad">{plural(v.wrong.length, 'element')} differ from the scalar loop</span>, the first at index {v.firstWrong}. {lanes} lanes {lanes <= d ? '≤' : '>'} d = {d}, so a chunk reads
      elements its own chunk has not written yet.
    </>
  );
}

export function depFrames(d: number, lanes: number, run: VectorRun, v: DepVerdict): DepFrame[] {
  const frames: DepFrame[] = [{ done: 0, say: depIntro(d, lanes) }];
  run.chunks.forEach((c, i) => frames.push({ done: i + 1, say: depStep(i + 1, c) }));
  frames.push({ done: run.chunks.length, say: depSummary(d, lanes, v), hold: 2.5 });
  return frames;
}

// ── warp ─────────────────────────────────────────────────────────────────

export interface WarpFrame extends Frame {
  /** Which lanes the instruction issued in this frame keeps on; none at the intro. */
  active: boolean[];
  /** 'intro' and 'done' show the lanes neutrally; 'step' lights the active ones and dims the rest. */
  phase: 'intro' | 'step' | 'done';
}

const none = (): boolean[] => Array.from({ length: WARP_SIZE }, () => false);

export function branchFrames(pred: Predicate): WarpFrame[] {
  const r = branchReport(pred);
  const frames: WarpFrame[] = [
    {
      active: none(),
      phase: 'intro',
      say: (
        <>
          A warp is {WARP_SIZE} lanes sharing one instruction stream. {r.aLanes} lanes take path A ({PATH_A_COST} instructions), {r.bLanes} take path B ({PATH_B_COST}). The warp runs each path that any lane needs.
        </>
      ),
    },
  ];
  const path = (name: 'A' | 'B', cost: number, lanes: number, active: boolean[]) => {
    if (lanes === 0) return;
    for (let k = 1; k <= cost; k++) {
      frames.push({
        active,
        phase: 'step',
        say: <>Path {name}, instruction {k} of {cost}: {plural(lanes, 'lane')} on, the other {WARP_SIZE - lanes} masked off.</>,
      });
    }
  };
  path('A', PATH_A_COST, r.aLanes, pred.slice());
  path('B', PATH_B_COST, r.bLanes, pred.map((p) => !p));
  const skipped = (r.aLanes === 0 ? 'path A was skipped (no lane needed it)' : r.bLanes === 0 ? 'path B was skipped (no lane needed it)' : null);
  frames.push({
    active: none(),
    phase: 'done',
    hold: 2.5,
    say: (
      <>
        The warp issued <span className="hl">{plural(r.issued, 'instruction')}</span>{skipped ? `, since ${skipped}` : `: ${PATH_A_COST} + ${PATH_B_COST}`}. Lane utilisation is{' '}
        <span className="hl info">{pctText(r.utilisation, 0)}</span>: the lanes did useful work in that share of the slots they were issued.
      </>
    ),
  });
  return frames;
}

export function loopFrames(trips: readonly number[]): WarpFrame[] {
  const r = tripReport(trips);
  const frames: WarpFrame[] = [
    {
      active: none(),
      phase: 'intro',
      say: (
        <>
          Each lane runs <code>for (k = 0; k &lt; n[lane]; k++) work</code> with its own trip count, from {Math.min(...trips)} to {r.longest}. The warp steps in lockstep until its longest lane is done.
        </>
      ),
    },
  ];
  for (let k = 1; k <= r.longest; k++) {
    const active = trips.map((n) => n >= k);
    const on = active.filter(Boolean).length;
    frames.push({
      active,
      phase: 'step',
      say: <>Step {k} of {r.longest}: {plural(on, 'lane')} still working, {WARP_SIZE - on} idle but still issued.</>,
    });
  }
  if (r.utilisation === null) {
    frames.push({ active: none(), phase: 'done', hold: 2.5, say: <>No lane has any iteration to run, so the warp issues nothing and there is no utilisation to report.</> });
  } else {
    frames.push({
      active: none(),
      phase: 'done',
      hold: 2.5,
      say: (
        <>
          The warp issued {plural(r.issued, 'step')} for {plural(r.total, 'lane-iteration')} of useful work in {WARP_SIZE * r.issued} slots: <span className="hl info">{pctText(r.utilisation, 0)}</span> utilisation
          {r.utilisation === 1 ? ', because every lane has the same count.' : '.'}
        </>
      ),
    });
  }
  return frames;
}

// ── latency hiding ───────────────────────────────────────────────────────

export const utilisationSoFar = (sim: TickSim<HideState>, tick: number): number | null => {
  const t = Math.floor(tick);
  return t === 0 ? null : sim.history[t].issuedTicks / t;
};

export interface HideFrame extends TimedFrame {
  now: number;
}

export function hideIntro(p: HideParams): ReactNode {
  return (
    <>
      {plural(p.warps, 'warp')} share one issue slot. Each runs {plural(p.compute, 'compute tick')}, then waits {p.stall} ticks for memory (a toy number). It takes {warpsToHide(p.compute, p.stall)} warps to keep the slot busy at these settings.
    </>
  );
}

export function hideFrames(sim: TickSim<HideState>, p: HideParams): HideFrame[] {
  sim.at(GANTT_TICKS);
  const h = sim.history;
  const milestones: { t: number; say: ReactNode }[] = [];
  const stallAt = h.findIndex((s, t) => t > 0 && s.status[0] === 'stall');
  if (stallAt > 0) {
    milestones.push({
      t: stallAt,
      say:
        p.warps > 1
          ? <>Warp 0 issued its {plural(p.compute, 'compute tick')} and now waits on memory for {p.stall} ticks. The slot goes to the next ready warp.</>
          : <>Warp 0 issued its {plural(p.compute, 'compute tick')} and now waits on memory for {p.stall} ticks. Nothing else can run.</>,
    });
  }
  const idleAt = h.findIndex((s, t) => t > 0 && s.issued === -1);
  if (idleAt > 0) milestones.push({ t: idleAt, say: <>At tick {idleAt} every warp is waiting on memory, so the issue slot <span className="hl bad">sits idle</span>.</> });
  const resumeAt = stallAt > 0 ? h.findIndex((s, t) => t > stallAt && s.status[0] !== 'stall') : -1;
  if (resumeAt > 0) milestones.push({ t: resumeAt, say: <>Warp 0&apos;s memory request is back at tick {resumeAt}: it can issue again.</> });
  const used = h[GANTT_TICKS].issuedTicks;
  return timeFrames({
    end: GANTT_TICKS,
    steps: 30,
    milestones,
    intro: hideIntro(p),
    summary: (
      <>
        In these {GANTT_TICKS} ticks the slot issued on {used}, so it was <span className="hl info">{pctText(used / GANTT_TICKS, 0)}</span> busy. The stats give the steady rate after warm-up.
      </>
    ),
    hold: 2.5,
  });
}

