import { describe, expect, it } from 'vitest';
import { createRecorder } from './recorder';
import type { Frame } from './types';

interface F extends Frame {
  n: number;
  flash: string | null;
}

const steps = () => {
  const r = createRecorder<F>({ n: 0, flash: null }, { transient: { flash: null } });
  r.snap('start');
  r.snap('add one', undefined, { n: 1, flash: 'n' });
  return r;
};

describe('createRecorder', () => {
  it('snap pushes the current state and resets transient keys afterwards', () => {
    const r = steps();
    expect(r.frames.map((f) => [f.n, f.flash, f.say])).toEqual([
      [0, null, 'start'],
      [1, 'n', 'add one'],
    ]);
    expect(r.get().flash).toBeNull();
  });

  it('close adds the summary as its own frame, so the last step keeps its caption', () => {
    const r = steps();
    r.close('summary', 2);
    expect(r.frames.map((f) => f.say)).toEqual(['start', 'add one', 'summary']);
    expect(r.frames[2]).toMatchObject({ n: 1, flash: null, hold: 2 });
  });

  it('amendLast replaces the last caption only when asked to, by name', () => {
    const r = steps();
    r.amendLast('add one, and that is all', 2);
    expect(r.frames.map((f) => f.say)).toEqual(['start', 'add one, and that is all']);
    expect(r.frames[1].hold).toBe(2);
  });

  it('amendLast on an empty recorder adds nothing', () => {
    const r = createRecorder<F>({ n: 0, flash: null });
    r.amendLast('nothing to amend');
    expect(r.frames).toEqual([]);
  });
});
