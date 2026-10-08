import { describe, expect, it } from 'vitest';
import { compile, formatInstr, runVm } from './bytecode';
import {
  COST, COUNTS, HOT_THRESHOLD, WORKLOADS, crossover, fmtTime, iterationsFor, linearCount, liveCounterAt, opsAt, race, singleCallTotals,
} from './costModel';
import { SUM_SQUARES, printFn, treeWalk, type Value } from './lang';
import { NATIVE, runNative } from './native';

/** The source the lesson shows, run as real JavaScript (tests may run on-screen snippets). */
const SOURCE_TEXT = printFn(SUM_SQUARES).lines.join('\n');
const realJs = new Function(`${SOURCE_TEXT}\nreturn sumSquares;`)() as (n: Value) => number;
const closedForm = (n: number) => (n * (n + 1) * (2 * n + 1)) / 6;
const BC = compile(SUM_SQUARES);

describe('the source on screen is the AST', () => {
  it('prints back exactly as the listing', () => {
    expect(printFn(SUM_SQUARES).lines).toEqual([
      'function sumSquares(n) {',
      '  let s = 0;',
      '  let i = 1;',
      '  while (i <= n) {',
      '    s = s + i * i;',
      '    i = i + 1;',
      '  }',
      '  return s;',
      '}',
    ]);
  });
});

describe('the interpreter, the VM and the machine-code model all compute sumSquares', () => {
  it('equals n(n+1)(2n+1)/6 for n in 0..200, in every implementation', () => {
    for (let n = 0; n <= 200; n++) {
      const want = closedForm(n);
      expect(treeWalk(SUM_SQUARES, n).result).toBe(want);
      expect(runVm(BC, 'n', n).result).toBe(want);
      expect(runNative(n).result).toBe(want);
    }
  });

  it('matches real JavaScript, the string "3" and odd values included', () => {
    for (const arg of [0, 1, 7, 2.5, -3, Number.NaN, '3', '10', '', 'abc', '2.9']) {
      const want = realJs(arg);
      expect(treeWalk(SUM_SQUARES, arg).result).toBe(want);
      expect(runVm(BC, 'n', arg).result).toBe(want);
      if (typeof arg === 'number') expect(runNative(arg).result).toBe(want);
      else expect(runNative(arg).deopt).toBe(true);
    }
  });
});

describe('bytecode', () => {
  it('is pinned', () => {
    expect(BC.code.map(formatInstr)).toEqual([
      '00  PUSH         0',
      '01  STORE        s',
      '02  PUSH         1',
      '03  STORE        i',
      '04  LOAD         i',
      '05  LOAD         n',
      '06  LE',
      '07  JMP_IF_FALSE 19',
      '08  LOAD         s',
      '09  LOAD         i',
      '10  LOAD         i',
      '11  MUL',
      '12  ADD',
      '13  STORE        s',
      '14  LOAD         i',
      '15  PUSH         1',
      '16  ADD',
      '17  STORE        i',
      '18  JMP          4',
      '19  LOAD         s',
      '20  RET',
    ]);
    expect(BC.loopHead).toBe(4);
  });
});

describe('op counts come from the implementations', () => {
  it('measured coefficients: hand-counted from the tree, the bytecode and the listing', () => {
    // Tree: per iteration the condition (<=, i, n), s = s + i * i (=, +, s, *, i, i) and i = i + 1 (=, +, i, 1).
    expect(COUNTS.tree.perIter).toBe(3 + 6 + 4);
    // VM: instructions 04..18 inclusive.
    expect(COUNTS.vm.perIter).toBe(15);
    expect(COUNTS.vm.entry).toBe(4);
    // Native: ucomisd, jb, movapd, mulsd, addsd, addsd, jmp.
    expect(COUNTS.native.perIter).toBe(7);
    expect(COUNTS.native.entry).toBe(5);
  });

  it('the linear count equals a full run, for n up to 300 and at 1,000,000', () => {
    for (const n of [0, 1, 2, 3, 10, 57, 300]) {
      expect(linearCount(COUNTS.tree, n)).toBe(treeWalk(SUM_SQUARES, n).visits);
      expect(linearCount(COUNTS.vm, n)).toBe(runVm(BC, 'n', n).executed);
      expect(linearCount(COUNTS.native, n)).toBe(runNative(n).executed);
    }
    const big = 1_000_000;
    expect(linearCount(COUNTS.vm, big)).toBe(runVm(BC, 'n', big).executed);
    expect(linearCount(COUNTS.tree, big)).toBe(treeWalk(SUM_SQUARES, big).visits);
    expect(linearCount(COUNTS.native, big)).toBe(runNative(big).executed);
  });

  it('iterationsFor matches the VM loop-head count', () => {
    for (const arg of [0, 1, 5, 2.5, -1, '3', '', 'x', 1000]) expect(iterationsFor(arg)).toBe(runVm(BC, 'n', arg).headVisits - 1);
  });

  it('the native listing has the instruction count its counters claim', () => {
    expect(NATIVE.filter((l) => l.sem.k !== 'label')).toHaveLength(13);
  });
});

describe('the race (cost model)', () => {
  const long = race(WORKLOADS[1], { countBuild: true });
  const lane = (r: ReturnType<typeof race>, id: string) => r.lanes.find((l) => l.id === id)!;

  it('every lane does every iteration of every call', () => {
    for (const w of WORKLOADS) {
      const r = race(w, { countBuild: true });
      const want = w.calls.reduce<number>((a, c) => a + iterationsFor(c), 0);
      for (const l of r.lanes.filter((x) => !x.failed)) expect(l.segments.reduce((a, s) => a + s.iters, 0)).toBe(want);
    }
  });

  it('segments are contiguous and priced at their lane cost', () => {
    for (const w of WORKLOADS) {
      for (const l of race(w, { countBuild: true }).lanes) {
        l.segments.forEach((s, i) => {
          expect(s.end).toBeGreaterThanOrEqual(s.start);
          if (i) expect(s.start).toBe(l.segments[i - 1].end);
        });
        expect(opsAt(l, l.total)).toBeCloseTo(l.ops, 6);
      }
    }
  });

  it('the tree-walker and VM totals are parse (+ compile) + ops × cost', () => {
    const n = 1_000_000;
    expect(lane(long, 'tree').total).toBeCloseTo(COST.parse + treeWalk(SUM_SQUARES, n).visits * COST.treeVisit, 3);
    expect(lane(long, 'vm').total).toBeCloseTo(COST.parse + COST.bytecodeCompile + runVm(BC, 'n', n).executed * COST.vmOp, 3);
  });

  it('the JIT compiles exactly when the counter reaches the threshold', () => {
    const jit = lane(long, 'jit');
    const vmPart = jit.segments.find((s) => s.kind === 'interp')!;
    expect(1 + vmPart.iters).toBe(HOT_THRESHOLD);
    expect(long.jitEvents).toEqual([{ kind: 'hot', at: vmPart.end, call: 0 }]);
    expect(liveCounterAt(long, vmPart.end - 1)).toBeLessThan(HOT_THRESHOLD);
    expect(liveCounterAt(long, vmPart.end)).toBe(HOT_THRESHOLD);
  });

  it('a short script never gets hot, so the JIT costs exactly what the VM costs', () => {
    const r = race(WORKLOADS[0], { countBuild: true });
    expect(r.jitEvents).toEqual([]);
    expect(lane(r, 'jit').total).toBe(lane(r, 'vm').total);
    expect(lane(r, 'tree').total).toBeLessThan(lane(r, 'vm').total);
    expect(lane(r, 'tree').total).toBeLessThan(lane(r, 'aot').total);
  });

  it('the deopt workload: guard fails on the string, deopts, warms up again and recompiles', () => {
    const r = race(WORKLOADS[2], { countBuild: true });
    expect(r.jitEvents.map((e) => [e.kind, e.call])).toEqual([['hot', 0], ['deopt', 1], ['hot', 2]]);
    expect(lane(r, 'aot').failed).toMatch(/type error/);
    const jitLong = lane(long, 'jit').total;
    // Worse than two clean long calls would be: the second one pays the warm-up and compile again.
    expect(lane(r, 'jit').total).toBeGreaterThan(2 * jitLong - COST.parse - COST.bytecodeCompile);
  });

  it('AOT with the build counted loses the short script, wins built ahead', () => {
    const counted = race(WORKLOADS[0], { countBuild: true });
    const ahead = race(WORKLOADS[0], { countBuild: false });
    expect(lane(counted, 'aot').total).toBeGreaterThan(lane(counted, 'tree').total);
    for (const id of ['tree', 'vm', 'jit']) expect(lane(ahead, 'aot').total).toBeLessThan(lane(ahead, id).total);
  });
});

describe('crossover points (tested against brute force and the closed-form break-even)', () => {
  it('JIT beats the VM from the n where the compile pause is paid back', () => {
    const n = crossover('jit', 'vm')!;
    const t = (m: number) => singleCallTotals(m);
    expect(t(n).jit).toBeLessThan(t(n).vm);
    expect(t(n - 1).jit).toBeGreaterThanOrEqual(t(n - 1).vm);
    // Break-even by hand: past the warm-up, each iteration saves vmOp·15 − nativeOp·7 ns, and the
    // pause costs jitCompile; the VM's 3-instruction tail vs native exit shifts it by a hair.
    const saving = COST.vmOp * 15 - COST.nativeOp * 7;
    const approx = HOT_THRESHOLD - 1 + COST.jitCompile / saving;
    expect(Math.abs(n - approx)).toBeLessThan(2);
  });

  it('the VM beats the tree-walker once the bytecode compile is paid back', () => {
    const n = crossover('vm', 'tree')!;
    const t = singleCallTotals;
    expect(t(n).vm).toBeLessThan(t(n).tree);
    expect(t(n - 1).vm).toBeGreaterThanOrEqual(t(n - 1).tree);
    const perIterSaving = COST.treeVisit * 13 - COST.vmOp * 15;
    expect(Math.abs(n - COST.bytecodeCompile / perIterSaving)).toBeLessThan(2);
  });
});

describe('fmtTime', () => {
  it('three significant figures', () => {
    expect(fmtTime(50_780)).toBe('50.8 µs');
    expect(fmtTime(5_966_000)).toBe('5.97 ms');
    expect(fmtTime(0.3)).toBe('0.3 ns');
    expect(fmtTime(78_050_060)).toBe('78.1 ms');
  });
});
