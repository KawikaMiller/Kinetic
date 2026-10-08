// A simulated product row (id 7, stock 10, version 3) edited by two users who each sell one
// unit (read the stock, work out stock - 1, save), under four strategies. Pure: model.test.ts
// runs every ordering of the two users' three steps (20), plus the HTTP If-Match rules and a
// seeded contention model. Simulated database row and lock manager at READ COMMITTED.
import { mulberry32 } from '../../core/random';

export const PRODUCT_ID = 7;
export const START = { stock: 10, version: 3 } as const;

export type UserId = 'ana' | 'ben';
export const USERS: readonly UserId[] = ['ana', 'ben'];
export const NAME: Record<UserId, string> = { ana: 'Ana', ben: 'Ben' };
const otherOf = (u: UserId): UserId => (u === 'ana' ? 'ben' : 'ana');

export const STEPS = ['read', 'edit', 'save'] as const;
export type StepName = (typeof STEPS)[number];

export type Strategy = 'none' | 'pessimistic' | 'optimistic' | 'atomic';
export const STRATEGIES: { id: Strategy; label: string }[] = [
  { id: 'none', label: 'No locking' },
  { id: 'pessimistic', label: 'Pessimistic' },
  { id: 'optimistic', label: 'Optimistic' },
  { id: 'atomic', label: 'Atomic UPDATE' },
];

export interface Opts {
  /** Ticks the edit step takes for each user (the time spent "thinking" with the row read). */
  editTicks: Record<UserId, number>;
  /** Pessimistic only: ticks a blocked read waits for the row lock before it errors. */
  lockTimeout: number;
}
export const LUNCH_TICKS = 8;
export const DEFAULT_TIMEOUT = 5;
export const DEFAULT_OPTS: Opts = { editTicks: { ana: 1, ben: 1 }, lockTimeout: DEFAULT_TIMEOUT };

export interface Seen {
  stock: number;
  version: number;
  /** How many writes the row had taken when this was read (to spot a write that clobbers a newer one). */
  writes: number;
}

export interface UserState {
  /** Next step index; 3 when saved. */
  pc: number;
  seen: Seen | null;
  local: number | null;
  /** When a blocked read started waiting for the lock. */
  waitingSince: number | null;
  outcome: 'saved' | 'timeout' | null;
  retries: number;
}

export type Ev =
  | { kind: 'read'; user: UserId; t0: number; t1: number; saw: Seen; locked: boolean }
  | { kind: 'wait'; user: UserId; t0: number; t1: number; result: 'granted' | 'timeout' }
  | { kind: 'edit'; user: UserId; t0: number; t1: number; local: number | null }
  | {
      kind: 'save'; user: UserId; t0: number; t1: number; result: 'committed' | 'conflict';
      /** Stock after the statement. */
      stock: number;
      seenVersion: number;
      /** The row's version after the statement. */
      version: number;
      /** A committed write that overwrote a change made after this user read: a lost update. */
      clobbered: boolean;
    };

export interface World {
  strategy: Strategy;
  opts: Opts;
  row: { stock: number; version: number; writes: number };
  lock: UserId | null;
  users: Record<UserId, UserState>;
  now: number;
  events: Ev[];
  /** Saves that went through. */
  committed: number;
}

const freshUser = (): UserState => ({ pc: 0, seen: null, local: null, waitingSince: null, outcome: null, retries: 0 });

export function createWorld(strategy: Strategy, opts: Opts = DEFAULT_OPTS): World {
  return {
    strategy, opts, row: { stock: START.stock, version: START.version, writes: 0 }, lock: null,
    users: { ana: freshUser(), ben: freshUser() }, now: 0, events: [], committed: 0,
  };
}

/** The user can act: not finished, not blocked, not timed out. */
export const able = (w: World, u: UserId) => {
  const s = w.users[u];
  return s.pc < STEPS.length && s.waitingSince === null && s.outcome === null;
};

/** Time passes; a blocked read that has waited longer than the timeout gives up (pessimistic only). */
function advance(w: World, ticks: number) {
  w.now += ticks;
  if (w.strategy !== 'pessimistic') return;
  for (const u of USERS) {
    const s = w.users[u];
    if (s.waitingSince !== null && w.now - s.waitingSince > w.opts.lockTimeout) {
      w.events.push({ kind: 'wait', user: u, t0: s.waitingSince, t1: s.waitingSince + w.opts.lockTimeout, result: 'timeout' });
      s.waitingSince = null;
      s.outcome = 'timeout';
    }
  }
}

function doRead(w: World, u: UserId) {
  const s = w.users[u];
  const locked = w.strategy === 'pessimistic';
  s.seen = { stock: w.row.stock, version: w.row.version, writes: w.row.writes };
  if (locked) w.lock = u;
  w.events.push({ kind: 'read', user: u, t0: w.now, t1: w.now + 1, saw: s.seen, locked });
  s.pc = 1;
  advance(w, 1);
}

/** Runs the user's next step. A pessimistic read that finds the row locked starts waiting instead. */
export function step(w: World, u: UserId): void {
  if (!able(w, u)) return;
  const s = w.users[u];
  const t0 = w.now;
  switch (STEPS[s.pc]) {
    case 'read':
      if (w.strategy === 'pessimistic' && w.lock !== null && w.lock !== u) s.waitingSince = w.now;
      else doRead(w, u);
      return;
    case 'edit':
      s.local = w.strategy === 'atomic' ? null : s.seen!.stock - 1;
      w.events.push({ kind: 'edit', user: u, t0, t1: t0 + w.opts.editTicks[u], local: s.local });
      s.pc = 2;
      advance(w, w.opts.editTicks[u]);
      return;
    case 'save':
      save(w, u);
  }
}

function save(w: World, u: UserId) {
  const s = w.users[u];
  const seen = s.seen!;
  const t0 = w.now;
  const clobbered = w.strategy === 'none' || w.strategy === 'pessimistic' ? w.row.writes !== seen.writes : false;
  let committed = true;
  if (w.strategy === 'optimistic' && w.row.version !== seen.version) committed = false; // UPDATE … WHERE version = :seen matched 0 rows
  if (committed) {
    w.row.stock = w.strategy === 'atomic' ? w.row.stock - 1 : s.local!;
    if (w.strategy === 'optimistic') w.row.version++;
    w.row.writes++;
    w.committed++;
  }
  w.events.push({
    kind: 'save', user: u, t0, t1: t0 + 1, result: committed ? 'committed' : 'conflict', stock: w.row.stock, seenVersion: seen.version,
    version: w.row.version, clobbered: committed && clobbered,
  });
  if (committed) {
    s.pc = STEPS.length;
    s.outcome = 'saved';
  } else {
    s.retries++;
    s.seen = null;
    s.local = null;
    s.pc = 0;
  }
  advance(w, 1);
  if (w.strategy === 'pessimistic' && w.lock === u) {
    w.lock = null;
    const next = otherOf(u);
    const waited = w.users[next].waitingSince;
    if (waited !== null) {
      w.events.push({ kind: 'wait', user: next, t0: waited, t1: w.now, result: 'granted' });
      w.users[next].waitingSince = null;
      doRead(w, next);
    }
  }
}

/**
 * Applies the users' actions in the given order. An action whose user is blocked waits for
 * that user to be free again (the next able action runs first); with `drain`, whatever is left
 * runs afterwards, Ana before Ben, so a retrying user can finish.
 */
export function run(strategy: Strategy, opts: Opts, order: readonly UserId[], drain = false): World {
  const w = createWorld(strategy, opts);
  const queue = [...order];
  while (queue.length) {
    const i = queue.findIndex((u) => able(w, u));
    if (i < 0) break;
    step(w, queue.splice(i, 1)[0]);
  }
  if (drain) for (let u = USERS.find((x) => able(w, x)); u; u = USERS.find((x) => able(w, x))) step(w, u);
  return w;
}

export const finished = (w: World) => USERS.every((u) => w.users[u].outcome !== null);

/** Saves that went through but whose decrement is not in the stock. */
export const lostUpdates = (w: World) => w.committed - (START.stock - w.row.stock);

/** Every ordering of the two users' three steps: C(6,3) = 20. */
export function orderings(): UserId[][] {
  const out: UserId[][] = [];
  const walk = (a: number, b: number, acc: UserId[]) => {
    if (a === STEPS.length && b === STEPS.length) return void out.push(acc);
    if (a < STEPS.length) walk(a + 1, b, [...acc, 'ana']);
    if (b < STEPS.length) walk(a, b + 1, [...acc, 'ben']);
  };
  walk(0, 0, []);
  return out;
}

export interface Tally {
  orderings: number;
  lost: number;
  blocked: number;
  conflicts: number;
  timedOut: number;
}

/** What the strategy does across all 20 orderings. */
export function tally(strategy: Strategy, opts: Opts): Tally {
  const t: Tally = { orderings: 0, lost: 0, blocked: 0, conflicts: 0, timedOut: 0 };
  for (const o of orderings()) {
    const w = run(strategy, opts, o, true);
    t.orderings++;
    if (lostUpdates(w) > 0) t.lost++;
    if (w.events.some((e) => e.kind === 'wait')) t.blocked++;
    if (w.events.some((e) => e.kind === 'save' && e.result === 'conflict')) t.conflicts++;
    if (USERS.some((u) => w.users[u].outcome === 'timeout')) t.timedOut++;
  }
  return t;
}

// ── Scripted orderings (presets) ────────────────────────────────────────

export const PRESET_ORDERS: { id: string; label: string; order: UserId[] }[] = [
  { id: 'serial', label: 'One after the other', order: ['ana', 'ana', 'ana', 'ben', 'ben', 'ben'] },
  { id: 'both-read', label: 'Both read first', order: ['ana', 'ben', 'ana', 'ben', 'ana', 'ben'] },
  { id: 'mid-edit', label: 'Ben reads while Ana edits', order: ['ana', 'ana', 'ben', 'ana', 'ben', 'ben'] },
];

// ── The SQL each step runs ──────────────────────────────────────────────

export function sqlFor(strategy: Strategy, step: StepName, seen: Seen | null, local: number | null): string {
  const n = local ?? ':new';
  switch (strategy) {
    case 'none':
      return { read: 'SELECT stock FROM products WHERE id = 7;', edit: '-- the app works out stock - 1', save: `UPDATE products SET stock = ${n} WHERE id = 7;` }[step];
    case 'pessimistic':
      return {
        read: 'BEGIN; SELECT stock FROM products WHERE id = 7 FOR UPDATE;',
        edit: '-- the app works out stock - 1 (row lock held)',
        save: `UPDATE products SET stock = ${n} WHERE id = 7; COMMIT;`,
      }[step];
    case 'optimistic':
      return {
        read: 'SELECT stock, version FROM products WHERE id = 7;',
        edit: '-- the app works out stock - 1',
        save: `UPDATE products SET stock = ${n}, version = ${seen ? seen.version + 1 : ':v + 1'} WHERE id = 7 AND version = ${seen ? seen.version : ':v'};`,
      }[step];
    case 'atomic':
      return {
        read: 'SELECT stock FROM products WHERE id = 7;  -- only to show it',
        edit: '-- nothing to compute',
        save: 'UPDATE products SET stock = stock - 1 WHERE id = 7;',
      }[step];
  }
}

// ── Over HTTP: ETag and If-Match ────────────────────────────────────────

/** A strong ETag for the row's version. */
export const etag = (version: number) => `"v${version}"`;

export type PutStatus = 200 | 412 | 428;
export const PUT_REASON: Record<PutStatus, string> = { 200: 'OK', 412: 'Precondition Failed', 428: 'Precondition Required' };

export interface PutOutcome {
  status: PutStatus;
  applied: boolean;
  /** Applied without a precondition although the client's copy was stale: a silent lost update. */
  clobbered: boolean;
}

/**
 * Server rule for PUT /products/7. With If-Match the server applies the write only if the tag
 * equals the current one (strong comparison; RFC 9110 §13.1.1), else 412. Without it, a server
 * that requires preconditions answers 428 (RFC 6585); one that doesn't applies the write blindly.
 */
export function putOutcome(requireIfMatch: boolean, ifMatch: string | null, serverVersion: number, clientSawVersion: number): PutOutcome {
  if (ifMatch === null) {
    if (requireIfMatch) return { status: 428, applied: false, clobbered: false };
    return { status: 200, applied: true, clobbered: clientSawVersion !== serverVersion };
  }
  const ok = ifMatch === etag(serverVersion);
  return { status: ok ? 200 : 412, applied: ok, clobbered: false };
}

export interface HttpStep {
  id: string;
  from: 'ana' | 'ben' | 'api';
  to: 'ana' | 'ben' | 'api';
  label: string;
  note?: string;
  /** Who the message belongs to, for colour. */
  owner: UserId;
  kind: 'get' | 'got' | 'put' | 'result';
  /** got: the stock and tag the client now holds. put: the stock it writes and the tag it sends (null: none). result: the new tag when applied. */
  stock?: number;
  tag?: string | null;
  status?: PutStatus;
  clobbered?: boolean;
  /** The product after this step. */
  product: { stock: number; version: number };
}

/** Ana and Ben both load the product, both sell one unit, Ben's PUT arrives second. */
export function httpScript(requireIfMatch: boolean, benSendsIfMatch: boolean): HttpStep[] {
  const out: HttpStep[] = [];
  let p: { stock: number; version: number } = { stock: START.stock, version: START.version };
  const add = (s: Omit<HttpStep, 'id' | 'product'>) => out.push({ ...s, id: `h${out.length}`, product: { ...p } });
  const get = (u: UserId) => {
    add({ kind: 'get', from: u, to: 'api', owner: u, label: 'GET /products/7' });
    add({ kind: 'got', from: 'api', to: u, owner: u, label: '200 OK', note: `ETag: ${etag(p.version)} · stock ${p.stock}`, status: 200, stock: p.stock, tag: etag(p.version) });
  };
  const put = (u: UserId, stock: number, saw: number, sendTag: boolean): PutOutcome => {
    const tag = sendTag ? etag(saw) : null;
    add({ kind: 'put', from: u, to: 'api', owner: u, label: `PATCH stock=${stock}`, note: tag ? `If-Match: ${tag}` : 'no If-Match', stock, tag });
    const r = putOutcome(requireIfMatch, tag, p.version, saw);
    if (r.applied) p = { stock, version: p.version + 1 };
    add({
      kind: 'result', from: 'api', to: u, owner: u, label: `${r.status} ${PUT_REASON[r.status]}`, status: r.status, clobbered: r.clobbered,
      note: r.status === 200 ? `ETag: ${etag(p.version)}` : undefined, tag: r.status === 200 ? etag(p.version) : null,
    });
    return r;
  };
  get('ana');
  get('ben');
  put('ana', START.stock - 1, START.version, true);
  const first = put('ben', START.stock - 1, START.version, benSendsIfMatch);
  if (!first.applied) {
    get('ben');
    put('ben', p.stock - 1, p.version, true);
  }
  return out;
}

// ── Contention: optimistic retries vs pessimistic waiting ───────────────

export const MAX_EDITORS = 20;
/** Ticks one read-edit-save takes (illustrative). */
export const TXN_TICKS = 3;
/** Editors arrive at random within this many ticks. */
export const WINDOW_TICKS = 30;
/** Fixed cost of taking and holding a lock even when nobody waits (illustrative). */
export const LOCK_OVERHEAD = 0.5;
export const TRIALS = 200;

export interface Contention {
  editors: number;
  /** Optimistic: ticks of work thrown away on conflicts, per editor. */
  optimisticLost: number;
  /** Optimistic: conflicts (retries) per editor. */
  retries: number;
  /** Pessimistic: ticks spent waiting for the lock, plus the fixed lock cost, per editor. */
  pessimisticLost: number;
}

function optimisticTrial(arrivals: readonly number[]): number {
  type E = { t: number; kind: 0 | 1; id: number };
  const q: E[] = arrivals.map((t, id) => ({ t, kind: 1, id }));
  const readAt: number[] = [];
  let version = 0;
  let retries = 0;
  while (q.length) {
    q.sort((a, b) => a.t - b.t || a.kind - b.kind || a.id - b.id);
    const e = q.shift()!;
    if (e.kind === 1) {
      readAt[e.id] = version;
      q.push({ t: e.t + TXN_TICKS, kind: 0, id: e.id });
    } else if (readAt[e.id] === version) version++;
    else {
      retries++;
      q.push({ t: e.t, kind: 1, id: e.id });
    }
  }
  return retries;
}

function pessimisticTrial(arrivals: readonly number[]): number {
  let free = 0;
  let waited = 0;
  for (const a of [...arrivals].sort((x, y) => x - y)) {
    const start = Math.max(a, free);
    waited += start - a;
    free = start + TXN_TICKS;
  }
  return waited;
}

/** Averaged over TRIALS seeded arrival patterns, so the curves are repeatable. */
export function contention(editors: number): Contention {
  let retries = 0;
  let waited = 0;
  for (let k = 0; k < TRIALS; k++) {
    const rnd = mulberry32(1000 * editors + k);
    const arrivals = Array.from({ length: editors }, () => rnd() * WINDOW_TICKS);
    retries += optimisticTrial(arrivals);
    waited += pessimisticTrial(arrivals);
  }
  const perEditor = (x: number) => x / (TRIALS * editors);
  return {
    editors, retries: perEditor(retries), optimisticLost: perEditor(retries) * TXN_TICKS, pessimisticLost: perEditor(waited) + LOCK_OVERHEAD,
  };
}

export const contentionCurve = (): Contention[] => Array.from({ length: MAX_EDITORS }, (_, i) => contention(i + 1));
