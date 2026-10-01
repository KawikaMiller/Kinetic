import type { ReactNode } from 'react';
import { captionText as text } from '../../core/testing/captions';
import { describe, expect, it } from 'vitest';
import { fixedKFrames, shortestFrames, uniqueFrames } from './frames';

/** Caption text with the markup stripped. */
const captions = (frames: { say?: ReactNode }[]) => frames.map((f) => text(f.say));

describe('sliding-window captions', () => {
  it('a repeat reads naturally for any letter', () => {
    const all = captions(uniqueFrames('abca')).join('\n');
    expect(all).toContain("'a' enters, but 'a' is already inside");
    expect(all).not.toMatch(/\ba 'a'/);
  });
  it('never offers to grow past the end of the list', () => {
    const says = captions(shortestFrames([1, 1, 5], 5));
    const last = says.findLast((s) => s.includes('leaves'))!;
    expect(last).toContain('r is already at the end');
    expect(says.join('\n')).not.toContain('grow from where r is');
  });
  it('counts singular and plural correctly', () => {
    expect(captions(fixedKFrames([5, -3], 2)).at(-1)).toMatch(/brute force needs 2 additions\./);
    expect(captions(uniqueFrames('a')).at(-1)).toMatch(/brute force needs 1 window\./);
  });
});
