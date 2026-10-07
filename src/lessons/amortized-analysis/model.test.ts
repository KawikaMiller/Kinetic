import { describe, expect, it } from 'vitest';
import { mulberry32, type Rnd } from '../../core/random';
import { captionText } from '../../core/testing/captions';
import { bankVerdict, pushFrames, trapCopies, trapFrames } from './frames';
import {
  coinsNeeded, COINS_PER_OP, cumulativeCost, grow, GROWTHS, MAX_PUSHES, potential, pushes, run, START_CAP, TRAP_FILL, TRAP_OPS,
  type Growth, type Op, type ShrinkRule,
} from './model';

/**
 * Reference: a dynamic array that really allocates blocks and moves elements one at a time,
 * counting every element write. Growth and shrink rules are restated here from the lesson text,
 * not imported.
 */
class RefArray {
  buf: (number | undefined)[] = new Array(1);
  size = 0;
  writes = 0;
  growth: Growth;
  shrink: ShrinkRule;
  constructor(growth: Growth, shrink: ShrinkRule) {
    this.growth = growth;
    this.shrink = shrink;
  }
  private moveTo(cap: number) {
    const next = new Array<number | undefined>(cap);
    for (let i = 0; i < this.size; i++) {
      next[i] = this.buf[i];
      this.writes++;
    }
    this.buf = next;
  }
  push(v: number) {
    if (this.size === this.buf.length) {
      const c = this.buf.length;
      this.moveTo(this.growth === 'double' ? 2 * c : this.growth === 'plus10' ? c + 10 : Math.max(c + 1, Math.floor((3 * c) / 2)));
    }
    this.buf[this.size++] = v;
    this.writes++;
  }
  pop() {
    this.buf[--this.size] = undefined;
    this.writes++;
    const c = this.buf.length;
    const limit = this.shrink === 'half' ? c / 2 : this.shrink === 'quarter' ? c / 4 : -1;
    if (c > 1 && this.size <= limit) this.moveTo(Math.max(1, Math.floor(c / 2)));
  }
}

/** Largest power of two ≤ m (m ≥ 1). */
const floorPow2 = (m: number) => {
  let p = 1;
  while (p * 2 <= m) p *= 2;
  return p;
};
/** Doubling from capacity 1: the copies made by n pushes are 1 + 2 + 4 + … over the powers of two below n. */
const doublingCopies = (n: number) => (n < 2 ? 0 : 2 * floorPow2(n - 1) - 1);
/** +10 from capacity 1: copies of 1, 11, 21, … for every capacity below n. */
const plus10Copies = (n: number) => {
  if (n < 2) return 0;
  const m = Math.floor((n - 2) / 10) + 1;
  return m + (10 * m * (m - 1)) / 2;
};

const copiesOf = (n: number, g: Growth) => run(pushes(n), g).reduce((t, s) => t + s.copies, 0);

function randomOps(rnd: Rnd, count: number): Op[] {
  const ops: Op[] = [];
  let size = 0;
  for (let i = 0; i < count; i++) {
    const op: Op = size > 0 && rnd() < 0.45 ? 'pop' : 'push';
    size += op === 'push' ? 1 : -1;
    ops.push(op);
  }
  return ops;
}

describe('amortized-analysis model', () => {
  it('matches a real element-moving array, write for write, on 300 seeded push/pop sequences per policy', () => {
    const rnd = mulberry32(7);
    const shrinks: ShrinkRule[] = ['none', 'half', 'quarter'];
    for (let t = 0; t < 300; t++) {
      const ops = randomOps(rnd, 1 + Math.floor(rnd() * 400));
      for (const g of GROWTHS.map((x) => x.id)) {
        const shrink = shrinks[t % 3];
        const ref = new RefArray(g, shrink);
        const steps = run(ops, g, shrink);
        let writes = 0;
        ops.forEach((op, i) => {
          if (op === 'push') ref.push(i);
          else ref.pop();
          writes += steps[i].cost;
          expect(writes).toBe(ref.writes);
          expect(steps[i].capAfter).toBe(ref.buf.length);
          expect(steps[i].after.length).toBe(ref.size);
        });
      }
    }
  });

  it('doubling: total copies equal the powers-of-two sum and stay below 2n for every n up to 10,000', () => {
    let copies = 0;
    run(pushes(10_000), 'double').forEach((s, i) => {
      copies += s.copies;
      const n = i + 1;
      expect(copies).toBe(doublingCopies(n));
      expect(copies).toBeLessThan(2 * n);
    });
  });

  it('doubling with 3 coins per push: the balance is 2n − copies and never below 0, for 1 to 10,000 pushes', () => {
    run(pushes(10_000), 'double').forEach((s, i) => {
      expect(s.balance).toBe(2 * (i + 1) - doublingCopies(i + 1));
      expect(s.balance).toBeGreaterThanOrEqual(0);
    });
  });

  it('2 coins per push are not enough under doubling, so 3 is the smallest whole number that works', () => {
    expect(run(pushes(5), 'double', 'none', 2).some((s) => s.balance < 0)).toBe(true);
    for (const n of [5, 32, 1000, 10_000]) expect(coinsNeeded(n, 'double')).toBe(3);
  });

  it('coinsNeeded is the smallest deposit that never overdraws, found by trying 1, 2, 3 … for every policy', () => {
    for (const g of GROWTHS.map((x) => x.id)) {
      for (const n of [1, 2, 7, 32, 200]) {
        let c = 1;
        while (run(pushes(n), g, 'none', c).some((s) => s.balance < 0)) c++;
        expect(coinsNeeded(n, g)).toBe(c);
      }
    }
  });

  it('1.5× and +10 overdraw a 3-coin bank within the playground, and 1.5× needs 5 per push up to 10,000', () => {
    expect(run(pushes(MAX_PUSHES), 'x1.5').some((s) => s.balance < 0)).toBe(true);
    expect(run(pushes(MAX_PUSHES), 'plus10').find((s) => s.balance < 0)?.n).toBe(42);
    // Exact 1.5× would settle near 1 + 1.5 / 0.5 = 4; rounding the capacity down makes the copies come sooner.
    expect(coinsNeeded(10_000, 'x1.5')).toBe(5);
  });

  it('+10: total copies equal the arithmetic sum, 49,600 at n = 1,000, about n²/20', () => {
    for (let n = 1; n <= 2000; n++) expect(copiesOf(n, 'plus10')).toBe(plus10Copies(n));
    const c = copiesOf(1000, 'plus10');
    expect(c).toBe(49_600);
    expect(c / (1000 ** 2 / 20)).toBeCloseTo(0.992, 3);
    // The amortized cost per push grows with n: no constant deposit works.
    expect(coinsNeeded(200, 'plus10')).toBeLessThan(coinsNeeded(2000, 'plus10'));
  });

  it('the 1.5× rule always grows by at least one slot', () => {
    for (let c = START_CAP; c < 500; c++) expect(grow(c, 'x1.5')).toBeGreaterThan(c);
    expect([1, 2, 3, 4, 6, 9].map((c) => grow(c, 'x1.5'))).toEqual([2, 3, 4, 6, 9, 13]);
  });

  it('quarter-shrink with doubling: 3 coins per push or pop keep the balance at or above 0 on 500 seeded sequences', () => {
    const rnd = mulberry32(99);
    for (let t = 0; t < 500; t++) {
      const steps = run(randomOps(rnd, 1 + Math.floor(rnd() * 2000)), 'double', 'quarter');
      for (const s of steps) expect(s.balance).toBeGreaterThanOrEqual(0);
    }
  });

  it('half-shrink thrash: after filling to 8, every alternating push and pop copies 8 elements', () => {
    const steps = run(TRAP_OPS, 'double', 'half');
    for (const s of steps.slice(TRAP_FILL)) expect(s.copies).toBe(8);
    const quarter = run(TRAP_OPS, 'double', 'quarter').slice(TRAP_FILL);
    expect(quarter.map((s) => s.copies)).toEqual([8, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('potential Φ = 2·size − capacity + 1: Φ starts at 0, never goes negative, and every doubling push costs exactly 3 amortized', () => {
    expect(potential(0, START_CAP)).toBe(0);
    for (const s of run(pushes(5000), 'double')) {
      const amortized = s.cost + potential(s.after.length, s.capAfter) - potential(s.before.length, s.capBefore);
      expect(amortized).toBe(3);
      expect(potential(s.after.length, s.capAfter)).toBeGreaterThanOrEqual(0);
    }
  });

  it('cumulative cost is pushes plus copies', () => {
    const cum = cumulativeCost(200, 'double');
    cum.forEach((v, n) => expect(v).toBe(n + doublingCopies(n)));
  });
});

describe('amortized-analysis captions', () => {
  const CASES: [number, number][] = [[0, 1], [1, 1], [2, 1], [3, 1], [5, 1], [17, 1], [8, 8], [24, 8], [32, 1], [42, 1], [48, 8]];

  it('every push-scene frame has its own caption, and its totals and balance match the reference array', () => {
    for (const g of GROWTHS.map((x) => x.id)) {
      for (const [n, batch] of CASES) {
        const frames = pushFrames(n, batch, g);
        for (const f of frames) expect(captionText(f.say).length).toBeGreaterThan(0);
        const last = frames[frames.length - 1];
        const ref = new RefArray(g, 'none');
        for (let i = 1; i <= n; i++) ref.push(i);
        expect(last.total).toBe(ref.writes);
        expect(last.block.filter((v) => v !== null).length).toBe(n);
        expect(last.block.length).toBe(n === 0 ? 1 : ref.buf.length);
        if (n === 0) continue;
        const text = captionText(last.say);
        expect(text).toContain(`${ref.writes} ${ref.writes === 1 ? 'write' : 'writes'} in all`);
        expect(text).toContain((ref.writes / n).toFixed(2));
        expect(last.balance).toBe(COINS_PER_OP * n - ref.writes);
        // The verdict comes from the balance history, checked against a direct replay.
        let bal = 0;
        let lowest = Infinity;
        let firstNeg: number | null = null;
        const r2 = new RefArray(g, 'none');
        for (let i = 1; i <= n; i++) {
          const before = r2.writes;
          r2.push(i);
          bal += COINS_PER_OP - (r2.writes - before);
          lowest = Math.min(lowest, bal);
          if (bal < 0 && firstNeg === null) firstNeg = i;
        }
        if (firstNeg === null) expect(text).toContain(`never went below zero (lowest ${lowest})`);
        else expect(text).toContain(`first went below zero at push ${firstNeg}`);
      }
    }
  });

  it('doubling never reports an overdraft and +10 does by the last push the playground allows', () => {
    expect(captionText(bankVerdict(run(pushes(MAX_PUSHES), 'double'), 'double'))).toContain('never went below zero');
    expect(captionText(bankVerdict(run(pushes(MAX_PUSHES), 'plus10'), 'plus10'))).toContain('keeps rising');
  });

  it('a single resize push is drawn allocate, copy, free, write, and copies at most 8 frames', () => {
    const frames = pushFrames(17, 1, 'double');
    const copyFrames = frames.filter((f) => f.old !== null && f.copied > 0);
    expect(copyFrames.length).toBe(8);
    expect(copyFrames[copyFrames.length - 1].copied).toBe(16);
    expect(captionText(frames[frames.length - 2].say)).toContain('1 + 16 = 17');
  });

  it('trap captions: half-shrink thrashes on every operation, quarter-shrink resizes once', () => {
    const half = trapFrames('half');
    expect(captionText(half[half.length - 1].say)).toContain('every single one resized');
    expect(trapCopies(run(TRAP_OPS, 'double', 'half'))).toBe(64);
    const quarter = trapFrames('quarter');
    const q = captionText(quarter[quarter.length - 1].say);
    expect(q).toContain('1 of them resized');
    // The printed lowest is the real minimum, from a direct replay (not clamped at 0).
    const ref = new RefArray('double', 'quarter');
    let bal = 0;
    let lowest = Infinity;
    TRAP_OPS.forEach((op, i) => {
      const before = ref.writes;
      if (op === 'push') ref.push(i);
      else ref.pop();
      bal += COINS_PER_OP - (ref.writes - before);
      lowest = Math.min(lowest, bal);
    });
    expect(lowest).toBeGreaterThan(0);
    expect(q).toContain(`never went below zero (lowest ${lowest})`);
    for (const f of [...half, ...quarter]) expect(captionText(f.say).length).toBeGreaterThan(0);
  });
});

describe('amortized-analysis lesson text', () => {
  it("quiz and tips' numbers come from the model", async () => {
    const lesson = (await import('./index')).default;
    const q2 = lesson.quiz[1];
    expect(q2.options[q2.answer]).toBe(String(copiesOf(9, 'double')));
    expect(run(pushes(9), 'double').filter((s) => s.resize).map((s) => s.n)).toEqual([2, 3, 5, 9]);
    expect(lesson.quiz[2].why).toContain(copiesOf(1000, 'plus10').toLocaleString('en-US'));
    // "1.5× resizes more often than 2×" within the playground.
    const resizes = (g: Growth) => run(pushes(MAX_PUSHES), g).filter((s) => s.resize).length;
    expect(resizes('x1.5')).toBeGreaterThan(resizes('double'));
    // "the running average stays under 3" for 2×.
    cumulativeCost(MAX_PUSHES, 'double').slice(1).forEach((t, i) => expect(t / (i + 1)).toBeLessThan(3));
  });
});
