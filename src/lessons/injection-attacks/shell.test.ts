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

  it('digits right before > name a file descriptor: x 2>y keeps x as the only argument', () => {
    expect(parseShell('open x 2>y')).toMatchObject({
      ok: true,
      commands: [{ argv: ['open', 'x'], redirects: [{ op: '>', fd: 2, target: 'y' }] }],
    });
  });

  it('an unquoted ( or ) is shell syntax, so ordinary text with brackets breaks the line', () => {
    expect(parseShell('open fish (and) chips')).toMatchObject({ ok: false }); // bash: syntax error near `('
  });
});

// Checked against bash 5 with stub commands (open printing its arguments, HOME=/home/me,
// three .txt files in the working directory): the expansions really happen there.
const kindsOf = (line: string) => {
  const p = parseShell(line);
  if (!p.ok) throw new Error(p.error);
  return p.expansions.map((e) => e.kind);
};

describe('parseShell recognises what the shell rewrites before running', () => {
  it('$(…) and backticks are command substitution', () => {
    expect(kindsOf('open $(date)')).toEqual(['command']); // bash ran date
    expect(kindsOf('open `date`')).toEqual(['command']);
    expect(kindsOf('open "$(date)"')).toEqual(['command']); // double quotes don't stop it
  });

  it('$NAME, ${NAME} and $5 are variables; a lone $ is a literal dollar', () => {
    expect(kindsOf('open $HOME')).toEqual(['variable']);
    expect(kindsOf('open ${HOME}x')).toEqual(['variable']);
    expect(kindsOf('open price $5')).toEqual(['variable']); // bash: [price], $5 is empty
    expect(kindsOf('open cost $')).toEqual([]); // bash: [cost][$]
    expect(kindsOf("open '$HOME'")).toEqual([]); // single quotes stop everything
  });

  it('~ at the start of a word, globs and brace lists expand; their look-alikes don\'t', () => {
    expect(kindsOf('open ~/notes.txt')).toEqual(['tilde']);
    expect(kindsOf('open a~b')).toEqual([]);
    expect(kindsOf('open *.txt')).toEqual(['glob']);
    expect(kindsOf('open {a,b}')).toEqual(['brace']); // bash: [a][b]
    expect(kindsOf('open {a}')).toEqual([]); // bash: [{a}]
    expect(kindsOf('open "{a,b}"')).toEqual([]);
  });

  it('# at the start of a word is a comment; inside a word it is just a character', () => {
    expect(kindsOf('open a # b')).toEqual(['comment']); // bash: [a]
    expect(kindsOf('open a#b')).toEqual([]);
  });

  it('unclosed substitutions are syntax errors', () => {
    expect(parseShell('open $(date')).toMatchObject({ ok: false });
    expect(parseShell('open `date')).toMatchObject({ ok: false });
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

  it('text the shell would rewrite is never reported as safe', () => {
    for (const text of ['$(date)', '`date`', '$HOME', '~/notes.txt', '{a,b}', '*.txt', 'Save $5 today', 'a # b']) {
      expect(describeShellPaste(text).broken, text).toBe(true);
    }
    expect(describeShellPaste('Save $5 today').lines).toEqual(["the shell rewrites it first: $5 is replaced by a variable's value"]);
    expect(describeShellPaste('fish (and) chips').lines[0]).toMatch(/can't read it/);
  });

  it('the fd redirect is reported with its descriptor', () => {
    expect(describeShellPaste('x 2>y').lines[0]).toBe('reads or writes files instead: 2> y');
  });
});
