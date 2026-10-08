import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ASYNC_SRC, CALLER_SRC, COMBINATORS, DESUGARED_SRC, DURATION, HELPERS, MACHINE, PITFALLS, REQS, SHAPE_CODE, predict, reasonOf, shapeRun, valueOf,
  type Combinator, type Outcome, type ReqId, type ReqSetting, type Settled, type Shape,
} from './model';

// Tests may run on-screen snippets as real JS (CLAUDE.md); none of this text comes from a learner.

describe('sequential vs parallel, against real JavaScript with fake timers', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'Date'], now: 0 }));
  afterEach(() => vi.useRealTimers());

  for (const shape of ['sequential', 'all', 'startFirst'] as Shape[]) {
    it(shape, async () => {
      const seen: Record<string, { start: number; end: number }> = {};
      const req = (id: ReqId) => () => {
        const start = Date.now();
        return new Promise((res) => setTimeout(() => {
          seen[id] = { start, end: Date.now() };
          res(valueOf(id));
        }, DURATION[id]));
      };
      const load = new Function('a', 'b', 'c', `${SHAPE_CODE[shape].join('\n')}\nreturn load;`)(req('a'), req('b'), req('c')) as () => Promise<string[]>;
      let doneAt = -1;
      const p = load().then((v) => {
        doneAt = Date.now();
        return v;
      });
      await vi.runAllTimersAsync();
      expect(await p).toEqual(['A', 'B', 'C']);
      const model = shapeRun(shape);
      for (const r of model.requests) expect(seen[r.id]).toEqual({ start: r.start, end: r.end });
      expect(doneAt).toBe(model.total);
    });
  }

  it('sequential total is the sum, parallel is the max', () => {
    const sum = REQS.reduce((a, id) => a + DURATION[id], 0);
    const max = Math.max(...REQS.map((id) => DURATION[id]));
    expect(shapeRun('sequential').total).toBe(sum);
    expect(shapeRun('all').total).toBe(max);
    expect(shapeRun('startFirst').total).toBe(max);
  });
});

/** The lab's whole grid: every time each request can be set to (ties included), for every outcome. */
const UI_TIMES = [100, 200, 300, 500];
const TIMINGS: number[][] = UI_TIMES.flatMap((ta) => UI_TIMES.flatMap((tb) => UI_TIMES.map((tc) => [ta, tb, tc])));
const OUTCOMES: Outcome[][] = Array.from({ length: 8 }, (_, m) => REQS.map((_, i) => ((m >> i) & 1 ? 'reject' : 'resolve')));

const describeReal = (s: PromiseSettledResult<string>[]) => `[${s.map((r) => (r.status === 'fulfilled' ? `fulfilled "${r.value}"` : `rejected ${(r.reason as Error).message}`)).join(', ')}]`;

async function runReal(c: Combinator, s: Record<ReqId, ReqSetting>): Promise<Settled> {
  const make = (id: ReqId) => new Promise<string>((res, rej) => setTimeout(() => (s[id].outcome === 'resolve' ? res(valueOf(id)) : rej(new Error(reasonOf(id)))), s[id].at));
  const ps = REQS.map(make);
  // Keep stray rejections (the ones a combinator ignores) from reaching the test runner.
  ps.forEach((p) => p.catch(() => {}));
  let out: Settled | null = null;
  const settle = (status: 'fulfilled' | 'rejected', x: unknown) => {
    const at = Date.now();
    if (status === 'rejected') {
      const e = x as Error;
      out = { status, at, reason: e instanceof AggregateError ? `AggregateError: ${e.errors.map((er: Error) => er.message).join(', ')}` : e.message };
    } else {
      const value = c === 'allSettled' ? describeReal(x as PromiseSettledResult<string>[]) : Array.isArray(x) ? `[${x.map((v) => `"${v}"`).join(', ')}]` : `"${x}"`;
      out = { status, at, value };
    }
  };
  const combined = c === 'all' ? Promise.all(ps) : c === 'allSettled' ? Promise.allSettled(ps) : c === 'race' ? Promise.race(ps) : Promise.any(ps);
  combined.then((v) => settle('fulfilled', v), (e) => settle('rejected', e));
  await vi.runAllTimersAsync();
  return out!;
}

describe('combinators: the model matches real Promise.all / allSettled / race / any', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'Date'], now: 0 }));
  afterEach(() => vi.useRealTimers());

  for (const c of COMBINATORS) {
    it(`${c}: every outcome × every UI timing (512 cases)`, async () => {
      for (const times of TIMINGS) {
        for (const outs of OUTCOMES) {
          vi.setSystemTime(0);
          const s = Object.fromEntries(REQS.map((id, i) => [id, { outcome: outs[i], at: times[i] }])) as Record<ReqId, ReqSetting>;
          expect(await runReal(c, s), `${c} ${outs.join(',')} @ ${times.join(',')}`).toEqual(predict(c, s));
        }
      }
    });
  }

  it('all rejects on the first rejection while the others keep running', () => {
    const s: Record<ReqId, ReqSetting> = { a: { outcome: 'resolve', at: 300 }, b: { outcome: 'reject', at: 100 }, c: { outcome: 'resolve', at: 200 } };
    expect(predict('all', s)).toEqual({ status: 'rejected', at: 100, reason: 'b failed' });
  });
});

describe('the coroutine as a state machine', () => {
  async function output(fnSrc: string[]): Promise<string[]> {
    const lines: string[] = [];
    const fakeConsole = { log: (s: string) => lines.push(s) };
    new Function('console', [...HELPERS, ...fnSrc, ...CALLER_SRC].join('\n'))(fakeConsole);
    await new Promise((r) => setTimeout(r, 5));
    return lines;
  }

  it('the desugared switch prints exactly what the async function prints', async () => {
    const real = await output(ASYNC_SRC);
    expect(real).toEqual(['main: calling checkout', 'checkout: start', 'main: carries on', 'cart has 3 items', 'total 30', 'main: checkout done, 30']);
    expect(await output(DESUGARED_SRC)).toEqual(real);
  });

  it('the step-through prints the same lines, in the same order', async () => {
    expect(MACHINE.map((s) => s.printed).filter((x) => x !== null)).toEqual(await output(ASYNC_SRC));
  });

  it('each step lights real lines, and the frame state matches the switch case it is in', () => {
    for (const s of MACHINE) {
      if (s.asyncLine >= 0) expect(ASYNC_SRC[s.asyncLine]).toBeDefined();
      if (s.sugarLine >= 0) expect(DESUGARED_SRC[s.sugarLine]).toBeDefined();
      // The line that prints: the caller's while main (or its callback) runs, else checkout's.
      if (s.printed) {
        const callerRuns = s.stack[0] === 'main' || s.sugarLine < 0;
        expect(callerRuns ? CALLER_SRC[s.callerLine] : DESUGARED_SRC[s.sugarLine]).toContain('console.log');
      }
      if (s.frame && s.sugarLine >= 0) {
        const caseLine = DESUGARED_SRC.slice(0, s.sugarLine + 1).map((l, i) => [l, i] as const).filter(([l]) => /case \d:/.test(l)).at(-1);
        const stateSet = DESUGARED_SRC.slice(caseLine ? caseLine[1] : 0, s.sugarLine + 1).find((l) => /frame\.state = \d/.test(l));
        if (caseLine && !stateSet) expect(caseLine[0]).toContain(`case ${s.frame.state}:`);
      }
      // Suspended means nothing of checkout is on the stack.
      if (s.suspended) expect(s.stack.some((f) => f.startsWith('checkout') || f.startsWith('step'))).toBe(false);
    }
  });
});

describe('pitfalls: the console lines are what Node really prints', () => {
  // The app's tsconfig has no Node types (adding them would change timer types app-wide), so the
  // child-process API is loaded at run time with just the shape this test uses.
  type Spawn = (cmd: string, args: string[], o: { encoding: 'utf8'; timeout: number }) => { stdout: string; stderr: string; status: number | null };
  const nodePath = (globalThis as unknown as { process: { execPath: string } }).process.execPath;
  let spawnSync: Spawn;
  beforeAll(async () => {
    const moduleName = 'node:child_process';
    spawnSync = ((await import(/* @vite-ignore */ moduleName)) as { spawnSync: Spawn }).spawnSync;
  });
  const run = (code: string[]) => spawnSync(nodePath, ['-e', code.join(String.fromCharCode(10))], { encoding: 'utf8', timeout: 10_000 });
  for (const p of PITFALLS) {
    it(`${p.id}: as written`, () => {
      const r = run(p.code);
      expect(r.stdout.trim().split('\n').filter(Boolean)).toEqual(p.out);
      if (p.unhandled) {
        // Node's default for an unhandled rejection: print the error and exit with code 1.
        expect(r.status).toBe(1);
        expect(r.stderr).toContain(p.unhandled.replace('Uncaught (in promise) ', ''));
      } else expect(r.status).toBe(0);
    });
    it(`${p.id}: fixed`, () => {
      const r = run(p.fixed);
      expect(r.status).toBe(0);
      expect(r.stdout.trim().split('\n').filter(Boolean)).toEqual(p.fixedOut);
    });
  }
});
