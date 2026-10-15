import { describe, expect, it } from 'vitest';
import { addItem, createLaneModel, moveItem, resizeItem } from '../../core/laneEditor';
import {
  CLIENTS, INITIAL_VALUE, LIMITS, MAX_OPS, NO_QUIET, PRESETS, SLOTS, VALUE_MAX, convergedVerdict, explainViolation, freshReadValue, nextWriteValue, opsOf, orderVerdict,
  presetById, profileOf, setValue, smallestViolation, strongestHolding, verdictsOf, witnessOrder, type OpData, type OpModel, type Profile,
} from './model';
import { oracleProfile } from './oracle';
import { chainStates } from './view';

const profile = (id: string): Profile => {
  const p = presetById(id);
  return profileOf(opsOf(p.model()), { values: p.quiet });
};

describe('the presets each pin a distinct verdict profile', () => {
  const expected: Record<string, Profile> = {
    'stale-read': { linearizable: false, sequential: true, causal: true, converged: true },
    'own-write': { linearizable: false, sequential: false, causal: false, converged: true },
    'two-orders': { linearizable: false, sequential: false, causal: true, converged: false },
    'causality-broken': { linearizable: false, sequential: false, causal: false, converged: true },
    'all-good': { linearizable: true, sequential: true, causal: true, converged: true },
  };
  for (const [id, want] of Object.entries(expected)) {
    it(`${id}: ${JSON.stringify(want)}`, () => expect(profile(id)).toEqual(want));
  }

  it('agree with the brute-force oracle, not only with the checkers', () => {
    for (const p of PRESETS) {
      const o = oracleProfile(opsOf(p.model()));
      const got = profile(p.id);
      expect([o.linearizable, o.sequential, o.causal], p.id).toEqual([got.linearizable, got.sequential, got.causal]);
    }
  });

  it('every implication of the chain has a preset where the converse fails, and converged is independent of order', () => {
    const profiles = PRESETS.map((p) => profile(p.id));
    expect(profiles.some((p) => p.sequential && !p.linearizable)).toBe(true);
    expect(profiles.some((p) => p.causal && !p.sequential)).toBe(true);
    expect(profiles.some((p) => p.causal && p.converged === false)).toBe(true);
    expect(profiles.some((p) => !p.causal && p.converged === true)).toBe(true);
  });

  it('the stale-read preset is exactly the minimal pair W(x=1) and R(x)→0, found by deleting operations', () => {
    const ops = opsOf(presetById('stale-read').model());
    const subset = smallestViolation('linearizable', ops)!;
    expect(subset.map((o) => `${o.client}:${o.kind}:${o.value}`)).toEqual(['C1:write:1', 'C2:read:0']);
    expect(explainViolation('linearizable', subset)).toBe(
      "C2's R(x)→0 began after C1's W(x=1) was acknowledged, yet returned the older value 0: a read that starts after a write finished has to see it.",
    );
  });

  it('read-your-own-write names the rule', () => {
    const ops = opsOf(presetById('own-write').model());
    const subset = smallestViolation('sequential', ops)!;
    expect(subset.map((o) => `${o.client}:${o.kind}:${o.value}`)).toEqual(['C1:write:1', 'C1:read:0']);
    expect(explainViolation('sequential', subset)).toBe('C1 wrote 1 and then read 0: a client has to see its own earlier write.');
  });

  it('presets fit the editor: at most MAX_OPS bars, inside the slots, one write per value', () => {
    for (const p of PRESETS) {
      const m = p.model();
      expect(m.items.length).toBeLessThanOrEqual(MAX_OPS);
      expect(m.items.every((i) => i.start >= 0 && i.end < SLOTS && i.end - i.start >= 1)).toBe(true);
      const writes = m.items.filter((i) => i.data.kind === 'write').map((i) => i.data.value);
      expect(new Set(writes).size).toBe(writes.length);
    }
  });
});

describe('the verdicts', () => {
  it('a read of a value no write wrote is allowed and every order model rejects it, with the reason', () => {
    const m = presetById('all-good').model();
    const stray = { ...m, items: m.items.map((i, k) => (k === 1 ? { ...i, data: { kind: 'read' as const, value: 7 } } : i)) };
    const ops = opsOf(stray);
    for (const name of ['linearizable', 'sequential', 'causal'] as const) {
      const v = orderVerdict(name, ops);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.message).toBe("C2's R(x)→7 returned 7, which no write wrote and is not the starting value 0.");
    }
    expect(smallestViolation('causal', ops)!.length).toBe(1);
  });

  it('converged is not decided until every client has a quiet read, and rejects a quiet read of a value no one wrote', () => {
    const ops = opsOf(presetById('all-good').model());
    expect(convergedVerdict(ops, { values: [1, NO_QUIET, 1] }).state).toBe('na');
    expect(convergedVerdict(ops, { values: [1, 1, 1] }).state).toBe('ok');
    expect(convergedVerdict(ops, { values: [1, 0, 1] }).state).toBe('bad');
    expect(convergedVerdict(ops, { values: [1, 9, 1] })).toEqual({ state: 'bad', message: "C2's quiet read returned 9, which no write wrote." });
  });

  it('agreeing on the starting value after an acknowledged write is not convergence on it: every write was lost', () => {
    const ops = opsOf(presetById('stale-read').model());
    expect(ops.some((o) => o.kind === 'write')).toBe(true);
    const lost = convergedVerdict(ops, { values: [0, 0, 0] });
    expect(lost.state).toBe('bad');
    expect(lost.message).toContain('every write was lost');
    expect(convergedVerdict(ops, { values: [1, 1, 1] }).state).toBe('ok');
    expect(convergedVerdict([], { values: [0, 0, 0] }).state).toBe('ok');
  });

  it('the strongest model that holds and the chain colours follow from the verdicts', () => {
    for (const p of PRESETS) {
      const v = verdictsOf(opsOf(p.model()), { values: p.quiet });
      const strongest = strongestHolding(v);
      const states = chainStates(strongest);
      for (const m of ['linearizable', 'sequential', 'causal'] as const) {
        expect(states[m] === 'fails', `${p.id} ${m}`).toBe(!v[m].ok);
      }
      expect(Object.values(states).filter((s) => s === 'strongest').length).toBe(strongest ? 1 : 0);
    }
  });

  it('an empty history satisfies every order model', () => {
    const v = verdictsOf([], { values: [0, 0, 0] });
    expect([v.linearizable.ok, v.sequential.ok, v.causal.ok, v.converged.state]).toEqual([true, true, true, 'ok']);
  });
});

describe('witness orders', () => {
  it('the all-good preset has a linearizable order that starts with the write and keeps the reads after it', () => {
    const order = witnessOrder('linearizable', opsOf(presetById('all-good').model()))!;
    expect(order.map((o) => `${o.kind}:${o.value}`)).toEqual(['write:1', 'read:1', 'read:1']);
  });
  it('a failing model has none', () => {
    expect(witnessOrder('linearizable', opsOf(presetById('stale-read').model()))).toBeNull();
    expect(witnessOrder('sequential', opsOf(presetById('stale-read').model()))!.map((o) => `${o.kind}:${o.value}`)).toEqual(['read:0', 'write:1', 'read:1']);
  });
  it('causal gives each client its own order: in the two-orders preset C1 and C2 see the writes in opposite orders', () => {
    const ops = opsOf(presetById('two-orders').model());
    const writes = (client: string) => witnessOrder('causal', ops, client)!.filter((o) => o.kind === 'write').map((o) => o.value);
    expect(writes('C1')).toEqual([1, 2]);
    expect(writes('C2')).toEqual([2, 1]);
  });
});

describe('editing rules the editor does not know', () => {
  const base = (): OpModel => presetById('stale-read').model();
  const idOf = (m: OpModel, kind: 'write' | 'read', value: number) => m.items.find((i) => i.data.kind === kind && i.data.value === value)!.id;

  it('a new write takes the first unused value; a new read returns the freshest value at its start (0 before any write)', () => {
    expect(nextWriteValue(base())).toBe(2);
    expect(nextWriteValue(createLaneModel<OpData>(LIMITS))).toBe(1);
    expect(freshReadValue(base(), 0)).toBe(INITIAL_VALUE);
    expect(freshReadValue(base(), 4)).toBe(1);
    expect(freshReadValue(base(), 3)).toBe(INITIAL_VALUE);
  });

  it('a repeated write value is refused with the reason, 0 cannot be written, and a value past the range is refused', () => {
    const m = base();
    const w2 = addItem(m, 1, 12, { kind: 'write', value: 2 });
    expect(w2.ok).toBe(true);
    const withTwo = (w2 as { ok: true; model: OpModel }).model;
    const clash = setValue(withTwo, (w2 as { ok: true; id?: string }).id!, 1);
    expect(clash).toEqual({ ok: false, reason: 'Another write already uses the value 1. Every write needs its own value, or a read could not say which write it saw.' });
    expect(setValue(m, idOf(m, 'write', 1), 0).ok).toBe(false);
    expect(setValue(m, idOf(m, 'write', 1), VALUE_MAX + 1).ok).toBe(false);
    expect(setValue(m, idOf(m, 'read', 0), 7).ok).toBe(true);
  });

  it('the editor refuses a bar that ends before it starts, two bars on one client that overlap, one past the axis, and an eleventh bar', () => {
    const m = base();
    expect(resizeItem(m, idOf(m, 'write', 1), 'end', -2)).toMatchObject({ ok: false });
    expect(addItem(m, 0, 2, { kind: 'read', value: 0 }, 1)).toEqual({ ok: false, reason: 'that place on the lane is taken' });
    expect(addItem(m, 1, SLOTS - 1, { kind: 'read', value: 0 }, 1)).toMatchObject({ ok: false });
    let full = createLaneModel<OpData>(LIMITS);
    for (let i = 0; i < MAX_OPS; i++) {
      const edit = addItem<OpData>(full, i % CLIENTS.length, Math.floor(i / CLIENTS.length) * 4, { kind: 'read', value: 0 }, 1);
      expect(edit.ok).toBe(true);
      if (edit.ok) full = edit.model;
    }
    expect(addItem(full, 0, 17, { kind: 'read', value: 0 }, 1)).toEqual({ ok: false, reason: `at most ${MAX_OPS} items fit` });
  });

  it('moving the stale read two slots earlier makes it overlap the write (they share slot 3)', () => {
    const m = base();
    const read = idOf(m, 'read', 0);
    const once = moveItem(m, read, 0, -1);
    expect(once.ok).toBe(true);
    const twice = moveItem((once as { ok: true; model: OpModel }).model, read, 0, -1);
    expect(twice.ok).toBe(true);
    const ops = opsOf((twice as { ok: true; model: OpModel }).model);
    expect(orderVerdict('linearizable', ops).ok).toBe(true);
    expect(orderVerdict('linearizable', opsOf((once as { ok: true; model: OpModel }).model)).ok).toBe(false);
  });
});
