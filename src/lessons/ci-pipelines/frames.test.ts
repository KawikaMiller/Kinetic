import { isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { pipelineFrames } from './frames';

/** Caption text with the markup stripped. */
const text = (node: ReactNode) =>
  isValidElement(node)
    ? renderToStaticMarkup(node)
        .replace(/<[^>]+>/g, '')
        .replace(/&#x27;/g, "'")
        .replace(/&amp;/g, '&')
    : String(node ?? '');

describe('pipeline captions', () => {
  it('a broken test with fail fast narrates the cancellation, then the summary', () => {
    const { frames } = pipelineFrames({ cache: false, shards: 2, failFast: true, branch: 'main', brokenTest: true });
    const says = frames.map((f) => text(f.say));
    expect(says.some((s) => s.includes('Fail fast also cancels'))).toBe(true);
    expect(says.at(-1)).toMatch(/^Red pipeline/);
    expect(says.at(-2)).toContain('Fail fast also cancels');
  });
  it('every run ends on a summary frame that repeats the final state', () => {
    for (const failFast of [false, true]) {
      for (const brokenTest of [false, true]) {
        const { frames } = pipelineFrames({ cache: true, shards: 4, failFast, branch: 'main', brokenTest });
        const [last, summary] = frames.slice(-2);
        expect(summary.t).toBe(last.t);
        expect(summary.jobs).toEqual(last.jobs);
        expect(text(summary.say)).toMatch(/^(Red pipeline|Green in)/);
      }
    }
  });
});
