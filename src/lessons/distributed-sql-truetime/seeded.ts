/**
 * distributed-sql-truetime, the seeded leg: the two-transaction race on `core/distSim`. Two shard leaders have constant clock
 * errors; a client drives T1 (a write on shard 1) and, one gap after T1's acknowledgement, T2 on shard 2, which reads x at its own
 * timestamp. The network adds no delay, so the only randomness is the clock errors and the gap, drawn from the seed: that is
 * what makes the closed form of truetime.ts exact for this model. Rule 0 (external consistency) is asserted after every event.
 */
import { createCluster, type Cluster, type DistNode, type Safety } from '../../core/distSim';
import { mulberry32 } from '../../core/random';
import { WAIT_EPSILON_MS, T1_START_MS, SEED_RANGE, drawRace, race, type RaceInput } from './truetime';

export interface Options {
  epsilon: number;
  delta: number;
  gapMax: number;
  commitWait: boolean;
  /** Fixed clock errors instead of the seed's draw (the "set them" mode); the gap still comes from the seed. */
  fixedErrors?: { e1: number; e2: number };
}

export const DEFAULT_OPTIONS: Options = { epsilon: 7, delta: 7, gapMax: 5, commitWait: false };

export type Msg =
  | { type: 'commit' }
  | { type: 'ack'; ts: number }
  | { type: 'begin' }
  | { type: 'read'; ts: number }
  | { type: 'value'; seen: boolean };

export interface State {
  /** Shard 1: T1's timestamp and the true time it was acknowledged. */
  ts1: number | null;
  ackedAt: number | null;
  /** Shard 2: T2's timestamp, the true time it started, and whether its read saw T1's write. */
  ts2: number | null;
  startedAt: number | null;
  seen: boolean | null;
}

const blank = (): State => ({ ts1: null, ackedAt: null, ts2: null, startedAt: null, seen: null });

/** The draw for a seed: clock errors and gap, in the order the scenario consumes them. */
export function drawFor(seed: number, o: Options): { e1: number; e2: number; gap: number } {
  const drawn = drawRace(mulberry32(seed * 31 + 7), o.delta, o.gapMax);
  return o.fixedErrors ? { ...o.fixedErrors, gap: drawn.gap } : drawn;
}

export const raceInput = (seed: number, o: Options): RaceInput => {
  const d = drawFor(seed, o);
  return { epsilon: o.epsilon, e1: d.e1, e2: d.e2, gap: d.gap, commitWait: o.commitWait };
};

function buildNodes(seed: number, o: Options): Record<string, DistNode<Msg, State>> {
  const { gap } = drawFor(seed, o);
  const s1: State = blank();
  const s2: State = blank();
  const owner = (state: State): DistNode<Msg, State> => ({
    init: () => {},
    onTimer: () => {},
    onMessage: () => {},
    snapshot: () => ({ ...state }),
  });
  const shard1: DistNode<Msg, State> = {
    ...owner(s1),
    onMessage: (ctx, msg) => {
      const m = msg.payload;
      if (m.type === 'commit') {
        // The timestamp is TT.now().latest: this leader's clock reading plus eps.
        s1.ts1 = ctx.now() + o.epsilon;
        // Commit wait: acknowledge only when TT.now().earliest > the timestamp, which is 2 eps of this clock later.
        if (o.commitWait) ctx.setTimer('ack', 2 * o.epsilon + WAIT_EPSILON_MS);
        else acknowledge(ctx);
      } else if (m.type === 'read') ctx.send(msg.from, { type: 'value', seen: s1.ts1 !== null && s1.ts1 <= m.ts });
    },
    onTimer: (ctx) => acknowledge(ctx),
  };
  function acknowledge(ctx: { send: (to: string, m: Msg) => void; trueNow: number }) {
    // trueNow is the observer's view, recorded for the safety rule; no protocol decision reads it.
    s1.ackedAt = ctx.trueNow;
    ctx.send('client', { type: 'ack', ts: s1.ts1! });
  }
  const shard2: DistNode<Msg, State> = {
    ...owner(s2),
    onMessage: (ctx, msg) => {
      const m = msg.payload;
      if (m.type === 'begin') {
        s2.ts2 = ctx.now() + o.epsilon;
        s2.startedAt = ctx.trueNow;
        ctx.send('s1', { type: 'read', ts: s2.ts2 });
      } else if (m.type === 'value') s2.seen = m.seen;
    },
  };
  const client: DistNode<Msg, State> = {
    ...owner(blank()),
    init: (ctx) => ctx.setTimer('t1', T1_START_MS),
    onTimer: (ctx, id) => {
      if (id === 't1') ctx.send('s1', { type: 'commit' });
      else ctx.send('s2', { type: 'begin' });
    },
    onMessage: (ctx, msg) => {
      if (msg.payload.type === 'ack') ctx.setTimer('t2', gap);
    },
  };
  return { s1: shard1, s2: shard2, client };
}

export function raceScenario(o: Options) {
  return (seed: number): Cluster<Msg, State> => {
    const d = drawFor(seed, o);
    return createCluster<Msg, State>({
      seed,
      nodes: buildNodes(seed, o),
      latency: { min: 0, max: 0 },
      clocks: [{ offsetMs: d.e1 }, { offsetMs: d.e2 }, {}],
    });
  };
}

/** Rule 0, external consistency: if T1 was acknowledged before T2 started, T2's timestamp is larger and its read sees T1's write. */
export const externalConsistency: Safety<State> = (snap) => {
  const a = snap.nodes.s1.state!;
  const b = snap.nodes.s2.state!;
  if (a.ackedAt === null || b.startedAt === null || b.seen === null || a.ts1 === null || b.ts2 === null) return null;
  if (b.startedAt < a.ackedAt) return null;
  if (b.ts2 <= a.ts1) return "T2 started after T1's ack but timestamped earlier";
  if (!b.seen) return "T2's read missed T1's write";
  return null;
};

export interface SeedRun {
  /** The race the pure model computes for this seed. */
  model: ReturnType<typeof race>;
  input: RaceInput;
  /** What the harness observed: T1's and T2's timestamps and whether T2's read saw the write. */
  observed: { ts1: number | null; ts2: number | null; seen: boolean | null };
  violation: string | null;
}

export function runRaceSeed(o: Options, seed: number): SeedRun {
  const cluster = raceScenario(o)(seed);
  cluster.run();
  const snap = cluster.snapshot();
  const input = raceInput(seed, o);
  const a = snap.nodes.s1.state!;
  const b = snap.nodes.s2.state!;
  return { model: race(input), input, observed: { ts1: a.ts1, ts2: b.ts2, seen: b.seen }, violation: externalConsistency(snap) };
}

export interface Sweep {
  failing: number[];
  lowestFailing: number | null;
  message: string | null;
}

export function sweepRace(o: Options): Sweep {
  const failing: number[] = [];
  let message: string | null = null;
  for (let seed = SEED_RANGE.from; seed < SEED_RANGE.to; seed++) {
    const r = runRaceSeed(o, seed);
    if (r.violation) {
      failing.push(seed);
      message = message ?? r.violation;
    }
  }
  return { failing, lowestFailing: failing[0] ?? null, message };
}

const sweepCache = new Map<string, Sweep>();
/** `sweepRace` remembered per option set: a slider drag revisits the same values. */
export function cachedSweep(o: Options): Sweep {
  const key = JSON.stringify(o);
  const hit = sweepCache.get(key);
  if (hit) return hit;
  const fresh = sweepRace(o);
  sweepCache.set(key, fresh);
  return fresh;
}

/** The same sweep with the pure model: identical verdicts, fast enough to draw a curve over epsilon. */
export function sweepModel(o: Options): number {
  let failing = 0;
  for (let seed = SEED_RANGE.from; seed < SEED_RANGE.to; seed++) if (!race(raceInput(seed, o)).ordered) failing++;
  return failing;
}

/** The lowest failing seeds from 1, pinned in truetime.test.ts against forSeeds: wait off (broken a) and epsilon underestimated (broken b). */
export const BROKEN_SEED = 2;
export const BROKEN_SEED_EPSILON = 2;
