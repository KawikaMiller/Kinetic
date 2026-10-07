import { describe, expect, it } from 'vitest';
import { pct } from '../../core/format';
import { captionText } from '../../core/testing/captions';
import { MAX_STEPS, byName, hottestLeaf, profileFrames } from './frames';
import { HOT_LEAF, NO_FIXES, SAMPLE_STEPS, foldStacks, margin95, program, sample, timeline, trueShare, type Fixes } from './model';
import { laneBars } from './view';

const FIXES: Fixes[] = [NO_FIXES, { hoist: true, fastJson: false }, { hoist: false, fastJson: true }, { hoist: true, fastJson: true }];

describe('profile frames over every fix × sample count × seed', () => {
  it('build up to the full sample set and end on a summary computed from those samples', () => {
    for (const fixes of FIXES)
      for (const n of SAMPLE_STEPS)
        for (const seed of [1, 2, 3, 4, 5]) {
          const { frames, samples, segs } = profileFrames(fixes, n, seed);
          expect(frames).toHaveLength(Math.min(n, MAX_STEPS) + 2);
          expect(frames.at(-1)!.shown).toBe(n);
          frames.slice(1, -1).forEach((f, i) => {
            expect(f.shown).toBeGreaterThan(frames[i].shown);
            expect(f.latest).toBe(samples[f.shown - 1]);
          });
          const text = captionText(frames.at(-1)!.say);
          const root = foldStacks(samples);
          const hot = hottestLeaf(root);
          expect(text).toContain(`renderPage is on the stack in ${pct(byName(root, 'renderPage').total / n)}`);
          expect(text).toContain(`only ${pct(byName(root, 'renderPage').self / n)} are its own work`);
          expect(text).toContain(`widest leaf is ${hot.name} at ${pct(hot.self / n)}`);
          expect(text.includes('modelled on-CPU time')).toBe(fixes.hoist || fixes.fastJson);
          // The off-CPU note appears exactly when a batch jumps over the database wait.
          const wait = segs.find((s) => !s.onCpu)!;
          const notes = frames.filter((f) => captionText(f.say).includes('off the CPU'));
          expect(notes.length).toBeLessThanOrEqual(1);
          for (const f of frames.slice(1, -1)) {
            const t = captionText(f.say);
            if (!t.includes('off the CPU')) expect(t).toContain(f.latest!.stack.join(' → '));
          }
          const crossed = samples.some((s) => s.at > wait.end) && samples.some((s) => s.at < wait.start);
          if (!crossed) expect(notes).toHaveLength(0);
        }
  });
});

describe('quiz and try-this numbers come from the model', () => {
  const segs = timeline(program(NO_FIXES));
  it('renderPage: wide in total, about 5% self', () => {
    expect(Math.round(trueShare(segs, 'renderPage', 'self') * 100)).toBe(5);
    expect(trueShare(segs, 'renderPage', 'total')).toBeGreaterThan(0.7);
  });
  it('the ± margin for a ~65% share: about 21 points at 20 samples, 3 at 1,000', () => {
    const share = trueShare(segs, HOT_LEAF, 'self');
    expect(Math.round(share * 100)).toBe(65);
    expect(Math.round(margin95(share, 20) * 100)).toBe(21);
    expect(Math.round(margin95(share, 1000) * 100)).toBe(3);
  });
  it('logLine runs last but is sorted before parseJson', () => {
    const top = segs.map((s) => s.stack[1]).filter(Boolean);
    expect(top.at(-1)).toBe('logLine');
    const order = foldStacks(sample(segs, 300, 1)).children[0].children.map((c) => c.name);
    expect(order.indexOf('logLine')).toBe(order.indexOf('parseJson') - 1);
  });
});

describe('timeline lanes', () => {
  it('are solid while a function is on the stack, dashed only for the function waiting off the CPU', () => {
    const segs = timeline(program(NO_FIXES));
    const names = [...new Set(segs.flatMap((s) => s.stack))];
    const bars = laneBars(segs, names);
    expect(bars.filter((b) => b.kind === 'blocked').map((b) => b.lane)).toEqual(['db.query']);
    for (const name of names) {
      const onStack = segs.filter((s) => s.stack.includes(name)).reduce((a, s) => a + s.end - s.start, 0);
      const drawn = bars.filter((b) => b.lane === name).reduce((a, b) => a + b.end - b.start, 0);
      expect(drawn).toBeCloseTo(onStack, 9);
    }
  });
});
