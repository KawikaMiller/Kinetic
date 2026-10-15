import type { ReactNode } from 'react';
import {
  callersByDistance, CART_ITEMS, countStatus, EDGES, FULL_BUILD_MIN, FUNCTION_CALL_MS, isInternalHop, LAYOUT, NETWORK_CALL_MS, ONE_SERVICE_BUILD_MIN, requestSteps,
  requestTotals, RUNTIME, sharedDbUsers, type Arch, type MmFrame, type Scenario, type Status, type StepTag,
} from './model';

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
  return { frames, push, all, status: () => cur.status };
}

const unit = (arch: Arch) => (arch === 'mono' ? 'modules' : 'services');
const ms1 = (v: number) => v.toFixed(1);

// ── The checkout request ────────────────────────────────────────────
const INTRO: Record<Arch, ReactNode> = {
  mono: <>A checkout request hits the monolith. Every module lives in <b>one process</b>.</>,
  micro: <>Same checkout, but now each capability is its own <b>service</b> with its own database.</>,
  dist: <>A <b>distributed monolith</b>: split into services, but chatty and sharing one database.</>,
};

const SAY: Record<StepTag, ReactNode> = {
  'first-call': <>web calls orders: a plain <span className="hl violet">function call</span>, about {FUNCTION_CALL_MS} ms here, with no network in between to lose it on.</>,
  'one-db': <>One database, so reading the cart is a local query (or a JOIN).</>,
  'one-tx': <>Payment and order are written in <b>one transaction</b>. All or nothing, for free.</>,
  net: <>Each call between services is now a <span className="hl info">network call</span>: serialise, send, wait, parse. {NETWORK_CALL_MS} ms each in this model.</>,
  'fail-modes': <>Each hop is also a new way to fail: timeouts, retries, a service mid-deploy.</>,
  'no-tx': <>Order and payment live in different databases: no single transaction any more.</>,
  'n-plus-one': <>Cart calls catalog <b>once per item</b> ({CART_ITEMS} items here). An N+1 query, except over the network.</>,
  'shared-db': <>Everyone reads the <span className="hl bad">same shared tables</span>, so they all contend for one database and each query costs more.</>,
  chatty: <>Payments calls users again, synchronously. Every service now waits on the others it calls.</>,
};

function outro(arch: Arch, ms: number, hops: number): ReactNode {
  const mono = requestTotals('mono');
  if (arch === 'mono') {
    return <>Done in <span className="hl ok">~{ms1(ms)} ms</span> with <b>zero</b> internal network hops: the same four database accesses as the others, and no network between modules.</>;
  }
  const extra = ms - mono.ms;
  if (arch === 'micro') {
    return (
      <>
        <span className="hl">~{ms1(ms)} ms</span> and <b>{hops}</b> network hops: {ms1(extra)} ms more than the monolith's {ms1(mono.ms)} ms, for the same
        database work. In exchange each piece can scale and deploy on its own.
      </>
    );
  }
  return (
    <>
      <span className="hl bad">~{ms1(ms)} ms</span>, <b>{hops}</b> hops: {(ms / mono.ms).toFixed(1)}× the monolith's {ms1(mono.ms)} ms. Network costs of
      microservices, coupling of a monolith.
    </>
  );
}

function requestFrames(arch: Arch) {
  const { frames, push } = builder(arch);
  let ms = 0;
  let hops = 0;
  push({ say: INTRO[arch], latency: 0, hops: 0 });
  for (const s of requestSteps(arch)) {
    ms += s.ms;
    if (isInternalHop(s)) hops++;
    const kind = s.hop === 'call' ? 'function call' : s.hop === 'db' ? 'database query' : 'network call';
    const fallback = (
      <>
        {s.from} → {s.to}: <span className={`hl ${s.hop === 'call' ? 'violet' : s.hop === 'net' ? 'info' : ''}`}>{kind}</span>
        {s.ms > 0 && <> (+{s.ms} ms)</>}
      </>
    );
    push({ packet: { from: s.from, to: s.to, hop: s.hop }, active: s.to, latency: ms, hops, say: s.tag ? SAY[s.tag] : fallback });
  }
  const last = frames[frames.length - 1];
  last.say = outro(arch, ms, hops);
  last.hold = 2;
  return frames;
}

// ── Deploy, bug and teams storylines (scripted) ─────────────────────
function deployFrames(arch: Arch) {
  const { frames, push, all, status } = builder(arch);
  const total = RUNTIME[arch].length;
  const shipped = (s: Record<string, Status>) => `${countStatus(arch, s, 'deploy')} / ${total} ${unit(arch)} shipped`;
  if (arch === 'mono') {
    push({ active: 'payments', say: <>The payments team fixes a typo. <b>One line</b> changed.</> });
    push({ set: all('deploy'), note: `building & testing the whole app · ~${FULL_BUILD_MIN} min`, say: <>But the deployable is the <b>whole app</b>, so everything gets built and tested.</> });
    push({ set: { ...all('deploy'), app: 'deploy' }, note: 'rolling restart of every instance', say: <>Every instance restarts, carrying <b>every team's</b> changes: one release train.</> });
    const blast = shipped(status());
    push({ set: all('ok'), blast, hold: 2, say: <>Shipped. One simple pipeline, but one team's risk is <span className="hl bad">everyone's</span> risk.</> });
  } else if (arch === 'micro') {
    push({ active: 'payments', say: <>The payments team fixes a typo. <b>One line</b> changed.</> });
    push({ set: { payments: 'deploy' }, note: `payments only · ~${ONE_SERVICE_BUILD_MIN} min`, say: <>Payments builds and ships <b>alone</b>. Nothing else restarts.</> });
    const blast = shipped(status());
    push({ set: { payments: 'ok' }, blast, hold: 2, say: <>Independent deploys, <span className="hl ok">as long as</span> its API stays backwards-compatible for its callers.</> });
  } else {
    push({ active: 'payments', say: <>Payments needs a new column in the <b>shared database</b>.</> });
    push({ set: { db: 'deploy' }, note: 'schema migration on shared tables', say: <>{sharedDbUsers()} services read those tables directly, so the migration affects all of them…</> });
    push({ set: { ...all('deploy'), db: 'deploy' }, note: `lockstep deploy of ${total} services`, say: <>…and they all have to deploy <span className="hl bad">together</span>. Microservice costs, monolith coupling.</> });
    const blast = shipped(status());
    push({ set: { ...all('ok'), db: 'ok' }, blast, hold: 2, say: <>If services can't deploy independently, you've paid for microservices without getting them.</> });
  }
  return frames;
}

function bugFrames(arch: Arch) {
  const { frames, push, all, status } = builder(arch);
  const total = RUNTIME[arch].length;
  const down = (s: Record<string, Status>) => `${countStatus(arch, s, 'down')} / ${total} down`;
  push({ active: 'catalog', say: <>A <b>memory leak</b> ships in catalog (product search).</> });
  if (arch === 'mono') {
    push({ set: { catalog: 'slow' }, say: <>Memory climbs. But every module shares <b>one process and one heap</b>.</> });
    push({ set: all('slow'), say: <>Garbage-collection pauses can slow <b>everything</b>, even checkout.</> });
    push({ set: { ...all('down'), app: 'down' }, blast: down({ ...status(), ...all('down') }), hold: 2, say: <>Out of memory: the process dies. A search bug just took down <span className="hl bad">checkout</span>.</> });
  } else if (arch === 'micro') {
    push({ set: { catalog: 'slow' }, say: <>Memory climbs, but only inside catalog's own process.</> });
    push({ set: { catalog: 'down' }, say: <>Catalog crashes and restarts. Nothing else shares its memory.</> });
    push({ set: { catalog: 'down' }, active: 'gateway', blast: down({ ...status(), catalog: 'down' }), hold: 2, say: <>Checkout keeps working; product pages show a fallback. <span className="hl ok">Blast radius: 1</span>, if callers use timeouts.</> });
  } else {
    // The blast radius is read off the drawn calls: whoever calls catalog, directly or through other services, and nobody else.
    const levels = callersByDistance(EDGES.dist, RUNTIME.dist, 'catalog');
    const chain = ['catalog', ...levels.flat()];
    const spared = RUNTIME.dist.filter((id) => !chain.includes(id));
    push({ set: { catalog: 'slow' }, say: <>Catalog slows down…</> });
    levels.forEach((ids, i) => {
      const below = i === 0 ? 'catalog' : levels[i - 1].join(' and ');
      push({
        set: Object.fromEntries(ids.map((id) => [id, 'slow' as const])),
        say: i === 0
          ? <>…{ids.join(' and ')} call{ids.length === 1 ? 's' : ''} {below} and wait on it <b>synchronously</b>, holding threads…</>
          : <>…{ids.join(' and ')} wait{ids.length === 1 ? 's' : ''} on {below}…</>,
      });
    });
    const downSet = Object.fromEntries(chain.map((id) => [id, 'down' as const]));
    push({
      set: downSet,
      blast: down({ ...status(), ...downSet }),
      hold: 2,
      say: <>Thread pools run out and the callers time out one after another. The failure <span className="hl bad">cascaded</span> up the call chain: {chain.length} of {total} services are down, and {spared.join(' and ')} stay up because nothing on their path calls catalog.</>,
    });
  }
  return frames;
}

function teamFrames(arch: Arch) {
  const { frames, push } = builder(arch);
  if (arch === 'mono') {
    push({ teams: true, say: <>Four teams, <b>one codebase</b>.</> });
    push({ teams: true, note: 'merge conflicts · one shared release', say: <>Everyone merges into one repo and ships on one release train. Coordination grows with headcount.</> });
    push({ teams: true, hold: 2, say: <>For one or two teams this can be a <span className="hl ok">feature</span>: one repo, easy refactors, no network in between.</> });
  } else if (arch === 'micro') {
    push({ teams: true, say: <>One team per service. <b>Conway's law</b>: systems tend to mirror the org chart.</> });
    push({ teams: true, say: <>Teams ship on their own schedule and own their own data.</> });
    push({ teams: true, note: 'platform tax: CI per service, tracing, discovery, on-call', hold: 2, say: <>The price: a <span className="hl">platform</span> to run it all, and debugging across network boundaries.</> });
  } else {
    push({ teams: true, say: <>Teams own services… but the shared database belongs to <b>nobody</b>.</> });
    push({ teams: true, note: 'every schema change = a cross-team meeting', hold: 2, say: <>Each change needs a meeting. You split the code but <span className="hl bad">not the coupling</span>.</> });
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
