import { describe, expect, it } from 'vitest';
import { arrowStep } from './geometry';

describe('arrowStep', () => {
  it('maps the arrow keys to screen-axis steps', () => {
    expect(arrowStep('ArrowLeft', 2)).toEqual([-2, 0]);
    expect(arrowStep('ArrowRight', 0.25)).toEqual([0.25, 0]);
    expect(arrowStep('ArrowUp', 1)).toEqual([0, -1]);
    expect(arrowStep('ArrowDown', 1)).toEqual([0, 1]);
  });

  it('is null for other keys', () => {
    expect(arrowStep('Enter', 1)).toBeNull();
    expect(arrowStep('a', 1)).toBeNull();
  });
});
