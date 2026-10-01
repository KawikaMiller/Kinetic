import { captionText as text } from '../../core/testing/captions';
import { describe, expect, it } from 'vitest';
import { errorFrames } from './frames';

import { programLines, runPlain, runTraced, type FailAt, type Mode, type Preset } from './model';

const CONFIGS: [Mode, Preset, FailAt][] = [
  ...(['boundary', 'swallow', 'rethrow', 'unhandled'] as Preset[]).flatMap((p) =>
    (['none', 'chargeCard', 'callBank'] as FailAt[]).map((f) => ['exceptions', p, f] as [Mode, Preset, FailAt]),
  ),
  ...(['none', 'chargeCard', 'callBank'] as FailAt[]).map((f) => ['result', 'boundary', f] as [Mode, Preset, FailAt]),
];

describe('error frames', () => {
  it.each(CONFIGS)('%s / %s / fail at %s: every frame has a caption and the console ends as the real program', (mode, preset, fail) => {
    const lines = programLines(mode, preset, fail);
    const frames = errorFrames(lines, mode, preset, fail);
    const plain = runPlain(lines);
    for (const f of frames) expect(f.say).toBeTruthy();
    const last = frames.at(-1)!;
    expect(last.output).toEqual(plain.output);
    expect(last.crash).toBe(plain.crash);
  });

  it('the stack is empty at the end and never has duplicate frames', () => {
    for (const [mode, preset, fail] of CONFIGS) {
      const frames = errorFrames(programLines(mode, preset, fail), mode, preset, fail);
      for (const f of frames) expect(new Set(f.stack.map((s) => s.fn)).size).toBe(f.stack.length);
      expect(frames.at(-1)!.stack.length).toBeLessThanOrEqual(1);
    }
  });

  it('a finally runs on its own frame, on top of the stack (QA M-3)', () => {
    for (const [mode, preset, fail] of CONFIGS) {
      for (const f of errorFrames(programLines(mode, preset, fail), mode, preset, fail)) {
        const top = f.stack.at(-1);
        if (top?.detail?.startsWith('finally')) {
          expect(text(f.say)).toContain(`${top.fn}'s finally`);
        }
        if (/'s finally/.test(text(f.say))) {
          const fn = text(f.say).split("'s finally")[0].split(' ').at(-1);
          expect(top?.fn).toBe(fn);
        }
      }
    }
  });

  it('success paths through a finally keep main → handleRequest → chargeCard until chargeCard returns', () => {
    for (const preset of ['boundary', 'rethrow', 'unhandled'] as Preset[]) {
      const frames = errorFrames(programLines('exceptions', preset, 'none'), 'exceptions', preset, 'none');
      const fin = frames.find((f) => f.stack.at(-1)?.detail?.startsWith('finally'))!;
      expect(fin.stack.map((s) => s.fn)).toEqual(['main', 'handleRequest', 'chargeCard']);
      // The next frame has popped chargeCard, and handleRequest is still there.
      const after = frames[frames.indexOf(fin) + 1];
      expect(after.stack.map((s) => s.fn)).toEqual(['main', 'handleRequest']);
    }
  });

  it('says "returns undefined" only for a function the real run shows returning nothing', () => {
    for (const [mode, preset, fail] of CONFIGS) {
      const lines = programLines(mode, preset, fail);
      const returned = new Set(runTraced(lines).events.flatMap((e) => (e.kind === 'return' ? [e.fn] : [])));
      for (const f of errorFrames(lines, mode, preset, fail)) {
        const claim = /(handleRequest|chargeCard|callBank) reaches its end without a return/.exec(text(f.say));
        if (claim) expect(returned.has(claim[1] as never)).toBe(false);
      }
    }
  });

  it('the stack never loses more than one frame at a time, except at a crash or the closing verdict', () => {
    for (const [mode, preset, fail] of CONFIGS) {
      const frames = errorFrames(programLines(mode, preset, fail), mode, preset, fail);
      frames.forEach((f, i) => {
        if (i === 0 || f.crash || i === frames.length - 1) return;
        expect(frames[i - 1].stack.length - f.stack.length).toBeLessThanOrEqual(1);
      });
    }
  });

  it('the verdict mentions a finally only when the program has one', () => {
    for (const [mode, preset, fail] of CONFIGS) {
      const lines = programLines(mode, preset, fail);
      const verdict = text(errorFrames(lines, mode, preset, fail).at(-1)!.say);
      if (!lines.some((l) => l.includes('finally'))) expect(verdict).not.toContain('finally');
    }
  });

  it('Result mode: the function that creates an Err says so; the ones above pass it up', () => {
    const lines = programLines('result', 'boundary', 'callBank');
    const says = errorFrames(lines, 'result', 'boundary', 'callBank').map((f) => text(f.say));
    expect(says.some((s) => s.startsWith("callBank fails, and says so with a value: it returns err('bank timeout')"))).toBe(true);
    expect(says.some((s) => s.startsWith('callBank checks the result'))).toBe(false);
    expect(says.some((s) => s.startsWith('chargeCard checks the result'))).toBe(true);
  });

  it('the swallow preset records the lost error', () => {
    const lines = programLines('exceptions', 'swallow', 'callBank');
    expect(errorFrames(lines, 'exceptions', 'swallow', 'callBank').at(-1)!.lost).toBe('bank timeout');
  });
});
