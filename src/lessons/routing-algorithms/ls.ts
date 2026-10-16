/**
 * Link-state routing on the distSim cluster. Each router floods a link-state advertisement
 * (LSA: origin, sequence number, its links) to its neighbours. A router stores an LSA only when
 * its sequence number is higher than the one it holds, then forwards it to every neighbour except
 * the one it came from. After the flood settles, each router runs Dijkstra on its own copy of the
 * database. A router also re-sends its own LSA to its direct neighbours a few times after each
 * change. That repairs a lost copy only on that one hop: a neighbour that already holds the
 * sequence number ignores the re-send, so a loss further along is NOT repaired and with loss the
 * databases can stay different for good (this model has no acknowledgements or database exchange
 * except on a restored link). A real OSPF router also has areas, ageing and a database exchange on
 * every new adjacency; this is the core idea.
 */
import { createCluster, toSequence, type Cluster, type DistNode, type NodeCtx, type Safety, type Snapshot } from '../../core/distSim';
import { dijkstra, nextHops, treeEdges, type Adj } from './paths';
import { sceneRun } from './dv';
import { intactTopo, adjacency, presetById, presetLinks, presetTopo, type Preset, type Topo } from './topology';

export type LsMode = 'seq' | 'ignore';
export type Delivery = 'random' | 'scripted';

export type LsaLinks = Record<string, number>;
export type LsMsg =
  | { type: 'lsa'; origin: string; seq: number; links: LsaLinks }
  | { type: 'link-down' | 'link-up'; peer: string; cost?: number };

export interface DbEntry {
  seq: number;
  links: LsaLinks;
}
export interface LsState {
  db: Record<string, DbEntry>;
}

/** A router re-floods its own LSA this many times after each change, REFRESH_MS apart, then stops. */
export const REFRESHES = 3;
export const REFRESH_MS = 80;
/** When the learner's link is cut, restored, and the cut of the scripted reordering (so the stale copy is still in flight). */
export const CUT_AT_MS = 60;
export const RESTORE_AT_MS = 200;
export const SCRIPTED_CUT_AT_MS = 15;
/** The scripted schedule: the first message on one link takes SLOW_MS, every other message FAST_MS. */
export const SCRIPTED_SLOW_MS = 40;
export const SCRIPTED_FAST_MS = 10;
/** Chance the network delivers a message twice, in random delivery. */
export const DUPLICATE_RATE = 0.05;
export const LATENCY_RANGE = { min: 1, max: 80 } as const;
export const LOSS_RANGE = { min: 0, max: 0.3, step: 0.05 } as const;
/** The lowest of 200 seeds (0..199) on which "ignore sequence numbers" breaks the rule, on the default random delivery; a test recomputes it. */
export const LS_BROKEN_SEED = 1;
/** The lowest of the same 200 seeds on which, with "ignore sequence numbers", a router is still routing over the cut link when the run ends. */
export const LS_DEAD_ROUTE_SEED = 70;
export const MAX_EVENTS = 20_000;
/** The run stops here: the last re-flood after the restore, plus the longest delivery, has long finished. */
export const HORIZON_MS = 600;

export interface LsSetup {
  presetId: string;
  mode: LsMode;
  delivery: Delivery;
  minMs: number;
  maxMs: number;
  loss: number;
  /** The link that is cut during the run (a link id such as 'AB'), or null for none. */
  link: string | null;
  /** The cut link comes back later. */
  restore: boolean;
  seed: number;
}

export const DEFAULT_LS: LsSetup = { presetId: 'ring', mode: 'seq', delivery: 'random', minMs: 5, maxMs: 60, loss: 0, link: 'AB', restore: false, seed: 1 };

export const cutAt = (s: LsSetup): number => (s.delivery === 'scripted' ? SCRIPTED_CUT_AT_MS : CUT_AT_MS);

function lsNode(id: string, neighbours: LsaLinks, mode: LsMode): DistNode<LsMsg, LsState> {
  let links: LsaLinks = {};
  let seq = 0;
  let db = new Map<string, DbEntry>();
  let refreshLeft = 0;

  const send = (ctx: NodeCtx<LsMsg>, to: string, origin: string, e: DbEntry) => ctx.send(to, { type: 'lsa', origin, seq: e.seq, links: e.links });
  const flood = (ctx: NodeCtx<LsMsg>, origin: string, except: string | null) => {
    const e = db.get(origin)!;
    for (const n of Object.keys(links).sort()) if (n !== except) send(ctx, n, origin, e);
  };
  const originate = (ctx: NodeCtx<LsMsg>) => {
    seq += 1;
    db.set(id, { seq, links: { ...links } });
    flood(ctx, id, null);
    refreshLeft = REFRESHES;
    ctx.setTimer('refresh', REFRESH_MS);
  };

  return {
    init: (ctx) => {
      links = { ...neighbours };
      seq = 0;
      db = new Map();
      originate(ctx);
    },
    onTimer: (ctx) => {
      if (refreshLeft <= 0) return;
      refreshLeft -= 1;
      const own: DbEntry = { seq, links: { ...links } };
      for (const n of Object.keys(links).sort()) send(ctx, n, id, own);
      if (refreshLeft > 0) ctx.setTimer('refresh', REFRESH_MS);
    },
    onMessage: (ctx, msg) => {
      const p = msg.payload;
      if (p.type === 'lsa') {
        const cur = db.get(p.origin);
        const accept = !cur || (mode === 'seq' ? p.seq > cur.seq : p.seq !== cur.seq);
        if (!accept) return;
        db.set(p.origin, { seq: p.seq, links: p.links });
        flood(ctx, p.origin, msg.from);
      } else if (p.type === 'link-down') {
        delete links[p.peer];
        originate(ctx);
      } else {
        links[p.peer] = p.cost ?? 1;
        originate(ctx);
        // A new adjacency starts with a database exchange: the peer may have missed everything while the link was down.
        for (const [origin, e] of [...db.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) if (origin !== id) send(ctx, p.peer, origin, e);
      }
    },
    snapshot: () => ({ db: Object.fromEntries(db) }),
  };
}

/** The slow directed link of the scripted schedule: from the cut link's first router to its first other neighbour; null when it has none. */
export function scriptedSlowLink(s: LsSetup): [string, string] | null {
  if (s.link === null) return null;
  const topo = intactTopo(presetTopo(presetById(s.presetId)));
  const l = topo.links.find((x) => x.id === s.link);
  if (!l) return null;
  const other = Object.keys(adjacency(topo)[l.a]).sort().find((n) => n !== l.b);
  return other ? [l.a, other] : null;
}

/** The cluster of a setup: routers, the delivery schedule and the link events. */
export function lsCluster(s: LsSetup): Cluster<LsMsg, LsState> {
  const preset = presetById(s.presetId);
  const topo = intactTopo(presetTopo(preset));
  const adj = adjacency(topo);
  const nodes = Object.fromEntries(topo.routers.map((r) => [r, lsNode(r, adj[r], s.mode)]));
  const scripted = s.delivery === 'scripted';
  const slow = scripted ? scriptedSlowLink(s) : null;
  const seen = new Set<string>();
  const cluster = createCluster<LsMsg, LsState>({
    seed: s.seed,
    nodes,
    latency: scripted
      ? (_rnd, from, to) => {
          const key = `${from}>${to}`;
          const first = !seen.has(key);
          seen.add(key);
          return slow && slow[0] === from && slow[1] === to && first ? SCRIPTED_SLOW_MS : SCRIPTED_FAST_MS;
        }
      : { min: s.minMs, max: s.maxMs },
    loss: scripted ? 0 : s.loss,
    duplicate: scripted ? 0 : DUPLICATE_RATE,
  });
  const l = topo.links.find((x) => x.id === s.link);
  if (l) {
    const at = cutAt(s);
    const back = s.restore ? RESTORE_AT_MS : HORIZON_MS + 1;
    cluster.partition(l.a, l.b, at, back);
    cluster.inject(at, l.a, { type: 'link-down', peer: l.b });
    cluster.inject(at, l.b, { type: 'link-down', peer: l.a });
    if (s.restore) {
      cluster.inject(back, l.a, { type: 'link-up', peer: l.b, cost: l.cost });
      cluster.inject(back, l.b, { type: 'link-up', peer: l.a, cost: l.cost });
    }
  }
  return cluster;
}

/** The links that are really up at true time `t`, given the learner's cut and restore. */
export function trueTopoAt(s: LsSetup, t: number): Topo {
  const topo = intactTopo(presetTopo(presetById(s.presetId)));
  const down = s.link !== null && t >= cutAt(s) && !(s.restore && t >= RESTORE_AT_MS);
  return { routers: topo.routers, links: topo.links.map((l) => ({ ...l, up: !(down && l.id === s.link) })) };
}

/** LS1: a router's stored sequence number for an origin never goes down. Stateful per run: it resets on the initial state (step 0). */
export function monotoneSeq(): Safety<LsState> {
  const last = new Map<string, number>();
  return (snap: Snapshot<LsState>) => {
    if (snap.step === 0) last.clear();
    for (const [router, n] of Object.entries(snap.nodes)) {
      for (const [origin, e] of Object.entries(n.state?.db ?? {})) {
        const key = `${router}|${origin}`;
        const before = last.get(key);
        if (before !== undefined && e.seq < before) return `${router} replaced its copy of ${origin}'s LSA #${before} with the older #${e.seq}`;
        last.set(key, e.seq);
      }
    }
    return null;
  };
}

export interface LsFrame {
  t: number;
  step: number;
  db: Record<string, Record<string, DbEntry>>;
}

export interface LsRun {
  setup: LsSetup;
  cluster: Cluster<LsMsg, LsState>;
  frames: LsFrame[];
  /** The first step at which LS1 failed, or null. */
  violation: { time: number; step: number; message: string } | null;
  endTime: number;
}

const frameOf = (snap: Snapshot<LsState>): LsFrame => ({
  t: snap.time,
  step: snap.step,
  db: Object.fromEntries(Object.entries(snap.nodes).map(([r, n]) => [r, n.state?.db ?? {}])),
});

/** Run the cluster to the end, recording the databases after every event. */
export function lsRun(setup: LsSetup): LsRun {
  const cluster = lsCluster(setup);
  const safety = monotoneSeq();
  cluster.start();
  const frames: LsFrame[] = [frameOf(cluster.snapshot())];
  let violation: LsRun['violation'] = null;
  const check = (snap: Snapshot<LsState>) => {
    const message = safety(snap);
    if (message !== null && violation === null) violation = { time: snap.time, step: snap.step, message };
  };
  check(cluster.snapshot());
  let events = 0;
  while (cluster.queued > 0 && cluster.nextTime() <= HORIZON_MS && events < MAX_EVENTS) {
    cluster.step();
    events += 1;
    const snap = cluster.snapshot();
    frames.push(frameOf(snap));
    check(snap);
  }
  return { setup, cluster, frames, violation, endTime: frames[frames.length - 1].t };
}

/** The frame in force at true time `t`: the last one at or before it. */
export function frameAt(run: LsRun, t: number): LsFrame {
  let lo = 0;
  let hi = run.frames.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (run.frames[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  return run.frames[lo];
}

/**
 * A router's view of the network: an edge counts only when both ends' LSAs list it (the two-way
 * check), at the larger of the two costs it reads.
 */
export function viewOf(db: Record<string, DbEntry>): Adj {
  const adj: Adj = Object.fromEntries(Object.keys(db).map((o) => [o, {} as Record<string, number>]));
  for (const [u, e] of Object.entries(db)) {
    for (const [v, w] of Object.entries(e.links)) {
      const back = db[v]?.links[u];
      if (back === undefined) continue;
      adj[u][v] = Math.max(w, back);
    }
  }
  return adj;
}

/** The routers that are connected to each other over links that are up (components of the true graph). */
export function components(topo: Topo): string[][] {
  const adj = adjacency(topo);
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const r of topo.routers) {
    if (seen.has(r)) continue;
    const comp = Object.keys(dijkstra(adj, r)).filter((x) => dijkstra(adj, r)[x] < Infinity).sort();
    comp.forEach((x) => seen.add(x));
    out.push(comp);
  }
  return out;
}

const seqKey = (db: Record<string, DbEntry>) => Object.keys(db).sort().map((o) => `${o}#${db[o].seq}`).join(',');

/** True when every router of each component of `topo` holds the same sequence numbers as the others of its component. */
export function agrees(frame: LsFrame, topo: Topo): boolean {
  return components(topo).every((comp) => new Set(comp.map((r) => seqKey(frame.db[r]))).size === 1);
}

/** Routers whose copy of some origin's LSA is older than the newest copy any router holds in the frame. */
export function behind(frame: LsFrame): string[] {
  const newest: Record<string, number> = {};
  for (const db of Object.values(frame.db)) for (const [o, e] of Object.entries(db)) newest[o] = Math.max(newest[o] ?? 0, e.seq);
  return Object.keys(frame.db).filter((r) => Object.entries(newest).some(([o, n]) => (frame.db[r][o]?.seq ?? 0) < n)).sort();
}

export interface Settling {
  /** When the databases last became (and stayed) in agreement, or null if they never settled within the run. */
  settledAt: number | null;
  /** The last topology change (cut or restore), or 0 when there is none. */
  changeAt: number;
  /** settledAt - changeAt, or null. */
  ms: number | null;
}

/** When all databases of each component agreed for good, and how long after the last change that took. */
export function settling(run: LsRun): Settling {
  const s = run.setup;
  const changeAt = s.link === null ? 0 : s.restore ? RESTORE_AT_MS : cutAt(s);
  const final = run.frames[run.frames.length - 1];
  const finalTopo = trueTopoAt(s, run.endTime);
  if (!agrees(final, finalTopo)) return { settledAt: null, changeAt, ms: null };
  let settledAt = final.t;
  for (let i = run.frames.length - 1; i >= 0; i--) {
    const f = run.frames[i];
    if (!agrees(f, trueTopoAt(s, f.t))) break;
    settledAt = f.t;
  }
  return { settledAt, changeAt, ms: Math.max(0, settledAt - changeAt) };
}

export interface RouterView {
  /** Shortest-path tree edges [parent, child] from the router's own database. */
  tree: [string, string][];
  next: Record<string, string | null>;
  dist: Record<string, number>;
  /** Tree edges that run over a link that is down in the true network at that moment. */
  deadEdges: [string, string][];
}

/** What router `r` would do at true time `t`: Dijkstra on its own copy of the database. */
export function routerView(run: LsRun, r: string, t: number): RouterView {
  const frame = frameAt(run, t);
  const adj = viewOf(frame.db[r]);
  const truth = adjacency(trueTopoAt(run.setup, t));
  const tree = treeEdges(adj, r);
  return {
    tree,
    next: nextHops(adj, r),
    dist: dijkstra(adj, r),
    deadEdges: tree.filter(([p, c]) => truth[p]?.[c] === undefined),
  };
}

/** Routers whose next hop to some destination differs from the one Dijkstra picks on the true graph at `t`. */
export function wrongRouters(run: LsRun, t: number): string[] {
  const truth = adjacency(trueTopoAt(run.setup, t));
  return Object.keys(truth).filter((r) => {
    const mine = nextHops(viewOf(frameAt(run, t).db[r]), r);
    const real = nextHops(truth, r);
    return Object.keys(truth).some((d) => (mine[d] ?? null) !== (real[d] ?? null));
  }).sort();
}

/** At the end of the run for `seed`, the first router whose tree still runs over a down link, or null. */
export function deadRouterOf(seed: number, setup: LsSetup = { ...DEFAULT_LS, mode: 'ignore', seed }): string | null {
  const run = lsRun({ ...setup, seed });
  const end = run.endTime;
  return Object.keys(adjacency(trueTopoAt(run.setup, end))).sort().find((r) => routerView(run, r, end).deadEdges.length > 0) ?? null;
}

/** Rounds plain distance vector needs to settle after the same link is cut (scene 2's model), or null when no link is cut. */
export function dvRoundsFor(s: LsSetup): number | null {
  if (s.link === null) return null;
  const p = presetById(s.presetId);
  const base: Topo = { routers: p.routers, links: presetLinks(p) };
  const cut: Topo = { routers: p.routers, links: base.links.map((l) => ({ ...l, up: l.id !== s.link })) };
  return sceneRun(base, cut, 'change', 'plain').rounds;
}

/** Messages the network was handed by true time `t`, and how many of them it lost. */
export function messageCounts(run: LsRun, t: number): { sent: number; lost: number } {
  const rows = run.cluster.trace.filter((r) => r.t <= t);
  return { sent: rows.filter((r) => r.kind === 'send').length, lost: rows.filter((r) => r.kind === 'drop' && !r.dup).length };
}

/** Trace rows up to `t` as a sequence diagram of the last `limit` messages. */
export function sequenceUpTo(run: LsRun, t: number, limit: number) {
  const rows = run.cluster.trace.filter((r) => r.t <= t);
  const seq = toSequence(rows, { actors: run.cluster.nodeIds.map((id) => ({ id, label: id })), label: msgLabel, events: false });
  const known = new Set(seq.actors.map((a) => a.id));
  const between = seq.messages.filter((m) => known.has(m.from) && (typeof m.to !== 'string' || m.to === '*' || known.has(m.to)));
  return { actors: seq.actors, messages: between.slice(-limit) };
}

export const msgLabel = (p: LsMsg): string => (p.type === 'lsa' ? `LSA ${p.origin} #${p.seq}` : p.type === 'link-down' ? `${p.peer} down` : `${p.peer} up`);

export type { Preset };
