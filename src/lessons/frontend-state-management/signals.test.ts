import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { batch, computed, effect, signal } from './signals';

describe('signal and effect', () => {
  it('an effect runs once at creation and again whenever a signal it read changes', () => {
    const a = signal(1);
    const seen: number[] = [];
    const e = effect(() => seen.push(a.get()));
    a.set(2);
    a.set(3);
    expect(seen).toEqual([1, 2, 3]);
    expect(e.runs).toBe(3);
  });

  it('writing the same value is not a change', () => {
    const a = signal(1);
    const e = effect(() => a.get());
    a.set(1);
    expect(e.runs).toBe(1);
  });

  it('an effect only reacts to what it read: a branch it no longer takes stops waking it', () => {
    const useX = signal(true);
    const x = signal('x1');
    const y = signal('y1');
    const seen: string[] = [];
    const e = effect(() => seen.push(useX.get() ? x.get() : y.get()));
    y.set('y2');
    expect(e.runs).toBe(1);
    useX.set(false);
    x.set('x2');
    expect(e.runs).toBe(2);
    y.set('y3');
    expect(seen).toEqual(['x1', 'y2', 'y3']);
  });

  it('a disposed effect stops running', () => {
    const a = signal(0);
    const e = effect(() => a.get());
    e.dispose();
    a.set(1);
    expect(e.runs).toBe(1);
  });
});

describe('computed', () => {
  it('is lazy and cached: it runs when first read, and again only after an input changed', () => {
    const a = signal(2);
    const double = computed(() => a.get() * 2);
    expect(double.runs).toBe(0);
    expect(double.get()).toBe(4);
    expect(double.get()).toBe(4);
    expect(double.runs).toBe(1);
    a.set(5);
    expect(double.runs).toBe(1);
    expect(double.get()).toBe(10);
    expect(double.runs).toBe(2);
  });

  it('recomputes only when one of its own dependencies changes', () => {
    const a = signal(1);
    const b = signal(1);
    const onlyA = computed(() => a.get() + 100);
    expect(onlyA.get()).toBe(101);
    b.set(2);
    expect(onlyA.get()).toBe(101);
    expect(onlyA.runs).toBe(1);
  });

  it('when a computed gets the same value again, the effects below it do not run', () => {
    const n = signal(2);
    const parity = computed(() => n.get() % 2);
    const e = effect(() => parity.get());
    n.set(4);
    n.set(6);
    expect(parity.runs).toBe(3);
    expect(e.runs).toBe(1);
    n.set(7);
    expect(e.runs).toBe(2);
  });

  it('diamond: one write runs each node once and the effect never sees a half-updated mix', () => {
    const a = signal(1);
    const b = computed(() => a.get() + 1);
    const c = computed(() => a.get() * 2);
    const d = computed(() => b.get() + c.get());
    const seen: number[] = [];
    const e = effect(() => seen.push(d.get()));
    const reference = (v: number) => v + 1 + v * 2;
    for (const v of [5, 9, 2]) a.set(v);
    expect(seen).toEqual([1, 5, 9, 2].map(reference));
    expect([b.runs, c.runs, d.runs, e.runs]).toEqual([4, 4, 4, 4]);
  });
});

describe('batch', () => {
  it('several writes inside a batch run the effect once, with the final values', () => {
    const a = signal(1);
    const b = signal(1);
    const seen: number[] = [];
    const e = effect(() => seen.push(a.get() + b.get()));
    batch(() => {
      a.set(10);
      b.set(20);
    });
    expect(seen).toEqual([2, 30]);
    expect(e.runs).toBe(2);
  });
});

describe('against a naive recompute-everything reference', () => {
  it('matches after 300 seeded random writes, and effects run only when something they read changed', () => {
    const rnd = mulberry32(5);
    const s = [signal(0), signal(0), signal(0)];
    const sum = computed(() => s[0].get() + s[1].get());
    const flag = computed(() => (sum.get() > 10 ? 'big' : 'small'));
    const prod = computed(() => (flag.get() === 'big' ? s[2].get() : s[0].get() * 2));
    let last = '';
    const e = effect(() => {
      last = `${flag.get()}:${prod.get()}`;
    });
    const vals = [0, 0, 0];
    const naive = () => {
      const f = vals[0] + vals[1] > 10 ? 'big' : 'small';
      return `${f}:${f === 'big' ? vals[2] : vals[0] * 2}`;
    };
    let expectedRuns = 1;
    let before = naive();
    for (let i = 0; i < 300; i++) {
      const k = Math.floor(rnd() * 3);
      const v = Math.floor(rnd() * 8);
      vals[k] = v;
      s[k].set(v);
      const after = naive();
      if (after !== before) expectedRuns++;
      before = after;
      expect(last, `write ${i}`).toBe(after);
    }
    // The effect's output is a function of what it read, so it runs exactly when that output changes
    // (every input it read feeds the output here).
    expect(e.runs).toBe(expectedRuns);
  });
});
