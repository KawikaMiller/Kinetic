import { describe, expect, it } from 'vitest';
import { checkByIntervals, checkSequential, formatLine, MAX_LINES, PALETTE, PRESETS, type Line, type RangePolicy, type Rule } from './ownership';

const preset = (id: string) => PRESETS.find((p) => p.id === id)!.program;
const summary = (program: Line[], policy?: RangePolicy) => checkSequential(program, policy).problems.map((p) => [p.line, p.rule]);

/** Every program of exactly `length` lines from the palette, as arrays of palette indices (counted in base 13). */
function* programs(length: number, firstIsNew: boolean): Generator<Line[]> {
  const base = PALETTE.length;
  const free = firstIsNew ? length - 1 : length;
  const total = base ** free;
  for (let n = 0; n < total; n++) {
    const lines: Line[] = firstIsNew ? [PALETTE[0]] : [];
    for (let k = 0, rest = n; k < free; k++, rest = Math.floor(rest / base)) lines.push(PALETTE[rest % base]);
    yield lines;
  }
}

describe('the two checkers agree', () => {
  it('on every program of up to 5 lines from the palette (exhaustive: pairwise live intervals against a sequential state machine)', () => {
    let count = 0;
    for (let length = 1; length <= 5; length++) {
      for (const p of programs(length, false)) {
        count++;
        const a = checkSequential(p);
        const b = checkByIntervals(p);
        if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`disagree on ${p.map(formatLine).join('; ')}`);
      }
    }
    expect(count).toBe(13 + 13 ** 2 + 13 ** 3 + 13 ** 4 + 13 ** 5);
  });

  it('on every 6-line program from the palette (4.8 million; exhaustive up to the 6-line spec)', () => {
    let accepted = 0;
    for (const p of programs(6, false)) {
      const a = checkSequential(p);
      if (JSON.stringify(a) !== JSON.stringify(checkByIntervals(p))) throw new Error(`disagree on ${p.map(formatLine).join('; ')}`);
      if (a.accepted) accepted++;
    }
    expect(accepted).toBeGreaterThan(0);
  }, 120_000);

  it('under the two broken range policies as well, on every program of up to 4 lines', () => {
    for (const policy of ['creation-only', 'end-of-program'] as RangePolicy[]) {
      for (let length = 1; length <= 4; length++) {
        for (const p of programs(length, false)) expect(JSON.stringify(checkSequential(p, policy))).toBe(JSON.stringify(checkByIntervals(p, policy)));
      }
    }
  });
});

describe('the Rust book programs have their published verdicts (hand-worked)', () => {
  it('two &mut of one value is rejected at line 3; shared then &mut with the shared ones used later is rejected at line 4; the same with the shared uses first is accepted; use after move is rejected at line 3', () => {
    expect(summary(preset('two-mut'))).toEqual([[2, 'two-mutable']]);
    expect(summary(preset('shared-then-mut'))).toEqual([[3, 'mutable-while-shared']]);
    expect(summary(preset('nll'))).toEqual([]);
    expect(summary(preset('after-move'))).toEqual([[2, 'use-after-move']]);
    expect(PRESETS.map((p) => p.accepted)).toEqual(PRESETS.map((p) => checkSequential(p.program).accepted));
  });

  it('each preset fits the ten-line cap', () => {
    for (const p of PRESETS) expect(p.program.length).toBeLessThanOrEqual(MAX_LINES);
  });
});

describe('each rule has a program that trips it', () => {
  const L = (op: Line['op'], name?: string) => (name ? ({ op, name } as Line) : ({ op } as Line));
  const cases: [Rule, Line[]][] = [
    ['move-while-borrowed', [L('new'), L('borrow', 'r'), L('move'), L('useBorrow', 'r')]],
    ['move-while-borrowed', [L('new'), L('borrow', 'm'), L('drop'), L('useBorrow', 'm')]],
    ['write-while-borrowed', [L('new'), L('borrow', 'r'), L('write'), L('useBorrow', 'r')]],
    ['use-while-mutably-borrowed', [L('new'), L('borrow', 'm'), L('use'), L('useBorrow', 'm')]],
    ['no-borrow', [L('new'), L('useBorrow', 'r')]],
    ['use-after-move', [L('new'), L('drop'), L('write')]],
  ];
  it.each(cases)('%s', (rule, program) => {
    expect(checkSequential(program).problems.map((p) => p.rule)).toContain(rule);
  });

  it('a shared use while only shared borrows are live is fine', () => {
    expect(checkSequential([L('new'), L('borrow', 'r'), L('use'), L('useBorrow', 'r')]).accepted).toBe(true);
  });
});

describe('broken checkers', () => {
  it('a checker whose borrows last to the end of the program rejects the accepted "shared ends before &mut" preset, and the real one accepts it', () => {
    expect(checkSequential(preset('nll')).accepted).toBe(true);
    expect(checkSequential(preset('nll'), 'end-of-program').accepted).toBe(false);
  });

  it('a checker whose borrow ends at its creation accepts the rejected "shared, then &mut" preset', () => {
    expect(checkSequential(preset('shared-then-mut')).accepted).toBe(false);
    expect(checkSequential(preset('shared-then-mut'), 'creation-only').accepted).toBe(true);
  });
});
