/**
 * Deterministic simulation testing on the real core/distSim: a seeded schedule (when the two requests arrive, how long each replicate
 * message takes, which are lost) is the whole input, so a failing seed replays exactly. Pure logic, no React.
 *
 * The lesson is its own proof: the thing it teaches is the thing it is built from.
 */
import { checkInvariants, createCluster, forSeeds, type Cluster, type DistNode, type Message, type Safety, type SeedsResult } from '../../core/distSim';
import { explore, type ExploreResult } from '../../core/explore';
import { fmix32, hexHash } from '../../core/hash';
import { asDistNodes, networkExplorer, type NetAction, type NetState } from '../../core/pureProtocol';
import { bookingProtocol, oversold, type BookMsg, type BookingMode, type Seat } from './booking';

export const WINDOW = { min: 10, max: 100, step: 10, default: 30 } as const;
export const LOSS = { min: 0, max: 0.2, step: 0.05, default: 0 } as const;
export const HUNT_N = { min: 10, max: 1000, step: 10, default: 200 } as const;
export const GAP = { min: -100, max: 100 } as const;
export const REPLAYS = 20;
export const LEAK_PERIOD = 16;
export const DELAY_MIN_MS = 1;
export const DELAY_MAX_MS = 10;
export const SCENE2_T1 = 100;
/** The lowest seed (from 1) that oversells at the default window of 30 ms and no loss: pinned by the test. */
export const BROKEN_SEED = 8;
/** Trace hash of that seed's run, pinned so a change to core/distSim that alters the trace fails a test on purpose. */
export const BROKEN_TRACE_HASH = '6d93e356';

const LIVE_BASE = 10_000;

/* ---------- the schedule a seed draws ---------- */

/** A number in [0, 1) that is a fixed, well-mixed function of the seed and a salt (adjacent seeds give unrelated numbers). */
const unit = (seed: number, salt: number): number => fmix32(Math.imul(seed, 0x9e3779b1) ^ fmix32(salt)) / 2 ** 32;

/** One request time per client, uniform on [0, window]: how close together the two requests tend to arrive. */
export function scheduleFor(seed: number, windowMs: number): { t1: number; t2: number } {
  return { t1: unit(seed, 11) * windowMs, t2: unit(seed, 12) * windowMs };
}

/** How long the replicate message from `from` takes: uniform on [1, 10] ms, a fixed function of the seed and the sender (so scene 2 can move the gap without re-drawing it). */
export function linkDelay(seed: number, from: string): number {
  return DELAY_MIN_MS + unit(seed, from === 'r1' ? 1 : 2) * (DELAY_MAX_MS - DELAY_MIN_MS);
}

/* ---------- the leak: a stand-in for ambient nondeterminism ---------- */

/** A module-level counter that is NOT reset between runs: what a node reading the wall clock or a global random number generator would see. */
const ambient = { leak: 0, live: 0 };
export const resetAmbient = (): void => {
  ambient.leak = 0;
  ambient.live = 0;
};

function leaky(base: DistNode<BookMsg, Seat>): DistNode<BookMsg, Seat> {
  const pending = new Map<string, Message<BookMsg>>();
  return {
    ...base,
    onMessage: (ctx, msg) => {
      if (msg.payload.type !== 'book') {
        base.onMessage(ctx, msg);
        return;
      }
      const wait = ambient.leak % LEAK_PERIOD;
      ambient.leak += 1;
      if (wait === 0) {
        base.onMessage(ctx, msg);
        return;
      }
      const id = `late${msg.id}`;
      pending.set(id, msg);
      ctx.setTimer(id, wait);
    },
    onTimer: (ctx, id) => {
      const msg = pending.get(id);
      if (!msg) {
        base.onTimer(ctx, id);
        return;
      }
      pending.delete(id);
      base.onMessage(ctx, msg);
    },
  };
}

/* ---------- one run ---------- */

export interface BookingSetup {
  seed: number;
  windowMs: number;
  loss: number;
  mode: BookingMode;
  /** r2 reads ambient randomness (the stand-in above). */
  leak: boolean;
  requestA: boolean;
  requestB: boolean;
  /** Explicit request times instead of the seed's draw (scene 2, and seed-free tests). */
  t1?: number;
  t2?: number;
  /** Drop every replicate message r1 sends (scene 2's fault row). */
  dropReplicate: boolean;
  /** A fixed link delay for seed-free tests, instead of the seed's. */
  delayMs?: number;
  /** Network duplication, for the stress test of the fix. */
  duplicate?: number;
}

export const defaultBooking = (seed = 1): BookingSetup => ({
  seed, windowMs: WINDOW.default, loss: LOSS.default, mode: 'async', leak: false, requestA: true, requestB: true, dropReplicate: false,
});

export type BookingCluster = Cluster<BookMsg, Seat>;

export function buildBooking(s: BookingSetup): BookingCluster {
  const nodes = asDistNodes(bookingProtocol(s.mode));
  if (s.leak) nodes.r2 = leaky(nodes.r2);
  const cluster = createCluster<BookMsg, Seat>({
    seed: s.seed,
    nodes,
    latency: (_rnd, from) => s.delayMs ?? linkDelay(s.seed, from),
    loss: s.loss,
    duplicate: s.duplicate,
  });
  const drawn = scheduleFor(s.seed, s.windowMs);
  const [t1, t2] = [s.t1 ?? drawn.t1, s.t2 ?? drawn.t2];
  if (s.requestA) cluster.inject(t1, 'r1', { type: 'book', client: 'A' });
  if (s.requestB) cluster.inject(t2, 'r2', { type: 'book', client: 'B' });
  if (s.dropReplicate) cluster.dropWhere((m) => m.payload.type === 'replicate' && m.from === 'r1', 0, Infinity);
  return cluster;
}

/** Rule 0: at most one client is granted the seat across both replicas, checked after every event. */
export const NO_OVERSELL: Safety<Seat> = (snap) => oversold({ r1: snap.nodes.r1?.state, r2: snap.nodes.r2?.state });
export const BOOKING_RULES: readonly Safety<Seat>[] = [NO_OVERSELL];

const hashRows = (cluster: BookingCluster): string =>
  hexHash(
    JSON.stringify(cluster.trace.map((r) => [Math.round(r.t * 1000), r.kind, r.from, r.to, r.node, r.detail, r.reason, r.payload])),
    8,
  );

export interface BookingRun {
  setup: BookingSetup;
  cluster: BookingCluster;
  failed: boolean;
  message: string | null;
  /** Hash of the trace the run left behind (cut at the violation, when there was one). */
  hash: string;
}

export function runBooking(setup: BookingSetup): BookingRun {
  const cluster = buildBooking(setup);
  const verdict = checkInvariants(cluster, BOOKING_RULES, { until: setup.windowMs + 400 });
  return { setup, cluster, failed: !verdict.ok, message: verdict.ok ? null : verdict.message, hash: hashRows(cluster) };
}

/* ---------- the hunt ---------- */

export interface Hunt {
  start: number;
  count: number;
  /** Seeds that broke the rule, ascending. */
  failures: number[];
  /** Distinct trace hashes over the runs. */
  distinct: number;
  /** Seeds tried until the first failure, counting it, or null when none failed. */
  triesToFirst: number | null;
}

export function hunt(base: BookingSetup, start: number, count: number): Hunt {
  const failures: number[] = [];
  const hashes = new Set<string>();
  for (let seed = start; seed < start + count; seed++) {
    const run = runBooking({ ...base, seed });
    hashes.add(run.hash);
    if (run.failed) failures.push(seed);
  }
  return { start, count, failures, distinct: hashes.size, triesToFirst: failures.length ? failures[0] - start + 1 : null };
}

/** The exact failure probability per seed (loss p on the replicate message, request window W >= 10 ms, delay uniform on [1, 10]): p + (1 - p)(11/W - 37/W^2). */
export function failureProbability(windowMs: number, loss: number): number {
  return loss + (1 - loss) * (11 / windowMs - 37 / windowMs ** 2);
}

/** Mean number of seeds until the first failure: 1 / P (a geometric wait). */
export const expectedTries = (windowMs: number, loss: number): number => 1 / failureProbability(windowMs, loss);

/** Replay one seed `n` times: how many runs left the same trace as the first, and how many broke the rule. */
export function replayAgreement(setup: BookingSetup, n = REPLAYS): { agree: number; failed: number; hashes: string[] } {
  const runs = Array.from({ length: n }, () => runBooking(setup));
  const hashes = runs.map((r) => r.hash);
  return { agree: hashes.filter((h) => h === hashes[0]).length, failed: runs.filter((r) => r.failed).length, hashes };
}

/* ---------- live chaos: a fresh schedule every run ---------- */

export interface LiveHunt {
  tries: number;
  /** The schedule seed the live run happened to use when it failed, or null when none did within `maxTries`. */
  failedWith: number | null;
}

/** Live chaos draws a different schedule each run (here from the leak counter) and never sees it again. */
export function liveHunt(base: BookingSetup, maxTries: number): LiveHunt {
  for (let tries = 1; tries <= maxTries; tries++) {
    const seed = LIVE_BASE + ambient.live++;
    if (runBooking({ ...base, seed, leak: false }).failed) return { tries, failedWith: seed };
  }
  return { tries: maxTries, failedWith: null };
}

/** Run the "same" experiment `n` more times live: each run gets the next fresh schedule. Returns how many failed again. */
export function liveReplays(base: BookingSetup, n = REPLAYS): number {
  let failed = 0;
  for (let i = 0; i < n; i++) if (runBooking({ ...base, seed: LIVE_BASE + ambient.live++, leak: false }).failed) failed += 1;
  return failed;
}

/* ---------- scene 2: the boundary, computed from the trace ---------- */

export interface GapRun {
  gap: number;
  failed: boolean;
  /** The replicate delay of the earlier request, from the seed. */
  delayMs: number;
  /** The earlier request's client ('A' when the gap is positive). */
  earlier: 'A' | 'B';
}

/** Scene 2: request A at SCENE2_T1, request B at SCENE2_T1 + gap, the seed's link delays kept. */
export function runGap(seed: number, gap: number, over: Partial<BookingSetup> = {}): GapRun {
  const t1 = SCENE2_T1;
  const setup = { ...defaultBooking(seed), t1, t2: Math.max(0, t1 + gap), ...over };
  const run = runBooking(setup);
  const earlier = gap >= 0 ? 'A' : 'B';
  return { gap, failed: run.failed, delayMs: linkDelay(seed, earlier === 'A' ? 'r1' : 'r2'), earlier };
}

/** Read from the trace: how long the first replicate message of the run took to arrive, or null when it never arrived (lost, dropped, or never sent). */
export function replicateDelay(run: BookingRun): number | null {
  const trace = run.cluster.trace;
  const sent = trace.find((r) => r.kind === 'send' && (r.payload as BookMsg).type === 'replicate');
  const arrived = sent && trace.find((r) => r.kind === 'deliver' && r.msgId === sent.msgId);
  return sent && arrived ? arrived.t - sent.t : null;
}

/** The boundary the page prints: the gap (in magnitude) below which this seed oversells, which is the earlier request's replicate delay. */
export const boundaryOf = (seed: number, direction: 1 | -1): number => linkDelay(seed, direction === 1 ? 'r1' : 'r2');

/** Find the flip by bisection between a passing and a failing gap, to 0.01 ms (the lesson's boundary equals the traced delay). */
export function bisectBoundary(seed: number, direction: 1 | -1, over: Partial<BookingSetup> = {}): number {
  let pass = direction * (GAP.max);
  let fail = 0;
  for (let i = 0; i < 40 && Math.abs(pass - fail) > 0.005; i++) {
    const mid = (pass + fail) / 2;
    const out = runBooking({ ...defaultBooking(seed), t1: SCENE2_T1, t2: Math.max(0, SCENE2_T1 + mid), ...over });
    if (out.failed) fail = mid;
    else pass = mid;
  }
  return Math.abs((pass + fail) / 2);
}

/* ---------- scene 4: every schedule at once ---------- */

export type BookingState = NetState<Seat, BookMsg>;
export type Exhaustive = ExploreResult<BookingState, NetAction<BookMsg>> & { init: BookingState };

const REQUESTS = [
  { to: 'r1', payload: { type: 'book', client: 'A' } },
  { to: 'r2', payload: { type: 'book', client: 'B' } },
] as const satisfies readonly { to: string; payload: BookMsg }[];

/** The bounded model: two replicas, the two bookings on the wire, and every delivery order, loss and duplication (the `set` network). */
export function exploreBooking(mode: BookingMode): Exhaustive {
  const net = networkExplorer(bookingProtocol(mode), { clientInputs: REQUESTS });
  return { ...explore({ ...net, invariant: (st) => oversold(net.nodeStates(st)) }), init: net.init };
}

/** The seeded leg over the SAME protocol functions: loss, duplication and delay on the harness, the rule checked after every event. */
export function seededLeg(mode: BookingMode, seeds = 200): SeedsResult<BookMsg> {
  return forSeeds(
    { from: 1, to: seeds + 1 },
    (seed) => {
      const cluster = createCluster<BookMsg, Seat>({ seed, nodes: asDistNodes(bookingProtocol(mode)), loss: 0.1, duplicate: 0.15 });
      const { t1, t2 } = scheduleFor(seed, WINDOW.default);
      cluster.inject(t1, 'r1', { type: 'book', client: 'A' });
      cluster.inject(t2, 'r2', { type: 'book', client: 'B' });
      return cluster;
    },
    BOOKING_RULES,
    { until: 400 },
  );
}
