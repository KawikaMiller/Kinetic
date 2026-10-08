import { describe, expect, it } from 'vitest';
import {
  ACK_MS, DUPLICATE_SEED, FEED, ORDERINGS, PAY_EVENTS, POLICY, PROVIDER_TIMEOUT_S, RETRY_DELAYS_MIN, SHOWN_ATTEMPTS, TRUTH, attemptTimes, deliverAll, fastScript,
  finalState, orderLabel, permutations, receive, scheduleEnd, withDuplicates, type PayEvent,
} from './model';

describe('the retry schedule is a pure function', () => {
  it('is the creation time plus the running total of the delays', () => {
    expect(attemptTimes(0)).toEqual([0, 1, 6, 36, 156]);
    expect(attemptTimes(3)).toEqual([3, 4, 9, 39, 159]);
    expect(attemptTimes(10, [2, 2])).toEqual([10, 12, 14]);
    expect(attemptTimes(7, [])).toEqual([7]);
  });
  it('has gaps that are exactly the delays, and the delays back off', () => {
    const t = attemptTimes(0);
    expect(t.slice(1).map((x, i) => x - t[i])).toEqual([...RETRY_DELAYS_MIN]);
    for (let i = 1; i < RETRY_DELAYS_MIN.length; i++) expect(RETRY_DELAYS_MIN[i]).toBeGreaterThan(RETRY_DELAYS_MIN[i - 1]);
  });
  it('ends at the last event\'s last attempt', () => {
    expect(scheduleEnd()).toBe(5 + 156);
  });
});

describe('a receiver that was down, then comes back', () => {
  it('delivers each event at its first scheduled attempt at or after the recovery (checked by brute force)', () => {
    for (let up = 0; up <= 200; up++) {
      for (const d of deliverAll(FEED, up)) {
        const times = attemptTimes(d.event.at);
        const first = times.find((t) => t >= up);
        expect(d.deliveredAt, `up ${up} ${d.event.id}`).toBe(first ?? null);
        expect(d.gaveUp).toBe(first === undefined);
        expect(d.attempts.map((a) => a.t)).toEqual(first === undefined ? times : times.slice(0, times.indexOf(first) + 1));
        expect(d.attempts.filter((a) => a.ok)).toHaveLength(first === undefined ? 0 : 1);
        expect(d.attempts.slice(0, -1).every((a) => !a.ok)).toBe(true);
      }
    }
  });
  it('the worked case: down for 20 minutes, the first event succeeds on its 4th attempt at minute 36', () => {
    const [a, b, c] = deliverAll(FEED, 20);
    expect(a.attempts).toEqual([{ t: 0, ok: false }, { t: 1, ok: false }, { t: 6, ok: false }, { t: 36, ok: true }]);
    expect([a.deliveredAt, b.deliveredAt, c.deliveredAt]).toEqual([36, 39, 41]);
  });
  it('up from the start means no retries; down past the schedule means every event gives up after 5 attempts', () => {
    expect(deliverAll(FEED, 0).every((d) => d.attempts.length === 1 && d.deliveredAt === d.event.at)).toBe(true);
    const gone = deliverAll(FEED, scheduleEnd() + 1);
    expect(gone.every((d) => d.gaveUp && d.attempts.length === RETRY_DELAYS_MIN.length + 1 && d.deliveredAt === null)).toBe(true);
  });
});

describe('the policy table says 2xx stops retries and the rest keep going', () => {
  it('has a success row first and three retrying rows', () => {
    expect(POLICY[0].provider).toContain('stops retrying');
    expect(POLICY.slice(1).filter((r) => r.provider.includes('keeps retrying'))).toHaveLength(3);
  });
});

const idsOf = (xs: readonly PayEvent[]) => xs.map((e) => e.id);

describe('duplicates', () => {
  it('a seeded stream repeats two events later in the stream, and nothing else', () => {
    for (const order of permutations())
      for (let seed = 1; seed <= 60; seed++) {
        const s = withDuplicates(order, seed);
        expect(s).toHaveLength(5);
        expect([...new Set(idsOf(s))].sort()).toEqual(idsOf(PAY_EVENTS));
        const counts = idsOf(s).reduce<Record<string, number>>((m, id) => ({ ...m, [id]: (m[id] ?? 0) + 1 }), {});
        expect(Object.values(counts).sort()).toEqual([1, 2, 2]);
        expect(idsOf(s)[0]).toBe(idsOf(order)[0]);
        // the first copies keep the original relative order
        expect(idsOf(s).filter((id, i, a) => a.indexOf(id) === i)).toEqual(idsOf(order));
      }
  });
  it('is the same every time', () => {
    const o = permutations()[0];
    expect(withDuplicates(o)).toEqual(withDuplicates(o, DUPLICATE_SEED));
  });
  it('with dedupe, every event id is handled once over seeded streams with duplicates', () => {
    for (const order of permutations())
      for (let seed = 1; seed <= 60; seed++) {
        const steps = receive(withDuplicates(order, seed), { dedupe: true, ordering: 'arrival' });
        const handled = steps.filter((s) => s.action !== 'dropped-duplicate').map((s) => s.event.id);
        expect(handled).toEqual(idsOf(order));
        expect(steps.filter((s) => s.duplicate).every((s) => s.action === 'dropped-duplicate')).toBe(true);
        expect(steps[steps.length - 1].seen).toEqual(idsOf(order));
        const fx = steps[steps.length - 1].effects;
        expect(new Set(fx).size).toBe(fx.length);
      }
  });
  it('without dedupe, arrival order runs the effect again for a repeated event', () => {
    const o = permutations().find((p) => orderLabel(p) === 'created → succeeded → refunded')!;
    const stream = [o[0], o[1], o[1], o[2]];
    expect(receive(stream, { dedupe: false, ordering: 'arrival' }).pop()!.effects).toEqual(['receipt email', 'receipt email', 'refund email']);
    expect(receive(stream, { dedupe: true, ordering: 'arrival' }).pop()!.effects).toEqual(['receipt email', 'refund email']);
  });
});

describe('ordering: the final state, for all 6 orders of 3 events', () => {
  const perms = permutations();
  it('there are 6 distinct orders', () => {
    expect(perms).toHaveLength(6);
    expect(new Set(perms.map(orderLabel)).size).toBe(6);
  });
  for (const dup of [false, true])
    for (const dedupe of [false, true])
      it(`timestamps and fetch-current-state always end at ${TRUTH} (duplicates ${dup}, dedupe ${dedupe})`, () => {
        for (const order of perms)
          for (const ordering of ['timestamp', 'refetch'] as const) {
            const stream = dup ? withDuplicates(order) : order;
            expect(finalState(receive(stream, { dedupe, ordering })), `${orderLabel(order)} ${ordering}`).toBe(TRUTH);
          }
      });
  it('arrival order ends wrong in 4 of 6, exactly when the refund is not the last to arrive', () => {
    let wrong = 0;
    for (const order of perms) {
      const end = finalState(receive(order, { dedupe: true, ordering: 'arrival' }));
      // Independent oracle: the receiver ends at whatever the last delivery says.
      expect(end).toBe(order[order.length - 1].status);
      if (end !== TRUTH) wrong++;
    }
    expect(wrong).toBe(4);
  });
  it('refetch makes a repeated delivery harmless on its own: no second effect even without dedupe', () => {
    for (const order of perms) {
      const steps = receive(withDuplicates(order), { dedupe: false, ordering: 'refetch' });
      expect(steps[steps.length - 1].effects).toEqual(['refund email']);
    }
  });
  it('a first delivery that arrives after a newer event is flagged out of order; a repeat is not', () => {
    const late = perms.find((p) => orderLabel(p) === 'refunded → created → succeeded')!;
    const steps = receive([...late, late[0]], { dedupe: true, ordering: 'timestamp' });
    expect(steps.map((s) => s.outOfOrder)).toEqual([false, true, true, false]);
    expect(steps.map((s) => s.action)).toEqual(['applied', 'ignored-stale', 'ignored-stale', 'dropped-duplicate']);
  });
  it('lists the three strategies', () => {
    expect(ORDERINGS.map((o) => o.id)).toEqual(['arrival', 'timestamp', 'refetch']);
  });
});

describe('respond fast', () => {
  const works = [1, 5, PROVIDER_TIMEOUT_S, PROVIDER_TIMEOUT_S + 1, 20, 30];
  it('ack-first: one attempt, one run of the work, acked, whatever the work takes', () => {
    for (const w of works) {
      const r = fastScript(w, 'ack-first');
      expect(r).toMatchObject({ attempts: 1, workRuns: 1, acked: true });
      expect(r.steps.find((s) => s.kind === 'reply')!.note).toBe(`after ${ACK_MS} ms`);
    }
  });
  it('after-work: fine up to the timeout, then the provider hangs up and retries while the work repeats', () => {
    for (const w of works) {
      const r = fastScript(w, 'after-work');
      if (w <= PROVIDER_TIMEOUT_S) expect(r).toMatchObject({ attempts: 1, workRuns: 1, acked: true });
      else expect(r).toMatchObject({ attempts: SHOWN_ATTEMPTS, workRuns: SHOWN_ATTEMPTS, acked: false });
    }
  });
  it('the run counter only grows, and a lost reply is always after the work has run', () => {
    for (const mode of ['after-work', 'ack-first'] as const)
      for (const w of works) {
        const steps = fastScript(w, mode).steps;
        steps.forEach((s, i) => i && expect(s.workRuns).toBeGreaterThanOrEqual(steps[i - 1].workRuns));
        for (const s of steps.filter((x) => x.lost)) expect(s.workRuns).toBe(s.attempt);
      }
  });
});
