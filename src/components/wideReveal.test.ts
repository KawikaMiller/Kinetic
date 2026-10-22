import { describe, expect, it } from 'vitest';
import { revealScrollLeft, wideRegionWords } from './wideReveal';

describe('wideRegionWords', () => {
  it('defaults to the wording every existing WideRegion already shows', () => {
    expect(wideRegionWords()).toEqual({ label: 'Diagram: scroll sideways to see all of it', hint: 'swipe to see the whole diagram' });
  });

  it('names whatever the lesson scrolls', () => {
    expect(wideRegionWords('table')).toEqual({ label: 'Table: scroll sideways to see all of it', hint: 'swipe to see the whole table' });
  });
});

const view = (scrollLeft: number) => ({ scrollLeft, clientWidth: 300, scrollWidth: 900 });

describe('revealScrollLeft', () => {
  it('leaves a span that is already in view alone', () => {
    expect(revealScrollLeft(view(0), 50, 200)).toBeNull();
    expect(revealScrollLeft(view(400), 450, 650)).toBeNull();
  });

  it('scrolls right just enough to show a span past the right edge, plus the margin', () => {
    expect(revealScrollLeft(view(0), 400, 500)).toBe(500 + 24 - 300);
  });

  it('scrolls left to a span before the view', () => {
    expect(revealScrollLeft(view(500), 100, 200)).toBe(100 - 24);
  });

  it('lines up the left edge of a span wider than the view', () => {
    expect(revealScrollLeft(view(0), 200, 700)).toBe(200 - 24);
  });

  it('clamps to the scrollable range', () => {
    expect(revealScrollLeft(view(300), 0, 40)).toBe(0);
    expect(revealScrollLeft(view(0), 860, 900)).toBe(600);
  });

  it('ignores sub-pixel moves', () => {
    expect(revealScrollLeft(view(600), 860, 900)).toBeNull();
  });
});
