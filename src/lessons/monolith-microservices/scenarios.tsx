import { cssVar } from '../../core/palette';
import type { ReactNode } from 'react';
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

export const TEAMS: Record<TeamId, { name: string; color: string }> = {
  A: { name: 'Storefront', color: cssVar('info') },
  B: { name: 'Checkout', color: cssVar('violet') },
  C: { name: 'Payments', color: cssVar('amber') },
  D: { name: 'Accounts', color: cssVar('pink') },
};

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

const RUNTIME: Record<Arch, string[]> = {
  mono: ['web', 'catalog', 'users', 'orders', 'cart', 'payments'],
  micro: SERVICES.map((s) => s.id),
  dist: SERVICES.map((s) => s.id),
};

// ── Frame building ──────────────────────────────────────────────────
function base(arch: Arch): MmFrame {
  const status: Record<string, Status> = {};
  for (const b of LAYOUT[arch]) status[b.id] = 'ok';
  return {
    status, packet: null, active: null, latency: null, hops: 0,
    deployUnit: arch === 'mono' ? 'whole app' : arch === 'micro' ? 'one service' : 'all services',
    blast: '–', teams: false, note: null,
  };
}

function builder(arch: Arch) {
  const frames: MmFrame[] = [];
  let cur = base(arch);
  const push = (patch: Partial<MmFrame> & { set?: Record<string, Status> }) => {
    const { set, ...rest } = patch;
    cur = { ...cur, packet: null, active: null, note: null, ...rest, status: { ...cur.status, ...set } };
    frames.push(cur);
  };
  const all = (s: Status) => Object.fromEntries(RUNTIME[arch].map((id) => [id, s]));
  return { frames, push, all };
}

type Step = [from: string, to: string, hop: Hop, ms: number, say?: ReactNode];

const REQUEST: Record<Arch, { intro: ReactNode; steps: Step[]; outro: (ms: number, hops: number) => ReactNode }> = {
  mono: {
    intro: <>A checkout request hits the monolith. Every module lives in <b>one process</b>.</>,
    steps: [
      ['client', 'web', 'net', 0],
      ['web', 'orders', 'call', 0.01, <>web calls orders: a plain <span className="hl violet">function call</span>. Nanoseconds, and it can't get lost.</>],
      ['orders', 'cart', 'call', 0.01],
      ['cart', 'db', 'db', 2, <>One database, so reading the cart is a local query (or a JOIN).</>],
      ['orders', 'users', 'call', 0.01],
      ['orders', 'payments', 'call', 0.01],
      ['payments', 'db', 'db', 3, <>Payment and order are written in <b>one transaction</b>. All or nothing, for free.</>],
      ['web', 'client', 'net', 0],
    ],
    outro: (ms) => (
      <>
        Done in <span className="hl ok">~{ms.toFixed(1)} ms</span> with <b>zero</b> internal network hops. Hard to beat.
      </>
    ),
  },
  micro: {
    intro: <>Same checkout, but now each capability is its own <b>service</b> with its own database.</>,
    steps: [
      ['client', 'gateway', 'net', 0],
      ['gateway', 'orders', 'net', 1.5, <>Every arrow is now a <span className="hl info">network call</span>: serialise, send, wait, parse. ~1.5 ms each.</>],
      ['orders', 'cart', 'net', 1.5],
      ['cart', 'cart-db', 'db', 2],
      ['orders', 'users', 'net', 1.5, <>Each hop is also a new way to fail: timeouts, retries, a service mid-deploy.</>],
      ['users', 'users-db', 'db', 2],
      ['orders', 'payments', 'net', 1.5],
      ['payments', 'payments-db', 'db', 3, <>Order and payment live in different databases: no single transaction any more.</>],
      ['orders', 'orders-db', 'db', 2],
      ['gateway', 'client', 'net', 0],
    ],
    outro: (ms, hops) => (
      <>
        <span className="hl">~{ms.toFixed(1)} ms</span> and <b>{hops}</b> network hops. Slower, but each piece can scale and deploy on
        its own.
      </>
    ),
  },
  dist: {
    intro: <>A <b>distributed monolith</b>: split into services, but chatty and sharing one database.</>,
    steps: [
      ['client', 'gateway', 'net', 0],
      ['gateway', 'orders', 'net', 1.5],
      ['orders', 'cart', 'net', 1.5],
      ['cart', 'catalog', 'net', 1.5, <>Cart calls catalog <b>once per item</b>. An N+1 query, except over the network.</>],
      ['cart', 'catalog', 'net', 1.5],
      ['cart', 'catalog', 'net', 1.5],
      ['cart', 'db', 'db', 3, <>Everyone reads the <span className="hl bad">same shared tables</span>, so they all contend for one database.</>],
      ['orders', 'users', 'net', 1.5],
      ['orders', 'payments', 'net', 1.5],
      ['payments', 'users', 'net', 1.5, <>Payments calls users again, synchronously. Every service now waits on every other.</>],
      ['payments', 'db', 'db', 4.5],
      ['gateway', 'client', 'net', 0],
    ],
    outro: (ms, hops) => (
      <>
        <span className="hl bad">~{ms.toFixed(1)} ms</span>, <b>{hops}</b> hops. Network costs of microservices, coupling of a monolith.
      </>
    ),
  },
};

function requestFrames(arch: Arch) {
  const { frames, push } = builder(arch);
  const spec = REQUEST[arch];
  let ms = 0;
  let hops = 0;
  push({ say: spec.intro, latency: 0, hops: 0 });
  for (const [from, to, hop, cost, say] of spec.steps) {
    ms += cost;
    const internal = hop === 'net' && from !== 'client' && to !== 'client';
    if (internal) hops++;
    const kind = hop === 'call' ? 'function call' : hop === 'db' ? 'database query' : 'network call';
    const fallback = (
      <>
        {from} → {to}: <span className={`hl ${hop === 'call' ? 'violet' : hop === 'net' ? 'info' : ''}`}>{kind}</span>
        {cost > 0 && <> (+{cost} ms)</>}
      </>
    );
    push({ packet: { from, to, hop }, active: to, latency: ms, hops, say: say ?? fallback });
  }
  const last = frames[frames.length - 1];
  last.say = spec.outro(ms, hops);
  last.hold = 2;
  return frames;
}

function deployFrames(arch: Arch) {
  const { frames, push, all } = builder(arch);
  if (arch === 'mono') {
    push({ active: 'payments', say: <>The payments team fixes a typo. <b>One line</b> changed.</> });
    push({ set: all('deploy'), note: 'building & testing the whole app · ~25 min', say: <>But the deployable is the <b>whole app</b>, so everything gets built and tested.</> });
    push({ set: { ...all('deploy'), app: 'deploy' }, note: 'rolling restart of every instance', say: <>Every instance restarts, carrying <b>every team's</b> changes: one release train.</> });
    push({ set: all('ok'), blast: '6 / 6 modules shipped', hold: 2, say: <>Shipped. One simple pipeline, but one team's risk is <span className="hl bad">everyone's</span> risk.</> });
  } else if (arch === 'micro') {
    push({ active: 'payments', say: <>The payments team fixes a typo. <b>One line</b> changed.</> });
    push({ set: { payments: 'deploy' }, note: 'payments only · ~5 min', say: <>Payments builds and ships <b>alone</b>. Nothing else restarts.</> });
    push({ set: { payments: 'ok' }, blast: '1 / 6 services shipped', hold: 2, say: <>Independent deploys, <span className="hl ok">as long as</span> its API stays backwards-compatible for its callers.</> });
  } else {
    push({ active: 'payments', say: <>Payments needs a new column in the <b>shared database</b>.</> });
    push({ set: { db: 'deploy' }, note: 'schema migration on shared tables', say: <>Five services read those tables directly, so the migration affects all of them…</> });
    push({ set: { ...all('deploy'), db: 'deploy' }, note: 'lockstep deploy of 6 services', say: <>…and they all have to deploy <span className="hl bad">together</span>. Microservice costs, monolith coupling.</> });
    push({ set: { ...all('ok'), db: 'ok' }, blast: '6 / 6 services shipped', hold: 2, say: <>If services can't deploy independently, you've paid for microservices without getting them.</> });
  }
  return frames;
}

function bugFrames(arch: Arch) {
  const { frames, push, all } = builder(arch);
  const total = RUNTIME[arch].length;
  push({ active: 'catalog', say: <>A <b>memory leak</b> ships in catalog (product search).</> });
  if (arch === 'mono') {
    push({ set: { catalog: 'slow' }, say: <>Memory climbs. But every module shares <b>one process and one heap</b>.</> });
    push({ set: all('slow'), say: <>Garbage-collection pauses slow <b>everything</b>, even checkout.</> });
    push({ set: { ...all('down'), app: 'down' }, blast: `${total} / ${total} down`, hold: 2, say: <>Out of memory: the process dies. A search bug just took down <span className="hl bad">checkout</span>.</> });
  } else if (arch === 'micro') {
    push({ set: { catalog: 'slow' }, say: <>Memory climbs, but only inside catalog's own process.</> });
    push({ set: { catalog: 'down' }, say: <>Catalog crashes and restarts. Nothing else shares its memory.</> });
    push({ set: { catalog: 'down' }, active: 'gateway', blast: `1 / ${total} down`, hold: 2, say: <>Checkout keeps working; product pages show a fallback. <span className="hl ok">Blast radius: 1</span>, if callers use timeouts.</> });
  } else {
    push({ set: { catalog: 'slow' }, say: <>Catalog slows down…</> });
    push({ set: { cart: 'slow' }, say: <>…cart waits on it <b>synchronously</b>, holding threads…</> });
    push({ set: { orders: 'slow', gateway: 'slow' }, say: <>…orders waits on cart, gateway waits on orders…</> });
    push({ set: all('down'), blast: `${total} / ${total} down`, hold: 2, say: <>Thread pools exhaust and everything times out. The failure <span className="hl bad">cascaded</span>.</> });
  }
  return frames;
}

function teamFrames(arch: Arch) {
  const { frames, push } = builder(arch);
  if (arch === 'mono') {
    push({ teams: true, say: <>Four teams, <b>one codebase</b>.</> });
    push({ teams: true, note: 'merge conflicts · one shared release', say: <>Everyone merges into one repo and ships on one release train. Coordination grows with headcount.</> });
    push({ teams: true, hold: 2, say: <>For one or two teams this is a <span className="hl ok">feature</span>: one repo, easy refactors, no network in between.</> });
  } else if (arch === 'micro') {
    push({ teams: true, say: <>One team per service. <b>Conway's law</b>: systems end up mirroring the org chart.</> });
    push({ teams: true, say: <>Teams ship on their own schedule and own their own data.</> });
    push({ teams: true, note: 'platform tax: CI per service, tracing, discovery, on-call', hold: 2, say: <>The price: a <span className="hl">platform</span> to run it all, and debugging across network boundaries.</> });
  } else {
    push({ teams: true, say: <>Teams own services… but the shared database belongs to <b>nobody</b>.</> });
    push({ teams: true, note: 'every schema change = a cross-team meeting', hold: 2, say: <>Every change needs a meeting. You split the code but <span className="hl bad">not the coupling</span>.</> });
  }
  return frames;
}

export function buildFrames(arch: Arch, scenario: Scenario): MmFrame[] {
  switch (scenario) {
    case 'request': return requestFrames(arch);
    case 'deploy': return deployFrames(arch);
    case 'bug': return bugFrames(arch);
    case 'teams': return teamFrames(arch);
  }
}
