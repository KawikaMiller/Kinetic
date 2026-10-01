import { describe, expect, it } from 'vitest';
import { describeShellPaste, parseShell } from './shell';

// Expected values were checked against real bash (`bash -n` for syntax, and functions
// that print their arguments for what runs). See the commit that added this file.
const argvOf = (line: string) => {
  const p = parseShell(line);
  if (!p.ok) throw new Error(p.error);
  return p.commands.map((c) => c.argv);
};

describe('parseShell reads a command line like bash does', () => {
  it('splits unquoted words on spaces', () => {
    expect(argvOf('open Smith')).toEqual([['open', 'Smith']]);
    expect(argvOf('open my report.pdf')).toEqual([['open', 'my', 'report.pdf']]);
  });

  it('quotes and backslashes keep a space inside one argument', () => {
    expect(argvOf('open "a b"')).toEqual([['open', 'a b']]);
    expect(argvOf('open a\\ b')).toEqual([['open', 'a b']]);
    expect(argvOf("open 'O''Brien'")).toEqual([['open', 'OBrien']]);
  });

  it("an apostrophe opens a quote that never closes: bash refuses the line", () => {
    expect(parseShell("open O'Brien")).toMatchObject({ ok: false });
    expect(parseShell("open it's")).toMatchObject({ ok: false });
  });

  it('& and a line break end one command and start another', () => {
    expect(argvOf('open fish & chips')).toEqual([['open', 'fish'], ['chips']]);
    expect(argvOf('open Ada\nsecond line')).toEqual([['open', 'Ada'], ['second', 'line']]);
    expect(argvOf('a; b && c || d | e')).toEqual([['a'], ['b'], ['c'], ['d'], ['e']]);
  });

  it('< and > are redirections; one with no file name is a syntax error', () => {
    const p = parseShell('sort < in.txt > out.txt');
    expect(p).toMatchObject({ ok: true, commands: [{ argv: ['sort'], redirects: [{ op: '<', target: 'in.txt' }, { op: '>', target: 'out.txt' }] }] });
    expect(parseShell('open use <b>bold</b>')).toMatchObject({ ok: false }); // bash: unexpected token `newline'
  });
});

describe('describeShellPaste: what pasting text into "open " + text does', () => {
  it('a plain word is one argument and works', () => {
    expect(describeShellPaste('Smith')).toEqual({ lines: ['arguments: ["Smith"]'], broken: false });
  });

  it("O'Brien makes the shell refuse the whole command", () => {
    const d = describeShellPaste("O'Brien");
    expect(d.broken).toBe(true);
    expect(d.lines[0]).toMatch(/can't read it/);
  });

  it('fish & chips runs a second command, chips', () => {
    const d = describeShellPaste('fish & chips');
    expect(d.broken).toBe(true);
    expect(d.lines[0]).toBe('runs 2 commands: open fish  ·  chips');
  });

  it('a space splits a file name into two arguments', () => {
    expect(describeShellPaste('my report.pdf')).toEqual({ lines: ['arguments: ["my","report.pdf"]'], broken: true });
  });

  it('a line break starts a second command', () => {
    expect(describeShellPaste('Ada\nsecond line').lines[0]).toBe('runs 2 commands: open Ada  ·  second line');
  });
});
