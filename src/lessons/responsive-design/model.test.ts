import { describe, expect, it } from 'vitest';
import {
  BREAKPOINTS, CANDIDATES, PAGE_CSS, blockOfLines, breakpointAt, isTooSmall, pickCandidate, slotWidth,
} from './model';

describe('breakpoints', () => {
  it('mobile first: base below 600, md from 600, lg from 960', () => {
    expect(breakpointAt(320).id).toBe('base');
    expect(breakpointAt(599).id).toBe('base');
    expect(breakpointAt(600).id).toBe('md');
    expect(breakpointAt(959).id).toBe('md');
    expect(breakpointAt(960).id).toBe('lg');
    expect(breakpointAt(1440).id).toBe('lg');
  });

  it('the stylesheet uses exactly the breakpoints the ruler shows', () => {
    const inCss = [...PAGE_CSS.matchAll(/@container \(min-width: (\d+)px\)/g)].map((m) => Number(m[1]));
    expect(inCss).toEqual(BREAKPOINTS.filter((b) => b.min > 0).map((b) => b.min));
  });

  it('assigns each CSS line to its block', () => {
    const lines = PAGE_CSS.split('\n');
    const blocks = blockOfLines(PAGE_CSS);
    expect(blocks).toHaveLength(lines.length);
    expect(blocks[lines.findIndex((l) => l.includes('--bp: md'))]).toBe('md');
    expect(blocks[lines.findIndex((l) => l.includes('--bp: lg'))]).toBe('lg');
    expect(blocks[lines.findIndex((l) => l.includes('.rd-links { display: none; }'))]).toBe('base');
  });
});

describe('srcset density selection', () => {
  it('slot width follows the first matching sizes condition', () => {
    expect(slotWidth(390)).toBe(390);
    expect(slotWidth(768)).toBe(384);
    expect(slotWidth(1440)).toBe(480);
  });

  // [viewport, dpr, expected candidate width]: smallest candidate >= slot × dpr, else the largest.
  const matrix: [number, number, number][] = [
    [390, 1, 400],
    [390, 2, 800],
    [390, 3, 1600],
    [768, 1, 400],
    [768, 2, 800],
    [768, 3, 1600],
    [1280, 1, 800],
    [1280, 2, 1600],
    [1280, 3, 1600],
    [320, 1, 400],
    [1440, 1, 800],
  ];
  it.each(matrix)('viewport %i at %ix picks the %iw image', (vw, dpr, expected) => {
    expect(pickCandidate(CANDIDATES, slotWidth(vw), dpr).w).toBe(expected);
  });

  it('falls back to the largest candidate when none is big enough', () => {
    expect(pickCandidate(CANDIDATES, 2000, 1).w).toBe(1600);
  });
});

describe('tap targets', () => {
  it('flags anything under 44 × 44', () => {
    expect(isTooSmall(44, 44)).toBe(false);
    expect(isTooSmall(24, 24)).toBe(true);
    expect(isTooSmall(120, 32)).toBe(true);
  });
});
