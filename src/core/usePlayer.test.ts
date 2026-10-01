import { describe, expect, it } from 'vitest';
import { shortcutFor } from './usePlayer';

const key = (k: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean }> = {}) => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  ...mods,
});

/** A fake event target that "matches" the selectors whose text includes any of `tags`. */
const target = (...tags: string[]) => ({
  closest: (selector: string) => (tags.some((t) => selector.includes(t)) ? {} : null),
});
const body = target();

describe('shortcutFor', () => {
  it('maps the player keys when focus is on the page', () => {
    expect(shortcutFor(key(' '), body)).toBe('toggle');
    expect(shortcutFor(key('ArrowRight'), body)).toBe('forward');
    expect(shortcutFor(key('ArrowLeft'), body)).toBe('back');
    expect(shortcutFor(key('r'), body)).toBe('restart');
    expect(shortcutFor(key('R'), null)).toBe('restart');
    expect(shortcutFor(key('x'), body)).toBeNull();
  });

  it('never fires while typing', () => {
    for (const k of [' ', 'ArrowRight', 'ArrowLeft', 'r']) expect(shortcutFor(key(k), target('input'))).toBeNull();
    expect(shortcutFor(key('r'), target('textarea'))).toBeNull();
  });

  it('lets Space press a focused control instead of toggling playback', () => {
    expect(shortcutFor(key(' '), target('button'))).toBeNull();
    expect(shortcutFor(key(' '), target('[role="radio"]'))).toBeNull();
    expect(shortcutFor(key(' '), target('a[href]'))).toBeNull();
    // other shortcuts still work from a focused button
    expect(shortcutFor(key('ArrowRight'), target('button'))).toBe('forward');
  });

  it('leaves the arrows to radio groups, tabs and sliders so they can move their selection', () => {
    for (const role of ['[role="radio"]', '[role="radiogroup"]', '[role="tab"]', '[role="slider"]']) {
      expect(shortcutFor(key('ArrowRight'), target(role))).toBeNull();
      expect(shortcutFor(key('ArrowLeft'), target(role))).toBeNull();
    }
    // R still restarts from a focused radio
    expect(shortcutFor(key('r'), target('[role="radio"]'))).toBe('restart');
  });

  it('ignores keys with a modifier held', () => {
    expect(shortcutFor(key('r', { ctrlKey: true }), body)).toBeNull();
    expect(shortcutFor(key(' ', { metaKey: true }), body)).toBeNull();
  });
});
