import type { ReactNode } from 'react';
import { pctText, plural, sig } from '../../core/format';
import type { TickSim } from '../../core/simTick';
import type { Frame } from '../../core/types';
import { brentBound, lowerBound, type FJState, type ForkResult, type Params } from './forkjoin';
import { POOL_CPU, ruleOfThumb, type PoolParams, type PoolResult } from './pool';
import { LEAF_TICKS, isParent, parentCount, taskCount, type StarveParams, type StarveState } from './starve';

// ── pool sizing ──────────────────────────────────────────────────────────

/** Where this pool size sits on the swept curve, said from the same numbers the stat shows. */
export function poolCaption(p: PoolParams, r: PoolResult, best: { pool: number; throughput: number }): ReactNode {
  const wait = p.ratio * POOL_CPU;
  const share = r.throughput / best.throughput;
  const place =
    share >= 0.95
      ? `on the plateau: ${pctText(share, 0)} of the best the sweep found`
      : `below the plateau: ${pctText(share, 0)} of the best, so more threads would still gain`;
  return (
    <>
      {plural(p.pool, 'thread')} on {plural(p.cores, 'core')} finish <span className="hl info">{sig(r.throughput)} tasks per 100 ticks</span>, keeping the cores {pctText(r.coreUse, 0)} busy. A task computes{' '}
      {r.burst} ticks and then {wait === 0 ? 'does not wait at all' : `waits ${wait} ticks`}. This size is {place}. The sweep peaks around P = {best.pool}; the rule of thumb
      cores × (1 + w/c) gives {ruleOfThumb(p.cores, p.ratio)}.
    </>
  );
}

// ── fork-join ────────────────────────────────────────────────────────────

export interface ForkFrame extends Frame {
  now: number;
}

const stealVerb = (p: Params) => (p.stealLatency === 0 ? 'steals' : `starts a ${p.stealLatency}-tick steal of`);

export function forkIntro(p: Params, res: ForkResult): ReactNode {
  const leaves = res.tree.leaves.length;
  return (
    <>
      A {p.n}-unit job splits in two until a piece is at most {p.grain} units, giving {plural(leaves, 'leaf', 'leaves')}. The whole job is submitted to worker 0&apos;s deque.{' '}
      {p.steal ? `Idle workers steal from the front of another deque.` : 'Stealing is off, so the other workers have nothing to do.'} {plural(p.workers, 'worker')}, seed {p.seed}.
    </>
  );
}

export function forkSummary(p: Params, res: ForkResult): ReactNode {
  const brent = brentBound(res, p.workers);
  const lower = lowerBound(res, p.workers);
  const held = res.makespan <= brent;
  return (
    <>
      Done in <span className="hl ok">{res.makespan} ticks</span>: work T1 = {res.work}, span T∞ = {res.span}, so no schedule beats {sig(lower)}. {plural(res.steals, 'steal')}, workers{' '}
      {pctText(res.utilisation, 0)} busy. Brent&apos;s bound for a greedy scheduler is {sig(brent)}: this run <span className={`hl ${held ? 'ok' : 'bad'}`}>{held ? 'is within it' : 'breaks it'}</span>
      {p.stealLatency > 0 ? `, because a steal takes ${p.stealLatency} ticks here and the scheduler is no longer greedy` : ''}.
    </>
  );
}

/** The frames: the intro, every tick up to the end with a caption at the first steal, the last steal and the finish. */
export function forkFrames(sim: TickSim<FJState>, p: Params, res: ForkResult): ForkFrame[] {
  sim.at(res.makespan);
  const h = sim.history;
  const first = h.findIndex((s, t) => t > 0 && s.stolen.length > 0);
  let last = -1;
  h.forEach((s, t) => {
    if (t > 0 && t <= res.makespan && s.stolen.length > 0) last = t;
  });
  const frames: ForkFrame[] = [{ now: 0, say: forkIntro(p, res) }];
  for (let t = 1; t <= res.makespan; t++) {
    const frame: ForkFrame = { now: t };
    if (t === first) {
      const e = h[t].stolen[0];
      frame.say = (
        <>
          At tick {t} worker {e.thief} {stealVerb(p)} the oldest task in worker {e.victim}&apos;s deque, a piece of {res.tree.tasks[e.task].size} units: the front of the deque, not the end the owner works at.
        </>
      );
    } else if (t === last && last !== first) {
      frame.say = <>The last steal is at tick {t}. After it every worker is busy until its own pile runs out.</>;
    }
    frames.push(frame);
  }
  frames.push({ now: res.makespan, say: forkSummary(p, res), hold: 2.5 });
  return frames;
}

// ── grain size ───────────────────────────────────────────────────────────

export function grainCaption(grain: number, makespan: number, sequential: number, best: { grain: number; makespan: number }, workers: number): ReactNode {
  const verdict =
    makespan > sequential
      ? <span className="hl bad">slower than running it on one worker ({sequential} ticks)</span>
      : makespan === best.makespan
        ? <span className="hl ok">the best grain in the sweep</span>
        : <span className="hl">faster than one worker ({sequential} ticks), {makespan - best.makespan} ticks off the best</span>;
  return (
    <>
      At grain {grain} on {plural(workers, 'worker')} the job takes {makespan} ticks: {verdict}. The sweep&apos;s best grain is {best.grain} at {best.makespan} ticks.
    </>
  );
}

// ── starvation ───────────────────────────────────────────────────────────

export interface StarveFrame extends Frame {
  now: number;
}

export function starveIntro(p: StarveParams): ReactNode {
  return (
    <>
      A tree of {plural(taskCount(p.depth), 'task')}: {parentCount(p.depth)} parents and {taskCount(p.depth) - parentCount(p.depth)} leaves of {LEAF_TICKS} ticks. A parent takes a worker, queues its two children and blocks until
      both finish. {plural(p.workers, 'worker')}, {p.helping ? 'and a waiting worker runs a queued task instead of idling' : 'and a waiting worker just waits'}.
    </>
  );
}

export function starveFrames(sim: TickSim<StarveState>, p: StarveParams): StarveFrame[] {
  const h = sim.history;
  const ticks = sim.ticks;
  const stalled = sim.violation !== null;
  const firstBlock = h.findIndex((s, t) => t > 0 && s.doing.some((d, w) => d >= 0 && isParent(d, p.depth) && s.stacks[w].at(-1)?.phase === 'wait'));
  const firstHelp = h.findIndex((s, t) => t > 0 && s.stacks.some((st, w) => st.length > h[t - 1].stacks[w].length && h[t - 1].stacks[w].at(-1)?.phase === 'wait'));
  const frames: StarveFrame[] = [{ now: 0, say: starveIntro(p) }];
  for (let t = 1; t <= ticks; t++) {
    const frame: StarveFrame = { now: t };
    if (t === firstBlock) frame.say = <>At tick {t} a parent takes a worker, queues its two children and blocks in its join: that worker holds a thread and does no work.</>;
    else if (t === firstHelp) frame.say = <>At tick {t} a waiting worker runs a queued task instead of idling: it helps while it waits for its children.</>;
    if (t === ticks) {
      frame.hold = 2.5;
      frame.say = stalled ? (
        <>
          At tick {t} every one of the {plural(p.workers, 'worker')} holds a parent that waits for its children, and {plural(h[t].queue.length, 'task')} wait in the queue. <span className="hl bad">Stalled</span>: no worker is free to run them,
          so nothing can run again. The model detects this; it does not hang.
        </>
      ) : (
        <>All {plural(taskCount(p.depth), 'task')} finished by tick {t}{p.helping ? ', with waiting workers running queued tasks while they waited' : ''}.</>
      );
    }
    frames.push(frame);
  }
  return frames;
}

