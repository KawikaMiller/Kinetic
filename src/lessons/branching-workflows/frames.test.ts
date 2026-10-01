import { isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { weekFrames } from './frames';
import { edits, outcome, strategies } from './model';

/** Caption text with the markup stripped. */
const text = (node: ReactNode) =>
  isValidElement(node) ? renderToStaticMarkup(node).replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'") : String(node ?? '');

const closing = (flags: boolean) => {
  const e = edits(4, 1);
  const s = strategies(5, flags);
  const frames = weekFrames({ long: { strategy: s.long, outcome: outcome(e, s.long) }, trunk: { strategy: s.trunk, outcome: outcome(e, s.trunk) } });
  return text(frames.at(-1)!.say);
};

describe('the week summary', () => {
  it('only promises hours-long branches when flags make them possible', () => {
    expect(closing(true)).toContain('hours, not weeks');
    expect(closing(false)).not.toContain('hours, not weeks');
    expect(closing(false)).toContain('waits 3 days');
  });
});
