import { cssVar } from '../../core/palette';
import type { Frame } from '../../core/types';

export type Arch = 'mono' | 'micro' | 'dist';
export type Scenario = 'request' | 'deploy' | 'bug' | 'teams';
export type Status = 'ok' | 'deploy' | 'slow' | 'down';
export type Hop = 'call' | 'net' | 'db';
export type TeamId = 'A' | 'B' | 'C' | 'D';

export interface Box {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'client' | 'module' | 'service' | 'db' | 'container';
  team?: TeamId;
}

export interface MmFrame extends Frame {
  status: Record<string, Status>;
  packet: { from: string; to: string; hop: Hop } | null;
  active: string | null;
  latency: number | null;
  hops: number;
  deployUnit: string;
  blast: string;
  teams: boolean;
  note: string | null;
}

/** One hue per team, none of them a status colour or a hop colour. */
export const TEAMS: Record<TeamId, { name: string; color: string }> = {
  A: { name: 'Storefront', color: cssVar('sky') },
  B: { name: 'Checkout', color: cssVar('trkHw') },
  C: { name: 'Payments', color: cssVar('trkMath') },
  D: { name: 'Accounts', color: cssVar('trkLang') },
};

/**
 * Every number in the lesson comes from these named constants, and every one is illustrative:
 * round figures for a service-to-service call in one data centre, not measurements.
 */
/** A function call inside one process (a real one is far cheaper; it only has to be tiny next to a network call). */
export const FUNCTION_CALL_MS = 0.01;
/** One network call between two services: serialise, send, wait, parse. */
export const NETWORK_CALL_MS = 1.5;
/** A database read and a write (a write waits for the commit). */
export const DB_READ_MS = 2;
export const DB_WRITE_MS = 3;
/** Queries on a database shared by every service wait on each other: this factor on every query's cost. */
export const SHARED_DB_CONTENTION = 1.5;
/** Items in the cart: the chatty design calls the catalog once for each. */
export const CART_ITEMS = 3;
/** Build and test time for the whole app, and for one service on its own. */
export const FULL_BUILD_MIN = 25;
export const ONE_SERVICE_BUILD_MIN = 5;

// ── Layouts (SVG viewBox 820 × 400) ─────────────────────────────────
const CLIENT: Box = { id: 'client', label: 'client', x: 20, y: 170, w: 84, h: 60, kind: 'client' };

const MONO: Box[] = [
  CLIENT,
  { id: 'app', label: 'shop.jar · one deployable, one process', x: 160, y: 40, w: 440, h: 320, kind: 'container' },
  { id: 'web', label: 'web', x: 185, y: 95, w: 120, h: 60, kind: 'module', team: 'A' },
  { id: 'catalog', label: 'catalog', x: 320, y: 95, w: 120, h: 60, kind: 'module', team: 'A' },
  { id: 'users', label: 'users', x: 455, y: 95, w: 120, h: 60, kind: 'module', team: 'D' },
  { id: 'orders', label: 'orders', x: 185, y: 245, w: 120, h: 60, kind: 'module', team: 'B' },
  { id: 'cart', label: 'cart', x: 320, y: 245, w: 120, h: 60, kind: 'module', team: 'B' },
  { id: 'payments', label: 'payments', x: 455, y: 245, w: 120, h: 60, kind: 'module', team: 'C' },
  { id: 'db', label: 'one database', x: 660, y: 165, w: 130, h: 70, kind: 'db' },
];

const SERVICES: Box[] = [
  { id: 'gateway', label: 'gateway', x: 140, y: 170, w: 100, h: 60, kind: 'service', team: 'A' },
  { id: 'catalog', label: 'catalog', x: 300, y: 30, w: 110, h: 54, kind: 'service', team: 'A' },
  { id: 'users', label: 'users', x: 300, y: 120, w: 110, h: 54, kind: 'service', team: 'D' },
  { id: 'orders', label: 'orders', x: 300, y: 210, w: 110, h: 54, kind: 'service', team: 'B' },
  { id: 'cart', label: 'cart', x: 300, y: 300, w: 110, h: 54, kind: 'service', team: 'B' },
  { id: 'payments', label: 'payments', x: 560, y: 120, w: 110, h: 54, kind: 'service', team: 'C' },
];

const MICRO: Box[] = [
  CLIENT,
  ...SERVICES,
  ...SERVICES.filter((s) => s.id !== 'gateway').map((s): Box => ({
    id: `${s.id}-db`, label: 'db', x: s.x + 130, y: s.y + 5, w: 64, h: 44, kind: 'db',
  })),
];

const DIST: Box[] = [
  CLIENT,
  ...SERVICES,
  { id: 'db', label: 'shared database', x: 560, y: 320, w: 180, h: 60, kind: 'db' },
];

export const LAYOUT: Record<Arch, Box[]> = { mono: MONO, micro: MICRO, dist: DIST };

export const EDGES: Record<Arch, [string, string][]> = {
  mono: [['client', 'app'], ['app', 'db']],
  micro: [
    ['client', 'gateway'], ['gateway', 'catalog'], ['gateway', 'orders'],
    ['orders', 'users'], ['orders', 'cart'], ['orders', 'payments'],
    ...SERVICES.filter((s) => s.id !== 'gateway').map((s): [string, string] => [s.id, `${s.id}-db`]),
  ],
  dist: [
    ['client', 'gateway'], ['gateway', 'catalog'], ['gateway', 'orders'],
    ['orders', 'users'], ['orders', 'cart'], ['orders', 'payments'],
    ['cart', 'catalog'], ['payments', 'users'],
    ...SERVICES.filter((s) => s.id !== 'gateway').map((s): [string, string] => [s.id, 'db']),
  ],
};

/** The things that run and can be deployed, slow or down: modules in the monolith, services otherwise. */
export const RUNTIME: Record<Arch, string[]> = {
  mono: ['web', 'catalog', 'users', 'orders', 'cart', 'payments'],
  micro: SERVICES.map((s) => s.id),
  dist: SERVICES.map((s) => s.id),
};

/** How many services read and write the shared database's tables directly (the edges into it). */
export const sharedDbUsers = () => EDGES.dist.filter(([, to]) => to === 'db').length;

/**
 * The services a failing one drags down: those that call it, directly or through other services, grouped by how many calls away
 * they are (the first group calls it directly). Read off the call edges between runtime units, upstream.
 * Units that never call it, however indirectly, are not in any group.
 */
export function callersByDistance(edges: [string, string][], runtime: string[], failing: string): string[][] {
  const calls = edges.filter(([from, to]) => runtime.includes(from) && runtime.includes(to));
  const seen = new Set([failing]);
  const levels: string[][] = [];
  let frontier = [failing];
  while (frontier.length) {
    const next = [...new Set(calls.filter(([, to]) => frontier.includes(to)).map(([from]) => from))].filter((id) => !seen.has(id));
    next.forEach((id) => seen.add(id));
    if (next.length) levels.push(next);
    frontier = next;
  }
  return levels;
}

// ── The checkout request ────────────────────────────────────────────
export type StepTag = 'first-call' | 'one-db' | 'one-tx' | 'net' | 'fail-modes' | 'no-tx' | 'n-plus-one' | 'shared-db' | 'chatty';

export interface Step {
  from: string;
  to: string;
  hop: Hop;
  ms: number;
  /** Which caption this step carries, if it carries one. */
  tag?: StepTag;
}

const step = (from: string, to: string, hop: Hop, ms: number, tag?: StepTag): Step => ({ from, to, hop, ms, tag });

/** The same checkout in each architecture: the same four data accesses (cart and users read, payments and orders write). */
export function requestSteps(arch: Arch): Step[] {
  if (arch === 'mono') {
    return [
      step('client', 'web', 'net', 0),
      step('web', 'orders', 'call', FUNCTION_CALL_MS, 'first-call'),
      step('orders', 'cart', 'call', FUNCTION_CALL_MS),
      step('cart', 'db', 'db', DB_READ_MS, 'one-db'),
      step('orders', 'users', 'call', FUNCTION_CALL_MS),
      step('users', 'db', 'db', DB_READ_MS),
      step('orders', 'payments', 'call', FUNCTION_CALL_MS),
      step('payments', 'db', 'db', DB_WRITE_MS),
      step('orders', 'db', 'db', DB_WRITE_MS, 'one-tx'),
      step('web', 'client', 'net', 0),
    ];
  }
  if (arch === 'micro') {
    return [
      step('client', 'gateway', 'net', 0),
      step('gateway', 'orders', 'net', NETWORK_CALL_MS, 'net'),
      step('orders', 'cart', 'net', NETWORK_CALL_MS),
      step('cart', 'cart-db', 'db', DB_READ_MS),
      step('orders', 'users', 'net', NETWORK_CALL_MS, 'fail-modes'),
      step('users', 'users-db', 'db', DB_READ_MS),
      step('orders', 'payments', 'net', NETWORK_CALL_MS),
      step('payments', 'payments-db', 'db', DB_WRITE_MS, 'no-tx'),
      step('orders', 'orders-db', 'db', DB_WRITE_MS),
      step('gateway', 'client', 'net', 0),
    ];
  }
  const shared = (ms: number) => ms * SHARED_DB_CONTENTION;
  return [
    step('client', 'gateway', 'net', 0),
    step('gateway', 'orders', 'net', NETWORK_CALL_MS),
    step('orders', 'cart', 'net', NETWORK_CALL_MS),
    ...Array.from({ length: CART_ITEMS }, (_, i) => step('cart', 'catalog', 'net', NETWORK_CALL_MS, i === 0 ? 'n-plus-one' : undefined)),
    step('cart', 'db', 'db', shared(DB_READ_MS), 'shared-db'),
    step('orders', 'users', 'net', NETWORK_CALL_MS),
    step('users', 'db', 'db', shared(DB_READ_MS)),
    step('orders', 'payments', 'net', NETWORK_CALL_MS),
    step('payments', 'users', 'net', NETWORK_CALL_MS, 'chatty'),
    step('payments', 'db', 'db', shared(DB_WRITE_MS)),
    step('orders', 'db', 'db', shared(DB_WRITE_MS)),
    step('gateway', 'client', 'net', 0),
  ];
}

/** A network call between two services (not the client's request or reply). */
export const isInternalHop = (s: Step) => s.hop === 'net' && s.from !== 'client' && s.to !== 'client';

/** Total time and internal network hops of the checkout request. */
export function requestTotals(arch: Arch): { ms: number; hops: number } {
  const steps = requestSteps(arch);
  return { ms: steps.reduce((sum, s) => sum + s.ms, 0), hops: steps.filter(isInternalHop).length };
}

// ── Counting statuses ───────────────────────────────────────────────
/** How many of the runtime units of `arch` have this status in `status`. */
export const countStatus = (arch: Arch, status: Record<string, Status>, which: Status) =>
  RUNTIME[arch].filter((id) => status[id] === which).length;
