import { describe, expect, it } from 'vitest';
import { fakeSecret } from './fakeSecret';

describe('fakeSecret', () => {
  it('joins its parts in order with nothing between them', () => {
    expect(fakeSecret('ab', '_', 'cd')).toBe('ab_cd');
    expect(fakeSecret('only')).toBe('only');
    expect(fakeSecret()).toBe('');
  });
});
