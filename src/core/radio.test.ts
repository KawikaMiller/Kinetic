import { describe, expect, it } from 'vitest';
import { listKeyTarget, radioKeyTarget, rovingTabStop } from './radio';

describe('radioKeyTarget', () => {
  it('steps forward and back with wrap-around', () => {
    expect(radioKeyTarget('ArrowRight', 0, 3)).toBe(1);
    expect(radioKeyTarget('ArrowDown', 2, 3)).toBe(0);
    expect(radioKeyTarget('ArrowLeft', 0, 3)).toBe(2);
    expect(radioKeyTarget('ArrowUp', 1, 3)).toBe(0);
  });

  it('jumps to the ends with Home and End', () => {
    expect(radioKeyTarget('Home', 2, 4)).toBe(0);
    expect(radioKeyTarget('End', 0, 4)).toBe(3);
  });

  it('starts from the right end when nothing is selected', () => {
    expect(radioKeyTarget('ArrowRight', -1, 3)).toBe(0);
    expect(radioKeyTarget('ArrowLeft', -1, 3)).toBe(2);
  });

  it('ignores other keys and empty groups', () => {
    expect(radioKeyTarget(' ', 0, 3)).toBeNull();
    expect(radioKeyTarget('Enter', 0, 3)).toBeNull();
    expect(radioKeyTarget('ArrowRight', 0, 0)).toBeNull();
  });
});

describe('rovingTabStop', () => {
  it('puts the checked option in the tab order, or the first if none', () => {
    expect(rovingTabStop(2)).toBe(2);
    expect(rovingTabStop(-1)).toBe(0);
  });
});

describe('listKeyTarget', () => {
  it('steps with the up and down arrows without wrapping, and Home/End jump to the ends', () => {
    expect(listKeyTarget('ArrowDown', 3, 10)).toBe(4);
    expect(listKeyTarget('ArrowUp', 3, 10)).toBe(2);
    expect(listKeyTarget('ArrowDown', 9, 10)).toBe(9);
    expect(listKeyTarget('ArrowUp', 0, 10)).toBe(0);
    expect(listKeyTarget('Home', 6, 10)).toBe(0);
    expect(listKeyTarget('End', 2, 10)).toBe(9);
  });

  it('ignores left/right and other keys, and an empty list', () => {
    for (const k of ['ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Tab']) expect(listKeyTarget(k, 1, 4)).toBeNull();
    expect(listKeyTarget('ArrowDown', 0, 0)).toBeNull();
  });
});
