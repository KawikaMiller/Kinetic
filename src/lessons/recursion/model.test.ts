import { describe, expect, it } from 'vitest';
import { factorialFrames, fibTree, sumFrames } from './frames';
import { fibCallTree, LIMIT } from './model';

/** Reference: how many calls plain recursive fib(n) makes, and how often each argument is computed. */
function fibReference(n: number) {
  const counts: Record<number, number> = {};
  let calls = 0;
  const fib = (k: number): number => {
    calls++;
    counts[k] = (counts[k] ?? 0) + 1;
    return k <= 1 ? k : fib(k - 1) + fib(k - 2);
  };
  return { value: fib(n), calls, counts };
}

const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1));

describe('factorial and sum call stacks', () => {
  it('factorial(n) returns n!, makes n calls and peaks at n frames, for every n on the slider', () => {
    for (let n = 1; n <= 7; n++) {
      const frames = factorialFrames(n, true);
      const last = frames[frames.length - 1];
      expect(last.result).toBe(factorial(n));
      expect(last.calls).toBe(n);
      expect(last.maxDepth).toBe(n);
      expect(last.crashed).toBe(false);
      expect(frames.every((f) => f.say !== undefined)).toBe(true);
      // the stack only ever holds the chain factorial(n), factorial(n-1), …
      for (const f of frames) f.stack.forEach((s, i) => expect(s.label).toBe(`factorial(${n - i})`));
    }
  });

  it('sum(list) returns the real sum, with one call per item plus the empty list', () => {
    const list = [3, 1, 4, 1, 5, 9];
    for (let len = 0; len <= list.length; len++) {
      const part = list.slice(0, len);
      const last = sumFrames(part, true).at(-1)!;
      expect(last.result).toBe(part.reduce((a, b) => a + b, 0));
      expect(last.calls).toBe(len + 1);
      expect(last.maxDepth).toBe(len + 1);
    }
  });

  it('without a base case it never returns: it overflows at the teaching limit', () => {
    for (const frames of [factorialFrames(4, false), sumFrames([3, 1, 4], false)]) {
      const last = frames[frames.length - 1];
      expect(last.crashed).toBe(true);
      expect(last.result).toBeNull();
      expect(last.stack).toHaveLength(LIMIT);
      expect(last.stack.every((s) => s.tone === 'crash')).toBe(true);
      expect(frames.some((f) => f.ret !== null)).toBe(false); // nothing ever returned
    }
  });

  it('real JavaScript overflows the same way, just much deeper', () => {
    const noBase = (n: number): number => n * noBase(n - 1);
    expect(() => noBase(4)).toThrow(RangeError);
  });
});

describe('the fib call tree', () => {
  it('matches plain recursion: same value, same number of calls, same count per argument', () => {
    for (let n = 2; n <= 12; n++) {
      const ref = fibReference(n);
      const { nodes, events } = fibCallTree(n);
      expect(nodes).toHaveLength(ref.calls);
      const perArg: Record<number, number> = {};
      nodes.forEach((nd) => (perArg[nd.n] = (perArg[nd.n] ?? 0) + 1));
      expect(perArg).toEqual(ref.counts);
      const rootReturn = events.filter((e) => e.t === 'ret').at(-1);
      expect(rootReturn).toEqual({ t: 'ret', id: 0, v: ref.value });
      // every call returns exactly once, after all of its children
      expect(events.filter((e) => e.t === 'call')).toHaveLength(ref.calls);
      expect(events.filter((e) => e.t === 'ret')).toHaveLength(ref.calls);
    }
  });

  it('flags as repeats exactly the calls whose argument (≥ 2) was already computed', () => {
    for (let n = 2; n <= 12; n++) {
      const { nodes } = fibCallTree(n);
      const ref = fibReference(n);
      const repeats = nodes.filter((nd) => nd.repeat).length;
      const expected = Object.entries(ref.counts)
        .filter(([k]) => Number(k) >= 2)
        .reduce((sum, [, c]) => sum + c - 1, 0);
      expect(repeats).toBe(expected);
    }
  });

  it('frames end with the right value and the full call count, for every n on the slider', () => {
    for (let n = 2; n <= 7; n++) {
      const { frames, nodes } = fibTree(n);
      const last = frames[frames.length - 1];
      expect(last.values[0]).toBe(fibReference(n).value);
      expect(last.calls).toBe(nodes.length);
      expect(last.states.every((s) => s === 'done')).toBe(true);
      expect(frames.every((f) => f.say !== undefined)).toBe(true);
    }
  });
});
