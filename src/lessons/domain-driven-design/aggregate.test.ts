import { describe, expect, it } from 'vitest';
import { MAX_LINES, START_LINES, interleavingName, interleavings, run, tally } from './aggregate';

describe('the six interleavings', () => {
  it('are exactly the orderings of R1 W1 R2 W2 where each actor reads before it writes', () => {
    const names = interleavings().map(interleavingName).sort();
    expect(names).toEqual(['R1 R2 W1 W2', 'R1 R2 W2 W1', 'R1 W1 R2 W2', 'R2 R1 W1 W2', 'R2 R1 W2 W1', 'R2 W2 R1 W1'].sort());
  });
});

describe('order lines as independent records', () => {
  const t = tally('records');
  const byName = (n: string) => t.runs.find((r) => interleavingName(r.events.map((e) => e.step)) === n)!;

  it('4 of the 6 end with 6 lines: those where both actors read before either writes', () => {
    const over = t.runs.filter((r) => r.violated).map((r) => interleavingName(r.events.map((e) => e.step))).sort();
    expect(over).toEqual(['R1 R2 W1 W2', 'R1 R2 W2 W1', 'R2 R1 W1 W2', 'R2 R1 W2 W1']);
    expect(t.violations).toBe(4);
    for (const n of over) expect(byName(n).finalLines).toBe(6);
  });

  it('the 2 serial ones end at 5, because the second actor reads 5 and is correctly refused', () => {
    for (const n of ['R1 W1 R2 W2', 'R2 W2 R1 W1']) {
      expect(byName(n).finalLines).toBe(MAX_LINES);
      expect(byName(n).events.at(-1)?.outcome).toBe('refused');
    }
  });
});

describe('the order as an aggregate with a version check', () => {
  const t = tally('aggregate');

  it('0 of the 6 violate, and each ends at exactly 5 lines', () => {
    expect(t.violations).toBe(0);
    for (const r of t.runs) expect(r.finalLines).toBe(START_LINES + 1);
  });

  it('the invariant holds after every step of every run, not just at the end', () => {
    for (const r of t.runs) for (const e of r.events) expect(e.lines).toBeLessThanOrEqual(MAX_LINES);
  });

  it('the loser of a race is refused, reads again, sees 5 lines and adds nothing', () => {
    const r = run('aggregate', interleavings().find((o) => interleavingName(o) === 'R1 R2 W1 W2')!);
    expect(r.events.map((e) => e.outcome)).toEqual(['read', 'read', 'added', 'conflict-retry']);
    expect(r.events.at(-1)?.note).toContain('reads again, sees 5 lines and finds no room');
    expect(r.finalLines).toBe(5);
  });

  it('a version check that never compares (the records design) breaks the invariant on the same schedule', () => {
    const racing = interleavings().find((o) => interleavingName(o) === 'R1 R2 W1 W2')!;
    expect(run('aggregate', racing).violated).toBe(false);
    expect(run('records', racing).violated).toBe(true);
  });

  it('the version grows by one for each line added', () => {
    for (const r of t.runs) expect(r.events.at(-1)?.version).toBe(r.finalLines - START_LINES);
  });
});
