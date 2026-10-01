// A small model of how a POSIX shell reads one command line: quoting, backslash
// escapes, command separators and redirections. It's simplified (no variables, globs,
// subshells or here-docs), but it treats the characters a shell treats as syntax as
// syntax, which is the whole point: text pasted into a command line is read as code.

export interface ShellCommand {
  argv: string[];
  /** Redirections such as `< b` or `> out.txt`: files read or written instead of arguments. */
  redirects: { op: '<' | '>' | '>>'; target: string }[];
}

export type ShellParse =
  | { ok: true; commands: ShellCommand[]; /** What joined each pair of commands. */ separators: string[] }
  | { ok: false; error: string };

const SEPARATORS = ['&&', '||', ';', '&', '|', '\n'] as const;

/** Parse a command line the way a shell would, up to the point where it would run. */
export function parseShell(line: string): ShellParse {
  const commands: ShellCommand[] = [];
  const separators: string[] = [];
  let current: ShellCommand = { argv: [], redirects: [] };
  let word: string | null = null;
  let pendingRedirect: '<' | '>' | '>>' | null = null;

  const endWord = () => {
    if (word === null) return;
    if (pendingRedirect) {
      current.redirects.push({ op: pendingRedirect, target: word });
      pendingRedirect = null;
    } else current.argv.push(word);
    word = null;
  };
  const endCommand = (sep: string | null): ShellParse | null => {
    endWord();
    if (pendingRedirect) return { ok: false, error: `a ${pendingRedirect} with no file name after it` };
    if (current.argv.length === 0 && current.redirects.length === 0) {
      if (sep === null && commands.length === 0) return null;
      if (sep === null) return null; // trailing & or ; is allowed
      return { ok: false, error: `nothing before "${sep === '\n' ? 'a line break' : sep}"` };
    }
    commands.push(current);
    if (sep !== null) separators.push(sep);
    current = { argv: [], redirects: [] };
    return null;
  };

  for (let i = 0; i < line.length; ) {
    const c = line[i];
    if (c === "'") {
      const close = line.indexOf("'", i + 1);
      if (close < 0) return { ok: false, error: 'an opening quote (\') with no closing quote' };
      word = (word ?? '') + line.slice(i + 1, close);
      i = close + 1;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let out = '';
      while (j < line.length && line[j] !== '"') {
        if (line[j] === '\\' && j + 1 < line.length && '"\\$`'.includes(line[j + 1])) j++;
        out += line[j++];
      }
      if (j >= line.length) return { ok: false, error: 'an opening quote (") with no closing quote' };
      word = (word ?? '') + out;
      i = j + 1;
      continue;
    }
    if (c === '\\' && i + 1 < line.length) {
      if (line[i + 1] !== '\n') word = (word ?? '') + line[i + 1]; // backslash-newline joins lines
      i += 2;
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
      endWord();
      if (pendingRedirect) return { ok: false, error: `a ${pendingRedirect} with no file name after it` };
      pendingRedirect = c === '>' && line[i + 1] === '>' ? '>>' : c;
      i += pendingRedirect.length;
      continue;
    }
    if (c === ' ' || c === '\t') {
      endWord();
      i++;
      continue;
    }
    word = (word ?? '') + c;
    i++;
  }
  const failed = endCommand(null);
  if (failed) return failed;
  return { ok: true, commands, separators };
}

const SEPARATOR_MEANING: Record<string, string> = {
  '&': 'runs the first command in the background and starts the next one',
  ';': 'ends one command and starts another',
  '\n': 'ends one command and starts another',
  '&&': 'runs the next command if the first succeeds',
  '||': 'runs the next command if the first fails',
  '|': 'pipes the first command into the next one',
};

/** What a shell would do with `open <text>` pasted together, in plain words for the stage. */
export function describeShellPaste(text: string): { lines: string[]; broken: boolean } {
  const parsed = parseShell(`open ${text}`);
  if (!parsed.ok) return { lines: [`the shell can't read it (${parsed.error}), so the command fails`], broken: true };
  const { commands, separators } = parsed;
  if (commands.length > 1) {
    const sep = separators[0];
    return {
      lines: [
        `runs ${commands.length} commands: ${commands.map((c) => c.argv.join(' ')).join('  ·  ')}`,
        `"${sep === '\n' ? 'a line break' : sep}" ${SEPARATOR_MEANING[sep]}`,
      ],
      broken: true,
    };
  }
  const [cmd] = commands;
  if (cmd.redirects.length) {
    return { lines: [`reads or writes files instead: ${cmd.redirects.map((r) => `${r.op} ${r.target}`).join(', ')}`], broken: true };
  }
  const args = cmd.argv.slice(1);
  return { lines: [`arguments: ${JSON.stringify(args)}`], broken: args.length !== 1 || args[0] !== text };
}
