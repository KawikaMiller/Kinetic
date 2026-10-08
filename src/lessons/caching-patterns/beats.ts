import {
  applyStep, behindStart, freshRegisters, behindStep, cached, isStale, replicaValue, type Beat, type BeatKind, type BehindOp, type BehindState,
  type Lane, type Options, type Store, type Timed, type View,
} from './model';

export const KEY = 'price';
const call = (op: string, value?: string) => (value === undefined ? `${op} ${KEY}` : `${op} ${KEY}=${value}`);

export const viewOf = (store: Store, now: number, o: Options, queued = 0): View => ({
  db: store.db, replica: replicaValue(store, now, o.lag), cache: cached(store, now, o.ttl), queued,
});

/** Turn steps into the arrows a sequence diagram draws, with what every store holds after each one. */
export function traceBeats(init: Store, steps: readonly Timed[], o: Options): Beat[] {
  const regs = freshRegisters();
  const beats: Beat[] = [];
  let store = init;
  const push = (s: Timed, after: Store, kind: BeatKind, from: Lane, to: Lane, label: string, extra: Partial<Beat> = {}) => {
    beats.push({
      id: `b${beats.length}`, from, to, kind, label, t: s.t, client: s.client, view: viewOf(after, s.t, o), stale: isStale(after, s.t, o.ttl), ...extra,
    });
  };
  for (const s of steps) {
    const res = applyStep(store, regs, s, o);
    const after = res.store;
    const c: Lane = s.client;
    switch (s.op) {
      case 'get':
        if (res.detail.hit) push(s, after, 'hit', c, 'cache', call('GET'), { served: res.served!, note: `hit: ${res.served!.value}` });
        else push(s, after, 'miss', c, 'cache', call('GET'), { note: 'miss' });
        break;
      case 'load':
        if (res.detail.skipped) break;
        if (s.source === 'replica') push(s, after, 'replica-read', c, 'replica', `SELECT ${KEY} (replica)`, { note: `returns ${res.detail.loaded}` });
        else push(s, after, 'db-read', c, 'db', `SELECT ${KEY}`, { note: `returns ${res.detail.loaded}` });
        break;
      case 'fill':
        if (res.detail.skipped) break;
        push(s, after, 'fill', c, 'cache', call('SET', res.detail.loaded), { served: res.served!, note: o.ttl === null ? undefined : `expires after ${o.ttl} s` });
        break;
      case 'db-write':
        push(s, after, 'db-write', c, 'db', `UPDATE ${KEY}=${s.value}`);
        break;
      case 'delete':
        push(s, after, 'delete', c, 'cache', call('DELETE'));
        break;
      case 'set':
        push(s, after, 'set', c, 'cache', call('SET', s.value), { note: o.ttl === null ? undefined : `expires after ${o.ttl} s` });
        break;
      case 'write-through': {
        // The cache layer takes its own lock for both writes, so no other step lands between them.
        const mid: Store = { ...store, cache: s.value!, cacheVersion: after.dbVersion, cacheSetAt: s.t };
        push(s, mid, 'cache-write', c, 'cache', call('PUT', s.value));
        push(s, after, 'cache-db-write', 'cache', 'db', `UPDATE ${KEY}=${s.value}`, { note: 'synchronously' });
        break;
      }
      case 'read-through':
        if (res.detail.hit) {
          push(s, after, 'hit', c, 'cache', call('GET'), { served: res.served!, note: `hit: ${res.served!.value}` });
        } else {
          push(s, store, 'miss', c, 'cache', call('GET'), { note: 'miss: the cache loads it' });
          push(s, after, 'db-read', 'cache', 'db', `SELECT ${KEY}`, { served: res.served!, note: `returns ${res.detail.loaded}, then stores it` });
        }
        break;
    }
    store = after;
  }
  return beats;
}

/** A self-arrow on the cache: its TTL ran out, so the entry is gone. */
export function ttlBeat(store: Store, t: number, o: Options, index: number): Beat {
  return {
    id: `ttl${index}`, from: 'cache', to: 'cache', kind: 'ttl', label: 'TTL expires', note: `${o.ttl} s after it was stored`, t,
    view: viewOf(store, t, o), stale: isStale(store, t, o.ttl),
  };
}

// ── Write-behind ──────────────────────────────────────────────────────────

export interface BehindBeat extends Beat {
  state: BehindState;
  /** Writes lost by this beat (a crash). */
  lostNow: number;
}

const behindView = (s: BehindState): View => ({ db: s.db, replica: s.db, cache: s.cache, queued: s.queue.length });

/** The write-behind script as diagram arrows, with the real model state after each one. */
export function behindBeats(db: string, ops: readonly BehindOp[]): BehindBeat[] {
  let state = behindStart(db);
  const beats: BehindBeat[] = [];
  ops.forEach((op, i) => {
    const before = state;
    state = behindStep(state, op);
    const base = { id: `w${i}`, t: i, view: behindView(state), stale: false, state };
    switch (op.op) {
      case 'write':
        beats.push({ ...base, from: 'A', to: 'cache', kind: 'queue', label: `PUT ${KEY}=${op.value}`, note: `queued for the database (${state.queue.length} waiting)`, lostNow: 0, client: 'A' });
        break;
      case 'flush':
        beats.push({ ...base, from: 'cache', to: 'db', kind: 'flush', label: `UPDATE ${KEY}=${state.db}`, note: `flush: ${before.queue.length} queued write${before.queue.length === 1 ? '' : 's'} become one`, lostNow: 0 });
        break;
      case 'crash':
        beats.push({ ...base, from: 'cache', to: 'cache', kind: 'crash', label: 'cache crashes', note: `${before.queue.length} queued write${before.queue.length === 1 ? '' : 's'} lost`, lostNow: before.queue.length });
        break;
    }
  });
  return beats;
}
