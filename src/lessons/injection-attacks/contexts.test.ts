import { describe, expect, it } from 'vitest';
import { allowedSort, contextViews, escapeLogValue, logLines, readParams, type ContextId } from './contexts';

const brokenIn = (text: string) =>
  contextViews(text).filter((c) => c.raw.broken).map((c) => c.id).sort();

describe('the same text, pasted into five places', () => {
  it('covers every context', () => {
    expect(contextViews('x').map((c) => c.id)).toEqual<ContextId[]>(['sql', 'html', 'shell', 'url', 'log']);
  });
  it('an ordinary word breaks nothing', () => {
    expect(brokenIn('Smith')).toEqual([]);
  });
  it("O'Brien breaks the SQL and the shell command (both read ' as a quote)", () => {
    expect(brokenIn("O'Brien")).toEqual(['shell', 'sql']);
  });
  it('a file name with a space breaks the shell command (and the URL)', () => {
    expect(brokenIn('my report.pdf')).toContain('shell');
  });
  it('fish & chips breaks the shell command: & starts a second command', () => {
    expect(brokenIn('fish & chips')).toContain('shell');
  });
  it('an ampersand splits a URL parameter in two', () => {
    expect(readParams('https://shop.example/search?q=fish & chips')).toEqual(['"q" = "fish "', '" chips" = ""']);
    expect(brokenIn('fish & chips')).toContain('url');
    expect(readParams(`https://shop.example/search?q=${encodeURIComponent('fish & chips')}`)).toEqual(['"q" = "fish & chips"']);
  });
  it('a line break turns one log entry into two, unless escaped', () => {
    expect(logLines('user=Ada\nsecond line')).toHaveLength(2);
    expect(logLines(`user=${escapeLogValue('Ada\nsecond line')}`)).toHaveLength(1);
    expect(brokenIn('Ada\nsecond line')).toContain('log');
  });
  it('markup breaks the HTML context', () => {
    expect(brokenIn('use <b>bold</b>')).toContain('html');
  });
  it('the safe versions keep the text whole in every context', () => {
    for (const text of ["O'Brien", 'my report.pdf', 'fish & chips', 'Ada\nsecond line', 'use <b>bold</b>']) {
      const views = contextViews(text);
      expect(views.find((v) => v.id === 'shell')!.safe.result).toEqual([`arguments: ${JSON.stringify([text])}`]);
      expect(views.find((v) => v.id === 'url')!.safe.result).toEqual([`"q" = ${JSON.stringify(text)}`]);
      expect(views.find((v) => v.id === 'log')!.safe.result).toHaveLength(1);
      expect(views.find((v) => v.id === 'html')!.safe.result).toEqual([`people see: ${JSON.stringify(text)}`]);
    }
  });
});

describe('allow-lists for identifiers', () => {
  it('accepts only the listed sort columns', () => {
    expect(allowedSort('surname')).toBe(true);
    expect(allowedSort('Surname')).toBe(false);
    expect(allowedSort('surname DESC')).toBe(false);
  });
});
