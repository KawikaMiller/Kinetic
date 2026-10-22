/**
 * How much rigour a decision deserves, as arithmetic. Every constant is INVENTED: the model shows how a trade-off
 * between the price of deliberating and the price of being wrong moves, not how much rigour any real decision needs.
 *
 *   total(r) = w * r + p0 * C * exp(-r / tau)
 *
 * C is the hours of work to undo the decision if it turns out wrong, p0 the chance it is wrong with no rigour, tau how
 * fast rigour shrinks that chance (hours), w the cost of one hour of rigour in hours of work.
 */
export interface Rigour {
  /** Hours of work to undo the decision (C). */
  undo: number;
  /** Chance of being wrong with no rigour (p0). */
  p0: number;
  /** Hours of rigour that cut the remaining chance to 1/e (tau). */
  tau: number;
  /** Hours of work one hour of rigour costs (w). */
  w: number;
}

export const RIGOUR_BOUNDS = {
  undo: { min: 0, max: 3000, step: 1 },
  p0: { min: 0.05, max: 0.9, step: 0.05 },
  tau: { min: 2, max: 40, step: 1 },
  w: { min: 0.5, max: 3, step: 0.5 },
  hours: { min: 0, max: 80, step: 1 },
} as const;

export const DEFAULT_TAU = 10;
export const DEFAULT_W = 1;

/** Expected cost, in hours of work, of deciding after `hours` of rigour. */
export const totalCost = (hours: number, m: Rigour): number => m.w * hours + m.p0 * m.undo * Math.exp(-hours / m.tau);

/** The cost to undo below which any deliberation costs more than it saves: tau * w / p0. */
export const crossoverCost = (p0: number, tau: number, w: number): number => (tau * w) / p0;

/** The hours of rigour that minimise the total; 0 (decide now) unless p0 * C is more than tau * w. */
export function optimalHours(m: Rigour): number {
  const ratio = (m.p0 * m.undo) / (m.tau * m.w);
  return ratio <= 1 ? 0 : m.tau * Math.log(ratio);
}

/** The total at the optimum: w * (r* + tau) when deliberating, p0 * C when deciding now. */
export const optimalTotal = (m: Rigour): number => totalCost(optimalHours(m), m);

/** True when some rigour beats deciding now. */
export const rigourPays = (m: Rigour): boolean => optimalHours(m) > 0;

// ── The ten decisions of scene 1 ────────────────────────────────────────────────

export interface Decision {
  id: string;
  label: string;
  /** A few words, for a picker. */
  short: string;
  /** Hours of work to undo it (C). */
  undo: number;
  /** Chance of being wrong with no rigour (p0). */
  p0: number;
}

export const DECISIONS: readonly Decision[] = [
  { id: 'rename', short: 'Rename', label: 'Rename an internal function', undo: 1, p0: 0.3 },
  { id: 'css', short: 'CSS names', label: 'Pick a CSS naming convention for one new page', undo: 8, p0: 0.4 },
  { id: 'flags', short: 'Flag library', label: 'Pick a feature-flag library for one service, wrapped behind an interface', undo: 20, p0: 0.4 },
  { id: 'fields', short: 'API fields', label: 'Name the public fields of a new API endpoint', undo: 150, p0: 0.3 },
  { id: 'database', short: 'Database', label: 'Choose the primary database engine', undo: 800, p0: 0.35 },
  { id: 'contract', short: 'Contract', label: 'Sign a three-year committed-spend contract', undo: 1200, p0: 0.4 },
  { id: 'deletion', short: 'Deletion policy', label: 'Set a 30-day deletion policy for user data', undo: 3000, p0: 0.2 },
  { id: 'abtest', short: 'A/B test', label: 'Run a one-week A/B test on a button colour', undo: 2, p0: 0.5 },
  { id: 'schema', short: 'Message schema', label: 'Adopt a message schema format six teams will use', undo: 400, p0: 0.35 },
  { id: 'oncall', short: 'On-call length', label: 'Pick the on-call rotation length', undo: 5, p0: 0.4 },
];

export type DecisionId = string;
export const decisionOf = (id: DecisionId): Decision => {
  const d = DECISIONS.find((x) => x.id === id);
  if (!d) throw new Error(`unknown decision ${id}`);
  return d;
};

/** One view of "cheap to undo": under this many hours. It is the crossover cost at p0 = 0.4, tau 10 h and w 1. */
export const COSTLY_UNDO_HOURS = 25;
/** One view of "unsure": a chance of being wrong of at least this. */
export const UNSURE_P0 = 0.35;

export type CellId = 'cheap-right' | 'cheap-unsure' | 'costly-right' | 'costly-unsure';
export const CELLS: readonly { id: CellId; label: string }[] = [
  { id: 'cheap-right', label: 'Cheap to undo, likely right' },
  { id: 'cheap-unsure', label: 'Cheap to undo, unsure' },
  { id: 'costly-right', label: 'Costly to undo, likely right' },
  { id: 'costly-unsure', label: 'Costly to undo, unsure' },
];

export const cellOf = (d: Decision): CellId => `${d.undo < COSTLY_UNDO_HOURS ? 'cheap' : 'costly'}-${d.p0 >= UNSURE_P0 ? 'unsure' : 'right'}` as CellId;
export const REFERENCE: Readonly<Record<DecisionId, CellId>> = Object.fromEntries(DECISIONS.map((d) => [d.id, cellOf(d)]));

/** The rigour model of a decision at the default tau and w. */
export const rigourOf = (d: Decision, tau = DEFAULT_TAU, w = DEFAULT_W): Rigour => ({ undo: d.undo, p0: d.p0, tau, w });

export interface RevealRow {
  id: DecisionId;
  label: string;
  undo: number;
  p0: number;
  crossover: number;
  hours: number;
  atOptimum: number;
  atZero: number;
}

/** What scene 1 reveals once every decision is placed. */
export const revealRows = (tau = DEFAULT_TAU, w = DEFAULT_W): RevealRow[] =>
  DECISIONS.map((d) => {
    const m = rigourOf(d, tau, w);
    return { id: d.id, label: d.label, undo: d.undo, p0: d.p0, crossover: crossoverCost(d.p0, tau, w), hours: optimalHours(m), atOptimum: optimalTotal(m), atZero: totalCost(0, m) };
  });

/** How many of the decisions are worth any rigour at all. */
export const deliberateCount = (): number => revealRows().filter((r) => r.hours > 0).length;

// ── Scene 3: doors that close, and techniques that make them wider ──────────────

/** The chance of being wrong the door-closing plot uses (the techniques use the picked decision's own). */
export const DOORS_P0 = 0.4;

export const DOORS = {
  c0: { min: 1, max: 500, step: 1 },
  growth: { min: 0, max: 30, step: 1 },
  month: { min: 0, max: 12, step: 1 },
} as const;

/** Cost to undo after `month` months of adoption growing at `growthPercent` a month. */
export const undoAt = (c0: number, growthPercent: number, month: number): number => c0 * (1 + growthPercent / 100) ** month;

export type DoorClosing = { kind: 'already' } | { kind: 'never' } | { kind: 'month'; month: number };

/** The month a two-way door becomes a one-way door: C(t) reaches the crossover cost. */
export function doorClosing(c0: number, growthPercent: number, crossover: number): DoorClosing {
  if (c0 >= crossover) return { kind: 'already' };
  if (growthPercent <= 0) return { kind: 'never' };
  return { kind: 'month', month: Math.log(crossover / c0) / Math.log(1 + growthPercent / 100) };
}

export interface Technique {
  id: string;
  label: string;
  /** What it multiplies the cost to undo by. */
  factor: number;
  /** Hours of upfront work to set it up (K). */
  setup: number;
}

export const TECHNIQUES: readonly Technique[] = [
  { id: 'flag', label: 'Feature flag', factor: 0.3, setup: 6 },
  { id: 'adapter', label: 'Adapter layer', factor: 0.5, setup: 12 },
  { id: 'expand', label: 'Expand then contract', factor: 0.4, setup: 16 },
  { id: 'pilot', label: 'Pilot with a small group', factor: 0.35, setup: 10 },
  { id: 'timebox', label: 'Time-boxed contract', factor: 0.6, setup: 20 },
];

export const techniqueOf = (id: string): Technique => {
  const t = TECHNIQUES.find((x) => x.id === id);
  if (!t) throw new Error(`unknown technique ${id}`);
  return t;
};

export interface TechniqueRow {
  technique: Technique;
  undoAfter: number;
  hoursAfter: number;
  totalAfter: number;
  /** Expected hours saved: the total before minus the total after, both at their own optimum. */
  saving: number;
  pays: boolean;
}

/** What a technique does to one decision: the cost to undo falls, and it pays only if the saving beats its setup. */
export function techniqueRow(m: Rigour, t: Technique): TechniqueRow {
  const after: Rigour = { ...m, undo: m.undo * t.factor };
  const saving = optimalTotal(m) - optimalTotal(after);
  return { technique: t, undoAfter: after.undo, hoursAfter: optimalHours(after), totalAfter: optimalTotal(after), saving, pays: saving > t.setup };
}

export const techniqueRows = (m: Rigour): TechniqueRow[] => TECHNIQUES.map((t) => techniqueRow(m, t));
