import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  BODY, CAP_S, FAILURES, KEY, OTHER_BODY, TTL_H, begin, charges, duplicateRows, finish, interleavings, newServer, raceScenario, roundSpread, retryDelay, retryScenario,
  retryTimes, reuseScenario, runInterleaving,
} from './model';

const last = <T,>(xs: T[]) => xs[xs.length - 1];

describe('retries with and without a key', () => {
  for (const { id } of FAILURES)
    for (let n = 1; n <= 6; n++) {
      it(`${id}, ${n} failure(s): with the key, exactly one ledger row and the client ends with 201`, () => {
        const steps = retryScenario(id, true, n);
        expect(charges(last(steps).server)).toBe(1);
        const settled = steps.filter((s) => s.settled);
        expect(settled).toHaveLength(1);
        expect(settled[0].resp).toEqual({ status: 201, payment: 'pay_1' });
      });
    }
  it('without the key, a lost response charges once per attempt (case 2 with one failure: 2 rows)', () => {
    expect(charges(last(retryScenario('response-lost', false, 1)).server)).toBe(2);
    for (let n = 1; n <= 5; n++) expect(charges(last(retryScenario('response-lost', false, n)).server)).toBe(n + 1);
  });
  it('without the key, a client timeout also charges twice; a lost request is safe either way', () => {
    expect(charges(last(retryScenario('client-timeout', false, 1)).server)).toBe(2);
    for (let n = 1; n <= 5; n++) expect(charges(last(retryScenario('request-lost', false, n)).server)).toBe(1);
  });
  it('the retry after a lost response replays the stored response instead of charging', () => {
    const steps = retryScenario('response-lost', true, 1);
    expect(steps.filter((s) => s.kind === 'charge')).toHaveLength(1);
    expect(last(steps).kind).toBe('replay');
  });
  it('retries that arrive while the first is still running get 409, never a second charge', () => {
    const steps = retryScenario('client-timeout', true, 3);
    expect(steps.filter((s) => s.kind === 'reject').map((s) => s.resp!.status)).toEqual([409, 409, 409]);
    expect(steps.filter((s) => s.kind === 'ignored')).toHaveLength(1);
  });
});

describe('duplicate ledger rows', () => {
  it('are the same amount charged again, and only that', () => {
    expect(duplicateRows(last(retryScenario('response-lost', false, 1)).server)).toEqual([1]);
    expect(duplicateRows(last(retryScenario('response-lost', false, 3)).server)).toEqual([1, 2, 3]);
    expect(duplicateRows(last(retryScenario('response-lost', true, 3)).server)).toEqual([]);
    // After expiry a different body is a new payment: two rows, no duplicate.
    const late = last(reuseScenario(TTL_H + 1, OTHER_BODY)).server;
    expect(charges(late)).toBe(2);
    expect(late.ledger.map((r) => r.amount)).toEqual([BODY.amount, OTHER_BODY.amount]);
    expect(duplicateRows(late)).toEqual([]);
    expect(duplicateRows(last(reuseScenario(TTL_H + 1, BODY)).server)).toEqual([1]);
  });
});

describe('the key store', () => {
  it('rejects the same key with a different body (422), and does not charge', () => {
    let [s] = begin(newServer(), KEY, BODY, 0);
    s = finish(s, KEY, BODY, 1, 0)[0];
    const [, b] = begin(s, KEY, OTHER_BODY, 1);
    expect(b).toEqual({ kind: 'mismatch', resp: { status: 422, payment: null } });
    expect(charges(s)).toBe(1);
    const steps = reuseScenario(1, OTHER_BODY);
    expect(last(steps).resp!.status).toBe(422);
    expect(charges(last(steps).server)).toBe(1);
  });
  it(`replays up to ${TTL_H} h and processes again after (documented: keys must outlive the retry window)`, () => {
    expect(charges(last(reuseScenario(TTL_H, BODY)).server)).toBe(1);
    expect(last(reuseScenario(TTL_H, BODY)).kind).toBe('replay');
    const late = reuseScenario(TTL_H + 1, BODY);
    expect(charges(last(late).server)).toBe(2);
    expect(late.some((s) => s.begin?.kind === 'expired-proceed')).toBe(true);
  });
  it('a request without a key is always processed', () => {
    const [, b] = begin(newServer(), null, BODY, 0);
    expect(b.kind).toBe('proceed');
  });
});

describe('two same-key requests in flight, every ordering', () => {
  const orders = interleavings();
  it('there are 6 orderings of two begin → finish pairs', () => {
    expect(orders).toHaveLength(6);
    expect(new Set(orders.map((o) => o.map((x) => x.req + x.op[0]).join(' '))).size).toBe(6);
  });
  it('claiming the key first: the handler runs exactly once in all 6', () => {
    for (const o of orders) {
      const r = runInterleaving(o, true);
      expect(r.handlerRuns).toBe(1);
      expect(charges(r.server)).toBe(1);
    }
  });
  it('check-then-act: it runs twice whenever both look before either stores (4 of 6)', () => {
    const doubled = orders.filter((o) => runInterleaving(o, false).handlerRuns === 2);
    expect(doubled).toHaveLength(4);
    for (const o of doubled) expect(o.findIndex((x) => x.op === 'finish')).toBe(2);
  });
  it('the race scene matches: 409 with the lock, two charges without', () => {
    expect(charges(last(raceScenario(true)).server)).toBe(1);
    expect(raceScenario(true).find((s) => s.kind === 'reject')!.resp!.status).toBe(409);
    expect(charges(last(raceScenario(false)).server)).toBe(2);
  });
});

describe('retry policy', () => {
  const r = () => 0.5;
  it('delays: immediate 0, fixed 1 s, exponential doubling to a cap, jitter within [0, exponential]', () => {
    expect([0, 1, 2].map((n) => retryDelay('immediate', n, r))).toEqual([0, 0, 0]);
    expect([0, 1, 2].map((n) => retryDelay('fixed', n, r))).toEqual([1, 1, 1]);
    expect([0, 1, 2, 3, 4, 5, 6].map((n) => retryDelay('exponential', n, r))).toEqual([1, 2, 4, 8, 16, CAP_S, CAP_S]);
    const rnd = mulberry32(3);
    for (let n = 0; n < 8; n++) {
      const d = retryDelay('jitter', n, rnd);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(retryDelay('exponential', n, rnd));
    }
  });
  it('retry times accumulate the delays', () => {
    expect(retryTimes('exponential', 4, r)).toEqual([1, 3, 7, 15]);
  });
  it('without jitter every client sends retry k at the same instant; with jitter each round spreads out', () => {
    const clients = 8;
    const run = (p: 'exponential' | 'jitter') => {
      const rnd = mulberry32(11);
      return Array.from({ length: clients }, () => retryTimes(p, 5, rnd));
    };
    for (let k = 0; k < 5; k++) {
      expect(roundSpread(run('exponential'), k)).toBe(0);
      expect(roundSpread(run('jitter'), k)).toBeGreaterThan(0);
    }
    expect(roundSpread(run('jitter'), 4)).toBeGreaterThan(5);
  });
});
