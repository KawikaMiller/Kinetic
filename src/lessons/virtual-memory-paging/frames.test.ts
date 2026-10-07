import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { accessFrames, hex4, thrashFrames } from './frames';
import lesson from './index';
import { access, ADDRESS_PRESETS, BELADY_REFS, simulate, startMachine, usefulShare, type Policy } from './model';
import { sceneGeometry } from './layout';

const POLICIES: Policy[] = ['fifo', 'clock'];

describe('accessFrames: every preset, from the start and in sequence, both policies', () => {
  for (const policy of POLICIES) {
    it(`${policy}: one frame per step, each caption true to its step`, () => {
      let m = startMachine();
      for (const p of ADDRESS_PRESETS) {
        for (const before of [startMachine(), m]) {
          const r = access(before, p.access, policy);
          const frames = accessFrames(before, p.access, policy);
          expect(frames).toHaveLength(r.steps.length);
          frames.forEach((f, i) => {
            const s = r.steps[i];
            const text = captionText(f.say);
            expect(f.step).toEqual(s);
            if (s.kind === 'split') expect(text).toContain(hex4(p.access.vaddr));
            if (s.kind === 'done') expect(text).toContain(`physical ${hex4(s.paddr!)}`);
            if (s.kind === 'segv') expect(text).toContain('Segmentation fault');
            if (s.kind === 'victim') {
              const dirty = s.evicted!.some((o) => before.tables[o.proc][o.vpn].dirty);
              expect(text.includes("It's dirty")).toBe(dirty);
              expect(text).toContain(`frame ${s.frame}`);
            }
            if (s.kind === 'load') expect(text.includes('from swap')).toBe(s.from === 'swap');
            // the scene can be laid out for every frame
            expect(sceneGeometry(f).width).toBeGreaterThan(0);
          });
        }
        m = access(m, p.access, policy).m;
      }
    });
  }
});

describe('thrashFrames', () => {
  for (const policy of POLICIES) {
    it(`${policy}: the summary's counts and useful share come from the run`, () => {
      const frames = thrashFrames(policy);
      const last = frames.at(-1)!;
      const text = captionText(last.say);
      expect(text).toContain(`${last.m.faults} faults`);
      expect(text).toContain(`${last.m.hits} hit`);
      const share = usefulShare(last.m.hits, last.m.faults);
      expect(share).toBeLessThan(0.01);
    });
  }
});

describe('quiz numbers', () => {
  it("Q4: Bélády's string gives 9 faults with 3 frames and 10 with 4", () => {
    const q = lesson.quiz[3];
    expect(q.q).toContain(`causes ${simulate(BELADY_REFS, 3, 'fifo').faults} page faults`);
    expect(q.options[q.answer]).toBe(`${simulate(BELADY_REFS, 4, 'fifo').faults} faults`);
  });
  it('Q2: A and B at 0xF800 land in different frames', () => {
    const a = access(startMachine(), { proc: 'A', vaddr: 0xf800, write: true }, 'fifo');
    const b = access(a.m, { proc: 'B', vaddr: 0xf800, write: true }, 'fifo');
    expect(a.paddr).not.toBe(b.paddr);
  });
});
