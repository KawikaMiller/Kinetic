import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { evalBin, listing, run, staticCount, type Program } from './ir';
import { aliasView, floatRow, loopView, reassocView, ssaView } from './model';
import { algebra, cse, deleteLoop, forwardLoads, inline, licm, optimiseLoop, PASS_IDS, runPipeline, type LoopOptions, type PassId } from './passes';
import { ALIAS_PROGRAM, loopProgram, LEFT_ASSOC, P1, RELOAD_PROGRAM, RIGHT_ASSOC, ssaSourceResult, SSA_PROGRAM, timesZero } from './programs';

/** Real JavaScript multiplication, through a function so a linter does not fold the point of the lesson away. */
const times = (a: number, b: number) => a * b;

/** All orderings of a list: the 120 orders of the five passes. */
function permutations<T>(xs: readonly T[]): T[][] {
  if (xs.length <= 1) return [[...xs]];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest]));
}

/** P1 written out in plain JavaScript: r = a * 2 + a * 2 + (7 + 3), in 32-bit arithmetic. The oracle for every optimised P1. */
const p1Reference = (a: number) => (((Math.imul(a, 2) + Math.imul(a, 2)) | 0) + 10) | 0;

/** The loop in plain JavaScript: the sum of (3x)^2, n times, in 32-bit arithmetic. */
function loopReference(x: number, n: number, resultUsed: boolean) {
  let s = 0;
  for (let i = 0; i < n; i++) {
    const k = Math.imul(x, 3);
    s = (s + Math.imul(k, k)) | 0;
  }
  return resultUsed ? s : 0;
}

const seededInts = (seed: number, count: number, span: number) => {
  const rnd = mulberry32(seed);
  return Array.from({ length: count }, () => Math.floor(rnd() * span) - span / 2);
};

const ALL_OPTIONS: LoopOptions[] = Array.from({ length: 16 }, (_, bits) => ({
  inlining: (bits & 1) !== 0,
  hoisting: (bits & 2) !== 0,
  dce: (bits & 4) !== 0,
  deleteLoops: (bits & 8) !== 0,
}));

describe('the interpreter agrees with JavaScript', () => {
  it('P1 returns the closed form for 500 seeded inputs, wrapping at 32 bits', () => {
    for (const a of [...seededInts(1, 490, 2 ** 32), 0, 2 ** 30, -(2 ** 31), 2 ** 31 - 1, 1, -1, 7, 99, 12345, -777]) {
      expect(run(P1, [a]).value, `a = ${a}`).toBe(p1Reference(a));
    }
  });

  it('i32 arithmetic equals |0 and Math.imul, and float64 arithmetic equals plain JavaScript', () => {
    for (const [a, b] of [[2 ** 31 - 1, 1], [-(2 ** 31), -1], [123456789, 987654321], [0.1, 0.2]]) {
      expect(evalBin('add', a, b, 'i32')).toBe((a + b) | 0);
      expect(evalBin('mul', a, b, 'i32')).toBe(Math.imul(a, b));
      expect(evalBin('sub', a, b, 'i32')).toBe((a - b) | 0);
      expect(evalBin('add', a, b, 'f64')).toBe(a + b);
      expect(evalBin('lt', a, b, 'f64')).toBe(a < b ? 1 : 0);
    }
  });

  it('the loop returns the plain-JavaScript sum for seeded (x, n), n = 0 included', () => {
    for (const [i, x] of seededInts(2, 40, 2000).entries()) {
      const n = i % 7;
      expect(run(loopProgram(true), [x, n]).value).toBe(loopReference(x, n, true));
      expect(run(loopProgram(false), [x, n]).value).toBe(0);
    }
  });
});

describe('semantic preservation', () => {
  it('every order of the five passes, once and to a fixed point, keeps the value of P1 on 500 seeded inputs (240 pipelines)', () => {
    const inputs = [...seededInts(3, 497, 2 ** 32), 0, 2 ** 31 - 1, -(2 ** 31)];
    const orders = permutations<PassId>(PASS_IDS);
    expect(orders).toHaveLength(120);
    for (const order of orders) {
      for (const fixedPoint of [false, true]) {
        const optimised = runPipeline(P1, order, fixedPoint).program;
        for (const a of inputs) expect(run(optimised, [a]).value, `${order.join('>')} fp=${fixedPoint} a=${a}`).toBe(p1Reference(a));
      }
    }
  });

  it('every subset of the passes, in the default order, keeps P1 correct', () => {
    for (let bits = 0; bits < 32; bits++) {
      const order = PASS_IDS.filter((_, k) => (bits >> k) & 1);
      for (const a of seededInts(4, 40, 2 ** 20)) expect(run(runPipeline(P1, order, true).program, [a]).value).toBe(p1Reference(a));
    }
  });

  it('all 16 loop-step combinations, with the result used or ignored, keep the loop correct for 100 seeded (x, n)', () => {
    const xs = seededInts(5, 100, 2000);
    for (const options of ALL_OPTIONS) {
      for (const resultUsed of [true, false]) {
        const optimised = optimiseLoop(loopProgram(resultUsed), options).program;
        xs.forEach((x, i) => {
          const n = i % 13;
          expect(run(optimised, [x, n]).value, JSON.stringify({ options, resultUsed, x, n })).toBe(loopReference(x, n, resultUsed));
        });
      }
    }
  });

  it('a deliberately broken CSE (loads kept across a store) is rejected: p = q = 100 gives 2 where the original gives 3', () => {
    const broken = cse(RELOAD_PROGRAM, { forgetLoadsAtStores: false }).program;
    const failing = [[100, 200], [100, 100]].filter(([p, q]) => run(broken, [p, q]).value !== run(RELOAD_PROGRAM, [p, q]).value);
    expect(failing).toEqual([[100, 100]]);
    expect(run(RELOAD_PROGRAM, [100, 100]).value).toBe(3);
    expect(run(broken, [100, 100]).value).toBe(2);
    const sound = cse(RELOAD_PROGRAM).program;
    for (const [p, q] of [[100, 200], [100, 100]]) expect(run(sound, [p, q]).value).toBe(run(RELOAD_PROGRAM, [p, q]).value);
  });
});

describe('counts', () => {
  it('the static count is the printed instruction lines, and the executed count is the trace length', () => {
    for (const order of [['fold', 'propagate'], ['dce'], ['algebra', 'cse', 'propagate', 'fold', 'dce']] as PassId[][]) {
      const p = runPipeline(P1, order, true).program;
      const printed = listing(p).lines.filter((l) => l.startsWith('  ')).length;
      expect(staticCount(p)).toBe(printed);
      expect(run(p, [5]).executed).toBe(run(p, [5]).trace.length);
    }
  });

  it('hand-worked: a good order to a fixed point leaves 3 instructions plus the ret', () => {
    const p = runPipeline(P1, ['algebra', 'cse', 'propagate', 'fold', 'dce'], true).program;
    expect(listing(p).lines).toEqual(['entry:', '  t1 = mul a, 2', '  t3 = add t1, t1', '  r = add t3, 10', '  ret r']);
    expect(staticCount(P1)).toBe(9);
  });

  it('hand-worked: fold before propagate finds nothing, propagate first folds the 2 constant operations, DCE first removes only u', () => {
    const changes = (order: PassId[]) => runPipeline(P1, order, false).rounds[0].steps.map((s) => [s.pass, s.changed]);
    expect(changes(['fold', 'propagate'])).toEqual([['fold', 0], ['propagate', 2]]);
    expect(changes(['propagate', 'fold'])).toEqual([['propagate', 2], ['fold', 2]]);
    const dceOnly = runPipeline(P1, ['dce'], false).program;
    expect(listing(dceOnly).lines).toEqual(listing(P1).lines.filter((l) => !l.includes('u = mul x, 99')));
  });

  it('with no pass enabled the program comes back as it was, and a fixed point is stable', () => {
    expect(runPipeline(P1, [], true).program).toBe(P1);
    const done = runPipeline(P1, PASS_IDS, true);
    expect(runPipeline(done.program, PASS_IDS, false).rounds[0].changed).toBe(0);
  });
});

describe('the loop passes', () => {
  const x = 3;
  const per = (o: LoopOptions) => {
    const p = optimiseLoop(loopProgram(true), o).program;
    return run(p, [x, 2]).executed - run(p, [x, 1]).executed;
  };
  const none: LoopOptions = { inlining: false, hoisting: false, dce: false, deleteLoops: false };

  it('hand-worked: 11 instructions per iteration, 9 after inlining, 7 after hoisting; n = 1,000 costs 11,006, 9,006 and 7,008', () => {
    expect(per(none)).toBe(11);
    expect(per({ ...none, inlining: true })).toBe(9);
    expect(per({ ...none, inlining: true, hoisting: true })).toBe(7);
    const total = (o: LoopOptions) => run(optimiseLoop(loopProgram(true), o).program, [x, 1000]).executed;
    expect([total(none), total({ ...none, inlining: true }), total({ ...none, inlining: true, hoisting: true })]).toEqual([11006, 9006, 7008]);
  });

  it('inlining removes the call and hoisting moves k and q out of the loop, and k alone without inlining', () => {
    const inlined = inline(loopProgram(true));
    expect(inlined.program.blocks.flatMap((b) => b.instrs).some((i) => i.op === 'call')).toBe(false);
    expect(licm(inlined.program).touched.sort()).toEqual(['k', 'q']);
    expect(licm(loopProgram(true)).touched).toEqual(['k']);
  });

  it('hoisting costs two instructions when the loop runs zero times', () => {
    const before = loopView(none, true, x, 0);
    const after = loopView({ ...none, inlining: true, hoisting: true }, true, x, 0);
    expect(before.afterRun.executed).toBe(6);
    expect(after.afterRun.executed).toBe(8);
  });

  it('loop removal needs an unused result: it is refused, with the reason, when the result is printed', () => {
    const used = optimiseLoop(loopProgram(true), { inlining: true, hoisting: true, dce: true, deleteLoops: true });
    expect(used.blocker).toContain('s');
    expect(used.program.blocks.map((b) => b.label)).toEqual(['entry', 'loop', 'body', 'exit']);
    const ignored = optimiseLoop(loopProgram(false), { inlining: true, hoisting: true, dce: true, deleteLoops: true });
    expect(ignored.blocker).toBeNull();
    expect(ignored.program.blocks.map((b) => b.label)).toEqual(['entry', 'exit']);
    expect(run(ignored.program, [x, 1000]).executed).toBe(2);
  });

  it('DCE alone leaves the loop counting (5 per iteration), because the counter still decides when to stop', () => {
    const dceOnly = optimiseLoop(loopProgram(false), { inlining: true, hoisting: true, dce: true, deleteLoops: false }).program;
    expect(run(dceOnly, [x, 1000]).executed).toBe(5005);
  });

  it('a loop that stores is never deleted, even when its result is unused', () => {
    const withStore = loopProgram(false);
    withStore.blocks[2].instrs.splice(0, 0, { op: 'store', addr: 5, val: 'x' });
    const r = deleteLoop(withStore);
    expect(r.changed).toBe(0);
    expect(r.blocker).toContain('stores');
  });
});

describe('the refusals', () => {
  it('the 2 x 2 aliasing table is computed by running four programs: only the false promise differs', () => {
    const cells = aliasView(false, false).cells;
    expect(cells.map((c) => [c.promise, c.same, c.agree])).toEqual([
      [false, false, true],
      [false, true, true],
      [true, false, true],
      [true, true, false],
    ]);
    const bad = cells.find((c) => !c.agree)!;
    expect([bad.original, bad.optimised]).toEqual([2, 1]);
  });

  it('forwarding is refused without the promise and made with it, and the original keeps its load', () => {
    expect(forwardLoads(ALIAS_PROGRAM, { noAlias: false }).refused).toHaveLength(1);
    expect(forwardLoads(ALIAS_PROGRAM, { noAlias: false }).changed).toBe(0);
    const promised = aliasView(false, true);
    expect(promised.compared.afterRun.loads).toBe(0);
    expect(promised.compared.beforeRun.loads).toBe(1);
  });

  it('x * 0: the float rewrite is refused and real JavaScript shows why; the int rewrite is sound for 2,000 seeded ints', () => {
    expect(Object.is(times(Infinity, 0), NaN)).toBe(true);
    expect(Object.is(times(-3, 0), -0)).toBe(true);
    expect(floatRow('f64', Infinity).agree).toBe(false);
    expect(floatRow('f64', -3).agree).toBe(false);
    expect(floatRow('f64', 5).agree).toBe(true);
    const f = algebra(timesZero('f64'));
    expect(f.changed).toBe(0);
    expect(f.refused[0]).toContain('NaN');
    const i = algebra(timesZero('i32'));
    expect(i.changed).toBe(1);
    for (const x of seededInts(6, 2000, 2 ** 32)) {
      expect(run(timesZero('i32'), [x]).value).toBe(0);
      expect(run(i.program, [x]).value).toBe(0);
    }
  });

  it('x + 0 is refused for floats because -0 + 0 is +0 in real JavaScript', () => {
    expect(Object.is(-0 + 0, 0)).toBe(true);
    const p: Program = { params: ['x'], funcs: {}, blocks: [{ label: 'entry', instrs: [{ op: 'bin', kind: 'add', dst: 'r', a: 'x', b: 0, ty: 'f64' }, { op: 'ret', a: 'r' }] }] };
    const r = algebra(p);
    expect(r.changed).toBe(0);
    expect(r.refused).toHaveLength(1);
  });

  it('reassociation: (1e16 + -1e16) + 1 is 1 and 1e16 + (-1e16 + 1) is 0, and the model reports the same', () => {
    expect((1e16 + -1e16) + 1).toBe(1);
    expect(1e16 + (-1e16 + 1)).toBe(0);
    const r = reassocView(1e16, -1e16, 1);
    expect([r.left, r.right, r.differ]).toEqual([1, 0, true]);
    expect(run(LEFT_ASSOC, [1e16, -1e16, 1]).value).toBe(1);
    expect(run(RIGHT_ASSOC, [1e16, -1e16, 1]).value).toBe(0);
    expect(reassocView(1, 2, 3).differ).toBe(false);
  });
});

describe('SSA', () => {
  it('the phi form evaluates equal to the non-SSA snippet for both branch values', () => {
    for (const c of [0, 1]) expect(run(SSA_PROGRAM, [c]).value).toBe(ssaSourceResult(c));
    expect(run(SSA_PROGRAM, [1]).value).toBe(3);
    expect(run(SSA_PROGRAM, [0]).value).toBe(2);
  });

  it('every name has exactly one definition, so a click finds a single line', () => {
    const view = ssaView(true);
    for (const name of ['x1', 'x2', 'x3', 'y']) expect(view.where(name).def, name).not.toBeNull();
    expect(view.where('x3').uses).toHaveLength(1);
    expect(view.where('c').def).toBeNull();
  });
});
