import { describe, expect, it } from 'vitest';
import type { Frame } from './types';
import { captionSources, shortcutFor } from './usePlayer';

const key = (k: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; defaultPrevented: boolean }> = {}) => ({
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
  it('leaves a key alone once a nearer handler has called preventDefault', () => {
    for (const k of [' ', 'ArrowRight', 'ArrowLeft', 'r']) expect(shortcutFor(key(k, { defaultPrevented: true }), body)).toBeNull();
    expect(shortcutFor(key('ArrowRight', { defaultPrevented: false }), body)).toBe('forward');
  });

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

describe('captionSources', () => {
  // frame i says `s<i>` when listed here; the rest inherit
  const frames: Frame[] = ['s0', undefined, undefined, 's3', undefined, 's5', undefined, undefined].map((say) => ({ say }));
  const sources = captionSources(frames);

  /**
   * What the caption strip reads after visiting `visits` in order, the way the player sets it:
   * once whenever the source frame changes, never for a frame with no source.
   */
  function shownAfter(visits: number[], intro = 'intro'): string {
    let caption = intro;
    let source: number | undefined;
    for (const i of visits) {
      if (sources[i] === source) continue;
      source = sources[i];
      if (source >= 0) caption = frames[source].say as string;
    }
    return caption;
  }

  it('points every frame at the last frame at or before it with a say', () => {
    expect(sources).toEqual([0, 0, 0, 3, 3, 5, 5, 5]);
    expect(captionSources([{}, {}, { say: 'x' }, {}])).toEqual([-1, -1, 2, 2]);
    expect(captionSources([])).toEqual([]);
  });

  it('a jump forward to a frame without say shows the last say before it, not the old caption', () => {
    expect(shownAfter([0, 4])).toBe('s3');
    expect(shownAfter([0, 7])).toBe('s5');
  });

  it('a jump back resolves the same way', () => {
    expect(shownAfter([0, 7, 2])).toBe('s0');
    expect(shownAfter([0, 7, 4])).toBe('s3');
  });

  it('scrubbing matches stepping: every visit order ending on a frame shows the same caption', () => {
    const scrub = [0, 6, 1, 7, 3, 2, 5, 4];
    for (let k = 1; k <= scrub.length; k++) {
      const end = scrub[k - 1];
      const stepped = Array.from({ length: end + 1 }, (_, i) => i);
      expect(shownAfter(scrub.slice(0, k))).toBe(shownAfter(stepped));
    }
  });

  it('reset to the first frame shows its caption again', () => {
    expect(shownAfter([0, 6, 0])).toBe('s0');
  });

  it('keeps the intro caption while no frame so far has a say', () => {
    const late = captionSources([{}, {}, { say: 'x' }]);
    expect(late[0]).toBe(-1);
    expect(late[1]).toBe(-1);
  });
});
