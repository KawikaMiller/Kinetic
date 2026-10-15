import { describe, expect, it } from 'vitest';
import { panAfterKey, tapeWindow, TAPE_CELLS } from './tapeWindow';

describe('tapeWindow', () => {
  it('centres the head, and the window follows it into negative cells', () => {
    expect(tapeWindow(0, TAPE_CELLS, 0)).toEqual({ first: -8, headAt: 8 });
    expect(tapeWindow(-30, 9, 0)).toEqual({ first: -34, headAt: 4 });
  });

  it('a pan shifts the view and the head leaves the window when panned far enough', () => {
    expect(tapeWindow(0, 9, 3)).toEqual({ first: -1, headAt: 1 });
    expect(tapeWindow(0, 9, 4).headAt).toBe(0);
    expect(tapeWindow(0, 9, 5).headAt).toBeNull();
    expect(tapeWindow(0, 9, -5).headAt).toBeNull();
  });
});

describe('panAfterKey', () => {
  it('arrows pan by one, Home recentres, anything else is left alone', () => {
    expect(panAfterKey('ArrowRight', 2)).toBe(3);
    expect(panAfterKey('ArrowLeft', 2)).toBe(1);
    expect(panAfterKey('Home', 7)).toBe(0);
    expect(panAfterKey('Tab', 1)).toBeNull();
  });
});
