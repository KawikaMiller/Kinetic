/**
 * The invented checkout system, its trust zones, the STRIDE-per-element chart and the nine controls.
 * Pure logic: no React. Every number the lesson quotes (cells, crossings, meters) is computed here.
 */
import type { PlainTone } from '../../core/tone';

// ── Zones ────────────────────────────────────────────────────────────────

export type ZoneId = 'internet' | 'app' | 'data' | 'third';

/** Trust boundaries are drawn as zones. They are plain categories, so each gets a categorical tone. */
export const ZONES: readonly { id: ZoneId; label: string; tone: PlainTone | 'violet' }[] = [
  { id: 'internet', label: 'Internet', tone: 'amber' },
  { id: 'app', label: 'App tier', tone: 'pink' },
  { id: 'data', label: 'Data tier', tone: 'sky' },
  { id: 'third', label: 'Third party', tone: 'violet' },
];

export const zoneLabel = (z: ZoneId) => ZONES.find((x) => x.id === z)!.label;

// ── Elements and flows ───────────────────────────────────────────────────

export type ElementId = 'browser' | 'webapp' | 'payment' | 'orders' | 'audit';
export type TargetKind = 'external' | 'process' | 'store' | 'flow';

export interface Target {
  id: string;
  label: string;
  kind: TargetKind;
  /** A data store that is a log: the per-element chart adds Repudiation for it. */
  log?: boolean;
}

export const ELEMENTS: readonly (Target & { id: ElementId; kind: Exclude<TargetKind, 'flow'> })[] = [
  { id: 'browser', label: 'Browser', kind: 'external' },
  { id: 'webapp', label: 'Web app', kind: 'process' },
  { id: 'payment', label: 'Payment provider', kind: 'external' },
  { id: 'orders', label: 'Orders DB', kind: 'store' },
  { id: 'audit', label: 'Audit log', kind: 'store', log: true },
];

export interface Flow extends Target {
  kind: 'flow';
  from: ElementId;
  to: ElementId;
  /** The short word drawn on the arrow. */
  tag: string;
}

export const FLOWS: readonly Flow[] = [
  { id: 'f-browser-web', label: 'Browser to Web app', kind: 'flow', from: 'browser', to: 'webapp', tag: 'order' },
  { id: 'f-web-orders', label: 'Web app to Orders DB', kind: 'flow', from: 'webapp', to: 'orders', tag: 'records' },
  { id: 'f-web-payment', label: 'Web app to Payment provider', kind: 'flow', from: 'webapp', to: 'payment', tag: 'charge' },
  { id: 'f-web-audit', label: 'Web app to Audit log', kind: 'flow', from: 'webapp', to: 'audit', tag: 'events' },
];

/** Everything STRIDE is applied to: the five elements, then the four flows. */
export const TARGETS: readonly Target[] = [...ELEMENTS, ...FLOWS];

export const targetById = (id: string): Target => TARGETS.find((t) => t.id === id)!;

/** The kind of thing a target is, in words. */
export const KIND_WORD: Record<TargetKind, string> = { external: 'external entity', process: 'process', store: 'data store', flow: 'data flow' };

// ── STRIDE ───────────────────────────────────────────────────────────────

export type Category = 'S' | 'T' | 'R' | 'I' | 'D' | 'E';

export const CATEGORIES: readonly { id: Category; name: string; property: string }[] = [
  { id: 'S', name: 'Spoofing', property: 'authentication' },
  { id: 'T', name: 'Tampering', property: 'integrity' },
  { id: 'R', name: 'Repudiation', property: 'non-repudiation' },
  { id: 'I', name: 'Information disclosure', property: 'confidentiality' },
  { id: 'D', name: 'Denial of service', property: 'availability' },
  { id: 'E', name: 'Elevation of privilege', property: 'authorisation' },
];

export const categoryById = (c: Category) => CATEGORIES.find((x) => x.id === c)!;

/** The per-element chart, as taught from Shostack's book (from memory, chipped on screen). */
const CHART: Record<TargetKind, readonly Category[]> = {
  external: ['S', 'R'],
  process: ['S', 'T', 'R', 'I', 'D', 'E'],
  flow: ['T', 'I', 'D'],
  store: ['T', 'I', 'D'],
};

/** The categories that apply to a target, in S-T-R-I-D-E order. A log adds Repudiation to a store. */
export function categoriesOf(t: Target): Category[] {
  const base = new Set<Category>(CHART[t.kind]);
  if (t.kind === 'store' && t.log) base.add('R');
  return CATEGORIES.map((c) => c.id).filter((c) => base.has(c));
}

export const cellId = (targetId: string, c: Category) => `${targetId}:${c}`;

export interface Cell {
  id: string;
  target: Target;
  category: Category;
}

/** Every applicable (target, category) cell, in grid order. */
export const CELLS: readonly Cell[] = TARGETS.flatMap((target) => categoriesOf(target).map((category) => ({ id: cellId(target.id, category), target, category })));

/**
 * One curated, generic threat sentence per applicable cell, written for the invented system and
 * naming no technique: what goes wrong, never how.
 */
export const THREAT_TEXT: Readonly<Record<string, string>> = {
  'browser:S': 'an impostor presents itself to the web app as a signed-in customer',
  'browser:R': 'a customer says they never placed an order, and nothing on record shows otherwise',
  'webapp:S': 'something else answers customers as if it were the web app',
  'webapp:T': 'the web app is changed without anyone noticing',
  'webapp:R': 'the web app does something on a customer\'s behalf and keeps no record of who asked',
  'webapp:I': 'the web app shows one customer another customer\'s order details',
  'webapp:D': 'so many requests arrive that real customers cannot check out',
  'webapp:E': 'an ordinary customer\'s request is allowed to do something only staff should do',
  'payment:S': 'something other than the payment provider answers the web app as if it were the provider',
  'payment:R': 'the provider disputes a charge it confirmed, and there is no record of its confirmation',
  'orders:T': 'stored orders are changed without anyone noticing',
  'orders:I': 'someone who should not read orders can read them',
  'orders:D': 'the orders store becomes unavailable and checkout stops',
  'audit:T': 'entries in the audit log are edited or removed after the fact',
  'audit:R': 'the log cannot show who did what, so a dispute cannot be settled',
  'audit:I': 'the log holds personal details that its readers should not see',
  'audit:D': 'the log fills up or is switched off, and later events go unrecorded',
  'f-browser-web:T': 'an order is altered on its way from the browser to the web app',
  'f-browser-web:I': 'an order is read by someone on the path between the browser and the web app',
  'f-browser-web:D': 'the link to the web app is flooded so that real orders do not arrive',
  'f-web-orders:T': 'an order record is changed between the web app and the database',
  'f-web-orders:I': 'order data is seen between the web app and the database',
  'f-web-orders:D': 'the path to the database is cut or overloaded',
  'f-web-payment:T': 'an amount is altered between the web app and the payment provider',
  'f-web-payment:I': 'payment details are seen between the web app and the provider',
  'f-web-payment:D': 'the payment link is unavailable, so no order can be paid',
  'f-web-audit:T': 'log entries are changed on their way to the log',
  'f-web-audit:I': 'log entries are seen on their way to the log',
  'f-web-audit:D': 'log entries are dropped on the way, silently',
};

/** A threat as a sentence: capitalised, with a full stop. */
export const threatSentence = (id: string): string => `${THREAT_TEXT[id][0].toUpperCase()}${THREAT_TEXT[id].slice(1)}.`;

// ── Zones, placement and crossings ───────────────────────────────────────

/** Where the two movable stores sit. The other three elements stay in their zone. */
export type Placement = { orders: ZoneId; audit: ZoneId };

const FIXED_ZONE: Record<'browser' | 'webapp' | 'payment', ZoneId> = { browser: 'internet', webapp: 'app', payment: 'third' };

export const zoneOf = (p: Placement, id: ElementId): ZoneId => (id === 'orders' || id === 'audit' ? p[id] : FIXED_ZONE[id]);

/** A flow crosses a trust boundary when its two ends are in different zones. */
export const crosses = (p: Placement, f: Flow): boolean => zoneOf(p, f.from) !== zoneOf(p, f.to);

export const crossingFlows = (p: Placement): Flow[] => FLOWS.filter((f) => crosses(p, f));

// ── Controls ─────────────────────────────────────────────────────────────

export type ControlId = 'authn' | 'session' | 'integrity' | 'validation' | 'audit-trail' | 'tls' | 'at-rest' | 'rate-limit' | 'authz';

/** `covers` lists the categories a control addresses; the first is the one it mainly addresses. */
export const CONTROLS: readonly { id: ControlId; label: string; covers: readonly Category[] }[] = [
  { id: 'authn', label: 'Strong authentication', covers: ['S'] },
  { id: 'session', label: 'Session binding', covers: ['S'] },
  { id: 'integrity', label: 'Integrity checks and signatures', covers: ['T'] },
  { id: 'validation', label: 'Input validation', covers: ['T'] },
  { id: 'audit-trail', label: 'Append-only audit trail', covers: ['R', 'T'] },
  { id: 'tls', label: 'Encryption in transit', covers: ['I', 'T'] },
  { id: 'at-rest', label: 'Encryption at rest and access control', covers: ['I'] },
  { id: 'rate-limit', label: 'Rate limiting and redundancy', covers: ['D'] },
  { id: 'authz', label: 'Authorisation checks', covers: ['E', 'I'] },
];

export const controlById = (id: ControlId) => CONTROLS.find((c) => c.id === id)!;

export const accepts = (id: ControlId, c: Category): boolean => controlById(id).covers.includes(c);

// ── The learner's state ──────────────────────────────────────────────────

export interface ThreatState {
  placement: Placement;
  /** Cell ids the learner has looked at. */
  revealed: Readonly<Record<string, true>>;
  /** Cell id to the control that mitigated it. */
  mitigated: Readonly<Record<string, ControlId>>;
}

export const START_PLACEMENT: Placement = { orders: 'data', audit: 'app' };

export const startState = (): ThreatState => ({ placement: START_PLACEMENT, revealed: {}, mitigated: {} });

export const withPlacement = (s: ThreatState, patch: Partial<Placement>): ThreatState => ({ ...s, placement: { ...s.placement, ...patch } });

/** Looking at a cell that is not applicable changes nothing. */
export function reveal(s: ThreatState, id: string): ThreatState {
  if (!CELLS.some((c) => c.id === id) || s.revealed[id]) return s;
  return { ...s, revealed: { ...s.revealed, [id]: true } };
}

export const revealAll = (s: ThreatState): ThreatState => CELLS.reduce((acc, c) => reveal(acc, c.id), s);

export type ControlResult =
  | { kind: 'accepted'; state: ThreatState; message: string }
  | { kind: 'refused'; state: ThreatState; message: string };

const nameList = (cats: readonly Category[]) => cats.map((c) => `${categoryById(c).name.toLowerCase()} (${categoryById(c).property})`).join(' and ');

/**
 * Put a control on a threat. Refused, with the reason, when the cell is not applicable or not yet looked
 * at, when it is already covered, or when the control does not address that category.
 */
export function applyControl(s: ThreatState, id: string, control: ControlId): ControlResult {
  const cell = CELLS.find((c) => c.id === id);
  const ctl = controlById(control);
  if (!cell) return { kind: 'refused', state: s, message: 'There is no threat there: the control goes back to the tray.' };
  if (!s.revealed[id]) return { kind: 'refused', state: s, message: 'That threat has not been looked at yet: reveal it first.' };
  if (s.mitigated[id]) return { kind: 'refused', state: s, message: `Already covered, by ${controlById(s.mitigated[id]).label.toLowerCase()}.` };
  if (!accepts(control, cell.category)) {
    return { kind: 'refused', state: s, message: `${ctl.label} addresses ${nameList(ctl.covers)}, not ${categoryById(cell.category).name.toLowerCase()} (${categoryById(cell.category).property}).` };
  }
  return { kind: 'accepted', state: { ...s, mitigated: { ...s.mitigated, [id]: control } }, message: `${ctl.label} is accepted: the threat is marked mitigated.` };
}

// ── Meters ───────────────────────────────────────────────────────────────

export type FlowStatus = 'inside' | 'unreviewed' | 'open' | 'covered';

/** A flow that stays inside one zone is `inside`; a crossing flow is unreviewed until a threat on it is looked at, covered once all its threats are mitigated. */
export function flowStatus(s: ThreatState, f: Flow): FlowStatus {
  if (!crosses(s.placement, f)) return 'inside';
  const cells = categoriesOf(f).map((c) => cellId(f.id, c));
  if (!cells.some((c) => s.revealed[c])) return 'unreviewed';
  return cells.every((c) => s.mitigated[c]) ? 'covered' : 'open';
}

export interface Meters {
  cells: number;
  revealed: number;
  mitigated: number;
  /** Flows that cross a boundary and have no revealed threat. */
  unreviewedCrossings: number;
  crossings: number;
  neverLooked: number;
}

export function metersOf(s: ThreatState): Meters {
  const revealed = CELLS.filter((c) => s.revealed[c.id]).length;
  return {
    cells: CELLS.length,
    revealed,
    mitigated: CELLS.filter((c) => s.revealed[c.id] && s.mitigated[c.id]).length,
    unreviewedCrossings: FLOWS.filter((f) => flowStatus(s, f) === 'unreviewed').length,
    crossings: crossingFlows(s.placement).length,
    neverLooked: CELLS.length - revealed,
  };
}

// ── Layout of the diagram ────────────────────────────────────────────────

export const ZONE_W = 180;
export const ZONE_TOP = 34;
export const SLOT_H = 78;
export const DIAGRAM_W = ZONE_W * ZONES.length;
export const DIAGRAM_H = ZONE_TOP + SLOT_H * 3 + 6;

/** Centre of each element: its zone's column, stacked in element order. */
export function positions(p: Placement): Record<ElementId, { x: number; y: number }> {
  const slots: Record<ZoneId, number> = { internet: 0, app: 0, data: 0, third: 0 };
  const out = {} as Record<ElementId, { x: number; y: number }>;
  for (const e of ELEMENTS) {
    const z = zoneOf(p, e.id);
    const col = ZONES.findIndex((x) => x.id === z);
    out[e.id] = { x: col * ZONE_W + ZONE_W / 2, y: ZONE_TOP + slots[z] * SLOT_H + SLOT_H / 2 };
    slots[z] += 1;
  }
  return out;
}
