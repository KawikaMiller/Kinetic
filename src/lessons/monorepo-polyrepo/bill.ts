/**
 * Scene 2: what a change costs in CI as the repository grows. A seeded random dependency graph
 * gives every change an affected set; with affected-set detection CI builds that set, without it
 * CI builds everything. The graph shape and the minutes are invented.
 */
import { mulberry32 } from '../../core/random';
import { affectedSet, type Graph } from './graph';

/** CI minutes one package costs to build and test. Illustrative. */
export const PACKAGE_CI_MINUTES = 2;
/** Packages per repository the learner may pick. */
export const SIZE_MIN = 5;
export const SIZE_MAX = 500;
export const SIZE_STEP = 5;
/** Each package depends on about this many earlier ones. Invented shape. */
export const AVG_DEPS = 2;
/** The graphs the "next graph" button steps through. */
export const GRAPH_SEEDS = [11, 23, 37, 51, 64] as const;
/** Sizes drawn on the curve. */
export const CURVE_SIZES = [5, 25, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500] as const;

/** A random acyclic graph of `size` packages: package i depends on each earlier package with probability AVG_DEPS / i, so about AVG_DEPS of them. */
export function randomDag(size: number, seed: number): Graph {
  const rnd = mulberry32(seed * 1_000_003 + size);
  const nodes = Array.from({ length: size }, (_, i) => `p${i}`);
  const deps: Record<string, string[]> = {};
  nodes.forEach((n, i) => {
    deps[n] = nodes.slice(0, i).filter(() => rnd() < Math.min(1, AVG_DEPS / i));
  });
  return { nodes, deps };
}

export interface Bill {
  size: number;
  /** Mean packages in the affected set, taking each package in turn as the one that changed. */
  meanAffected: number;
  /** meanAffected over size. */
  affectedFraction: number;
  /** CI minutes per change with detection (the affected set) and without (everything). */
  withDetection: number;
  withoutDetection: number;
}

const cache = new Map<string, Bill>();

/** The bill for a repository of `size` packages, averaged over every package being the one that changed. */
export function bill(size: number, seed: number): Bill {
  const key = `${size}/${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const g = randomDag(size, seed);
  const total = g.nodes.reduce((sum, n) => sum + affectedSet(g, n).size, 0);
  const meanAffected = total / size;
  const out: Bill = {
    size,
    meanAffected,
    affectedFraction: meanAffected / size,
    withDetection: meanAffected * PACKAGE_CI_MINUTES,
    withoutDetection: size * PACKAGE_CI_MINUTES,
  };
  cache.set(key, out);
  return out;
}

/** Minutes a change costs under the learner's setting. */
export const minutesFor = (b: Bill, detection: boolean): number => (detection ? b.withDetection : b.withoutDetection);

/** The next of the pinned graphs. */
export const nextSeed = (seed: number): number => GRAPH_SEEDS[(GRAPH_SEEDS.indexOf(seed as (typeof GRAPH_SEEDS)[number]) + 1) % GRAPH_SEEDS.length];
