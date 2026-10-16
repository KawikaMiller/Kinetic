import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { apply, check, CHAIN_SCRIPT, CYCLE_SCRIPT, emptyHeap, leaked, nextTarget, OBJECT_COUNT, reachable, recountedRc, replay, SLOTS, updateCost, WEAK_BACK_SCRIPT, type Heap, type Op, type Slot } from './heap';
import { buildOp, usesFirst, usesSecond, usesWeak } from './tray';

/** A seeded random operation, valid or not: invalid ones are refused and skipped by the caller. */
function randomOp(rnd: () => number): Op {
  const slot = (): Slot => SLOTS[Math.floor(rnd() * 3)];
  const k = Math.floor(rnd() * 11);
  if (k < 2) return { kind: 'new', slot: slot() };
  if (k < 4) return { kind: 'copy', to: slot(), from: slot() };
  if (k < 6) return { kind: 'setNext', slot: slot(), target: slot(), weak: rnd() < 0.3 };
  if (k < 8) return { kind: 'null', slot: slot() };
  if (k < 10) return { kind: 'clearNext', slot: slot() };
  return { kind: 'collect' };
}

/** Run a random valid operation sequence under both modes, returning every state. */
function randomRun(seed: number, steps: number) {
  const rnd = mulberry32(seed);
  const log: Op[] = [];
  let h = emptyHeap();
  for (let i = 0; i < steps; i++) {
    const op = randomOp(rnd);
    const next = apply(h, op, 'counting');
    if (next.refused) continue;
    log.push(op);
    h = next.heap;
  }
  return log;
}

describe('reference counting', () => {
  it('after every op of 500 seeded sequences each count equals the incoming references recomputed from the slots and fields, and nothing live points at a freed object', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const log = randomRun(seed, 40);
      const heaps = replay(log, 'counting').heaps;
      heaps.forEach((h, k) => {
        const expected = recountedRc(h);
        h.objs.forEach((o, i) => {
          if (o.live) expect(o.rc, `seed ${seed} op ${k} obj ${i}`).toBe(expected[i]);
          else expect(o.rc, `seed ${seed} op ${k} freed obj ${i}`).toBe(0);
          if (o.live && o.next !== null && !o.weak) expect(h.objs[o.next].live, `seed ${seed} op ${k}: dangling strong next from ${i}`).toBe(true);
        });
        h.slots.forEach((s) => s !== null && expect(h.objs[s].live).toBe(true));
      });
    }
  });

  it('a weak reference to a freed object reads as null, and never as a dangling arrow', () => {
    const run = replay(WEAK_BACK_SCRIPT, 'counting');
    // after op 4 the back edge b -> a is weak; once a is freed (op 5) it reads null
    expect(nextTarget(run.heaps[4], 1)).toBe(0);
    expect(nextTarget(run.heaps[5], 1)).toBeNull();
  });

  it('hand-worked: the cycle leaks both objects with count 1; a weak back edge frees them at ops 5 and 6; the chain frees together at op 8', () => {
    const cycle = replay(CYCLE_SCRIPT, 'counting');
    const end = cycle.heaps[cycle.heaps.length - 1];
    expect([end.objs[0].rc, end.objs[1].rc]).toEqual([1, 1]);
    expect(cycle.fates.slice(0, 2)).toEqual([{ kind: 'leaked' }, { kind: 'leaked' }]);
    const weak = replay(WEAK_BACK_SCRIPT, 'counting');
    expect(weak.fates.slice(0, 2)).toEqual([{ kind: 'freed', at: 5 }, { kind: 'freed', at: 6 }]);
    const chain = replay(CHAIN_SCRIPT, 'counting');
    expect(chain.fates.slice(0, 3)).toEqual([{ kind: 'freed', at: 8 }, { kind: 'freed', at: 8 }, { kind: 'freed', at: 8 }]);
  });

  it('hand-worked: the cycle script makes 6 count updates, costing 6 plain and 18 atomic', () => {
    const run = replay(CYCLE_SCRIPT, 'counting');
    const updates = run.heaps[run.heaps.length - 1].updates;
    expect(updates).toBe(6);
    expect([updateCost(updates, false), updateCost(updates, true)]).toEqual([6, 18]);
  });
});

describe('leaks and tracing', () => {
  const unreachableMinusFreed = (h: Heap) => h.objs.flatMap((o, i) => (o.allocated && o.live && !reachable(h).has(i) ? [i] : []));

  it('the leaked set is unreachable minus freed, found by a separate graph search: non-empty on the cycle, empty once the back edge is weak', () => {
    const cycleEnd = replay(CYCLE_SCRIPT, 'counting').heaps.at(-1) as Heap;
    expect(leaked(cycleEnd)).toEqual([0, 1]);
    expect(unreachableMinusFreed(cycleEnd)).toEqual([0, 1]);
    const weakEnd = replay(WEAK_BACK_SCRIPT, 'counting').heaps.at(-1) as Heap;
    expect(leaked(weakEnd)).toEqual([]);
  });

  it('after a collect the tracing run has freed exactly the unreachable set, cycle included, and counting is unchanged', () => {
    const tracing = replay([...CYCLE_SCRIPT, { kind: 'collect' }], 'tracing');
    expect(tracing.fates.slice(0, 2)).toEqual([{ kind: 'freed', at: 7 }, { kind: 'freed', at: 7 }]);
    expect(replay([...CYCLE_SCRIPT, { kind: 'collect' }], 'counting').fates.slice(0, 2)).toEqual([{ kind: 'leaked' }, { kind: 'leaked' }]);
  });

  it('on 500 seeded logs a collect frees exactly the objects unreachable just before it', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const log = [...randomRun(seed, 30), { kind: 'collect' } as Op];
      const heaps = replay(log, 'tracing').heaps;
      const before = heaps[heaps.length - 2];
      const after = heaps[heaps.length - 1];
      const reach = reachable(before);
      before.objs.forEach((o, i) => expect(after.objs[i].live, `seed ${seed} obj ${i}`).toBe(o.live && reach.has(i)));
    }
  });
});

describe('the tray', () => {
  it('actions that do nothing are refused with a sentence and leave the heap unchanged', () => {
    const h = emptyHeap();
    for (const op of [{ kind: 'null', slot: 'a' }, { kind: 'copy', to: 'b', from: 'a' }, { kind: 'setNext', slot: 'a', target: 'b', weak: false }, { kind: 'clearNext', slot: 'a' }] as Op[]) {
      const r = apply(h, op, 'counting');
      expect(r.refused, JSON.stringify(op)).toEqual(expect.any(String));
      expect(r.heap).toBe(h);
    }
  });

  it('a seventh allocation is refused', () => {
    let h = emptyHeap();
    for (let i = 0; i < OBJECT_COUNT; i++) h = apply(h, { kind: 'new', slot: 'a' }, 'tracing').heap;
    expect(check(h, { kind: 'new', slot: 'b' })).toContain('in use');
  });

  it('hidden pickers do not change the operation: the second slot and the weak flag are ignored by operations that do not read them', () => {
    for (const kind of ['new', 'null', 'clearNext', 'collect'] as const) {
      expect(usesSecond(kind)).toBe(false);
      expect(buildOp({ kind, first: 'a', second: 'b', weak: false })).toEqual(buildOp({ kind, first: 'a', second: 'c', weak: true }));
    }
    expect(usesFirst('collect')).toBe(false);
    expect(usesWeak('copy')).toBe(false);
    expect(buildOp({ kind: 'copy', first: 'a', second: 'b', weak: false })).toEqual(buildOp({ kind: 'copy', first: 'a', second: 'b', weak: true }));
  });
});
