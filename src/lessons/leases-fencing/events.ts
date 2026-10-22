/**
 * Reading a lease run as a story and as drawings: the moments worth a caption, the Gantt bars and the
 * storage log. Pure, so a test can pin a caption or a bar against the model's own trace.
 */
import type { GanttBar } from '../../components/GanttLanes';
import { barsAt } from '../../core/gantt';
import type { LogRow } from '../../components/logRows';
import { CLIENT_A, CLIENT_B, STORE, type Abandon, type Grant, type LeaseRun, type StoreEntry } from './model';

export type LeaseEvent =
  | { t: number; kind: 'grant'; grant: Grant }
  | { t: number; kind: 'expiry'; grant: Grant }
  | { t: number; kind: 'pause'; until: number | null }
  | { t: number; kind: 'resume' }
  | { t: number; kind: 'write'; entry: StoreEntry }
  | { t: number; kind: 'abandon'; node: string; why: Abandon['why'] };

const ORDER: Record<LeaseEvent['kind'], number> = { expiry: 0, grant: 1, pause: 2, resume: 3, abandon: 4, write: 5 };

/** The moments of a run in time order (ties: expiry, grant, pause, resume, abandon, write). */
export function leaseEvents(run: LeaseRun): LeaseEvent[] {
  const events: LeaseEvent[] = [];
  for (const g of run.grants) {
    events.push({ t: g.at, kind: 'grant', grant: g });
    if (g.endedBy === 'expiry' && g.endedAt !== null) events.push({ t: g.endedAt, kind: 'expiry', grant: g });
  }
  if (run.pause) {
    events.push({ t: run.pause.from, kind: 'pause', until: run.pause.to });
    if (run.pause.to !== null) events.push({ t: run.pause.to, kind: 'resume' });
  }
  for (const a of run.abandoned) events.push({ t: a.at, kind: 'abandon', node: a.node, why: a.why });
  for (const entry of run.store) events.push({ t: entry.at, kind: 'write', entry });
  return events.sort((a, b) => a.t - b.t || ORDER[a.kind] - ORDER[b.kind]);
}

export const LEASE_LANES = [
  { id: CLIENT_A, label: 'client A' },
  { id: CLIENT_B, label: 'client B' },
  { id: STORE, label: 'storage' },
];

const sec = (ms: number) => ms / 1000;

/** The end of the time axis, in ms: a little past the last event, rounded up to a whole second. */
export const domainEndMs = (run: LeaseRun) => Math.max(1000, Math.ceil((run.end + 500) / 1000) * 1000);

export const writeLabel = (e: StoreEntry) =>
  `${e.from}: token ${e.token} ${e.applied ? (e.stale ? 'applied (stale)' : 'applied') : e.refusedNewest ? 'rejected (wrongly)' : 'rejected'}`;

/** Every bar of the run in seconds; clip them with `barsAt(bars, now)`. */
export function leaseBars(run: LeaseRun): GanttBar[] {
  const end = domainEndMs(run);
  const bars: GanttBar[] = [];
  for (const g of run.grants) {
    const until = g.endedAt ?? Math.min(g.expiresAt, end);
    bars.push({ id: `lease-${g.epoch}`, lane: g.to, start: sec(g.at), end: sec(until), tone: 'ok', label: `lease, token ${g.token}`, minPx: 6 });
    bars.push({ id: `grant-${g.epoch}`, lane: g.to, start: sec(g.at), end: sec(g.at), tone: 'violet', label: `grant ${g.token}` });
    g.renewedAt.forEach((t, i) => bars.push({ id: `renew-${g.epoch}-${i}`, lane: g.to, start: sec(t), end: sec(t), tone: 'info' }));
    const write = run.store.find((e) => e.epoch === g.epoch);
    if (g.endedAt !== null && write && write.at > g.endedAt) {
      bars.push({ id: `believes-${g.epoch}`, lane: g.to, start: sec(g.endedAt), end: sec(write.at), tone: 'dim', label: 'still believes it holds the lock', minPx: 6 });
    }
  }
  if (run.pause) bars.push({ id: 'pause', lane: CLIENT_A, start: sec(run.pause.from), end: sec(run.pause.to ?? end), tone: 'orange', kind: 'wait', label: 'paused' });
  for (const a of run.abandoned) bars.push({ id: `abandon-${a.node}`, lane: a.node, start: sec(a.at), end: sec(a.at), tone: 'dim', label: a.why === 'check' ? 'sees the lease lapsed, stops' : 'told the lease is lost, stops' });
  for (const e of run.store) bars.push({ id: `write-${e.id}`, lane: STORE, start: sec(e.at), end: sec(e.at), tone: e.stale || e.refusedNewest ? 'bad' : 'ok', label: writeLabel(e) });
  return bars;
}

export const barsUpTo = (bars: readonly GanttBar[], nowMs: number) => barsAt(bars, sec(nowMs));

/** The storage server's history up to `nowMs`, one row per write that reached it; ids are `seed:position`. */
export function storeRows(run: LeaseRun, nowMs: number): LogRow[] {
  return run.store
    .filter((e) => e.at <= nowMs)
    .map((e) => ({
      id: `${run.setup.seed}:${e.id}`,
      at: `${sec(e.at).toFixed(2)} s`,
      source: 'storage',
      tone: e.stale || e.refusedNewest ? ('bad' as const) : ('ok' as const),
      text: e.applied
        ? `${e.from} wrote "${e.value}" (token ${e.token}): applied${e.stale ? ', but a newer lease had already written' : ''}`
        : `${e.from} wrote "${e.value}" (token ${e.token}): rejected, stale token ${e.token} < ${e.highestBefore}${e.refusedNewest ? ', although it is the newest lease write' : ''}`,
    }));
}
