import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { captionText, expectCaption } from '../../core/testing/captions';
import { appendedCaption, introCaption, money, newProjectionCaption, rejectedCaption, resetCaption, scrubCaption } from './captions';
import {
  apply, bigWithdrawals, dateOf, EMPTY, fold, foldFrom, SEED, statement, upcast, type AccountEvent, type EventType,
} from './events';
import lesson from './index';
import {
  addBigProjection, DEPOSIT, hasBigProjection, initialSim, isBehind, lagOf, LAST_DAY, runCommand, tick, WITHDRAW, WITHDRAW_TOO_MUCH, type Sim,
} from './model';

/** A random but valid log: opens an account, then deposits and withdrawals the balance can cover, v1 and v2 events mixed. */
function randomLog(seed: number, length: number): AccountEvent[] {
  const rnd = mulberry32(seed);
  const log: AccountEvent[] = [{ seq: 1, type: 'AccountOpened', amount: 0, owner: 'Zed', day: 1, v: 1 }];
  let balance = 0;
  let day = 1;
  while (log.length < length) {
    day = Math.min(365, day + Math.floor(rnd() * 12));
    const deposit = rnd() < 0.55 || balance < 10;
    const amount = deposit ? 1 + Math.floor(rnd() * 400) : 1 + Math.floor(rnd() * balance);
    balance += deposit ? amount : -amount;
    const type: EventType = deposit ? 'Deposited' : 'Withdrew';
    const v = rnd() < 0.5 ? 1 : 2;
    log.push({ seq: log.length + 1, type, amount, day, v, ...(v === 2 ? { currency: 'EUR' } : {}) });
  }
  return log;
}

/** The balance after each prefix, by a plain loop (no fold, no apply). */
function balancesByLoop(log: readonly AccountEvent[]): number[] {
  const out = [0];
  let balance = 0;
  for (const e of log) {
    if (e.type === 'Deposited') balance += e.amount;
    else if (e.type === 'Withdrew') balance -= e.amount;
    out.push(balance);
  }
  return out;
}

describe('replaying the log gives the state', () => {
  it('the seed log, prefix by prefix, against hand-worked balances', () => {
    // opened, +500, -120, +300, -80, -450, +60
    const expected = [0, 0, 500, 380, 680, 600, 150, 210];
    for (let k = 0; k <= SEED.length; k++) {
      const state = fold(SEED, k);
      expect(state.balance, `after ${k} events`).toBe(expected[k]);
      expect(state.applied).toBe(k);
    }
    expect(fold(SEED).owner).toBe('Ada');
    expect(fold(SEED, 0)).toEqual(EMPTY);
  });

  it('random logs of v1 and v2 events, for every prefix, against a plain loop', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const log = randomLog(seed, 120);
      const want = balancesByLoop(log);
      for (let k = 0; k <= log.length; k++) expect(fold(log, k).balance, `seed ${seed} prefix ${k}`).toBe(want[k]);
    }
  });

  it('a snapshot plus the events after it equals a full replay, at every split point', () => {
    for (const seed of [1, 2, 3]) {
      const log = randomLog(seed, 80);
      const full = fold(log);
      for (let split = 0; split <= log.length; split++) {
        const snapshot = fold(log, split);
        expect(foldFrom(snapshot, log.slice(split)), `seed ${seed} split ${split}`).toEqual(full);
      }
    }
  });

  it('upcasting v1 events to v2 EUR never rewrites the log and changes no balance', () => {
    const log = randomLog(9, 60);
    const before = JSON.stringify(log);
    const upcasted = log.map(upcast);
    expect(JSON.stringify(log)).toBe(before);
    for (const e of upcasted) {
      expect(e.v).toBe(2);
      expect(e.currency).toBeDefined();
    }
    expect(log.some((e) => e.v === 1)).toBe(true);
    expect(fold(upcasted)).toEqual(fold(log));
    const v1: AccountEvent = { seq: 2, type: 'Deposited', amount: 5, day: 1, v: 1 };
    expect(upcast(v1)).toEqual({ ...v1, v: 2, currency: 'EUR' });
    expect(apply(EMPTY, v1)).toEqual(apply(EMPTY, upcast(v1)));
  });
});

describe('dates', () => {
  it('dateOf matches the calendar for every day of a year with 28 days in February', () => {
    const NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for (let day = 1; day <= 365; day++) {
      const d = new Date(Date.UTC(2023, 0, day));
      const want = `${NAMES[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, '0')}`;
      expect(dateOf(day).label, `day ${day}`).toBe(want);
      expect(dateOf(day).month).toBe(NAMES[d.getUTCMonth()]);
    }
  });

  it('seed dates read Jan 03, Jan 05, Jan 19, Feb 02, Feb 14, Feb 27, Mar 04', () => {
    expect(SEED.map((e) => dateOf(e.day).label)).toEqual(['Jan 03', 'Jan 05', 'Jan 19', 'Feb 02', 'Feb 14', 'Feb 27', 'Mar 04']);
  });
});

describe('read models', () => {
  it('the monthly statement groups deposits and withdrawals by month (seed, hand-worked)', () => {
    expect(statement(SEED, SEED.length)).toEqual([
      { month: 'Jan', inflow: 500, outflow: 120 },
      { month: 'Feb', inflow: 300, outflow: 530 },
      { month: 'Mar', inflow: 60, outflow: 0 },
    ]);
    expect(statement(SEED, 2)).toEqual([{ month: 'Jan', inflow: 500, outflow: 0 }]);
  });

  it('the statement matches a brute-force grouping on random logs, for every prefix length tried', () => {
    for (const seed of [1, 2, 3]) {
      const log = randomLog(seed, 90);
      for (const upTo of [1, 17, 45, 90]) {
        const want = new Map<string, { inflow: number; outflow: number }>();
        for (const e of log.slice(0, upTo)) {
          const month = new Date(Date.UTC(2023, 0, e.day)).toLocaleString('en', { month: 'short', timeZone: 'UTC' });
          const row = want.get(month) ?? { inflow: 0, outflow: 0 };
          if (e.type === 'Deposited') row.inflow += e.amount;
          if (e.type === 'Withdrew') row.outflow += e.amount;
          want.set(month, row);
        }
        expect(statement(log, upTo).map((r) => [r.month, r.inflow, r.outflow])).toEqual([...want].map(([m, r]) => [m, r.inflow, r.outflow]));
      }
    }
  });

  it('big withdrawals are the ones of 100 or more (the seed has #3 and #6)', () => {
    expect(bigWithdrawals(SEED, SEED.length).map((e) => [e.seq, e.amount])).toEqual([[3, 120], [6, 450]]);
    const edge: AccountEvent[] = [
      { seq: 1, type: 'Withdrew', amount: 99, day: 1, v: 2 },
      { seq: 2, type: 'Withdrew', amount: 100, day: 1, v: 2 },
      { seq: 3, type: 'Deposited', amount: 900, day: 1, v: 2 },
    ];
    expect(bigWithdrawals(edge, 3).map((e) => e.seq)).toEqual([2]);
    expect(bigWithdrawals(SEED, 4).map((e) => e.seq)).toEqual([3]);
  });
});

describe('commands', () => {
  it('a withdrawal larger than the balance is rejected: nothing is written and the log is the same object', () => {
    const sim = initialSim();
    const result = runCommand(sim, 'Withdrew', WITHDRAW_TOO_MUCH);
    expect(result.ok).toBe(false);
    expect(result.sim).toBe(sim);
    if (!result.ok) expect(result.balance).toBe(210);
  });

  it('a withdrawal of exactly the balance is accepted, and one more cent-worth is not', () => {
    const sim = initialSim();
    const all = runCommand(sim, 'Withdrew', 210);
    expect(all.ok).toBe(true);
    if (all.ok) {
      expect(fold(all.sim.events).balance).toBe(0);
      expect(runCommand(all.sim, 'Withdrew', 1).ok).toBe(false);
    }
  });

  it('appends an event with the next sequence number and a later day, and leaves every earlier event untouched', () => {
    let sim: Sim = initialSim();
    const original = [...sim.events];
    for (let i = 0; i < 100; i++) {
      const r = runCommand(sim, i % 3 === 0 ? 'Withdrew' : 'Deposited', i % 3 === 0 ? 1 : DEPOSIT);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const last = sim.events[sim.events.length - 1];
      expect(r.event.seq).toBe(last.seq + 1);
      expect(r.event.day).toBe(Math.min(LAST_DAY, last.day + 5));
      expect(r.event.v).toBe(2);
      expect(r.event.currency).toBe('EUR');
      expect(r.sim.events.slice(0, sim.events.length)).toEqual(sim.events);
      sim = r.sim;
    }
    expect(sim.events.slice(0, original.length)).toEqual(original);
    expect(sim.events.at(-1)?.day).toBe(LAST_DAY);
  });

  it('the balance after any run of accepted commands is the sum of what they did', () => {
    const rnd = mulberry32(12);
    let sim = initialSim();
    let expected = 210;
    for (let i = 0; i < 200; i++) {
      const type = rnd() < 0.5 ? 'Deposited' : 'Withdrew';
      const amount = 1 + Math.floor(rnd() * 300);
      const r = runCommand(sim, type, amount);
      const allowed = type === 'Deposited' || amount <= expected;
      expect(r.ok, `step ${i}`).toBe(allowed);
      if (r.ok) {
        expected += type === 'Deposited' ? amount : -amount;
        sim = r.sim;
      }
      expect(fold(sim.events).balance).toBe(expected);
      expect(expected).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('projections catch up asynchronously', () => {
  const ticks = (s: Sim, n: number) => Array.from({ length: n }).reduce<Sim>((acc) => tick(acc), s);

  it('start level with the log, and a deposit leaves both one event behind', () => {
    const sim = initialSim();
    expect(lagOf(sim)).toBe(0);
    expect(isBehind(sim)).toBe(false);
    const r = runCommand(sim, 'Deposited', DEPOSIT);
    if (!r.ok) throw new Error('deposit rejected');
    expect(lagOf(r.sim)).toBe(1);
    expect(r.sim.projections.map((p) => r.sim.events.length - p.pos)).toEqual([1, 1]);
    expect(isBehind(r.sim)).toBe(true);
  });

  it('the balance view catches up after exactly its delay in ticks, the statement after its own, then the clock can stop', () => {
    const r = runCommand(initialSim(), 'Deposited', DEPOSIT);
    if (!r.ok) throw new Error('deposit rejected');
    const [balance, statementView] = r.sim.projections;
    expect(ticks(r.sim, balance.delay - 1).projections[0].pos).toBe(r.sim.events.length - 1);
    expect(ticks(r.sim, balance.delay).projections[0].pos).toBe(r.sim.events.length);
    expect(ticks(r.sim, statementView.delay - 1).projections[1].pos).toBe(r.sim.events.length - 1);
    expect(ticks(r.sim, statementView.delay).projections[1].pos).toBe(r.sim.events.length);
    expect(isBehind(ticks(r.sim, Math.max(balance.delay, statementView.delay)))).toBe(false);
    expect(isBehind(ticks(r.sim, statementView.delay - 1))).toBe(true);
  });

  it('with several events queued, each one costs a projection its delay again', () => {
    let sim: Sim = initialSim();
    for (let i = 0; i < 3; i++) {
      const r = runCommand(sim, 'Deposited', DEPOSIT);
      if (!r.ok) throw new Error('deposit rejected');
      sim = r.sim;
    }
    const delay = sim.projections[0].delay;
    expect(lagOf(sim)).toBe(3);
    expect(ticks(sim, delay * 2).projections[0].pos).toBe(sim.events.length - 1);
    expect(ticks(sim, delay * 3).projections[0].pos).toBe(sim.events.length);
  });

  it('a new projection replays history one event per tick from the start, then stops rebuilding; it is added once', () => {
    const sim = addBigProjection(initialSim());
    expect(hasBigProjection(sim)).toBe(true);
    expect(addBigProjection(sim)).toBe(sim);
    const n = sim.events.length;
    for (let k = 1; k <= n; k++) {
      const big = ticks(sim, k).projections[2];
      expect(big.pos, `tick ${k}`).toBe(k);
      expect(big.rebuilding, `tick ${k}`).toBe(true);
    }
    const done = ticks(sim, n + 1).projections[2];
    expect(done.rebuilding).toBe(false);
    expect(done.pos).toBe(n);
  });

  it('a projection that is still replaying keeps going when new events arrive, and ends level with the log', () => {
    let sim = addBigProjection(initialSim());
    sim = ticks(sim, 3);
    const r = runCommand(sim, 'Withdrew', 150);
    if (!r.ok) throw new Error('withdrawal rejected');
    sim = ticks(r.sim, 40);
    const big = sim.projections[2];
    expect(big.pos).toBe(sim.events.length);
    expect(big.rebuilding).toBe(false);
    expect(bigWithdrawals(sim.events, big.pos).map((e) => e.amount)).toEqual([120, 450, 150]);
  });
});

describe('captions', () => {
  it('have no glued sentences and use the numbers of the run', () => {
    expectCaption(introCaption());
    expectCaption(newProjectionCaption());
    expect(captionText(rejectedCaption(WITHDRAW_TOO_MUCH, 210), { strict: true })).toContain('withdraw €5,000 with only €210');
    const r = runCommand(initialSim(), 'Deposited', DEPOSIT);
    if (!r.ok) throw new Error('deposit rejected');
    expect(captionText(appendedCaption(r.event), { strict: true })).toContain('Deposited €100 appended as event #8');
    expect(captionText(scrubCaption(SEED, 3, fold(SEED, 3).balance), { strict: true })).toContain('state as of event #3 (Jan 19) = balance €380');
    expect(captionText(scrubCaption(SEED, SEED.length, 210), { strict: true })).toContain('7 events, balance €210');
    expect(captionText(resetCaption(SEED.length), { strict: true })).toContain('original 7 events');
    expect(money(-5)).toBe('−€5');
    expect(money(1234)).toBe('€1,234');
  });
});

describe('try-this, from the default state (the seven seed events, projections level)', () => {
  it('try-this 1: Deposit shows both read models "1 behind" before they catch up', () => {
    const r = runCommand(initialSim(), 'Deposited', DEPOSIT);
    if (!r.ok) throw new Error('deposit rejected');
    expect(r.sim.projections.map((p) => r.sim.events.length - p.pos)).toEqual([1, 1]);
    let sim = r.sim;
    for (let i = 0; i < 12; i++) sim = tick(sim);
    expect(lagOf(sim)).toBe(0);
  });

  it('try-this 2: the time-travel slider at event #3 shows €380, recomputed from the log', () => {
    expect(fold(SEED, 3).balance).toBe(380);
    expect(captionText(scrubCaption(SEED, 3, fold(SEED, 3).balance))).toContain('€380');
    expect(lesson.tryThis[1]).toContain('#3');
  });

  it('try-this 3: Withdraw €5,000 is rejected with no event written (the default balance is €210)', () => {
    const sim = initialSim();
    const r = runCommand(sim, 'Withdrew', WITHDRAW_TOO_MUCH);
    expect(r.ok).toBe(false);
    expect(r.sim.events).toHaveLength(SEED.length);
    expect(runCommand(sim, 'Withdrew', WITHDRAW).ok).toBe(true);
  });

  it('try-this 4: + New projection starts empty, replays the whole log, and ends holding the big withdrawals', () => {
    let sim = addBigProjection(initialSim());
    expect(sim.projections[2].pos).toBe(0);
    for (let i = 0; i < SEED.length + 1; i++) sim = tick(sim);
    const big = sim.projections[2];
    expect([big.pos, big.rebuilding]).toEqual([SEED.length, false]);
    expect(bigWithdrawals(sim.events, big.pos).map((e) => e.seq)).toEqual([3, 6]);
  });
});
