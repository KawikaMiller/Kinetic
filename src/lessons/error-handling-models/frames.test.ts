import { describe, expect, it } from 'vitest';
import { errorFrames } from './frames';
import { programLines, runPlain, type FailAt, type Mode, type Preset } from './model';

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

  it('the swallow preset records the lost error', () => {
    const lines = programLines('exceptions', 'swallow', 'callBank');
    expect(errorFrames(lines, 'exceptions', 'swallow', 'callBank').at(-1)!.lost).toBe('bank timeout');
  });
});
