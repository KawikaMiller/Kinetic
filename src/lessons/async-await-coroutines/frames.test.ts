import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { combinatorCaption, machineFrames, pitfallCaption, shapeFrames } from './frames';
import { COMBINATORS, DURATION, MACHINE, PITFALLS, REQS, predict, shapeRun, type Outcome, type ReqId, type ReqSetting, type Shape } from './model';

describe('sequential vs parallel captions', () => {
  for (const shape of ['sequential', 'all', 'startFirst'] as Shape[]) {
    it(shape, () => {
      const frames = shapeFrames(shape);
      const texts = frames.map((f) => captionText(f.say));
      const run = shapeRun(shape);
      for (const t of texts) expect(t).not.toMatch(/undefined|NaN/);
      expect(texts.at(-1)).toContain(`returns at ${run.total} ms`);
      expect(texts.at(-1)!.includes('add up')).toBe(shape === 'sequential');
      // Each request's start and end is narrated at its own time.
      for (const r of run.requests) {
        expect(texts.some((t) => t.startsWith(`At ${r.start} ms`) && t.includes(`${r.id}()`))).toBe(true);
        expect(texts.some((t) => t.startsWith(`At ${r.end} ms`) && t.includes(`${r.id}()`))).toBe(true);
      }
      // "suspended" only while some await is actually waiting.
      frames.slice(0, -1).forEach((f, i) => {
        const waiting = run.waits.some((w) => w.start <= f.now && f.now < w.end);
        expect(texts[i].includes('suspended')).toBe(waiting);
      });
    });
  }
});

describe('combinator caption, every outcome × time setting', () => {
  const TIMES = [100, 200, 300, 500];
  it('names the real settle time and only the requests still running', () => {
    for (let m = 0; m < 8; m++) {
      for (const ta of TIMES) for (const tb of TIMES) for (const tc of TIMES) {
        const outs: Outcome[] = REQS.map((_, i) => ((m >> i) & 1 ? 'reject' : 'resolve'));
        const at = { a: ta, b: tb, c: tc };
        const s = Object.fromEntries(REQS.map((id, i) => [id, { outcome: outs[i], at: at[id] }])) as Record<ReqId, ReqSetting>;
        for (const c of COMBINATORS) {
          const r = predict(c, s);
          const text = captionText(combinatorCaption(c, s));
          expect(text).toContain(`at ${r.at} ms`);
          const running = REQS.filter((id) => s[id].at > r.at);
          expect(text.includes('keep')).toBe(running.length > 0);
          for (const id of running) expect(text).toContain(`${id}()`);
        }
      }
    }
  });
});

describe('state machine frames', () => {
  it('the console accumulates exactly the printed lines', () => {
    const frames = machineFrames();
    expect(frames).toHaveLength(MACHINE.length);
    expect(frames.at(-1)!.printed).toEqual(MACHINE.map((s) => s.printed).filter(Boolean));
  });
});

describe('pitfall captions', () => {
  for (const p of PITFALLS) {
    for (const fixed of [false, true]) {
      it(`${p.id} fixed=${fixed}`, () => {
        const text = captionText(pitfallCaption(p, fixed));
        if (fixed) for (const l of p.fixedOut) expect(text).toContain(`"${l}"`);
        else expect(text.includes('unhandled rejection')).toBe(p.unhandled !== null);
      });
    }
  }
});

it('durations are the spec\'s illustrative 300 / 500 / 200 ms', () => {
  expect(DURATION).toEqual({ a: 300, b: 500, c: 200 });
});
