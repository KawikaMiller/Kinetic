import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { WORKLOADS, fmtTime, race } from './costModel';
import { raceFrames, stepFrames, type Strategy } from './frames';
import { LINE_OF_NODE, NODES, SOURCE } from './program';
import { printFn, SUM_SQUARES, type Value } from './lang';

const realJs = new Function(`${printFn(SUM_SQUARES).lines.join('\n')}\nreturn sumSquares;`)() as (n: Value) => number;
const STRATEGIES: Strategy[] = ['tree', 'vm', 'native'];
const ARGS: Value[] = [3, '3'];

describe('step-through captions, every strategy × argument', () => {
  for (const s of STRATEGIES) {
    for (const arg of ARGS) {
      it(`${s} ${JSON.stringify(arg)}`, () => {
        const frames = stepFrames(s, arg);
        const texts = frames.map((f) => captionText(f.say));
        for (const t of texts) {
          expect(t.length).toBeGreaterThan(10);
          expect(t).not.toMatch(/undefined|NaN|null/);
        }
        const last = frames.at(-1)!;
        const final = texts.at(-1)!;
        expect(last.done).toBe(true);
        const deopt = s === 'native' && typeof arg === 'string';
        expect(last.deopt).toBe(deopt);
        // The answer the final caption reports is real JavaScript's.
        expect(final).toContain(String(realJs(arg)));
        if (deopt) expect(final).toMatch(/^Deoptimised/);
        else expect(final).toMatch(/^Done: /);
        // The count shown on the last frame is the number of operation frames.
        expect(last.count).toBe(frames.length - 1);
        expect(final).toContain(last.count.toLocaleString('en-US'));
      });
    }
  }

  it('a mixed number/string comparison is called out only when it happens', () => {
    const num = stepFrames('vm', 3).map((f) => captionText(f.say));
    const str = stepFrames('vm', '3').map((f) => captionText(f.say));
    expect(num.some((t) => t.includes('compare as numbers'))).toBe(false);
    expect(str.filter((t) => t.includes('compare as numbers'))).toHaveLength(4);
  });

  it('every tree node maps to the source line it is written on', () => {
    for (const [id, node] of NODES) {
      const line = LINE_OF_NODE.get(id);
      if (node.kind === 'fn') expect(line).toBe(0);
      else {
        expect(line).toBeDefined();
        if (node.kind === 'var' || node.kind === 'num') expect(SOURCE.lines[line!]).toMatch(new RegExp(`\\b${node.kind === 'var' ? node.name : node.value}\\b`));
      }
    }
  });
});

describe('race captions, every workload × AOT build setting', () => {
  for (const w of WORKLOADS) {
    for (const countBuild of [true, false]) {
      it(`${w.id}, build ${countBuild ? 'counted' : 'ahead'}`, () => {
        const r = race(w, { countBuild });
        const frames = raceFrames(r);
        const texts = frames.map((f) => captionText(f.say));
        for (const t of texts) expect(t).not.toMatch(/undefined|NaN|null/);
        // Moments run forward, and no two frames print the same time.
        for (let i = 1; i < frames.length - 1; i++) expect(frames[i].now).toBeGreaterThan(frames[i - 1].now);
        const stamps = texts.slice(0, -1).map((t) => t.split(':')[0]);
        expect(new Set(stamps).size).toBe(stamps.length);

        // Every lane's finish (or failure) is narrated once, at its time.
        for (const l of r.lanes) {
          const said = texts.filter((t) => t.includes(`${l.name} finishes`) || (l.failed && t.includes(l.failed)));
          expect(said).toHaveLength(1);
          if (!l.failed) expect(said[0]).toContain(fmtTime(l.total));
        }

        // The verdict names the fastest lane, found here by sorting independently.
        const verdict = texts.at(-1)!;
        const fastest = r.lanes.filter((l) => !l.failed).reduce((a, b) => (b.total < a.total ? b : a));
        expect(verdict.startsWith(`${fastest.name} finished first`)).toBe(true);
        const hot = r.jitEvents.some((e) => e.kind === 'hot');
        expect(verdict.includes('never got hot')).toBe(!hot);
        expect(verdict.includes('deoptimisation')).toBe(r.jitEvents.some((e) => e.kind === 'deopt'));
        expect(verdict.includes('flip it to "built ahead"')).toBe(countBuild && fastest.id !== 'aot' && !r.lanes.find((l) => l.id === 'aot')!.failed);
      });
    }
  }
});
