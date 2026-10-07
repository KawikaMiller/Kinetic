import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { outcomeText, switchFrames } from './frames';
import lesson from './index';
import { fire, overhead, OVERHEAD_BAD, sandboxStart, switchScript, type IrqSource, type SwitchKind } from './model';

const COMBOS: [SwitchKind, boolean][] = [
  ['involuntary', true],
  ['involuntary', false],
  ['voluntary', true],
  ['voluntary', false],
];

describe('switchFrames, every combination of the two toggles', () => {
  for (const [kind, same] of COMBOS) {
    it(`${kind}, ${same ? 'same process' : 'two processes'}: true captions at every step`, () => {
      const sc = switchScript(kind, same);
      const frames = switchFrames(sc, kind);
      expect(frames).toHaveLength(sc.steps.length + 1);
      frames.slice(0, -1).forEach((f, i) => {
        const s = sc.steps[i];
        const text = captionText(f.say);
        expect(f.i).toBe(i);
        expect(text.length).toBeGreaterThan(0);
        if (s.phase === 'load') expect(text.includes('Exactly the values it was saved with')).toBe(s.roundTrip);
        if (s.phase === 'pick') expect(text.includes('another process')).toBe(!same);
        if (s.phase === 'save' || s.phase === 'load') expect(text).toContain(`${s.subject}'s`);
      });
      const last = captionText(frames.at(-1)!.say);
      const changes = sc.steps.filter((s) => s.phase === 'mm').length;
      if (kind === 'involuntary') expect(last.includes('switched address space')).toBe(changes > 0);
      else expect(last.includes('none of them changing address space')).toBe(changes === 0);
    });
  }
});

describe('sandbox sentences', () => {
  it('say "context switch" exactly when one happened', () => {
    const order: IrqSource[] = ['disk', 'timer', 'key', 'network', 'timer', 'timer', 'timer'];
    let s = sandboxStart();
    for (const src of order) {
      s = fire(s, src);
      const o = s.log.at(-1)!;
      expect(outcomeText(o).includes('context switch')).toBe(o.reschedule);
    }
  });
});

describe('claims in the lesson text', () => {
  it('Q5: a 50 µs slice and a 50 µs switch lose 50%', () => {
    const q = lesson.quiz[4];
    expect(q.options[q.answer]).toBe(`${overhead(50, 50) * 100}%`);
  });
  it('try-this: a 20 µs slice with the default 5 µs switch is over the red line', () => {
    expect(overhead(20, 5)).toBeGreaterThan(OVERHEAD_BAD);
    expect(overhead(4000, 5)).toBeLessThan(OVERHEAD_BAD);
  });
  it('try-this: Disk then Timer twice gives B the CPU on the second tick only', () => {
    const s = (['disk', 'timer', 'timer'] as IrqSource[]).reduce((w, src) => fire(w, src), sandboxStart());
    expect(s.log.map((o) => o.reschedule)).toEqual([false, false, true]);
    expect(s.running).toBe('B');
  });
});
