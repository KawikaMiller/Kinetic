/**
 * Five anycast points of presence that share abstract load by catchment, and a scrubbing classifier
 * over seeded scores. Rates are numbers only: nothing is generated, sent or measured on a network.
 * Every capacity and rate is a named constant and illustrative.
 */
import { normal } from '../../core/distributions';
import { clamp01 } from '../../core/math';
import { mulberry32 } from '../../core/random';
import { confusionAt, type Confusion } from '../../core/stats';
import { createTickSim, type TickSim } from '../../core/simTick';

export const POP_CAPACITY: readonly number[] = [400, 300, 300, 200, 200];
export const POP_COUNT = POP_CAPACITY.length;
export const TOTAL_CAPACITY = POP_CAPACITY.reduce((a, b) => a + b, 0);
/** Legitimate traffic, Mbit/s. */
export const LEGIT_TOTAL = 300;
export const ATTACK_RANGE = { min: 0, max: 1400, step: 50, default: 1000 } as const;
export const SKEW_RANGE = { min: 0, max: 100, step: 10, default: 80 } as const;
export const EXTRA_RANGE = { min: 0, max: 1000, step: 100, default: 0 } as const;

/** Capacity of each site, with `extra` added at site 1. */
export const capacities = (extra: number): number[] => POP_CAPACITY.map((c, i) => (i === 0 ? c + extra : c));

/** Each site's share of the traffic: proportional to its capacity at skew 0, all of it at site 1 at skew 100. */
export function catchment(skewPct: number, caps: readonly number[]): number[] {
  const total = caps.reduce((a, b) => a + b, 0);
  const s = skewPct / 100;
  return caps.map((c, i) => (1 - s) * (c / total) + (i === 0 ? s : 0));
}

export interface SiteLoad {
  capacity: number;
  attack: number;
  legit: number;
  /** What arrives, attack plus legitimate. */
  load: number;
  /** Legitimate traffic served: the site drops in proportion when it is over capacity. */
  legitServed: number;
}

export interface PopsResult {
  sites: SiteLoad[];
  legitDropped: number;
  overloaded: number[];
}

/** Legitimate traffic a site served: it drops in proportion when over capacity. */
const legitServedAt = (legit: number, load: number, capacity: number): number => (load <= capacity ? legit : (legit * capacity) / load);

export function pops(attack: number, legit: number, skewPct: number, extra: number): PopsResult {
  const caps = capacities(extra);
  const w = catchment(skewPct, caps);
  const sites = caps.map((capacity, i) => {
    const a = attack * w[i];
    const l = legit * w[i];
    const load = a + l;
    return { capacity, attack: a, legit: l, load, legitServed: legitServedAt(l, load, capacity) };
  });
  return {
    sites,
    // Summed per site so an uncongested site contributes exactly 0 (a total-minus-served subtraction leaves float residue).
    legitDropped: sites.reduce((acc, s) => acc + (s.legit - s.legitServed), 0),
    overloaded: sites.flatMap((s, i) => (s.load > s.capacity ? [i] : [])),
  };
}

// ── A seeded run of the same, tick by tick ────────────────────────────────────

/** One tick is one second: the load ramps up over this many, and legitimate traffic wobbles by this much. */
export const RAMP_TICKS = 5;
export const RUN_TICKS = 30;
export const LEGIT_WOBBLE = 0.1;

export interface PopsState {
  tick: number;
  attack: number;
  legit: number;
  loads: number[];
  legitDropped: number;
}

export interface PopsRunConfig {
  seed: number;
  attack: number;
  skewPct: number;
  extra: number;
}

/** Conservation: what the sites receive adds up to what was sent, at every tick. */
export const CONSERVATION_TOLERANCE = 1e-6;

export function createPopsSim(c: PopsRunConfig): TickSim<PopsState> {
  const caps = capacities(c.extra);
  const w = catchment(c.skewPct, caps);
  const at = (tick: number, rnd: () => number): Pick<PopsState, 'attack' | 'legit'> => ({
    attack: c.attack * Math.min(1, tick / RAMP_TICKS),
    legit: LEGIT_TOTAL * (1 + LEGIT_WOBBLE * (2 * rnd() - 1)),
  });
  const state = (tick: number, rnd: () => number): PopsState => {
    const { attack, legit } = at(tick, rnd);
    const loads = w.map((share) => (attack + legit) * share);
    const legitDropped = loads.reduce((acc, load, i) => acc + (legit * w[i] - legitServedAt(legit * w[i], load, caps[i])), 0);
    return { tick, attack, legit, loads, legitDropped };
  };
  return createTickSim<PopsState>({
    seed: c.seed,
    init: (rnd) => state(0, rnd),
    step: (_s, rnd, tick) => state(tick, rnd),
    check: (s) => (Math.abs(s.loads.reduce((a, b) => a + b, 0) - (s.attack + s.legit)) > CONSERVATION_TOLERANCE ? 'the sites received more or less than was sent' : null),
  });
}

export function runPops(c: PopsRunConfig): { sim: TickSim<PopsState>; final: PopsState; worstDropped: number } {
  const sim = createPopsSim(c);
  sim.run(RUN_TICKS);
  return { sim, final: sim.state, worstDropped: Math.max(...sim.history.map((s) => s.legitDropped)) };
}

// ── Scrubbing: a classifier over seeded scores ────────────────────────────────

export const FLOWS_PER_CLASS = 1000;
export const LEGIT_SCORE = { mean: 0.3, sd: 0.15 } as const;
export const ATTACK_SCORE = { mean: 0.7, sd: 0.15 } as const;
export const THRESHOLD_RANGE = { min: 0, max: 1.05, step: 0.05, default: 0.5 } as const;

export interface Scored {
  score: number;
  /** 1 for unwanted, 0 for legitimate. */
  label: 0 | 1;
}


/** Scores for each flow: the unwanted ones tend high, the legitimate ones low, and the two overlap. */
export function scoreSet(seed: number, n = FLOWS_PER_CLASS): Scored[] {
  const rnd = mulberry32(seed);
  return [
    ...Array.from({ length: n }, () => ({ score: clamp01(normal(rnd, LEGIT_SCORE.mean, LEGIT_SCORE.sd)), label: 0 as const })),
    ...Array.from({ length: n }, () => ({ score: clamp01(normal(rnd, ATTACK_SCORE.mean, ATTACK_SCORE.sd)), label: 1 as const })),
  ];
}

export interface ScrubPoint {
  threshold: number;
  confusion: Confusion;
  /** Share of unwanted flows dropped, and of legitimate flows dropped. */
  attackRemoved: number;
  legitDropped: number;
}

/** What dropping every flow scored at or above `threshold` does. */
export function scrubAt(scored: readonly Scored[], threshold: number): ScrubPoint {
  const confusion = confusionAt(scored, threshold);
  return { threshold, confusion, attackRemoved: confusion.tp / (confusion.tp + confusion.fn), legitDropped: confusion.fp / (confusion.fp + confusion.tn) };
}

export const thresholdGrid = (): number[] => {
  const out: number[] = [];
  for (let t = THRESHOLD_RANGE.min; t <= THRESHOLD_RANGE.max + 1e-9; t += 0.01) out.push(Math.round(t * 100) / 100);
  return out;
};
