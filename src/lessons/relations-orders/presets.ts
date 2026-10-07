import { emptyRel, fromPred, type Rel } from './model';

export type PresetId = 'divides' | 'subsets' | 'tasks' | 'mod3' | 'near' | 'custom';

export interface Preset {
  id: PresetId;
  label: string;
  /** How to read a R b. */
  reads: string;
  labels: readonly string[];
  rel: Rel;
}

const DIVISORS = [1, 2, 3, 4, 6, 12];
const SETS = ['∅', 'a', 'b', 'c', 'ab', 'ac', 'bc', 'abc'];
const TASKS = ['spec', 'design', 'api', 'ui', 'tests', 'ship'];
/** Direct dependencies between tasks: [before, after]. */
const DEPS: [number, number][] = [[0, 1], [1, 2], [1, 3], [2, 4], [3, 4], [4, 5]];

/** Reflexive-transitive closure of the task dependencies: "comes before, or is the same task". */
function taskOrder(): Rel {
  const n = TASKS.length;
  const r = fromPred(n, (a, b) => a === b || DEPS.some(([x, y]) => x === a && y === b));
  for (let k = 0; k < n; k++) for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (r[a][k] && r[k][b]) r[a][b] = true;
  return r;
}

const subset = (x: string, y: string) => x === '∅' || [...x].every((ch) => y.includes(ch));

export const PRESETS: readonly Preset[] = [
  { id: 'divides', label: 'Divides (divisors of 12)', reads: 'a divides b', labels: DIVISORS.map(String), rel: fromPred(6, (a, b) => DIVISORS[b] % DIVISORS[a] === 0) },
  { id: 'subsets', label: 'Subsets of {a, b, c}', reads: 'a ⊆ b', labels: SETS, rel: fromPred(8, (a, b) => subset(SETS[a], SETS[b])) },
  { id: 'tasks', label: 'Task dependencies', reads: 'a comes before b (or is b)', labels: TASKS, rel: taskOrder() },
  { id: 'mod3', label: 'Same remainder mod 3', reads: 'a ≡ b (mod 3)', labels: Array.from({ length: 8 }, (_, i) => String(i)), rel: fromPred(8, (a, b) => a % 3 === b % 3) },
  { id: 'near', label: 'Within 1 of (not transitive)', reads: '|a − b| ≤ 1', labels: ['1', '2', '3', '4', '5', '6'], rel: fromPred(6, (a, b) => Math.abs(a - b) <= 1) },
];

export const CUSTOM_SIZES = [4, 5, 6, 7, 8] as const;

export const customPreset = (n: number): Preset => ({
  id: 'custom',
  label: 'Your own',
  reads: 'a R b',
  labels: Array.from({ length: n }, (_, i) => String(i + 1)),
  rel: emptyRel(n),
});
