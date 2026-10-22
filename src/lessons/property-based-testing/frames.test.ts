import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, genOf } from './config';
import { playerFrames, shrinkFrames } from './frames';
import { findAndShrink } from './runner';
import { bugOf } from './sorts';

describe('playerFrames', () => {
  it('hands usePlayer the very same array on every render while no case fails (a new array each time rewinds it forever)', () => {
    const correct = { ...DEFAULT_CONFIG, fn: 'correct' as const };
    const found = findAndShrink(bugOf(correct.fn).fn, correct.props, genOf(correct));
    expect(found).toBeNull();
    const first = playerFrames([]);
    expect(first).toHaveLength(1);
    expect(playerFrames([])).toBe(first);
  });

  it('passes real frames through untouched', () => {
    const found = findAndShrink(bugOf(DEFAULT_CONFIG.fn).fn, DEFAULT_CONFIG.props, genOf(DEFAULT_CONFIG))!;
    const frames = shrinkFrames(found.shrunk, found.run.failure!.k);
    expect(playerFrames(frames)).toBe(frames);
  });
});
