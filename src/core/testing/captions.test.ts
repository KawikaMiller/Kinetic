import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { captionText, expectCaption } from './captions';

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

describe('captionText strict', () => {
  // What a JSX line break right after an expression does: the space disappears.
  const glued = createElement('span', null, 'Wait on the port', '.', '60 s later it times out.');

  it('throws on a glued sentence and names it', () => {
    expect(() => captionText(glued, { strict: true })).toThrow(/port\.60 s/);
    expect(() => expectCaption(glued)).toThrow(/Glued sentence/);
    expect(() => expectCaption('done.Then')).toThrow();
  });

  it('returns the same text as the lenient form when nothing is glued', () => {
    const fine = createElement('span', null, 'Wait on the port. ', createElement('b', null, '60 s'), ' later.');
    expect(expectCaption(fine)).toBe(captionText(fine));
    expect(captionText(glued)).toBe('Wait on the port.60 s later it times out.');
  });

  it('ignores inline code but not prose glued to it', () => {
    expect(expectCaption(createElement('span', null, 'Use ', createElement('code', null, 'Math.PI'), ' here.'))).toBe('Use Math.PI here.');
    expect(() => expectCaption(createElement('span', null, 'Call ', createElement('code', null, 'f()'), '.Then wait.'))).toThrow();
  });
});
