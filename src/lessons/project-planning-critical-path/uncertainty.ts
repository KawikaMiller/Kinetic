/** Scene 5: the preset's durations as ranges. A seeded Monte Carlo of the project length, criticality indices and merge bias. */
import { normal } from '../../core/distributions';
import { mulberry32 } from '../../core/random';
import { cpm, topoOrder, type Plan } from './cpm';

export const RUNS = 10_000;
export const SPREAD = { min: 0.1, max: 0.8, step: 0.1 };
export const UNCERTAINTY_DEFAULT = { sigma: 0.4, seed: 9 };
/** A task counts as critical in a run when its slack is below this (days): ties and rounding. */
const EPS = 1e-9;

export interface Uncertainty {
  lengths: number[];
  meanLength: number;
  /** Share of runs on which each task is on a longest path. */
  criticality: Record<string, number>;
  /** The most tasks critical in any one run, and the fewest. */
  criticalPerRun: { min: number; max: number };
  meanEf: Record<string, number>;
  meanEs: Record<string, number>;
}

/** Each task's duration is log-normal with the planned days as its median and `sigma` as its log-spread. */
export function simulateProject(plan: Plan, sigma: number, seed: number, runs = RUNS): Uncertainty {
  const order = topoOrder(plan)!;
  const rnd = mulberry32(seed);
  const preds = new Map(plan.tasks.map((t) => [t.id, plan.edges.filter(([, b]) => b === t.id).map(([a]) => a)]));
  const succs = new Map(plan.tasks.map((t) => [t.id, plan.edges.filter(([a]) => a === t.id).map(([, b]) => b)]));
  const lengths: number[] = [];
  const critical: Record<string, number> = Object.fromEntries(plan.tasks.map((t) => [t.id, 0]));
  const sumEf: Record<string, number> = { ...critical };
  const sumEs: Record<string, number> = { ...critical };
  let min = Infinity;
  let max = 0;
  for (let r = 0; r < runs; r++) {
    const d: Record<string, number> = {};
    for (const t of plan.tasks) d[t.id] = t.days * Math.exp(sigma * normal(rnd));
    const es: Record<string, number> = {};
    const ef: Record<string, number> = {};
    for (const id of order) {
      es[id] = Math.max(0, ...preds.get(id)!.map((p) => ef[p]));
      ef[id] = es[id] + d[id];
    }
    const length = Math.max(...Object.values(ef));
    const ls: Record<string, number> = {};
    for (const id of [...order].reverse()) ls[id] = (succs.get(id)!.length ? Math.min(...succs.get(id)!.map((n) => ls[n])) : length) - d[id];
    let count = 0;
    for (const id of order) {
      if (ls[id] - es[id] < EPS) {
        critical[id]++;
        count++;
      }
      sumEf[id] += ef[id];
      sumEs[id] += es[id];
    }
    min = Math.min(min, count);
    max = Math.max(max, count);
    lengths.push(length);
  }
  const share = (m: Record<string, number>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v / runs]));
  return {
    lengths: lengths.sort((a, b) => a - b),
    meanLength: lengths.reduce((a, b) => a + b, 0) / runs,
    criticality: share(critical),
    criticalPerRun: { min, max },
    meanEf: share(sumEf),
    meanEs: share(sumEs),
  };
}

/** Mean of the later of two independent normal paths, by seeded simulation. */
export function maxOfTwoPaths(mean: number, sd: number, seed: number, runs = RUNS): number {
  const rnd = mulberry32(seed);
  let sum = 0;
  for (let r = 0; r < runs; r++) sum += Math.max(mean + sd * normal(rnd), mean + sd * normal(rnd));
  return sum / runs;
}

export const MERGE_DEMO = { mean: 10, sd: 2, seed: 4 };
/** The closed form for two equal independent normals: the mean of the maximum is mean + sd / sqrt(pi). */
export const expectedMaxClosedForm = (mean: number, sd: number) => mean + sd / Math.sqrt(Math.PI);

/**
 * The mean length of the plan's critical chain on its own, in closed form. Each duration is log-normal with the plan as its
 * median, so its mean is the plan times e^(sigma^2 / 2); the chain's mean is the sum. This is the skew part of the gap between
 * the plan and the simulated average. Valid when the critical tasks form one chain (they do in the preset).
 */
export function criticalChainMean(plan: Plan, sigma: number): number {
  const critical = new Set(cpm(plan).critical);
  const planned = plan.tasks.filter((t) => critical.has(t.id)).reduce((s, t) => s + t.days, 0);
  return planned * Math.exp((sigma * sigma) / 2);
}

/** Split the simulated average's excess over the plan into skew (the chain's own mean above its median) and merge bias. */
export function gapSplit(plan: Plan, planned: number, meanLength: number, sigma: number): { skew: number; merge: number } {
  const chain = criticalChainMean(plan, sigma);
  return { skew: chain - planned, merge: Math.max(0, meanLength - chain) };
}
