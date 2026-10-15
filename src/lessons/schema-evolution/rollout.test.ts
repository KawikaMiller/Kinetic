import { describe, expect, it } from 'vitest';
import { ruleProblems } from './avro';
import { CHANGES, CONSUMERS, ORDERS, PRODUCERS, changeById, directionHolds, neededOrder, pairsMet, rollout, totalFailures, totalMessages, type ChangeId, type OrderId } from './rollout';

const total = (c: ChangeId, o: OrderId) => totalFailures(rollout(c, o));

describe('the rollout, worked by hand', () => {
  /**
   * Failures summed over every state, counting one message from each producer to each consumer in
   * each state. Worked from the states, not from the code: for example, "add tag, no default" with
   * consumers first loses 3 + 6 + 9 messages while the consumers upgrade (every new consumer meets
   * three old producers) and 6 + 3 + 0 while the producers catch up.
   */
  const BY_HAND: Record<ChangeId, Record<OrderId, number>> = {
    'add-default': { 'consumers-first': 0, 'producers-first': 0, interleaved: 0 },
    'add-required': { 'consumers-first': 27, 'producers-first': 0, interleaved: 5 },
    remove: { 'consumers-first': 0, 'producers-first': 27, interleaved: 14 },
    rename: { 'consumers-first': 27, 'producers-first': 27, interleaved: 19 },
    'rename-safely': { 'consumers-first': 0, 'producers-first': 0, interleaved: 0 },
  };

  for (const change of CHANGES) {
    for (const order of ORDERS) {
      it(`${change.id}, ${order.id}: ${BY_HAND[change.id][order.id]} failed messages`, () => {
        expect(total(change.id, order.id)).toBe(BY_HAND[change.id][order.id]);
      });
    }
  }

  it('a rollout has one start state and six upgrades per hop, and nine messages in each state', () => {
    for (const c of CHANGES) {
      const states = rollout(c.id, 'interleaved');
      expect(states).toHaveLength(1 + 6 * (c.chain.length - 1));
      expect(states.every((s) => s.messages.length === 9)).toBe(true);
      expect(totalMessages(states)).toBe(9 * states.length);
      expect(states[0].failures).toBe(0);
    }
  });

  it('each upgrade moves exactly one service one version on, in the order chosen', () => {
    const states = rollout('add-required', 'consumers-first');
    expect(states.slice(1).map((s) => s.upgraded)).toEqual(['C1', 'C2', 'C3', 'P1', 'P2', 'P3']);
    for (let i = 1; i < states.length; i++) {
      const moved = [...PRODUCERS, ...CONSUMERS].filter((id) => states[i].versions[id] !== states[i - 1].versions[id]);
      expect(moved).toEqual([states[i].upgraded]);
    }
    expect(states.at(-1)?.versions).toEqual({ P1: 1, P2: 1, P3: 1, C1: 1, C2: 1, C3: 1 });
  });
});

describe('the invariant over every change and every order', () => {
  it('failures are zero exactly when every pair the order creates is compatible by the rules', () => {
    for (const change of CHANGES) {
      for (const order of ORDERS) {
        const states = rollout(change.id, order.id);
        const chain = changeById(change.id).chain;
        const ruleFailures = pairsMet(states).filter((p) => ruleProblems(chain[p.reader], chain[p.writer]).length > 0).length;
        expect(totalFailures(states), `${change.id} ${order.id}`).toBe(ruleFailures);
        expect(totalFailures(states) === 0, `${change.id} ${order.id}`).toBe(ruleFailures === 0);
      }
    }
  });

  it('zero failures exactly when the change satisfies the direction the order needs', () => {
    for (const change of CHANGES) {
      const backward = directionHolds(change.id, 'backward');
      const forward = directionHolds(change.id, 'forward');
      expect(total(change.id, 'consumers-first') === 0, `${change.id} consumers first needs backward`).toBe(backward);
      expect(total(change.id, 'producers-first') === 0, `${change.id} producers first needs forward`).toBe(forward);
      expect(total(change.id, 'interleaved') === 0, `${change.id} one of each needs both`).toBe(backward && forward);
    }
  });

  it('backward-compatible changes want consumers first, forward-compatible ones want producers first, neither wants a two-step rollout', () => {
    expect(neededOrder('add-default')).toBe('any');
    expect(neededOrder('remove')).toBe('consumers-first');
    expect(neededOrder('add-required')).toBe('producers-first');
    expect(neededOrder('rename')).toBe('two-step');
    expect(neededOrder('rename-safely')).toBe('any');
  });

  it('the safe rename is three schemas, and each hop is compatible both ways', () => {
    const chain = changeById('rename-safely').chain;
    expect(chain).toHaveLength(3);
    expect(directionHolds('rename-safely', 'backward')).toBe(true);
    expect(directionHolds('rename-safely', 'forward')).toBe(true);
    expect(directionHolds('rename', 'backward')).toBe(false);
    expect(directionHolds('rename', 'forward')).toBe(false);
  });

  it('a failure carries the decoder\'s own reason, and a clean message carries none', () => {
    const states = rollout('add-required', 'consumers-first');
    const failed = states[1].messages.filter((m) => m.failed);
    expect(failed).toHaveLength(3);
    expect(failed[0].error).toBe('reader field tag has no default and the writer did not write it');
    expect(states[0].messages.every((m) => !m.failed && m.error === undefined)).toBe(true);
  });
});
