import { describe, expect, it } from 'vitest';
import { pageTitle } from './pageTitle';

describe('pageTitle', () => {
  it('puts the page first so tabs and bookmarks can be told apart', () => {
    expect(pageTitle('Binary Search')).toBe('Binary Search · Kinetic');
  });

  it('is just the app name for the home page', () => {
    expect(pageTitle(null)).toBe('Kinetic');
    expect(pageTitle('')).toBe('Kinetic');
  });
});
