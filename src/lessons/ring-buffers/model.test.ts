import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  MAX_SLOTS, MIN_SLOTS, NEAR_WRAP, capacity, createRing, dequeue, enqueue, headSlot, isEmpty, isFull, refusal, reservedSlot, size, tailSlot,
  type Policy, type Ring, type Strategy,
} from './model';

const STRATEGIES: Strategy[] = ['sentinel', 'count', 'masked'];
const POLICIES: Policy[] = ['block', 'drop', 'overwrite'];
const POW2 = [4, 8, 16];
const sizesFor = (s: Strategy) => (s === 'masked' ? POW2 : Array.from({ length: MAX_SLOTS - MIN_SLOTS + 1 }, (_, i) => MIN_SLOTS + i));

/** Independent reference: a plain array as a FIFO bounded at `cap`, with the overflow policy spelled out. */
class RefQueue {
  items: number[] = [];
  dropped = 0;
  overwritten = 0;
  blocked = 0;
  readonly cap: number;
  readonly policy: Policy;
  constructor(cap: number, policy: Policy) {
    this.cap = cap;
    this.policy = policy;
  }
  push(v: number) {
    if (this.items.length < this.cap) this.items.push(v);
    else if (this.policy === 'block') this.blocked++;
    else if (this.policy === 'drop') this.dropped++;
    else {
      this.items.shift();
      this.overwritten++;
      this.items.push(v);
    }
  }
  pop(): number | null {
    return this.items.length ? this.items.shift()! : null;
  }
}

const same = (x: readonly unknown[], y: readonly unknown[]) => x.length === y.length && x.every((v, i) => v === y[i]);

/** Run a seeded mix of operations on both; returns the first disagreement, or null. Plain checks: it runs ~400k times. */
function compare(r0: Ring, policy: Policy, seed: number, ops = 400): string | null {
  const rnd = mulberry32(seed);
  const ref = new RefQueue(capacity(r0), policy);
  let r = r0;
  let next = 1;
  const bias = 0.3 + rnd() * 0.4; // some runs fill up, some drain
  for (let k = 0; k < ops; k++) {
    const where = `${r0.strategy}/${policy}/n=${r0.n}/seed ${seed}/op ${k}`;
    if (rnd() < bias) {
      const v = next++;
      const { ring, event } = enqueue(r, v, policy);
      ref.push(v);
      r = ring;
      const want = { blocked: 'block', dropped: 'drop', overwrote: 'overwrite' }[event.kind as string];
      if (want && want !== policy) return `${where}: ${event.kind} under ${policy}`;
    } else {
      const { ring, event } = dequeue(r);
      r = ring;
      const want = ref.pop();
      if ((event.kind === 'dequeued' ? event.value : null) !== want) return `${where}: dequeued the wrong item`;
    }
    if (size(r) !== ref.items.length) return `${where}: size`;
    if (isEmpty(r) !== (ref.items.length === 0)) return `${where}: empty`;
    if (isFull(r) !== (ref.items.length === capacity(r))) return `${where}: full`;
    // The live items, read from head, are exactly the reference queue.
    const live = Array.from({ length: size(r) }, (_, i) => r.slots[(headSlot(r) + i) % r.n]);
    if (!same(live, ref.items)) return `${where}: contents`;
    if (r.slots.filter((x) => x !== null).length !== ref.items.length) return `${where}: stray items`;
  }
  return null;
}

describe('every strategy × policy × size matches a reference bounded FIFO', () => {
  for (const strategy of STRATEGIES)
    for (const policy of POLICIES)
      it(`${strategy} / ${policy}`, () => {
        for (const n of sizesFor(strategy)) for (let seed = 0; seed < 8; seed++) expect(compare(createRing(strategy, n), policy, seed * 31 + n)).toBeNull();
      });
});

describe('capacity', () => {
  it('is N − 1 when one slot is kept empty and N for the other two', () => {
    for (const s of STRATEGIES)
      for (const n of sizesFor(s)) {
        let r = createRing(s, n);
        let accepted = 0;
        for (let v = 0; v < n + 3; v++) {
          const e = enqueue(r, v, 'block');
          if (e.event.kind === 'enqueued') accepted++;
          r = e.ring;
        }
        expect(accepted).toBe(s === 'sentinel' ? n - 1 : n);
        expect(capacity(r)).toBe(accepted);
      }
  });

  it('head == tail is ambiguous for raw indexes: empty and full look the same without a count', () => {
    let r = createRing('count', 8);
    expect(headSlot(r)).toBe(tailSlot(r));
    for (let v = 0; v < 8; v++) r = enqueue(r, v, 'block').ring;
    expect(headSlot(r)).toBe(tailSlot(r));
    expect(isFull(r) && !isEmpty(r)).toBe(true);
  });

  it('the slot behind head is never filled with one slot kept empty', () => {
    for (const n of sizesFor('sentinel'))
      for (const policy of POLICIES) {
        const rnd = mulberry32(n);
        let r = createRing('sentinel', n);
        for (let k = 0; k < 300; k++) {
          r = rnd() < 0.6 ? enqueue(r, k, policy).ring : dequeue(r).ring;
          expect(r.slots[reservedSlot(r)!]).toBeNull();
        }
      }
  });
});

describe('masked counters', () => {
  it('& (N − 1) picks the same slot as % N for every power of two, across the 2³² wrap', () => {
    for (const n of [1, 2, 4, 8, 16, 1024])
      for (const c of [0, 1, 5, 2 ** 31, NEAR_WRAP, 2 ** 32 - 1, 123456789]) expect(c & (n - 1)).toBe((c >>> 0) % n);
  });

  it('survive wrapping past 2³²: started 3 below, they still match the reference', () => {
    for (const policy of POLICIES)
      for (const n of POW2) {
        const r0 = createRing('masked', n, NEAR_WRAP);
        expect(r0.head).toBe(2 ** 32 - 3);
        expect(compare(r0, policy, n, 200)).toBeNull();
      }
    // And the counters really did wrap to small numbers.
    let r = createRing('masked', 4, NEAR_WRAP);
    for (let v = 0; v < 5; v++) r = dequeue(enqueue(r, v, 'block').ring).ring;
    expect(r.tail).toBe(2);
    expect(r.head).toBe(2);
  });

  it('refuses a size that is not a power of two, with a reason', () => {
    for (let n = MIN_SLOTS; n <= MAX_SLOTS; n++) {
      const why = refusal('masked', n);
      expect(why === null).toBe([4, 8, 16].includes(n));
      if (why) {
        expect(why).toContain('power of two');
        expect(() => createRing('masked', n)).toThrow(RangeError);
      }
    }
    expect(refusal('sentinel', 12)).toBeNull();
    expect(refusal('count', 3)).not.toBeNull();
  });
});

describe('overflow policies', () => {
  it('count what they lose: drop counts new items, overwrite counts old ones, block loses nothing', () => {
    for (const policy of POLICIES) {
      let r = createRing('count', 4);
      const events = [];
      for (let v = 1; v <= 6; v++) {
        const e = enqueue(r, v, policy);
        r = e.ring;
        events.push(e.event.kind);
      }
      const drained: number[] = [];
      while (!isEmpty(r)) {
        const d = dequeue(r);
        r = d.ring;
        if (d.event.kind === 'dequeued') drained.push(d.event.value);
      }
      if (policy === 'overwrite') expect(drained).toEqual([3, 4, 5, 6]);
      else expect(drained).toEqual([1, 2, 3, 4]);
      expect(events.slice(4)).toEqual(policy === 'block' ? ['blocked', 'blocked'] : policy === 'drop' ? ['dropped', 'dropped'] : ['overwrote', 'overwrote']);
    }
  });
});

describe('try-this: start the masked counters near 2³² and enqueue a few', () => {
  it('tail wraps round to 0 while head is still near 2³², the size stays right, and dequeuing wraps head too', () => {
    let r = createRing('masked', 8, NEAR_WRAP);
    for (let v = 1; v <= 4; v++) r = enqueue(r, v, 'block').ring;
    expect(r.tail).toBe(1);
    expect(r.head).toBe(NEAR_WRAP);
    expect(size(r)).toBe(4);
    const out: number[] = [];
    for (let k = 0; k < 4; k++) {
      const d = dequeue(r);
      r = d.ring;
      if (d.event.kind === 'dequeued') out.push(d.event.value);
    }
    expect(out).toEqual([1, 2, 3, 4]);
    expect(r.head).toBe(1);
    expect(isEmpty(r)).toBe(true);
  });
});
