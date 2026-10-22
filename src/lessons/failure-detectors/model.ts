/**
 * Failure detectors on the real core/distSim: a heartbeat monitor M watching a peer P (scenes 1 to 3)
 * and a SWIM-style probe round with helpers (scene 4). Pure logic, no React.
 *
 * The model, as the lesson prints it: P sends a heartbeat every HEARTBEAT_MS; the link delay is
 * LATENCY_MIN_MS plus an exponential with mean `jitter`, cut at LATENCY_CAP_MS; M suspects P when its
 * timeout has run since the last heartbeat arrived, and the next heartbeat un-suspects it.
 */
import { createCluster, type Cluster, type DistNode, type NodeCtx, type Safety } from '../../core/distSim';
import { exponential, normalCdf, normalQuantile } from '../../core/distributions';
import { mulberry32, shuffle } from '../../core/random';
import { mean as meanOf } from '../../core/sim';
import { stdDev } from '../../core/stats';

export const HEARTBEAT_MS = 100;
export const LATENCY_MIN_MS = 1;
export const LATENCY_CAP_MS = 300;
export const WINDOW = 100;
/** Gaps M needs before the phi rule trusts its own estimate; until then it waits the fixed timeout. */
export const PHI_WARMUP_GAPS = 10;
/** The spread of a normal fitted to a handful of gaps can be 0; real detectors floor it too. */
export const MIN_SIGMA_MS = 1;
export const PHI_DISPLAY_CAP = 16;

export const JITTER = { min: 5, max: 60, step: 5, default: 20 } as const;
export const TIMEOUT = { min: 120, max: 600, step: 10, default: 185 } as const;
export const PHI = { min: 1, max: 16, step: 1, default: 8 } as const;
export const PAUSE = { min: 100, max: 3000, step: 100, default: 600 } as const;
export const SWIM_LOSS = { min: 0, max: 0.4, step: 0.05, default: 0.1 } as const;
export const SWIM_K = { min: 0, max: 4, step: 1, default: 0 } as const;

export const SEED_RUN_MS = 10_000;
export const MINUTE_MS = 60_000;
export const CRASH_AT_MS = 5_000;
const CRASH_PHASE_STREAM = 0x9e3779b1;
export const SWEEP_SEEDS = 200;
/** Above this jitter the exponential's cut at LATENCY_CAP_MS removes enough mass that the closed forms drift. */
export const CLOSED_FORM_MAX_JITTER = 40;
/** Fixed timeout of the fixed mode in the tests and the lesson's "safe" setting. */
export const SAFE_TIMEOUT_MS = 400;
/** Fixed timeout shorter than the jitter tail: the broken mode of rule 0. */
export const BROKEN_TIMEOUT_MS = TIMEOUT.default;
/** The lowest seed (from 1) on which the broken mode suspects a live peer in a 10 s run; pinned by the test. */
export const BROKEN_SEED = 5;

export type DetectorRule = 'fixed' | 'phi';
export interface PauseWindow {
  from: number;
  to: number;
}

export interface DetectorSetup {
  seed: number;
  timeoutMs: number;
  jitterMs: number;
  rule: DetectorRule;
  phi: number;
  /** P crashes at this true time, or null. */
  crashAt: number | null;
  /** P is paused over this window, or null. */
  pause: PauseWindow | null;
}

/** Scene 1's crash: 5 s plus a seeded phase inside one heartbeat period, so the detection time averages over where in the period the crash lands. */
export const crashTimeFor = (seed: number): number => CRASH_AT_MS + Math.floor(mulberry32(seed ^ CRASH_PHASE_STREAM)() * HEARTBEAT_MS);

export const defaultSetup = (): DetectorSetup => ({
  seed: BROKEN_SEED,
  timeoutMs: TIMEOUT.default,
  jitterMs: JITTER.default,
  rule: 'fixed',
  phi: PHI.default,
  crashAt: null,
  pause: null,
});

/* ---------- the normal model behind phi ---------- */

/** P(next arrival is later than `t`) under a normal with mean `mu` and spread `sigma`. */
export const survival = (t: number, mu: number, sigma: number): number => normalCdf(-(t - mu) / sigma);

/** phi(t) = -log10 of that probability, capped for display at PHI_DISPLAY_CAP. */
export function phiAt(t: number, mu: number, sigma: number): number {
  const p = survival(t, mu, sigma);
  return p <= 0 ? PHI_DISPLAY_CAP : Math.min(PHI_DISPLAY_CAP, -Math.log10(p));
}

/** The wait after which phi reaches `phi`: mu + sigma * z with z = Phi^-1(1 - 10^-phi), found from the lower tail so tiny tails keep precision. */
export const impliedTimeout = (phi: number, mu: number, sigma: number): number => mu - sigma * normalQuantile(10 ** -phi);

/* ---------- closed forms for the fixed rule ---------- */

/** P(an arrival gap exceeds T): the gap is Delta plus the difference of two delays, which is Laplace with scale s. Valid for T >= Delta. */
export const gapExceedsProbability = (timeoutMs: number, jitterMs: number): number =>
  timeoutMs <= HEARTBEAT_MS ? 1 : 0.5 * Math.exp(-(timeoutMs - HEARTBEAT_MS) / jitterMs);

/** Expected false suspicions per minute: 600 gaps a minute, each exceeding T with the probability above. */
export const falsePerMinute = (timeoutMs: number, jitterMs: number): number =>
  (MINUTE_MS / HEARTBEAT_MS) * gapExceedsProbability(timeoutMs, jitterMs);

/** Expected false suspicions in a run of `runMs`: one gap per heartbeat except the first. */
export const expectedFalseInRun = (timeoutMs: number, jitterMs: number, runMs: number): number =>
  (Math.floor(runMs / HEARTBEAT_MS) - 1) * gapExceedsProbability(timeoutMs, jitterMs);

/** Mean detection time after a crash at a uniform phase: T + mean delay - Delta / 2. */
export const detectionMean = (timeoutMs: number, jitterMs: number): number => timeoutMs + LATENCY_MIN_MS + jitterMs - HEARTBEAT_MS / 2;

/* ---------- the monitor on distSim ---------- */

export type HeartbeatMsg = { type: 'heartbeat'; n: number };

export interface MonitorState {
  /** True arrival time of each heartbeat, in arrival order. */
  arrivals: number[];
  /** Gaps between consecutive arrivals, the newest WINDOW of them. */
  gaps: number[];
  suspected: boolean;
  /** True time of each moment the timeout ran out. */
  suspicions: number[];
}

const latencyOf = (jitterMs: number) => (rnd: () => number) => Math.min(LATENCY_CAP_MS, LATENCY_MIN_MS + exponential(rnd, 1 / jitterMs));

/** The wait M applies after an arrival: the fixed timeout, or the phi rule's implied timeout once it has enough gaps. */
export function waitAfterArrival(setup: Pick<DetectorSetup, 'rule' | 'timeoutMs' | 'phi'>, gaps: readonly number[]): number {
  if (setup.rule === 'fixed' || gaps.length < PHI_WARMUP_GAPS) return setup.timeoutMs;
  return impliedTimeout(setup.phi, meanOf(gaps), Math.max(MIN_SIGMA_MS, stdDev(gaps)));
}

export interface Detector {
  cluster: Cluster<HeartbeatMsg, DetectorView>;
  monitor: MonitorState;
  setup: DetectorSetup;
}
export interface DetectorView {
  suspected: boolean;
  suspicions: number;
}

export function buildDetector(setup: DetectorSetup): Detector {
  const monitor: MonitorState = { arrivals: [], gaps: [], suspected: false, suspicions: [] };
  let sent = 0;
  const peer: DistNode<HeartbeatMsg> = {
    init: (ctx) => ctx.setTimer('beat', HEARTBEAT_MS),
    onMessage: () => undefined,
    onTimer: (ctx: NodeCtx<HeartbeatMsg>) => {
      sent += 1;
      ctx.send('M', { type: 'heartbeat', n: sent });
      ctx.setTimer('beat', HEARTBEAT_MS);
    },
  };
  const monitorNode: DistNode<HeartbeatMsg, DetectorView> = {
    init: (ctx) => ctx.setTimer('suspect', setup.timeoutMs),
    onMessage: (ctx) => {
      const at = ctx.trueNow;
      const last = monitor.arrivals.at(-1);
      if (last !== undefined) monitor.gaps = [...monitor.gaps, at - last].slice(-WINDOW);
      monitor.arrivals.push(at);
      monitor.suspected = false;
      ctx.setTimer('suspect', waitAfterArrival(setup, monitor.gaps));
    },
    onTimer: (ctx) => {
      monitor.suspected = true;
      monitor.suspicions.push(ctx.trueNow);
    },
    snapshot: () => ({ suspected: monitor.suspected, suspicions: monitor.suspicions.length }),
  };
  const cluster = createCluster<HeartbeatMsg, DetectorView>({
    seed: setup.seed,
    nodes: { P: peer as DistNode<HeartbeatMsg, DetectorView>, M: monitorNode },
    latency: latencyOf(setup.jitterMs),
  });
  if (setup.crashAt !== null) cluster.crash('P', setup.crashAt);
  if (setup.pause) cluster.pause('P', setup.pause.from, setup.pause.to);
  return { cluster, monitor, setup };
}

/** Run a detector to `untilMs` of true time and hand back what M saw. */
export function runDetector(setup: DetectorSetup, untilMs: number): Detector {
  const d = buildDetector(setup);
  d.cluster.run({ until: untilMs });
  return d;
}

/** Rule 0, accuracy: while P is up and not paused, M does not suspect it. */
export const accuracyRule: Safety<DetectorView> = (snap) =>
  snap.nodes.M.state?.suspected && snap.nodes.P.up && !snap.nodes.P.paused
    ? `M suspected a live peer at t = ${Math.round(snap.time)} ms`
    : null;
export const DETECTOR_RULES: readonly Safety<DetectorView>[] = [accuracyRule];

/** Whether a suspicion at `t` is a false one: P is alive and not paused then. */
export function isFalseSuspicion(t: number, setup: Pick<DetectorSetup, 'crashAt' | 'pause'>): boolean {
  if (setup.crashAt !== null && t >= setup.crashAt) return false;
  if (setup.pause && t >= setup.pause.from && t < setup.pause.to) return false;
  return true;
}

export const falseSuspicions = (d: Detector): number[] => d.monitor.suspicions.filter((t) => isFalseSuspicion(t, d.setup));

/** The silence M waited before its first false suspicion: the timeout actually in force then (the phi rule's estimate grows with the gaps it has seen). Null without one. */
export function waitAtFirstFalse(d: Detector): number | null {
  const first = falseSuspicions(d)[0];
  if (first === undefined) return null;
  const last = d.monitor.arrivals.filter((a) => a < first).at(-1) ?? 0;
  return first - last;
}

/** After a crash: how long M took to suspect for good (the suspicion that follows the last arrival), or null if it never did. */
export function detectionTime(d: Detector): number | null {
  const { crashAt } = d.setup;
  if (crashAt === null) return null;
  const last = d.monitor.arrivals.at(-1) ?? -Infinity;
  const final = d.monitor.suspicions.find((t) => t > last);
  return final === undefined ? null : final - crashAt;
}

/* ---------- scene 1: one seeded run ---------- */

export type RunKind = 'quiet' | 'crash' | 'pause';
export const SCENE_RUN_MS = SEED_RUN_MS;
/** Scene 1's pause button: P stalls from 5.0 s to 5.6 s. */
export const SCENE1_PAUSE: PauseWindow = { from: CRASH_AT_MS, to: CRASH_AT_MS + PAUSE.default };

/** The setup a scene-1 button runs: the learner's controls plus the fault that button adds. */
export function setupFor(controls: DetectorSetup, kind: RunKind): DetectorSetup {
  return {
    ...controls,
    crashAt: kind === 'crash' ? crashTimeFor(controls.seed) : null,
    pause: kind === 'pause' ? SCENE1_PAUSE : null,
  };
}

export interface SuspicionBar {
  from: number;
  to: number;
  /** A live, unpaused peer was suspected when the bar began. */
  falseAlarm: boolean;
}

/** Each stretch during which M suspected P: from the timeout to the next arrival (or the run's end). */
export function suspicionBars(d: Detector, untilMs: number): SuspicionBar[] {
  return d.monitor.suspicions.map((from) => ({
    from,
    to: Math.min(untilMs, d.monitor.arrivals.find((a) => a > from) ?? untilMs),
    falseAlarm: isFalseSuspicion(from, d.setup),
  }));
}

/** The first moment M suspected a live, unpaused peer, worded as rule 0's message; null when it never did. */
export function accuracyMessage(d: Detector): string | null {
  const first = falseSuspicions(d)[0];
  return first === undefined ? null : `M suspected a live peer at t = ${Math.round(first)} ms`;
}

/* ---------- sweeps over seeds ---------- */

export interface SweepPoint {
  timeoutMs: number;
  /** Measured false suspicions per minute, over the sweep's runs. */
  falsePerMin: number;
  /** Measured mean detection time after a crash at CRASH_AT_MS, ms. */
  detectionMs: number;
}

/** Mean false suspicions per minute over `seeds` seeded 60 s runs, and mean detection time over `seeds` seeded crash runs. */
export function measurePoint(base: DetectorSetup, timeoutMs: number, seeds = SWEEP_SEEDS): SweepPoint {
  let falseTotal = 0;
  let detectTotal = 0;
  let detectCount = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const quiet = runDetector({ ...base, seed, timeoutMs, crashAt: null, pause: null }, MINUTE_MS);
    falseTotal += falseSuspicions(quiet).length;
    const crashed = runDetector({ ...base, seed, timeoutMs, crashAt: crashTimeFor(seed), pause: null }, CRASH_AT_MS + HEARTBEAT_MS + timeoutMs + 2 * LATENCY_CAP_MS);
    const t = detectionTime(crashed);
    if (t !== null) {
      detectTotal += t;
      detectCount += 1;
    }
  }
  return { timeoutMs, falsePerMin: falseTotal / seeds, detectionMs: detectCount === 0 ? Number.NaN : detectTotal / detectCount };
}

export const SWEEP_TIMEOUTS: readonly number[] = [120, 140, 160, 185, 210, 250];

/** The seeds in [from, to) on which rule 0 fails in a 10 s fault-free run: for the "fails on k of 200" line. */
export function failingSeeds(base: DetectorSetup, from = 1, to = SWEEP_SEEDS + 1): number[] {
  const bad: number[] = [];
  for (let seed = from; seed < to; seed++) {
    const d = buildDetector({ ...base, seed, crashAt: null, pause: null });
    d.cluster.start();
    let broken = false;
    while (d.cluster.queued > 0 && d.cluster.nextTime() <= SEED_RUN_MS && !broken) {
      d.cluster.step();
      broken = accuracyRule(d.cluster.snapshot()) !== null;
    }
    if (broken) bad.push(seed);
  }
  return bad;
}

/** Gaps (ms) between consecutive arrivals of one seeded fault-free run. */
export function sampleGaps(seed: number, jitterMs: number, untilMs: number): number[] {
  const d = runDetector({ ...defaultSetup(), seed, jitterMs, crashAt: null }, untilMs);
  return d.monitor.gaps;
}

/** What the phi model says next to what the gaps do: requested, true (closed form) and measured exceedance of the implied timeout. */
export interface PhiReadout {
  mu: number;
  sigma: number;
  timeoutMs: number;
  requested: number;
  actual: number;
  exceeded: number;
  gaps: number;
}

export function phiReadout(seed: number, jitterMs: number, phi: number, seeds = SWEEP_SEEDS): PhiReadout {
  const shown = sampleGaps(seed, jitterMs, SEED_RUN_MS + 1_000);
  const mu = meanOf(shown);
  const sigma = Math.max(MIN_SIGMA_MS, stdDev(shown));
  const timeoutMs = impliedTimeout(phi, mu, sigma);
  let exceeded = 0;
  let gaps = 0;
  for (let s = 1; s <= seeds; s++) {
    for (const g of sampleGaps(s, jitterMs, SEED_RUN_MS)) {
      gaps += 1;
      if (g > timeoutMs) exceeded += 1;
    }
  }
  return { mu, sigma, timeoutMs, requested: 10 ** -phi, actual: gapExceedsProbability(timeoutMs, jitterMs), exceeded, gaps };
}

/* ---------- scene 2: crash or pause ---------- */

export const SCENE2_UNTIL_MS = 11_000;

export interface TwinRuns {
  crash: Detector;
  pause: Detector;
  /** Index of the first arrival the two runs do not share, or -1 when they never part. */
  firstDifference: number;
  /** True arrival time of that heartbeat in the paused run: M's observations match until then. */
  partsAt: number | null;
}

export function twinRuns(seed: number, pauseMs: number, jitterMs = JITTER.default, timeoutMs = TIMEOUT.default): TwinRuns {
  const base = { ...defaultSetup(), seed, jitterMs, timeoutMs };
  const until = Math.max(SCENE2_UNTIL_MS, CRASH_AT_MS + pauseMs + 1_500);
  const crash = runDetector({ ...base, crashAt: CRASH_AT_MS }, until);
  const pause = runDetector({ ...base, pause: { from: CRASH_AT_MS, to: CRASH_AT_MS + pauseMs } }, until);
  const a = crash.monitor.arrivals;
  const b = pause.monitor.arrivals;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const parts = i < b.length || i < a.length;
  return { crash, pause, firstDifference: parts ? i : -1, partsAt: parts ? (b[i] ?? a[i]) : null };
}

export type Guess = 'crashed' | 'paused';

export interface Verdict {
  /** True when the two runs' observations are still equal at the decision time. */
  indistinguishable: boolean;
  /** Which worlds the answer is right in. */
  rightIn: ('A' | 'B')[];
  /** Which run the answer is right in, as a sentence. */
  scope: string;
  text: string;
}

const fmtMs = (ms: number) => String(Math.round(ms));
const answerScope = (guess: Guess): string => `Your answer, "${guess}", is right in run ${guess === 'crashed' ? 'A' : 'B'} only.`;

/** Scoring a "say crashed" / "say paused" answer at decision time `decideAt`, in both worlds (A: crash, B: pause). */
export function judge(twin: TwinRuns, decideAt: number, guess: Guess): Verdict {
  const parts = twin.partsAt;
  const same = parts === null || decideAt < parts;
  const rightIn: ('A' | 'B')[] = guess === 'crashed' ? ['A'] : ['B'];
  if (same) {
    const x = fmtMs(parts ?? Infinity);
    const text =
      guess === 'paused'
        ? `In run A the peer is dead. M's observations were the same until ${x} ms, so this answer was a guess.`
        : `In run B the peer was only paused. M's observations were the same until ${x} ms, so this answer was a guess.`;
    return { indistinguishable: true, rightIn, scope: answerScope(guess), text };
  }
  const text = `By ${fmtMs(decideAt)} ms the runs have parted: a heartbeat reached M at ${fmtMs(parts)} ms in run B and nothing did in run A, so a detector can tell them apart now. "Paused" fits the list with that heartbeat, "crashed" fits the list without it.`;
  return { indistinguishable: false, rightIn, scope: answerScope(guess), text };
}

/* ---------- scene 4: SWIM, ask a friend ---------- */

export const SWIM_PERIOD_MS = 500;
export const SWIM_DIRECT_MS = 100;
export const SWIM_END_MS = 300;
export const SWIM_HELPERS = ['H1', 'H2', 'H3', 'H4'] as const;
export const SWIM_PERIODS = 2_000;

export type SwimMsg =
  | { type: 'ping'; period: number; origin?: string }
  | { type: 'ping-req'; period: number }
  | { type: 'ack'; period: number; origin?: string };

export type SwimCut = 'none' | 'both' | 'm-to-b' | 'b-to-m';

export interface SwimSetup {
  seed: number;
  loss: number;
  k: number;
  cut: SwimCut;
  periods: number;
}

export const defaultSwim = (): SwimSetup => ({ seed: 1, loss: SWIM_LOSS.default, k: SWIM_K.default, cut: 'none', periods: SWIM_PERIODS });

export interface SwimResult {
  cluster: Cluster<SwimMsg, unknown>;
  /** Per period: did M get an ack (direct or through a helper) before the period's end? */
  acked: boolean[];
  /** Per period: did M have to fall back on ping-req? */
  askedHelpers: boolean[];
}

/** One run of M probing B every period; B is alive throughout, so every period without an ack is a false suspicion. */
export function runSwim(setup: SwimSetup): SwimResult {
  const acked: boolean[] = [];
  const askedHelpers: boolean[] = [];
  const pick = mulberry32(setup.seed ^ 0x5bd1e995);
  let period = 0;
  const monitor: DistNode<SwimMsg> = {
    init: (ctx) => ctx.setTimer('period', SWIM_PERIOD_MS),
    onMessage: (_ctx, msg) => {
      if (msg.payload.type === 'ack') acked[msg.payload.period] = true;
    },
    onTimer: (ctx, id) => {
      if (id === 'period') {
        period += 1;
        acked[period] = false;
        askedHelpers[period] = false;
        ctx.send('B', { type: 'ping', period });
        ctx.setTimer(`direct${period}`, SWIM_DIRECT_MS);
        ctx.setTimer('period', SWIM_PERIOD_MS);
        return;
      }
      const n = Number(id.slice('direct'.length));
      if (acked[n]) return;
      askedHelpers[n] = setup.k > 0;
      for (const h of shuffle(SWIM_HELPERS, pick).slice(0, setup.k)) ctx.send(h, { type: 'ping-req', period: n });
    },
  };
  const target: DistNode<SwimMsg> = {
    init: () => undefined,
    onMessage: (ctx, msg) => {
      if (msg.payload.type !== 'ping') return;
      ctx.send(msg.from, { type: 'ack', period: msg.payload.period, ...(msg.payload.origin ? { origin: msg.payload.origin } : {}) });
    },
    onTimer: () => undefined,
  };
  const helper: DistNode<SwimMsg> = {
    init: () => undefined,
    onMessage: (ctx, msg) => {
      const p = msg.payload;
      if (p.type === 'ping-req') ctx.send('B', { type: 'ping', period: p.period, origin: 'M' });
      else if (p.type === 'ack' && p.origin) ctx.send(p.origin, { type: 'ack', period: p.period });
    },
    onTimer: () => undefined,
  };
  const cluster = createCluster<SwimMsg, unknown>({
    seed: setup.seed,
    nodes: { M: monitor, B: target, H1: helper, H2: helper, H3: helper, H4: helper },
    loss: setup.loss,
  });
  const horizon = (setup.periods + 2) * SWIM_PERIOD_MS;
  if (setup.cut === 'both') cluster.partition('M', 'B', 0, horizon);
  if (setup.cut === 'm-to-b') cluster.partition('M', 'B', 0, horizon, { oneWay: true });
  if (setup.cut === 'b-to-m') cluster.partition('B', 'M', 0, horizon, { oneWay: true });
  cluster.run({ until: (setup.periods + 1) * SWIM_PERIOD_MS });
  return { cluster, acked: acked.slice(1, setup.periods + 1), askedHelpers: askedHelpers.slice(1, setup.periods + 1) };
}

export const swimFalseSuspicions = (r: SwimResult): number => r.acked.filter((a) => !a).length;

/**
 * Exact false-suspicion probability per period: a direct probe fails with q = 1 - (1-p)^2 (or 1 when the link is cut in a
 * direction the probe needs), one helper path M-H-B-H-M survives with (1-p)^4 (the cut never touches it), and k helpers fail together.
 */
export function swimFalseSuspicion(p: number, k: number, cut: SwimCut): number {
  const direct = cut === 'none' ? 1 - (1 - p) ** 2 : 1;
  const helperFails = 1 - (1 - p) ** 4;
  return direct * helperFails ** k;
}

/** How many loss patterns `swimEnumerated` walks: 2 bits for the direct round trip plus 4 per helper. */
export const swimPatternCount = (k: number): number => 2 ** (2 + 4 * k);

/**
 * The same probability by brute force: every pattern of which of the 2 + 4k messages are lost, weighted by p, and the
 * total weight of the patterns on which M hears nothing (the direct probe fails and every helper path fails).
 */
export function swimEnumerated(p: number, k: number, cut: SwimCut): number {
  const bits = 2 + 4 * k;
  let total = 0;
  for (let pattern = 0; pattern < 2 ** bits; pattern++) {
    let weight = 1;
    for (let b = 0; b < bits; b++) weight *= (pattern >> b) & 1 ? p : 1 - p;
    const lost = (b: number) => ((pattern >> b) & 1) === 1;
    const directOk = cut === 'none' && !lost(0) && !lost(1);
    let anyHelperOk = false;
    for (let h = 0; h < k; h++) {
      const base = 2 + 4 * h;
      if (!lost(base) && !lost(base + 1) && !lost(base + 2) && !lost(base + 3)) anyHelperOk = true;
    }
    if (!directOk && !anyHelperOk) total += weight;
  }
  return total;
}
