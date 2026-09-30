import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { escapeHtml, renderHtml, unescapeHtml, visibleText } from './html';

const ANY = 'ab<>&"\'/= ;#x3éü😀\t';
const randomText = (rnd: () => number, max = 16) =>
  Array.from({ length: Math.floor(rnd() * max) }, () => [...ANY][Math.floor(rnd() * [...ANY].length)]).join('');

describe('reading markup like a browser', () => {
  it('turns <b>…</b> into bold text', () => {
    const r = renderHtml('use <b>bold</b>');
    expect(r.runs).toEqual([
      { text: 'use ', bold: false, italic: false, mono: false },
      { text: 'bold', bold: true, italic: false, mono: false },
    ]);
    expect(r.swallowed).toEqual([{ text: '<b>', start: 4 }, { text: '</b>', start: 11 }]);
  });
  it('swallows the middle of "a<b and b>c": "and b" become attributes of a <b> tag', () => {
    expect(visibleText('a<b and b>c')).toBe('ac');
    expect(renderHtml('a<b and b>c').runs.at(-1)).toMatchObject({ text: 'c', bold: true });
  });
  it('decodes an entity someone meant to show literally', () => {
    expect(visibleText('Tom &amp; Jerry')).toBe('Tom & Jerry');
  });
  it('leaves "<" alone when a digit or space follows (works by luck)', () => {
    expect(visibleText('I <3 it')).toBe('I <3 it');
    expect(visibleText('5 > 3 & 2 < 4')).toBe('5 > 3 & 2 < 4');
  });
  it('drops a tag cut off by the end of the input', () => {
    expect(visibleText('hi <b')).toBe('hi ');
  });
  it('hides comments, including "bogus" ones the parser invents', () => {
    expect(visibleText('a<!-- note -->b')).toBe('ab');
    expect(visibleText('a</ b>c')).toBe('ac'); // </ + non-letter: a bogus comment up to >
    expect(visibleText('</1/x')).toBe(''); // …or to the end
    expect(visibleText('a<?x>b')).toBe('ab');
    expect(visibleText('a<!-->b')).toBe('ab'); // an empty comment
  });
  it('lets quotes hide a > inside an attribute value', () => {
    expect(visibleText('x<b t="1>2">y')).toBe('xy');
  });
});

describe('encoding for HTML', () => {
  it('shows any text exactly as typed', () => {
    const rnd = mulberry32(3);
    for (let n = 0; n < 3000; n++) {
      const text = randomText(rnd);
      expect(visibleText(escapeHtml(text))).toBe(text);
      expect(renderHtml(escapeHtml(text)).swallowed).toEqual([]);
      expect(unescapeHtml(escapeHtml(text))).toBe(text);
    }
  });
  it('leaves no markup characters in the encoded text', () => {
    expect(escapeHtml('<b>"Tom" & \'Jerry\'</b>')).toBe('&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;');
  });
});
