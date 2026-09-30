/**
 * The test pyramid as numbers: how long each layer takes and how often a test fails for
 * no reason (flakiness). All figures are illustrative, chosen to show the shape of the
 * trade-off, not measured from a real suite.
 */

export type Layer = 'unit' | 'integration' | 'e2e';

export const LAYERS: Layer[] = ['unit', 'integration', 'e2e'];

export interface LayerSpec {
  label: string;
  /** Seconds per test. */
  seconds: number;
  /** Chance a single run of one test fails even though nothing is broken. */
  flake: number;
  max: number;
}

export const SPEC: Record<Layer, LayerSpec> = {
  unit: { label: 'Unit', seconds: 0.01, flake: 0, max: 400 },
  integration: { label: 'Integration', seconds: 0.5, flake: 0.002, max: 100 },
  e2e: { label: 'E2E', seconds: 20, flake: 0.015, max: 50 },
};

export type Counts = Record<Layer, number>;

export const PRESETS: { id: string; label: string; counts: Counts }[] = [
  { id: 'pyramid', label: 'Pyramid', counts: { unit: 300, integration: 60, e2e: 10 } },
  { id: 'diamond', label: 'Diamond', counts: { unit: 40, integration: 100, e2e: 15 } },
  { id: 'cone', label: 'Ice-cream cone', counts: { unit: 20, integration: 40, e2e: 50 } },
];

export type Shape = 'pyramid' | 'diamond' | 'ice-cream cone' | 'hourglass' | 'no tests';

/** Name the shape the counts make, reading bottom (unit) to top (E2E). */
export function shapeOf(c: Counts): Shape {
  const { unit: u, integration: i, e2e: e } = c;
  if (u + i + e === 0) return 'no tests';
  if (u >= i && i >= e) return 'pyramid';
  if (e >= i && i >= u) return 'ice-cream cone';
  if (i > u && i > e) return 'diamond';
  return 'hourglass';
}

/** Seconds for the whole suite on one runner: every test, one after another. */
export function suiteSeconds(c: Counts): number {
  return LAYERS.reduce((sum, l) => sum + c[l] * SPEC[l].seconds, 0);
}

/** P(the whole suite is green | nothing is broken) = Π (1 − pᵢ) over every test. */
export function pGreen(c: Counts): number {
  return LAYERS.reduce((p, l) => p * (1 - SPEC[l].flake) ** c[l], 1);
}

export type Bug = 'logic' | 'wiring' | 'browser';

export const BUGS: { id: Bug; label: string; layer: Layer; example: string }[] = [
  { id: 'logic', label: 'Logic bug', layer: 'unit', example: 'discount applied twice' },
  { id: 'wiring', label: 'Wiring bug', layer: 'integration', example: 'wrong column name in the SQL' },
  { id: 'browser', label: 'Real-browser bug', layer: 'e2e', example: 'pay button hidden on Safari' },
];

/**
 * Which layer catches a planted bug: the cheapest layer that can see it, as long as the
 * suite has tests there. (An E2E test may stumble on a logic bug too, but tells you only
 * that checkout broke, not where; this model gives each bug its home layer.)
 */
export function catches(c: Counts, bug: Bug): boolean {
  return c[BUGS.find((b) => b.id === bug)!.layer] > 0;
}

export type Result = 'pass' | 'flake' | 'fail';

export interface TestRun {
  layer: Layer;
  /** Seconds from the start of the suite when this test finishes. */
  end: number;
  result: Result;
}

/**
 * One run of the suite: layers in order (unit, then integration, then E2E), every test
 * rolled against its flake rate. A planted bug makes the first test of its layer fail.
 */
export function runSuite(c: Counts, bug: Bug | null, rnd: () => number): TestRun[] {
  const runs: TestRun[] = [];
  let t = 0;
  const bugLayer = bug ? BUGS.find((b) => b.id === bug)!.layer : null;
  for (const layer of LAYERS) {
    for (let k = 0; k < c[layer]; k++) {
      t += SPEC[layer].seconds;
      const result: Result = layer === bugLayer && k === 0 ? 'fail' : rnd() < SPEC[layer].flake ? 'flake' : 'pass';
      runs.push({ layer, end: t, result });
    }
  }
  return runs;
}

export function isGreen(runs: readonly TestRun[]): boolean {
  return runs.every((r) => r.result === 'pass');
}
