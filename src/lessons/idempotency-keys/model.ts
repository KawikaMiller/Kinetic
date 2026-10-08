// A simulated payment API with an in-memory idempotency-key store, and the scripted
// exchanges the stage steps through. Pure: model.test.ts proves one ledger row per payment
// with a key, whatever fails and however often, and that a same-key race never runs the
// handler twice when the key is locked first. Semantics follow the IETF
// Idempotency-Key header draft (draft-ietf-httpapi-idempotency-key-header): 422 for a
// reused key with a different body, 409 while the first request is still in flight.

/** How long the server keeps a key, in hours (illustrative; Stripe documents at least 24 h). */
export const TTL_H = 24;
export const KEY = 'a7f3c9e2-5b1d-4e8a-9c6f-2d4b8e1a7c30';

export interface Body {
  amount: number;
  currency: 'EUR';
  card: string;
}
export const BODY: Body = { amount: 2500, currency: 'EUR', card: '•••• 4242' };
export const OTHER_BODY: Body = { ...BODY, amount: 9900 };

/** What the server remembers about a request body. Real servers store a hash of it. */
export const fingerprint = (b: Body) => `${b.amount} ${b.currency} ${b.card}`;
export const money = (cents: number) => `€${(cents / 100).toFixed(2)}`;

export type Status = 201 | 409 | 422;
export const REASON: Record<Status, string> = { 201: 'Created', 409: 'Conflict', 422: 'Unprocessable Content' };

export interface Resp {
  status: Status;
  /** The payment the response is about (for 201). */
  payment: string | null;
}

export interface LedgerRow {
  id: string;
  amount: number;
  /** Which attempt caused this charge. */
  attempt: number;
}

export interface KeyRecord {
  fingerprint: string;
  state: 'in-progress' | 'done';
  response: Resp | null;
  /** Hours on the scene clock when the key was first seen. */
  at: number;
}

export interface Server {
  ledger: LedgerRow[];
  keys: Record<string, KeyRecord>;
  /**
   * true: claim the key atomically (insert an in-progress record) before doing any work.
   * false: look the key up, do the work, store it afterwards: check-then-act, a race.
   */
  lockFirst: boolean;
}

export const newServer = (lockFirst = true): Server => ({ ledger: [], keys: {}, lockFirst });

export type Begin =
  | { kind: 'proceed' }
  | { kind: 'replay'; resp: Resp }
  | { kind: 'mismatch'; resp: Resp }
  | { kind: 'in-progress'; resp: Resp }
  | { kind: 'expired-proceed' };

/** The key is still remembered at `now`. */
export const live = (r: KeyRecord, now: number) => now - r.at <= TTL_H;

/** Step 1 of handling a POST /payments: consult (and maybe claim) the key. */
export function begin(s: Server, key: string | null, body: Body, now: number): [Server, Begin] {
  if (key === null) return [s, { kind: 'proceed' }];
  const rec = s.keys[key];
  const expired = !!rec && !live(rec, now);
  if (rec && !expired) {
    if (rec.fingerprint !== fingerprint(body)) return [s, { kind: 'mismatch', resp: { status: 422, payment: null } }];
    if (rec.state === 'in-progress') return [s, { kind: 'in-progress', resp: { status: 409, payment: null } }];
    return [s, { kind: 'replay', resp: rec.response! }];
  }
  const keys = { ...s.keys };
  if (expired) delete keys[key];
  if (s.lockFirst) keys[key] = { fingerprint: fingerprint(body), state: 'in-progress', response: null, at: now };
  return [{ ...s, keys }, expired ? { kind: 'expired-proceed' } : { kind: 'proceed' }];
}

/**
 * Step 2, only after begin said proceed: charge the card (one ledger row) and, in the same
 * transaction, store the response under the key.
 */
export function finish(s: Server, key: string | null, body: Body, attempt: number, now: number): [Server, Resp] {
  const id = `pay_${s.ledger.length + 1}`;
  const resp: Resp = { status: 201, payment: id };
  const ledger = [...s.ledger, { id, amount: body.amount, attempt }];
  if (key === null) return [{ ...s, ledger }, resp];
  const prev = s.keys[key];
  const at = s.lockFirst && prev ? prev.at : now;
  return [{ ...s, ledger, keys: { ...s.keys, [key]: { fingerprint: fingerprint(body), state: 'done', response: resp, at } } }, resp];
}

/** How many times the handler charged: the ledger is the truth. */
export const charges = (s: Server) => s.ledger.length;

// ── Scripted exchanges for the sequence diagram ─────────────────────────

export type Failure = 'request-lost' | 'response-lost' | 'client-timeout';
export const FAILURES: { id: Failure; label: string }[] = [
  { id: 'request-lost', label: '1 · request lost' },
  { id: 'response-lost', label: '2 · response lost' },
  { id: 'client-timeout', label: '3 · client times out' },
];

export type StepKind = 'send' | 'check' | 'charge' | 'charged' | 'respond' | 'replay' | 'reject' | 'timeout' | 'ignored';

export interface Step {
  id: string;
  kind: StepKind;
  from: 'client' | 'api' | 'ledger';
  to: 'client' | 'api' | 'ledger';
  label: string;
  note?: string;
  lost?: boolean;
  attempt: number;
  /** The server after this step. */
  server: Server;
  begin?: Begin;
  /** The body this attempt carried (on check steps). */
  body?: Body;
  resp?: Resp;
  /** Did the client receive a usable answer at this step? */
  settled?: boolean;
}

/** Builds steps while driving the real server functions, so every row and response comes from the model. */
class Script {
  steps: Step[] = [];
  s: Server;
  readonly key: string | null;
  readonly now: number;
  constructor(s: Server, key: string | null, now = 0) {
    this.s = s;
    this.key = key;
    this.now = now;
  }
  private push(st: Omit<Step, 'id' | 'server'>) {
    this.steps.push({ ...st, id: `m${this.steps.length}`, server: this.s });
  }
  send(attempt: number, lost = false) {
    this.push({ kind: 'send', from: 'client', to: 'api', attempt, lost,
      label: `POST /payments${attempt > 1 ? ` (retry ${attempt - 1})` : ''}`,
      note: this.key ? `Idempotency-Key: ${this.key.slice(0, 8)}…` : 'no Idempotency-Key' });
  }
  /** Consults the key; returns what begin decided. */
  check(attempt: number, body: Body, now = this.now): Begin {
    const [s, b] = begin(this.s, this.key, body, now);
    this.s = s;
    if (this.key) {
      const label = { proceed: 'key is new: claim it', 'expired-proceed': 'key expired: treat as new', replay: 'key done: load stored response',
        mismatch: 'same key, different body', 'in-progress': 'key in progress' }[b.kind];
      this.push({ kind: 'check', from: 'api', to: 'api', attempt, label, begin: b, body });
    }
    return b;
  }
  charge(attempt: number, body: Body, now = this.now): Resp {
    this.push({ kind: 'charge', from: 'api', to: 'ledger', attempt, label: `INSERT charge ${money(body.amount)}` });
    const [s, r] = finish(this.s, this.key, body, attempt, now);
    this.s = s;
    this.push({ kind: 'charged', from: 'ledger', to: 'api', attempt, label: `ok, ${r.payment}`, resp: r });
    return r;
  }
  respond(attempt: number, r: Resp, how: 'deliver' | 'lost' | 'ignored', kind: 'respond' | 'replay' | 'reject' = 'respond') {
    this.push({ kind: how === 'ignored' ? 'ignored' : kind, from: 'api', to: 'client', attempt, resp: r, lost: how !== 'deliver', settled: how === 'deliver' && r.status === 201,
      label: `${r.status} ${REASON[r.status]}${r.payment ? ` (${r.payment})` : ''}`,
      note: kind === 'replay' ? 'stored response, replayed' : how === 'ignored' ? 'the client stopped waiting' : undefined });
  }
  timeout(attempt: number, why: string) {
    this.push({ kind: 'timeout', from: 'client', to: 'client', attempt, label: why });
  }
  /** One whole attempt: check, then charge or answer from the key store. */
  attempt(attempt: number, body: Body, how: 'deliver' | 'lost') {
    const b = this.check(attempt, body);
    if (b.kind === 'proceed' || b.kind === 'expired-proceed') this.respond(attempt, this.charge(attempt, body), how);
    else this.respond(attempt, b.resp, how, b.kind === 'replay' ? 'replay' : 'reject');
  }
}

/**
 * `fails` attempts go wrong at the chosen point, then one goes through. For the client
 * timeout, `fails` retries arrive while the first request is still being processed.
 */
export function retryScenario(failure: Failure, withKey: boolean, fails: number): Step[] {
  const sc = new Script(newServer(), withKey ? KEY : null);
  if (failure === 'request-lost') {
    for (let a = 1; a <= fails; a++) {
      sc.send(a, true);
      sc.timeout(a, 'no answer: retry');
    }
    sc.send(fails + 1);
    sc.attempt(fails + 1, BODY, 'deliver');
  } else if (failure === 'response-lost') {
    for (let a = 1; a <= fails; a++) {
      sc.send(a);
      sc.attempt(a, BODY, 'lost');
      sc.timeout(a, 'no answer: retry');
    }
    sc.send(fails + 1);
    sc.attempt(fails + 1, BODY, 'deliver');
  } else {
    // Attempt 1 is slow: the client gives up on it while the server is still charging.
    sc.send(1);
    const first = sc.check(1, BODY);
    sc.timeout(1, 'timed out: retry');
    let settled = false;
    for (let a = 2; a <= fails + 1 && !settled; a++) {
      sc.send(a);
      const b = sc.check(a, BODY);
      if (b.kind === 'proceed') {
        sc.respond(a, sc.charge(a, BODY), 'deliver');
        settled = true;
      } else {
        sc.respond(a, (b as { resp: Resp }).resp, 'deliver', 'reject');
        sc.timeout(a, 'wait, then retry');
      }
    }
    if (first.kind === 'proceed') sc.respond(1, sc.charge(1, BODY), 'ignored');
    if (!settled) {
      sc.send(fails + 2);
      sc.attempt(fails + 2, BODY, 'deliver');
    }
  }
  return sc.steps;
}

/** Two same-key requests racing: A arrives, B arrives while A is still charging. */
export function raceScenario(lockFirst: boolean): Step[] {
  const sc = new Script(newServer(lockFirst), KEY);
  sc.send(1);
  const a = sc.check(1, BODY);
  sc.send(2);
  const b = sc.check(2, BODY);
  if (b.kind === 'proceed') sc.respond(2, sc.charge(2, BODY), 'deliver');
  else sc.respond(2, (b as { resp: Resp }).resp, 'deliver', 'reject');
  if (a.kind === 'proceed') sc.respond(1, sc.charge(1, BODY), 'deliver');
  return sc.steps;
}

/** A first payment whose response is lost, then one retry `afterH` hours later with this body. */
export function reuseScenario(afterH: number, body: Body): Step[] {
  const sc = new Script(newServer(), KEY);
  sc.send(1);
  sc.attempt(1, BODY, 'lost');
  sc.timeout(1, `retry ${afterH < 1 ? `${Math.round(afterH * 60)} min` : `${afterH} h`} later`);
  sc.send(2);
  const b = sc.check(2, body, afterH);
  if (b.kind === 'proceed' || b.kind === 'expired-proceed') sc.respond(2, sc.charge(2, body, afterH), 'deliver');
  else sc.respond(2, b.resp, 'deliver', b.kind === 'replay' ? 'replay' : 'reject');
  return sc.steps;
}

// ── Interleavings, for the race test ────────────────────────────────────

export type Op = { req: 'A' | 'B'; op: 'begin' | 'finish' };

/** Every ordering of A's and B's begin → finish (6 of them). */
export function interleavings(): Op[][] {
  const out: Op[][] = [];
  const walk = (a: number, b: number, acc: Op[]) => {
    if (a === 2 && b === 2) return void out.push(acc);
    if (a < 2) walk(a + 1, b, [...acc, { req: 'A', op: a === 0 ? 'begin' : 'finish' }]);
    if (b < 2) walk(a, b + 1, [...acc, { req: 'B', op: b === 0 ? 'begin' : 'finish' }]);
  };
  walk(0, 0, []);
  return out;
}

/** Runs one ordering; a request only finishes (charges) if its begin said proceed. Returns how many times the handler ran. */
export function runInterleaving(order: Op[], lockFirst: boolean): { handlerRuns: number; server: Server } {
  let s = newServer(lockFirst);
  const proceed: Record<string, boolean> = {};
  let runs = 0;
  for (const o of order) {
    if (o.op === 'begin') {
      const [n, b] = begin(s, KEY, BODY, 0);
      s = n;
      proceed[o.req] = b.kind === 'proceed';
    } else if (proceed[o.req]) {
      s = finish(s, KEY, BODY, o.req === 'A' ? 1 : 2, 0)[0];
      runs++;
    }
  }
  return { handlerRuns: runs, server: s };
}

// ── Retry policy ────────────────────────────────────────────────────────

export type Policy = 'immediate' | 'fixed' | 'exponential' | 'jitter';
export const POLICIES: { id: Policy; label: string }[] = [
  { id: 'immediate', label: 'Immediate' },
  { id: 'fixed', label: 'Fixed 1 s' },
  { id: 'exponential', label: 'Exponential' },
  { id: 'jitter', label: 'Exponential + jitter' },
];
export const BASE_S = 1;
export const CAP_S = 16;

/**
 * Seconds to wait before retry n (0-based). Exponential doubles from BASE_S up to CAP_S;
 * "full jitter" picks uniformly in [0, that] (rnd is seeded on the stage).
 */
export function retryDelay(p: Policy, n: number, rnd: () => number): number {
  const exp = Math.min(CAP_S, BASE_S * 2 ** n);
  switch (p) {
    case 'immediate': return 0;
    case 'fixed': return BASE_S;
    case 'exponential': return exp;
    case 'jitter': return rnd() * exp;
  }
}

/** When each of `count` retries goes out (seconds after the first failure). */
export function retryTimes(p: Policy, count: number, rnd: () => number): number[] {
  const out: number[] = [];
  let t = 0;
  for (let n = 0; n < count; n++) {
    t += retryDelay(p, n, rnd);
    out.push(t);
  }
  return out;
}

/** How far apart the clients' retry number `round` lands (latest minus earliest, seconds). 0 = all at the same instant. */
export function roundSpread(times: readonly number[][], round: number): number {
  const at = times.map((ts) => ts[round]);
  return Math.max(...at) - Math.min(...at);
}
