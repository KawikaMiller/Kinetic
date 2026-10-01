import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { captionText } from './captions';

describe('captionText', () => {
  it('strips markup and decodes the entities React escapes', () => {
    const node = createElement('span', null, 'O', createElement('b', null, "'Brien"), ' & "co" <3 > 2');
    expect(captionText(node)).toBe(`O'Brien & "co" <3 > 2`);
  });

  it('decodes each entity once, so an escaped entity stays literal', () => {
    expect(captionText(createElement('span', null, '&lt;b&gt;'))).toBe('&lt;b&gt;');
  });

  it('passes plain values through', () => {
    expect(captionText('plain')).toBe('plain');
    expect(captionText(42)).toBe('42');
    expect(captionText(undefined)).toBe('');
    expect(captionText(null)).toBe('');
  });
});
