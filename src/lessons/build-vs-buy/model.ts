/**
 * Build vs buy: three INVENTED components of an invented scheduling product, each with three options, in thousands of an
 * invented currency. The cost model is pure; the benefit term is the learner's: it counts only when the component is
 * placed as something that sets the product apart.
 */
export type ComponentId = 'email' | 'search' | 'engine';
export type OptionId = 'build' | 'oss' | 'buy';
export type StageId = 'genesis' | 'custom' | 'product' | 'commodity';

export const OPTIONS: readonly { id: OptionId; label: string }[] = [
  { id: 'build', label: 'Build' },
  { id: 'oss', label: 'Open source, self-hosted' },
  { id: 'buy', label: 'Buy' },
];
export const STAGES: readonly { id: StageId; label: string }[] = [
  { id: 'genesis', label: 'Genesis' },
  { id: 'custom', label: 'Custom-built' },
  { id: 'product', label: 'Product' },
  { id: 'commodity', label: 'Commodity' },
];

/** A component's yearly benefit counts only when the learner placed it here: "you said it sets you apart". */
export const DIFFERENTIATING: readonly StageId[] = ['genesis', 'custom'];
export const benefitCounts = (stage: StageId): boolean => DIFFERENTIATING.includes(stage);

type PerOption<T> = Readonly<Record<OptionId, T>>;

export interface Component {
  id: ComponentId;
  label: string;
  /** Build: upfront cost. */
  upfront: number;
  /** Buy: integration cost, and the licence of year 1. */
  integration: number;
  licence: number;
  /** Open source: setup, and operations a year (staff time beyond this constant is not counted). */
  setup: number;
  operations: number;
  /** The component's own yearly benefit B, before a learner changes it. */
  benefit: number;
  reversal: PerOption<number>;
  months: PerOption<number>;
  /** Share of the benefit each option captures. */
  control: PerOption<number>;
  /** A visible, non-monetary column. */
  points: PerOption<number>;
}

export const COMPONENTS: readonly Component[] = [
  {
    id: 'email', label: 'email delivery', upfront: 360, integration: 30, licence: 60, setup: 80, operations: 60, benefit: 0,
    reversal: { build: 90, oss: 30, buy: 40 }, months: { build: 9, oss: 3, buy: 1 }, control: { build: 1, oss: 0.5, buy: 0 }, points: { build: 5, oss: 3, buy: 1 },
  },
  {
    id: 'search', label: 'search', upfront: 480, integration: 40, licence: 80, setup: 100, operations: 80, benefit: 150,
    reversal: { build: 120, oss: 40, buy: 60 }, months: { build: 10, oss: 4, buy: 1 }, control: { build: 1, oss: 0.5, buy: 0.25 }, points: { build: 5, oss: 3, buy: 2 },
  },
  {
    id: 'engine', label: 'scheduling engine', upfront: 720, integration: 60, licence: 100, setup: 150, operations: 90, benefit: 400,
    reversal: { build: 150, oss: 60, buy: 150 }, months: { build: 12, oss: 6, buy: 2 }, control: { build: 1, oss: 0.25, buy: 0 }, points: { build: 5, oss: 3, buy: 1 },
  },
];
export const componentOf = (id: ComponentId): Component => COMPONENTS.find((c) => c.id === id)!;

/** The author's placement, shown under a one-view label once everything is placed. */
export const REFERENCE: Readonly<Record<ComponentId, StageId>> = { email: 'commodity', search: 'product', engine: 'custom' };
/** The neutral placement the lesson opens on. */
export const DEFAULT_PLACEMENT: Readonly<Record<ComponentId, StageId>> = { email: 'product', search: 'product', engine: 'product' };

/** The sliders: licence growth and maintenance share in percent, horizon in years, yearly benefit B. */
export const GROWTH = { min: 0, max: 40, step: 5, default: 15 } as const;
export const MAINTENANCE = { min: 5, max: 40, step: 5, default: 20 } as const;
export const HORIZON = { min: 1, max: 10, step: 1, default: 3 } as const;
export const BENEFIT = { min: 0, max: 800, step: 10 } as const;
/** How far ahead the crossover year is searched. */
export const CROSSOVER_SCAN = 30;

export interface Assumptions {
  /** Licence growth a year, percent. */
  growth: number;
  /** Yearly maintenance as a share of the build cost, percent. */
  maintenance: number;
  horizon: number;
  /** Yearly benefit B for each component. */
  benefit: Readonly<Record<ComponentId, number>>;
  /** Add the cost of reversing the choice to every option. */
  includeReversal: boolean;
}

export const defaultAssumptions = (): Assumptions => ({
  growth: GROWTH.default,
  maintenance: MAINTENANCE.default,
  horizon: HORIZON.default,
  benefit: Object.fromEntries(COMPONENTS.map((c) => [c.id, c.benefit])) as Record<ComponentId, number>,
  includeReversal: false,
});

/** Cumulative cost at the end of year `n` (year 0 is the upfront cost). */
export function cumulativeCost(c: Component, o: OptionId, n: number, growth: number, maintenance: number): number {
  if (o === 'build') return c.upfront + (maintenance / 100) * c.upfront * n;
  if (o === 'oss') return c.setup + c.operations * n;
  let licences = 0;
  for (let year = 0; year < n; year += 1) licences += c.licence * (1 + growth / 100) ** year;
  return c.integration + licences;
}

export interface Row {
  option: OptionId;
  cost: number;
  /** The yearly benefit counted over the horizon: B x years x the share this option captures, or 0 when not placed as differentiating. */
  benefit: number;
  reversal: number;
  net: number;
  months: number;
  points: number;
}

export function rows(c: Component, stage: StageId, a: Assumptions): Row[] {
  return OPTIONS.map(({ id }) => {
    const cost = cumulativeCost(c, id, a.horizon, a.growth, a.maintenance);
    const benefit = benefitCounts(stage) ? a.benefit[c.id] * a.horizon * c.control[id] : 0;
    const reversal = a.includeReversal ? c.reversal[id] : 0;
    return { option: id, cost, benefit, reversal, net: cost - benefit + reversal, months: c.months[id], points: c.points[id] };
  });
}

/** The first year-end at which buying has cost more than building, searched up to CROSSOVER_SCAN years; null when it never does. */
export function crossoverYear(c: Component, growth: number, maintenance: number): number | null {
  for (let n = 0; n <= CROSSOVER_SCAN; n += 1) {
    if (cumulativeCost(c, 'buy', n, growth, maintenance) > cumulativeCost(c, 'build', n, growth, maintenance)) return n;
  }
  return null;
}

/** The options with the lowest net cost (a tie lists both). */
export function cheapest(rs: readonly Row[]): OptionId[] {
  const low = Math.min(...rs.map((r) => r.net));
  return rs.filter((r) => r.net === low).map((r) => r.option);
}

export interface CheapestFlip {
  /** The first horizon, in years, at which the lowest-net option differs from the one-year answer. */
  year: number;
  from: OptionId[];
  to: OptionId[];
}

/**
 * The first horizon (1 to CROSSOVER_SCAN years) at which the lowest-net option changes from what it is at one year, with the
 * placement and assumptions as given and only the horizon varied; null when it never changes.
 */
export function cheapestFlip(c: Component, stage: StageId, a: Assumptions): CheapestFlip | null {
  const at = (horizon: number) => cheapest(rows(c, stage, { ...a, horizon }));
  const from = at(1);
  for (let year = 2; year <= CROSSOVER_SCAN; year += 1) {
    const to = at(year);
    if (to.join() !== from.join()) return { year, from, to };
  }
  return null;
}

/**
 * The yearly benefit at which options `a` and `b` have the same net cost (with the same horizon, reversal setting
 * and the benefit counted); null when they capture the same share, so no benefit separates them.
 */
export function breakEven(c: Component, a: OptionId, b: OptionId, assumptions: Assumptions): number | null {
  const gap = c.control[a] - c.control[b];
  if (gap === 0) return null;
  const total = (o: OptionId) => cumulativeCost(c, o, assumptions.horizon, assumptions.growth, assumptions.maintenance) + (assumptions.includeReversal ? c.reversal[o] : 0);
  return (total(a) - total(b)) / (assumptions.horizon * gap);
}

export const PAIRS: readonly (readonly [OptionId, OptionId])[] = [['build', 'buy'], ['oss', 'buy'], ['build', 'oss']];

/** Options best on all four columns at once (an empty list says none is): net cost, months to value and cost to reverse low, control points high. */
export function bestOnAllColumns(c: Component, rs: readonly Row[]): OptionId[] {
  const best = {
    net: Math.min(...rs.map((r) => r.net)),
    months: Math.min(...rs.map((r) => r.months)),
    reversal: Math.min(...rs.map((r) => c.reversal[r.option])),
    points: Math.max(...rs.map((r) => r.points)),
  };
  return rs.filter((r) => r.net === best.net && r.months === best.months && c.reversal[r.option] === best.reversal && r.points === best.points).map((r) => r.option);
}

/** Does option `a` beat `b` or tie on every column, and strictly beat it on one? */
export function dominatesOption(c: Component, a: Row, b: Row): boolean {
  const d = [b.net - a.net, b.months - a.months, c.reversal[b.option] - c.reversal[a.option], a.points - b.points];
  return d.every((x) => x >= 0) && d.some((x) => x > 0);
}

/** The chart: cumulative cost at the end of each year 0 to the horizon. */
export function series(c: Component, o: OptionId, a: Assumptions): [number, number][] {
  return Array.from({ length: a.horizon + 1 }, (_, n) => [n, cumulativeCost(c, o, n, a.growth, a.maintenance)] as [number, number]);
}

/** Read the board's answers into a placement; a component left unplaced is Product, the neutral stage the lesson opens on. */
export function placementOf(answers: Readonly<Record<string, string | null>>): Record<ComponentId, StageId> {
  const stage = (id: ComponentId): StageId => STAGES.find((s) => s.id === answers[id])?.id ?? 'product';
  return { email: stage('email'), search: stage('search'), engine: stage('engine') };
}

/** A cost with up to two decimals, a thousands separator and a real minus. */
export function amount(x: number): string {
  const text = (Math.round(x * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
  return text.replace('-', '−');
}
