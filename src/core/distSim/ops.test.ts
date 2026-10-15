import { describe, expect, it } from 'vitest';
import { linearizable } from './invariants';
import { historyOf, latencyOf, settleOp, type OpRecord } from './ops';

const rec = (over: Partial<OpRecord<number>> & Pick<OpRecord<number>, 'kind' | 'invoke'>): OpRecord<number> => ({
  op: 0, client: 'C1', node: 'N1', response: null, outcome: 'open', value: null, ...over,
});

describe('settleOp and latencyOf', () => {
  it('closes a request with its answer time, outcome and (for a read) the value it returned', () => {
    const read = rec({ kind: 'read', invoke: 10 });
    expect(latencyOf(read)).toBeNull();
    settleOp(read, 35, 'ok', 7);
    expect(read).toMatchObject({ response: 35, outcome: 'ok', value: 7 });
    expect(latencyOf(read)).toBe(25);
  });

  it('keeps a write\'s own value when none is given', () => {
    const write = rec({ kind: 'write', invoke: 0, value: 4 });
    settleOp(write, 120, 'refused');
    expect(write).toMatchObject({ outcome: 'refused', value: 4 });
  });
});

describe('historyOf', () => {
  it('keeps the times, client and key of an answered request', () => {
    const history = historyOf([rec({ kind: 'write', invoke: 1, response: 9, outcome: 'ok', value: 5, key: 'x', client: 'C2' })]);
    expect(history).toEqual([{ process: 'C2', kind: 'write', value: 5, invoke: 1, response: 9, key: 'x' }]);
  });

  it('keeps a refused or open write as one that never answered (it may have taken effect) and drops a refused or open read', () => {
    const history = historyOf([
      rec({ kind: 'write', invoke: 0, outcome: 'refused', response: 120, value: 2 }),
      rec({ kind: 'write', invoke: 5, outcome: 'open', value: 3 }),
      rec({ kind: 'read', invoke: 6, outcome: 'refused', response: 126 }),
      rec({ kind: 'read', invoke: 7, outcome: 'open' }),
    ]);
    expect(history.map((o) => [o.kind, o.value, o.response])).toEqual([['write', 2, Infinity], ['write', 3, Infinity]]);
  });

  it('feeds the register checkers: an ok history passes, a stale read after an acknowledged write is caught', () => {
    const fresh = [
      rec({ kind: 'write', invoke: 0, response: 10, outcome: 'ok', value: 2 }),
      rec({ kind: 'read', invoke: 20, response: 25, outcome: 'ok', value: 2, client: 'C2' }),
    ];
    expect(linearizable(historyOf(fresh), { initial: 1 })).toBeNull();
    const stale = [fresh[0], { ...fresh[1], value: 1 }];
    expect(linearizable(historyOf(stale), { initial: 1 })).not.toBeNull();
  });

  it('an unanswered write may explain a later read, so the history stays linearizable', () => {
    const ops = [
      rec({ kind: 'write', invoke: 0, outcome: 'refused', response: 120, value: 2 }),
      rec({ kind: 'read', invoke: 200, response: 205, outcome: 'ok', value: 2, client: 'C2' }),
    ];
    expect(linearizable(historyOf(ops), { initial: 1 })).toBeNull();
  });
});
