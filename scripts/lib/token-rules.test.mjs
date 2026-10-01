import { describe, expect, it } from 'vitest';
import { findHits } from './token-rules.mjs';

const rules = (text) => findHits(text).map((h) => h.rule);

describe('inline spring literal', () => {
  it('flags an anonymous spring in a transition prop', () => {
    expect(rules("<motion.g transition={{ type: 'spring', stiffness: 300, damping: 30 }} />")).toEqual(['inline spring literal']);
  });

  it('does not flag a variable that happens to be called spring (seasons, DST)', () => {
    expect(rules("const spring = 'March 8';")).toEqual([]);
    expect(rules('const spring = { offset: -7 }; // spring forward')).toEqual([]);
  });

  it('does not flag a named spring constant or a preset', () => {
    expect(rules("const CHIP_SPRING = { type: 'spring', stiffness: 400, damping: 26 } as const;")).toEqual([]);
    expect(rules('<motion.g transition={SPRING.snappy} />')).toEqual([]);
  });
});

describe('colour literals', () => {
  it('flags hex and rgb() in code but not in comments', () => {
    expect(rules('color: #ff8800;')).toEqual(['hex colour']);
    expect(rules('ctx.fillStyle = "rgb(1 2 3)";')).toEqual(['rgb() literal']);
    expect(rules('/* the old #ff8800 orange */ color: var(--orange);')).toEqual([]);
    expect(rules('const x = 1; // was #ff8800')).toEqual([]);
  });

  it('honours an allow-color marker only when it gives a reason', () => {
    expect(findHits('color: #2b1d0e; /* allow-color: coffee-cup illustration */')[0].allowed).toBe(true);
    expect(findHits('color: #2b1d0e; /* allow-color: */')[0].allowed).toBe(false);
  });

  it('reports 1-based line numbers', () => {
    expect(findHits('a\nb\ncolor: #fff;')[0].line).toBe(3);
  });
});
