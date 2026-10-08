import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { lazyFrames, passFrames, protoFrames } from './frames';
import {
  FILE_TEXT, FILTERS, PASS_CODE, PROGRAMS, PROGRAM_CODE, RANGE_TO, SOURCES, SOURCE_CODE, TAKES, countdownResults, eagerRun, forBreakRun, lazyRun, naturalsRun,
  showResult, twoPasses,
} from './model';

/** Run fixed, on-screen snippet text as real JavaScript. Test-only; never learner input. */
const run = (src: string, ...args: [string, unknown][]) => new Function(...args.map(([n]) => n), src)(...args.map(([, v]) => v));

/** The first k squares (of 1, 2, 3…) that pass the filter: an independent brute-force reference. */
function reference(test: (x: number) => boolean, k: number) {
  const out: number[] = [];
  let i = 0;
  while (out.length < k) {
    i++;
    if (test(i * i)) out.push(i * i);
  }
  return { out, pulled: i };
}

describe('scene 1: eager vs lazy', () => {
  it('lazy and eager give the same values as a brute-force reference, for every filter and take', () => {
    for (const f of FILTERS) {
      for (const n of TAKES) {
        const ref = reference(f.test, n);
        expect(lazyRun(f.value, n).result).toEqual(ref.out);
        expect(eagerRun(f.value, n).result).toEqual(ref.out);
        // The lazy pipeline pulls exactly as many values from range as the reference needed.
        expect(lazyRun(f.value, n).events.at(-1)!.counts.range).toBe(ref.pulled);
      }
    }
  });

  it('the default preset (even, take 3) pulls exactly 6 values and returns [4, 16, 36]', () => {
    const { result, events } = lazyRun('even', 3);
    expect(result).toEqual([4, 16, 36]);
    expect(events.at(-1)!.counts).toEqual({ range: 6, map: 6, filter: 6, take: 3 });
    expect(events.filter((e) => e.dropped).map((e) => e.value)).toEqual([1, 9, 25]);
  });

  it('eager does the full million at every stage', () => {
    const e = eagerRun('even', 3);
    expect([e.squared, e.filtered, e.arrays]).toEqual([RANGE_TO, RANGE_TO, 4]);
    expect(e.elements).toBe(RANGE_TO + RANGE_TO + RANGE_TO / 2 + 3);
  });

  it('frames: the last captions quote the real counts', () => {
    expect(captionText(lazyFrames('even', 3).at(-1)!.say)).toContain('pulling only 6 of 1,000,000');
    for (const f of FILTERS) for (const n of TAKES) expect(lazyFrames(f.value, n).at(-1)!.result).toEqual(lazyRun(f.value, n).result);
  });
});

describe('scene 2: the protocol is what real JavaScript does', () => {
  const nextCalls = (src: string) => {
    const it = run(`${src}\nreturn countdown(3);`) as Iterator<number>;
    return [it.next(), it.next(), it.next(), it.next()];
  };

  it('the hand-written and function* countdowns on screen return the same { value, done } as the model', () => {
    const expected = ['{ value: 3, done: false }', '{ value: 2, done: false }', '{ value: 1, done: false }', '{ value: undefined, done: true }'];
    expect(nextCalls(PROGRAM_CODE.hand.def.join('\n')).map(showResult)).toEqual(expected);
    expect(nextCalls(PROGRAM_CODE.gen.def.join('\n')).map(showResult)).toEqual(expected);
    expect(countdownResults('hand').map(showResult)).toEqual(expected);
    expect(countdownResults('gen').map(showResult)).toEqual(expected);
  });

  it('the frames print exactly those results, in order', () => {
    for (const p of ['hand', 'gen'] as const) expect(protoFrames(p).at(-1)!.printed).toEqual(countdownResults(p).map(showResult));
  });

  it('a suspended generator is never on the call stack, and it is parked exactly while suspended', () => {
    for (const { value } of PROGRAMS) {
      for (const f of protoFrames(value)) {
        const onStack = f.stack.some((s) => s.id === 'gen');
        if (onStack) expect(f.parked).toBeNull();
      }
    }
    const gen = protoFrames('gen');
    expect(gen.filter((f) => f.parked?.includes('paused at yield')).length).toBe(3);
  });

  it('for…of + break: real output is 3 then cleanup, and break calls return()', () => {
    const logs: string[] = [];
    run([...PROGRAM_CODE.forBreak.def, ...PROGRAM_CODE.forBreak.caller].join('\n'), ['console', { log: (s: unknown) => logs.push(String(s)) }]);
    expect(logs).toEqual(['3', 'cleanup']);
    const r = forBreakRun();
    expect(r.printed).toEqual(logs);
    expect(r.calls).toEqual(['[Symbol.iterator]()', 'next() → { value: 3, done: false }', 'next() → { value: 2, done: false }', 'return()']);
    expect(protoFrames('forBreak').at(-1)!.printed).toEqual(logs);
  });

  it('take(naturals(), 3) finishes after pulling exactly 3', () => {
    const takeSrc = 'function* take(it, k) { if (k <= 0) return; for (const x of it) { yield x; if (--k === 0) return; } }';
    const logs: unknown[] = [];
    run([...PROGRAM_CODE.naturals.def, takeSrc, ...PROGRAM_CODE.naturals.caller].join('\n'), ['console', { log: (s: unknown) => logs.push(s) }]);
    expect(logs).toEqual([[1, 2, 3]]);
    expect(naturalsRun(3)).toEqual({ result: [1, 2, 3], pulled: 3 });
  });
});

describe('scene 3: single pass', () => {
  it('real JavaScript: iterators are spent after one pass, iterables are not', () => {
    for (const s of SOURCES) {
      const logs: unknown[] = [];
      run([...SOURCE_CODE[s.value], ...PASS_CODE].join('\n'), ['console', { log: (x: unknown) => logs.push(x) }], ['accessLog', FILE_TEXT]);
      expect(logs).toEqual(twoPasses(s.value));
    }
    expect(twoPasses('generator')[1]).toEqual([]);
    expect(twoPasses('file')[1]).toEqual([]);
    expect(twoPasses('array')[1]).toEqual([1, 2, 3]);
    expect(twoPasses('iterable')[1]).toEqual([1, 2, 3]);
  });

  it('frames end on the second pass, captioned for the right kind of source', () => {
    for (const s of SOURCES) {
      const last = passFrames(s.value).at(-1)!;
      expect(last.second).toEqual(twoPasses(s.value)[1]);
      expect(captionText(last.say)).toContain(last.second!.length ? 'is an iterable' : 'is an iterator');
    }
  });
});
