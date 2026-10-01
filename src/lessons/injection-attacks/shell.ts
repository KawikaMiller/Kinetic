// A small model of how a POSIX shell like bash reads one command line: quoting,
// backslash escapes, command separators, redirections, and the characters that make it
// rewrite the line before running it (command substitution, variables, ~, globs, brace
// lists, comments). Expansions are recognised and reported, never carried out: nothing
// here runs anything. That is the whole point of the lesson: text pasted into a command
// line is read as code.

export interface ShellCommand {
  argv: string[];
  /** Redirections such as `< b`, `> out.txt` or `2> err.txt`: files read or written instead of arguments. */
  redirects: { op: '<' | '>' | '>>'; fd?: number; target: string }[];
}

/** A part of the line the shell would rewrite before running anything. */
export type ExpansionKind = 'command' | 'variable' | 'tilde' | 'glob' | 'brace' | 'comment';

export interface Expansion {
  kind: ExpansionKind;
  /** The characters that triggered it, as typed. */
  text: string;
}

export type ShellParse =
  | {
      ok: true;
      commands: ShellCommand[];
      /** What joined each pair of commands. */
      separators: string[];
      expansions: Expansion[];
    }
  | { ok: false; error: string };

const SEPARATORS = ['&&', '||', ';', '&', '|', '\n'] as const;
const VARIABLE_START = /[A-Za-z0-9_{?!#*@$-]/;
const GLOB_CHARS = '*?[';

/** Index of the `)` closing the `(` at `open`, counting nesting; -1 if it never closes. */
function closingParen(line: string, open: number): number {
  let depth = 0;
  for (let i = open; i < line.length; i++) {
    if (line[i] === '(') depth++;
    else if (line[i] === ')' && --depth === 0) return i;
  }
  return -1;
}

/**
 * Read a `$…` or backtick at `i` (outside single quotes). Returns the characters it
 * covers and what kind of expansion it is, or null if the `$` is just a literal dollar.
 */
function readDollarOrBacktick(line: string, i: number): { end: number; expansion: Expansion } | { error: string } | null {
  if (line[i] === '`') {
    const close = line.indexOf('`', i + 1);
    if (close < 0) return { error: 'an opening backtick (`) with no closing one' };
    return { end: close + 1, expansion: { kind: 'command', text: line.slice(i, close + 1) } };
  }
  const next = line[i + 1];
  if (next === '(') {
    const close = closingParen(line, i + 1);
    if (close < 0) return { error: 'a $( with no closing )' };
    return { end: close + 1, expansion: { kind: 'command', text: line.slice(i, close + 1) } };
  }
  if (next === '{') {
    const close = line.indexOf('}', i + 2);
    if (close < 0) return { error: 'a ${ with no closing }' };
    return { end: close + 1, expansion: { kind: 'variable', text: line.slice(i, close + 1) } };
  }
  if (next !== undefined && VARIABLE_START.test(next)) {
    let end = i + 2;
    if (/[A-Za-z_]/.test(next)) while (end < line.length && /[A-Za-z0-9_]/.test(line[end])) end++;
    return { end, expansion: { kind: 'variable', text: line.slice(i, end) } };
  }
  return null; // a lone "$" (end of line, before a space or a quote) stays a literal dollar
}

/** True if an unquoted word contains a brace list like {a,b} or {1..3}. */
const isBraceList = (s: string) => /\{[^{}\s]*(,|\.\.)[^{}\s]*\}/.test(s);

/** Parse a command line the way a shell would, up to the point where it would run. */
export function parseShell(line: string): ShellParse {
  const commands: ShellCommand[] = [];
  const separators: string[] = [];
  const expansions: Expansion[] = [];
  let current: ShellCommand = { argv: [], redirects: [] };
  let word: string | null = null;
  /** The unquoted characters of the current word, for brace-list detection. */
  let unquoted = '';
  let pendingRedirect: { op: '<' | '>' | '>>'; fd?: number } | null = null;

  const endWord = () => {
    if (word === null) return;
    if (isBraceList(unquoted)) expansions.push({ kind: 'brace', text: unquoted });
    if (pendingRedirect) {
      current.redirects.push({ ...pendingRedirect, target: word });
      pendingRedirect = null;
    } else current.argv.push(word);
    word = null;
    unquoted = '';
  };
  const endCommand = (sep: string | null): ShellParse | null => {
    endWord();
    if (pendingRedirect) return { ok: false, error: `a ${pendingRedirect.op} with no file name after it` };
    if (current.argv.length === 0 && current.redirects.length === 0) {
      if (sep === null) return null; // empty line, or a trailing & or ; (allowed)
      return { ok: false, error: `nothing before "${sep === '\n' ? 'a line break' : sep}"` };
    }
    commands.push(current);
    if (sep !== null) separators.push(sep);
    current = { argv: [], redirects: [] };
    return null;
  };
  const append = (text: string, quoted: boolean) => {
    word = (word ?? '') + text;
    if (!quoted) unquoted += text;
  };

  for (let i = 0; i < line.length; ) {
    const c = line[i];
    if (c === "'") {
      const close = line.indexOf("'", i + 1);
      if (close < 0) return { ok: false, error: "an opening quote (') with no closing quote" };
      append(line.slice(i + 1, close), true);
      i = close + 1;
      continue;
    }
    if (c === '"') {
      // Double quotes stop word splitting, globs, ~ and brace lists, but $ and ` still expand.
      let j = i + 1;
      let out = '';
      while (j < line.length && line[j] !== '"') {
        if (line[j] === '\\' && j + 1 < line.length && '"\\$`'.includes(line[j + 1])) {
          out += line[j + 1];
          j += 2;
          continue;
        }
        if (line[j] === '$' || line[j] === '`') {
          const read = readDollarOrBacktick(line, j);
          if (read && 'error' in read) return { ok: false, error: read.error };
          if (read) {
            expansions.push(read.expansion);
            out += read.expansion.text;
            j = read.end;
            continue;
          }
        }
        out += line[j++];
      }
      if (j >= line.length) return { ok: false, error: 'an opening quote (") with no closing quote' };
      append(out, true);
      i = j + 1;
      continue;
    }
    if (c === '\\' && i + 1 < line.length) {
      if (line[i + 1] !== '\n') append(line[i + 1], true); // backslash-newline joins lines
      i += 2;
      continue;
    }
    if (c === '$' || c === '`') {
      const read = readDollarOrBacktick(line, i);
      if (read && 'error' in read) return { ok: false, error: read.error };
      if (read) {
        expansions.push(read.expansion);
        append(read.expansion.text, true);
        i = read.end;
        continue;
      }
    }
    if (c === '#' && word === null) {
      // A # at the start of a word starts a comment: the rest of the line is ignored.
      const end = line.indexOf('\n', i);
      expansions.push({ kind: 'comment', text: line.slice(i, end < 0 ? line.length : end) });
      i = end < 0 ? line.length : end;
      continue;
    }
    if (c === '(' || c === ')') return { ok: false, error: `a "${c}" outside quotes, which the shell reads as syntax` };
    if (c === '~' && word === null) {
      expansions.push({ kind: 'tilde', text: '~' });
      append(c, false);
      i++;
      continue;
    }
    if (GLOB_CHARS.includes(c)) {
      expansions.push({ kind: 'glob', text: c });
      append(c, false);
      i++;
      continue;
    }
    const sep = SEPARATORS.find((s) => line.startsWith(s, i));
    if (sep) {
      const failed = endCommand(sep);
      if (failed) return failed;
      i += sep.length;
      continue;
    }
    if (c === '<' || c === '>') {
      // A word made only of digits right before < or > is a file descriptor (2> err.txt).
      const fd = word !== null && /^\d+$/.test(word) && unquoted === word ? Number(word) : undefined;
      if (fd !== undefined) {
        word = null;
        unquoted = '';
      } else endWord();
      if (pendingRedirect) return { ok: false, error: `a ${pendingRedirect.op} with no file name after it` };
      const op = c === '>' && line[i + 1] === '>' ? '>>' : c;
      pendingRedirect = fd === undefined ? { op } : { op, fd };
      i += op.length;
      continue;
    }
    if (c === ' ' || c === '\t') {
      endWord();
      i++;
      continue;
    }
    append(c, false);
    i++;
  }
  const failed = endCommand(null);
  if (failed) return failed;
  return { ok: true, commands, separators, expansions };
}

const SEPARATOR_MEANING: Record<string, string> = {
  '&': 'runs the first command in the background and starts the next one',
  ';': 'ends one command and starts another',
  '\n': 'ends one command and starts another',
  '&&': 'runs the next command if the first succeeds',
  '||': 'runs the next command if the first fails',
  '|': 'pipes the first command into the next one',
};

/** What each kind of expansion does, in plain words. */
export const EXPANSION_MEANING: Record<ExpansionKind, string> = {
  command: 'runs another command and pastes its output in',
  variable: "is replaced by a variable's value",
  tilde: 'becomes your home folder',
  glob: 'can turn into a list of matching file names',
  brace: 'turns into several separate words',
  comment: 'starts a comment, so the rest is ignored',
};

const describeExpansion = (e: Expansion) => `${e.text} ${EXPANSION_MEANING[e.kind]}`;

const formatRedirect = (r: ShellCommand['redirects'][number]) => `${r.fd ?? ''}${r.op} ${r.target}`;

/** What a shell would do with `open <text>` pasted together, in plain words for the stage. */
export function describeShellPaste(text: string): { lines: string[]; broken: boolean } {
  const parsed = parseShell(`open ${text}`);
  if (!parsed.ok) return { lines: [`the shell can't read it (${parsed.error}), so the command fails`], broken: true };
  const { commands, separators, expansions } = parsed;
  const rewrites = expansions.map((e) => `the shell rewrites it first: ${describeExpansion(e)}`);
  if (commands.length > 1) {
    const sep = separators[0];
    return {
      lines: [
        `runs ${commands.length} commands: ${commands.map((c) => c.argv.join(' ')).join('  ·  ')}`,
        `"${sep === '\n' ? 'a line break' : sep}" ${SEPARATOR_MEANING[sep]}`,
        ...rewrites,
      ],
      broken: true,
    };
  }
  if (commands.length === 0) return { lines: ['nothing left to run', ...rewrites], broken: true };
  const [cmd] = commands;
  if (cmd.redirects.length) {
    return { lines: [`reads or writes files instead: ${cmd.redirects.map(formatRedirect).join(', ')}`, ...rewrites], broken: true };
  }
  if (rewrites.length) return { lines: rewrites, broken: true };
  const args = cmd.argv.slice(1);
  return { lines: [`arguments: ${JSON.stringify(args)}`], broken: args.length !== 1 || args[0] !== text };
}
