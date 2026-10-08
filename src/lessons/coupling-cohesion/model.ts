/**
 * A toy shop codebase: 14 functions, the calls between them, and three module boxes to
 * put them in. Every score on screen is computed here from the current assignment.
 *
 * - Coupling: call edges whose two ends sit in different modules.
 * - Cohesion (per module): the share of the edges touching a module that stay inside it.
 * - Ca / Ce / I: Robert C. Martin's package metrics, counted over functions instead of
 *   classes. Ca (afferent) = functions outside that call into the module, Ce (efferent) =
 *   functions inside that call out, instability I = Ce / (Ca + Ce).
 * - A change request edits one function's interface, so the functions that call it
 *   directly are edited too: the change set is read off the call graph.
 */

export const FN_IDS = [
  'cartPage', 'priceCart', 'applyCoupon', 'couponRules', 'roundMoney',
  'checkoutPage', 'placeOrder', 'chargeCard', 'cardGateway', 'saveOrder',
  'sendReceipt', 'formatEmail', 'emailClient', 'receiptTemplate',
] as const;
export type FnId = (typeof FN_IDS)[number];

export type Layer = 'controller' | 'service' | 'util';
export type Feature = 'cart' | 'payment' | 'email';

export const FN_INFO: Record<FnId, { layer: Layer; feature: Feature }> = {
  cartPage: { layer: 'controller', feature: 'cart' },
  priceCart: { layer: 'service', feature: 'cart' },
  applyCoupon: { layer: 'service', feature: 'cart' },
  couponRules: { layer: 'util', feature: 'cart' },
  roundMoney: { layer: 'util', feature: 'cart' },
  checkoutPage: { layer: 'controller', feature: 'payment' },
  placeOrder: { layer: 'service', feature: 'payment' },
  chargeCard: { layer: 'service', feature: 'payment' },
  cardGateway: { layer: 'util', feature: 'payment' },
  saveOrder: { layer: 'util', feature: 'payment' },
  sendReceipt: { layer: 'service', feature: 'email' },
  formatEmail: { layer: 'util', feature: 'email' },
  emailClient: { layer: 'util', feature: 'email' },
  receiptTemplate: { layer: 'util', feature: 'email' },
};

export interface CallEdge {
  /** The caller. */
  from: FnId;
  /** The function it calls (or reads data from). */
  to: FnId;
}

export const EDGES: readonly CallEdge[] = [
  { from: 'cartPage', to: 'priceCart' },
  { from: 'priceCart', to: 'applyCoupon' },
  { from: 'applyCoupon', to: 'couponRules' },
  { from: 'priceCart', to: 'roundMoney' },
  { from: 'applyCoupon', to: 'roundMoney' },
  { from: 'checkoutPage', to: 'placeOrder' },
  { from: 'placeOrder', to: 'priceCart' },
  { from: 'placeOrder', to: 'chargeCard' },
  { from: 'chargeCard', to: 'cardGateway' },
  { from: 'placeOrder', to: 'saveOrder' },
  { from: 'placeOrder', to: 'sendReceipt' },
  { from: 'sendReceipt', to: 'formatEmail' },
  { from: 'formatEmail', to: 'receiptTemplate' },
  { from: 'sendReceipt', to: 'emailClient' },
  { from: 'formatEmail', to: 'roundMoney' },
];

/** The three module boxes, left to right. */
export const SLOTS = [0, 1, 2] as const;
export type Slot = (typeof SLOTS)[number];
export type Assignment = Record<FnId, Slot>;

export type PresetId = 'layer' | 'feature' | 'god';
export interface Preset {
  id: PresetId;
  label: string;
  /** Module names, by slot. */
  modules: readonly [string, string, string];
  assign: Assignment;
}

const assignBy = <T extends string>(key: (id: FnId) => T, order: readonly T[]): Assignment =>
  Object.fromEntries(FN_IDS.map((id) => [id, order.indexOf(key(id)) as Slot])) as Assignment;

export const PRESETS: Record<PresetId, Preset> = {
  layer: {
    id: 'layer',
    label: 'By layer',
    modules: ['controllers', 'services', 'utils'],
    assign: assignBy((id) => FN_INFO[id].layer, ['controller', 'service', 'util']),
  },
  feature: {
    id: 'feature',
    label: 'By feature',
    modules: ['cart', 'payment', 'email'],
    assign: assignBy((id) => FN_INFO[id].feature, ['cart', 'payment', 'email']),
  },
  god: {
    id: 'god',
    label: 'God module',
    modules: ['shop', 'spare A', 'spare B'],
    assign: assignBy(() => 'all', ['all']),
  },
};
export const PRESET_IDS = Object.keys(PRESETS) as PresetId[];

export type RequestId = 'coupon' | 'email' | 'receipt' | 'gateway' | 'rounding';
export interface ChangeRequest {
  id: RequestId;
  label: string;
  /** The function whose interface the request changes. */
  seed: FnId;
}

export const REQUESTS: readonly ChangeRequest[] = [
  { id: 'coupon', label: 'Change the coupon rules', seed: 'couponRules' },
  { id: 'email', label: 'Switch email provider', seed: 'emailClient' },
  { id: 'receipt', label: 'Redesign the receipt', seed: 'receiptTemplate' },
  { id: 'gateway', label: 'New card gateway', seed: 'cardGateway' },
  { id: 'rounding', label: 'Change price rounding', seed: 'roundMoney' },
];
export const requestById = (id: RequestId) => REQUESTS.find((r) => r.id === id)!;

/** Direct callers of a function, read off the call edges. */
export const callersOf = (fn: FnId): FnId[] => EDGES.filter((e) => e.to === fn).map((e) => e.from);

/** The functions a request edits: the seed, plus every function that calls it directly. */
export function changeSet(req: ChangeRequest): FnId[] {
  return [req.seed, ...callersOf(req.seed).filter((f) => f !== req.seed)];
}

export const crosses = (a: Assignment, e: CallEdge) => a[e.from] !== a[e.to];

/** Coupling: the number of call edges that cross a module boundary. */
export const coupling = (a: Assignment) => EDGES.filter((e) => crosses(a, e)).length;

export const membersOf = (a: Assignment, m: Slot) => FN_IDS.filter((id) => a[id] === m);

export interface ModuleStats {
  slot: Slot;
  size: number;
  internal: number;
  /** Edges with at least one end in the module. */
  touching: number;
  /** internal / touching, or null when no edge touches the module. */
  cohesion: number | null;
  /** Functions outside that call into the module. */
  ca: number;
  /** Functions inside that call out of it. */
  ce: number;
  /** Ce / (Ca + Ce), or null when both are 0. */
  instability: number | null;
}

export function moduleStats(a: Assignment, m: Slot): ModuleStats {
  const inside = (f: FnId) => a[f] === m;
  const internal = EDGES.filter((e) => inside(e.from) && inside(e.to)).length;
  const touching = EDGES.filter((e) => inside(e.from) || inside(e.to)).length;
  const ca = new Set(EDGES.filter((e) => !inside(e.from) && inside(e.to)).map((e) => e.from)).size;
  const ce = new Set(EDGES.filter((e) => inside(e.from) && !inside(e.to)).map((e) => e.from)).size;
  return {
    slot: m,
    size: membersOf(a, m).length,
    internal,
    touching,
    cohesion: touching ? internal / touching : null,
    ca,
    ce,
    instability: ca + ce ? ce / (ca + ce) : null,
  };
}

/** Mean cohesion over the modules that have any edges at all. */
export function meanCohesion(a: Assignment): number | null {
  const scores = SLOTS.map((m) => moduleStats(a, m).cohesion).filter((c): c is number => c !== null);
  return scores.length ? scores.reduce((s, c) => s + c, 0) / scores.length : null;
}

/** The modules a change request lands in, left to right. */
export function modulesTouched(a: Assignment, req: ChangeRequest): Slot[] {
  const hit = new Set(changeSet(req).map((f) => a[f]));
  return SLOTS.filter((m) => hit.has(m));
}

/** Functions living in the modules a change lands in: the code to re-read, retest and redeploy with it. */
export const blastRadius = (a: Assignment, req: ChangeRequest) =>
  modulesTouched(a, req).reduce<number>((n, m) => n + membersOf(a, m).length, 0);

/** How many of the change requests land in a module: its reasons to change. */
export const reasonsToChange = (a: Assignment, m: Slot) => REQUESTS.filter((r) => modulesTouched(a, r).includes(m)).length;

export const moveFn = (a: Assignment, fn: FnId, to: Slot): Assignment => ({ ...a, [fn]: to });

/**
 * How coupling changes if `fn` moves to `to`, from the moved function's own edges only:
 * each edge that stops crossing is −1, each that starts crossing is +1.
 */
export function couplingDelta(a: Assignment, fn: FnId, to: Slot): number {
  let delta = 0;
  for (const e of EDGES) {
    if (e.from !== fn && e.to !== fn) continue;
    const other = e.from === fn ? e.to : e.from;
    delta += Number(a[other] !== to) - Number(a[other] !== a[fn]);
  }
  return delta;
}

/** The edges that change state (start or stop crossing) when `fn` moves to `to`. */
export function edgesFlipped(a: Assignment, fn: FnId, to: Slot): CallEdge[] {
  const b = moveFn(a, fn, to);
  return EDGES.filter((e) => crosses(a, e) !== crosses(b, e));
}

/** Score thresholds this lesson colours by: its own rules of thumb, not a standard. */
export const THRESHOLDS = {
  /** Crossing edges as a share of all edges: at or below this is the cheap side. */
  couplingOk: 0.25,
  /** At or above this is the costly side. */
  couplingBad: 0.5,
  /** Blast radius as a share of all functions. */
  blastOk: 0.4,
  blastBad: 0.75,
} as const;

export type Verdict = 'ok' | 'bad' | 'muted';
export function verdict(share: number, ok: number, bad: number): Verdict {
  if (share <= ok) return 'ok';
  if (share >= bad) return 'bad';
  return 'muted';
}
