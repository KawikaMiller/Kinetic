/**
 * Conway's law as a board: eight INVENTED services, ten call edges, six invented change requests, up to three teams.
 * Pure: every figure on screen is one of these functions of a team assignment. No scenario, nothing branches.
 */
export type ServiceId = 'web' | 'mobile' | 'catalog' | 'search' | 'cart' | 'checkout' | 'payments' | 'orders';
export type TeamId = 'A' | 'B' | 'C';
export type Skill = 'front-end' | 'back-end' | 'payments';

export interface Service {
  id: ServiceId;
  /** Invented complexity points. */
  complexity: number;
  skill: Skill;
  /** Where the service is drawn (a fixed layout). */
  at: { x: number; y: number };
}

export const SERVICES: readonly Service[] = [
  { id: 'web', complexity: 3, skill: 'front-end', at: { x: 150, y: 40 } },
  { id: 'mobile', complexity: 2, skill: 'front-end', at: { x: 410, y: 40 } },
  { id: 'catalog', complexity: 3, skill: 'back-end', at: { x: 70, y: 150 } },
  { id: 'search', complexity: 4, skill: 'back-end', at: { x: 70, y: 265 } },
  { id: 'cart', complexity: 2, skill: 'back-end', at: { x: 230, y: 150 } },
  { id: 'checkout', complexity: 4, skill: 'back-end', at: { x: 390, y: 150 } },
  { id: 'payments', complexity: 5, skill: 'payments', at: { x: 310, y: 265 } },
  { id: 'orders', complexity: 3, skill: 'back-end', at: { x: 480, y: 265 } },
];
export const SERVICE_IDS: readonly ServiceId[] = SERVICES.map((s) => s.id);
export const TEAMS: readonly TeamId[] = ['A', 'B', 'C'];

export const EDGES: readonly (readonly [ServiceId, ServiceId])[] = [
  ['web', 'catalog'], ['web', 'cart'], ['web', 'checkout'],
  ['mobile', 'catalog'], ['mobile', 'cart'], ['mobile', 'checkout'],
  ['search', 'catalog'], ['cart', 'checkout'], ['checkout', 'payments'], ['checkout', 'orders'],
];

export interface Change {
  id: string;
  label: string;
  touches: readonly ServiceId[];
}
export const CHANGES: readonly Change[] = [
  { id: 'F1', label: 'a gift option at checkout', touches: ['web', 'mobile', 'cart', 'checkout', 'orders'] },
  { id: 'F2', label: 'a new payment method', touches: ['checkout', 'payments', 'web', 'mobile'] },
  { id: 'F3', label: 'faster search', touches: ['search', 'catalog'] },
  { id: 'F4', label: 'stock on the product page', touches: ['catalog', 'web', 'mobile'] },
  { id: 'F5', label: 'guest checkout', touches: ['cart', 'checkout', 'web', 'mobile'] },
  { id: 'F6', label: 'an order history page', touches: ['orders', 'web', 'mobile'] },
];

/** The cognitive-load cap is invented and learner-controlled; the default is the one the lesson opens on. */
export const CAP = { min: 13, max: 30, step: 1, default: 16 } as const;
/** The weight of one interface against one handoff in the reference search. */
export const WEIGHT = { min: 0, max: 2, step: 0.5, default: 1 } as const;
/** How many tied reference layouts the page lists. */
export const MAX_TIED_SHOWN = 6;

export const serviceOf = (id: ServiceId): Service => SERVICES.find((s) => s.id === id)!;

/** A team for each service, or null while it is unplaced. */
export type Layout = Readonly<Record<ServiceId, TeamId | null>>;
export type PlacedLayout = Readonly<Record<ServiceId, TeamId>>;

export const emptyLayout = (): Layout => Object.fromEntries(SERVICE_IDS.map((id) => [id, null])) as Layout;

/** Read the board's answers into a layout; anything that is not a team is unplaced. */
export function layoutFrom(answers: Readonly<Record<string, string | null>>): Layout {
  return Object.fromEntries(SERVICE_IDS.map((id) => [id, TEAMS.find((t) => t === answers[id]) ?? null])) as Layout;
}

export const placedCount = (l: Layout): number => SERVICE_IDS.filter((id) => l[id] !== null).length;
export const isPlaced = (l: Layout): l is PlacedLayout => placedCount(l) === SERVICE_IDS.length;

export const PRESETS: Readonly<Record<'one' | 'layer' | 'journey', { label: string; layout: PlacedLayout }>> = {
  one: { label: 'One team', layout: { web: 'A', mobile: 'A', catalog: 'A', search: 'A', cart: 'A', checkout: 'A', payments: 'A', orders: 'A' } },
  layer: { label: 'By layer', layout: { web: 'A', mobile: 'A', catalog: 'B', search: 'B', cart: 'B', checkout: 'B', orders: 'B', payments: 'C' } },
  journey: { label: 'By journey', layout: { web: 'A', mobile: 'A', cart: 'A', checkout: 'A', catalog: 'B', search: 'B', payments: 'C', orders: 'C' } },
};

export interface Metrics {
  /** For each change, the teams it touches. */
  teamsTouched: Readonly<Record<string, number>>;
  /** Sum over the changes of (teams touched - 1). */
  handoffs: number;
  /** Call edges whose ends are in different teams. */
  crossEdges: readonly (readonly [ServiceId, ServiceId])[];
  interfaces: number;
  /** Complexity owned by each team (0 for an unused team). */
  owned: Readonly<Record<TeamId, number>>;
  /** Owned complexity plus one per cross-team edge touching a service the team owns. */
  cognitive: Readonly<Record<TeamId, number>>;
  maxCognitive: number;
  /** Services that share a skill with another service of the same team. */
  peers: number;
  /** The teams over the cap, for the cap given to `metrics`. */
  over: readonly TeamId[];
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

/** Every figure of a complete layout against a cap. */
export function metrics(layout: PlacedLayout, cap: number): Metrics {
  const teamsTouched = Object.fromEntries(CHANGES.map((c) => [c.id, new Set(c.touches.map((s) => layout[s])).size]));
  const crossEdges = EDGES.filter(([a, b]) => layout[a] !== layout[b]);
  const owned = Object.fromEntries(TEAMS.map((t) => [t, sum(SERVICES.filter((s) => layout[s.id] === t).map((s) => s.complexity))])) as Record<TeamId, number>;
  const cognitive = Object.fromEntries(TEAMS.map((t) => [t, owned[t] + sum(crossEdges.map(([a, b]) => Number(layout[a] === t) + Number(layout[b] === t)))])) as Record<TeamId, number>;
  const maxCognitive = Math.max(...TEAMS.map((t) => cognitive[t]));
  const peers = SERVICES.filter((s) => SERVICES.some((o) => o.id !== s.id && layout[o.id] === layout[s.id] && o.skill === s.skill)).length;
  return {
    teamsTouched,
    handoffs: sum(Object.values(teamsTouched).map((n) => n - 1)),
    crossEdges,
    interfaces: crossEdges.length,
    owned,
    cognitive,
    maxCognitive,
    peers,
    over: TEAMS.filter((t) => cognitive[t] > cap),
  };
}

/** The layout with one service moved to another team. */
export const moveService = (layout: PlacedLayout, id: ServiceId, team: TeamId): PlacedLayout => ({ ...layout, [id]: team });

// ── The exhaustive reference ────────────────────────────────────────────────

export const ASSIGNMENT_COUNT = TEAMS.length ** SERVICE_IDS.length;

/** One of the 3^8 assignments with the three numbers the search needs. */
interface Candidate {
  layout: PlacedLayout;
  handoffs: number;
  interfaces: number;
  maxCognitive: number;
  peers: number;
}

let candidates: readonly Candidate[] | null = null;

/** All 3^8 = 6,561 assignments, built once. */
function allCandidates(): readonly Candidate[] {
  if (candidates) return candidates;
  const built: Candidate[] = [];
  for (let n = 0; n < ASSIGNMENT_COUNT; n += 1) {
    const layout = Object.fromEntries(SERVICE_IDS.map((id, i) => [id, TEAMS[Math.floor(n / TEAMS.length ** i) % TEAMS.length]])) as PlacedLayout;
    const m = metrics(layout, Infinity);
    built.push({ layout, handoffs: m.handoffs, interfaces: m.interfaces, maxCognitive: m.maxCognitive, peers: m.peers });
  }
  candidates = built;
  return built;
}

/** Relabel the teams in order of first appearance along the service order, so layouts that differ only by team names are one layout. */
export function canonical(layout: PlacedLayout): PlacedLayout {
  const names = new Map<TeamId, TeamId>();
  const next: Record<string, TeamId> = {};
  for (const id of SERVICE_IDS) {
    if (!names.has(layout[id])) names.set(layout[id], TEAMS[names.size]);
    next[id] = names.get(layout[id])!;
  }
  return next as PlacedLayout;
}

export const layoutKey = (layout: PlacedLayout): string => SERVICE_IDS.map((id) => layout[id]).join('');

export interface Reference {
  /** Null when no layout fits the cap. */
  score: number | null;
  /** The best layouts (one per distinct grouping), in a fixed order. */
  tied: readonly PlacedLayout[];
}

const referenceByRun = new Map<string, Reference>();

/** The layouts that minimise handoffs + weight x interfaces with every team's cognitive load at most `cap` (memoised per cap and weight). */
export function reference(cap: number, weight: number): Reference {
  const key = `${cap}|${weight}`;
  const hit = referenceByRun.get(key);
  if (hit) return hit;
  const fits = allCandidates().filter((c) => c.maxCognitive <= cap);
  const score = (c: Candidate) => c.handoffs + weight * c.interfaces;
  const best = fits.length ? Math.min(...fits.map(score)) : null;
  const groups = new Map<string, PlacedLayout>();
  for (const c of fits) if (score(c) === best) groups.set(layoutKey(canonical(c.layout)), canonical(c.layout));
  const result: Reference = { score: best, tied: [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, l]) => l) };
  referenceByRun.set(key, result);
  return result;
}

/** The smallest cap at which some layout fits. */
export const minFeasibleCap = (): number => Math.min(...allCandidates().map((c) => c.maxCognitive));

/** The teams a layout uses, in order, with their services. */
export const teamsOf = (layout: PlacedLayout): { team: TeamId; services: ServiceId[] }[] =>
  TEAMS.map((team) => ({ team, services: SERVICE_IDS.filter((id) => layout[id] === team) })).filter((t) => t.services.length > 0);

/** Does a dominate b on (handoffs, interfaces, maximum cognitive load: lower is better; skill peers: higher is better)? */
type Axes = Pick<Metrics, 'handoffs' | 'interfaces' | 'maxCognitive' | 'peers'>;
export function dominates(a: Axes, b: Axes): boolean {
  const axes = [b.handoffs - a.handoffs, b.interfaces - a.interfaces, b.maxCognitive - a.maxCognitive, a.peers - b.peers];
  return axes.every((d) => d >= 0) && axes.some((d) => d > 0);
}

/**
 * The distinct groupings (team names ignored) among all 3^8 assignments that dominate `layout` on the four axes and keep
 * every team's load at most `cap` (no cap by default).
 */
export function dominatingLayouts(layout: PlacedLayout, cap = Infinity): readonly PlacedLayout[] {
  const mine = metrics(layout, cap);
  const groups = new Map<string, PlacedLayout>();
  for (const c of allCandidates()) if (c.maxCognitive <= cap && dominates(c, mine)) groups.set(layoutKey(canonical(c.layout)), canonical(c.layout));
  return [...groups.values()];
}

/** How many distinct groupings of the services there are (set partitions into at most three teams), team names ignored. */
export const groupingCount = (): number => new Set(allCandidates().map((c) => layoutKey(canonical(c.layout)))).size;
