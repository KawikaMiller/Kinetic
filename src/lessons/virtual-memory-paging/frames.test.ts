import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { accessFrames, hex4, thrashFrames } from './frames';
import lesson from './index';
import { access, ADDRESS_PRESETS, BELADY_REFS, simulate, startMachine, usefulShare, type Access, type Policy } from './model';
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
      expect(text).toContain(`${last.m.faults} faults (${last.m.major} major, from disk; ${last.m.minor} minor)`);
      expect(text).toContain(`${last.m.hits} hit`);
      const share = usefulShare(last.m);
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

describe('the victim caption follows where a clean page can be restored from', () => {
  it('zero-fill pages are "never written", file or swap pages have a copy on disk; both branches occur', () => {
    const reads: Access[] = [];
    for (const proc of ['A', 'B'] as const) for (const vpn of [4, 5, 6, 13, 14, 1, 3, 15]) reads.push({ proc, vaddr: vpn * 0x1000, write: false });
    let m = startMachine();
    const seen = { zero: 0, disk: 0 };
    for (const policy of POLICIES) {
      m = startMachine();
      for (const a of [...reads, ...reads]) {
        const frames = accessFrames(m, a, policy);
        const r = access(m, a, policy);
        r.steps.forEach((s, i) => {
          if (s.kind !== 'victim') return;
          const text = captionText(frames[i].say);
          const dirty = s.evicted!.some((o) => m.tables[o.proc][o.vpn].dirty);
          const zero = s.evicted!.every((o) => m.tables[o.proc][o.vpn].backing === 'zero');
          expect(text.includes('never written')).toBe(!dirty && zero);
          expect(text.includes('copy on disk')).toBe(!dirty && !zero);
          if (!dirty) seen[zero ? 'zero' : 'disk']++;
        });
        m = r.m;
      }
    }
    expect(seen.zero).toBeGreaterThan(0);
    expect(seen.disk).toBeGreaterThan(0);
  });
  it('major faults are exactly the loads from swap or the program file', () => {
    let m = startMachine();
    for (const p of ADDRESS_PRESETS) {
      const r = access(m, p.access, 'fifo');
      const load = r.steps.find((s) => s.kind === 'load');
      const shared = r.steps.some((s) => s.kind === 'shared');
      expect(r.m.major - m.major).toBe(load && load.from !== 'zero' ? 1 : 0);
      expect(r.m.minor - m.minor).toBe((load && load.from === 'zero') || shared ? 1 : 0);
      m = r.m;
    }
  });
});
