// A tiny POSIX-ish shell: quoting, $VAR expansion, * globbing, pipelines, ; && ||, and
// redirections applied left to right to a file-descriptor table, exactly as a real shell
// does (which is why `2>&1 > file` and `> file 2>&1` differ).
import { runCommand } from './commands';
import type { Env, Fs } from './fixture';

type Op = ';' | '&&' | '||';
type RedirectOp = '>' | '>>' | '2>' | '2>>' | '2>&1';

type Token = { kind: 'word'; value: string } | { kind: 'op'; value: Op | '|' } | { kind: 'redirect'; value: RedirectOp };

export interface Redirect {
  op: RedirectOp;
  file?: string;
}

export interface SimpleCommand {
  argv: string[];
  redirects: Redirect[];
}

export interface Pipeline {
  /** The operator joining this pipeline to the previous one. */
  op: Op | null;
  commands: SimpleCommand[];
}

export class ShellSyntaxError extends Error {}

const OPERATORS = ['2>&1', '2>>', '&&', '||', '>>', '2>', '|', ';', '>'] as const;

/** Words and operators, with quotes removed, $VAR expanded and * globbed against the files. */
export function tokenize(line: string, env: Env, fs: Fs): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < line.length) {
    if (/\s/.test(line[i])) {
      i++;
      continue;
    }
    const op = OPERATORS.find((o) => line.startsWith(o, i) && !(o.startsWith('2') && i > 0 && !/\s/.test(line[i - 1])));
    if (op) {
      i += op.length;
      if (op === '|' || op === ';' || op === '&&' || op === '||') tokens.push({ kind: 'op', value: op });
      else tokens.push({ kind: 'redirect', value: op });
      continue;
    }
    let word = '';
    let globbable = false;
    while (i < line.length && !/\s/.test(line[i]) && !OPERATORS.some((o) => !o.startsWith('2') && line.startsWith(o, i))) {
      const c = line[i];
      if (c === "'") {
        const end = line.indexOf("'", i + 1);
        if (end < 0) throw new ShellSyntaxError("unexpected end of line: missing closing '");
        word += line.slice(i + 1, end); // single quotes: completely literal
        i = end + 1;
      } else if (c === '"') {
        let j = i + 1;
        let inner = '';
        while (j < line.length && line[j] !== '"') {
          if (line[j] === '\\' && '"$\\'.includes(line[j + 1] ?? '')) {
            inner += line[j + 1];
            j += 2;
          } else if (line[j] === '$') {
            const v = readVar(line, j, env);
            inner += v.value;
            j = v.end;
          } else inner += line[j++];
        }
        if (j >= line.length) throw new ShellSyntaxError('unexpected end of line: missing closing "');
        word += inner;
        i = j + 1;
      } else if (c === '\\') {
        word += line[i + 1] ?? '';
        i += 2;
      } else if (c === '$') {
        const v = readVar(line, i, env);
        word += v.value;
        i = v.end;
      } else {
        if (c === '*' || c === '?') globbable = true;
        word += c;
        i++;
      }
    }
    for (const w of globbable ? glob(word, fs) : [word]) tokens.push({ kind: 'word', value: w });
  }
  return tokens;
}

/** $NAME or ${NAME}; an unset variable expands to nothing, as in sh. */
function readVar(line: string, at: number, env: Env): { value: string; end: number } {
  const braced = /^\$\{([A-Za-z_]\w*)\}/.exec(line.slice(at));
  if (braced) return { value: env[braced[1]] ?? '', end: at + braced[0].length };
  const plain = /^\$([A-Za-z_]\w*)/.exec(line.slice(at));
  if (plain) return { value: env[plain[1]] ?? '', end: at + plain[0].length };
  return { value: '$', end: at + 1 };
}

/** File names matching * and ?, sorted; with no match the pattern stays as typed (bash's default). */
export function glob(pattern: string, fs: Fs): string[] {
  const re = new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*').replaceAll('?', '.')}$`);
  const hits = Object.keys(fs).filter((f) => re.test(f)).sort();
  return hits.length ? hits : [pattern];
}

export function parse(line: string, env: Env, fs: Fs): Pipeline[] {
  const tokens = tokenize(line, env, fs);
  const pipelines: Pipeline[] = [];
  let op: Op | null = null;
  let commands: SimpleCommand[] = [];
  let current: SimpleCommand = { argv: [], redirects: [] };

  const endCommand = () => {
    if (current.argv.length === 0) throw new ShellSyntaxError('syntax error: a command is missing');
    commands.push(current);
    current = { argv: [], redirects: [] };
  };
  const endPipeline = () => {
    endCommand();
    pipelines.push({ op, commands });
    commands = [];
  };

  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.kind === 'word') current.argv.push(t.value);
    else if (t.kind === 'redirect') {
      if (t.value === '2>&1') current.redirects.push({ op: t.value });
      else {
        const target = tokens[++k];
        if (!target || target.kind !== 'word') throw new ShellSyntaxError(`syntax error: ${t.value} needs a file name`);
        current.redirects.push({ op: t.value, file: target.value });
      }
    } else if (t.value === '|') endCommand();
    else {
      endPipeline();
      op = t.value;
    }
  }
  if (current.argv.length || commands.length || pipelines.length === 0) endPipeline();
  return pipelines;
}

// ─── Running it ─────────────────────────────────────────────────────────────

/** Where a file descriptor points. */
type Target = { to: 'pipe' } | { to: 'terminal' } | { to: 'file'; file: string; append: boolean };

export interface StageRun {
  argv: string[];
  stdinCount: number;
  stdout: string[];
  stderr: string[];
  exit: number;
  /** Where stdout and stderr ended up, after redirections: "pipe", "terminal" or a file name. */
  stdoutTo: string;
  stderrTo: string;
  /** What this command printed to the terminal, in order. */
  printed: TermLine[];
}

export interface TermLine {
  text: string;
  stream: 'out' | 'err';
}

export interface PipelineRun {
  op: Op | null;
  source: string;
  ran: boolean;
  stages: StageRun[];
  exit: number | null;
}

export interface ShellResult {
  runs: PipelineRun[];
  terminal: TermLine[];
  fs: Fs;
  /** Files created or changed by redirections. */
  written: string[];
  error: string | null;
}

const describe = (t: Target) => (t.to === 'file' ? t.file : t.to);

/** Run one command line against a copy of `fs`. Never throws: syntax errors come back in `error`. */
export function runShell(line: string, fsIn: Fs, env: Env): ShellResult {
  const fs: Fs = { ...fsIn };
  const terminal: TermLine[] = [];
  const written = new Set<string>();
  let pipelines: Pipeline[];
  try {
    pipelines = parse(line, env, fs);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { runs: [], terminal: [{ text: `bash: ${error}`, stream: 'err' }], fs, written: [], error };
  }

  const write = (target: Target, out: string[], into: string[], stream: TermLine['stream'], printed: TermLine[]) => {
    if (target.to === 'pipe') into.push(...out);
    else if (target.to === 'terminal') {
      const shown = out.map((text) => ({ text, stream }));
      terminal.push(...shown);
      printed.push(...shown);
    } else {
      // `>` already truncated the file when it was opened, so every write appends: with
      // `> f 2>&1` stdout and stderr share the file instead of overwriting each other.
      const before = fs[target.file] ?? '';
      const text = out.join('\n');
      fs[target.file] = before && text ? `${before}\n${text}` : before + text;
      written.add(target.file);
    }
  };

  const runs: PipelineRun[] = [];
  let last = 0;
  for (const p of pipelines) {
    const source = p.commands.map((c) => c.argv.join(' ')).join(' | ');
    const ran = p.op === null || p.op === ';' || (p.op === '&&' ? last === 0 : last !== 0);
    if (!ran) {
      runs.push({ op: p.op, source, ran, stages: [], exit: null });
      continue;
    }
    const stages: StageRun[] = [];
    let stdin: string[] = [];
    p.commands.forEach((cmd, k) => {
      const isLast = k === p.commands.length - 1;
      // The fd table: stdout feeds the next command (or the terminal), stderr the terminal...
      const fd: Record<1 | 2, Target> = { 1: isLast ? { to: 'terminal' } : { to: 'pipe' }, 2: { to: 'terminal' } };
      // ...then each redirection, left to right. Files open (and truncate) before the command runs.
      for (const r of cmd.redirects) {
        if (r.op === '2>&1') fd[2] = fd[1];
        else {
          const target: Target = { to: 'file', file: r.file!, append: r.op.endsWith('>>') };
          if (!target.append) fs[target.file] = '';
          if (r.op.startsWith('2')) fd[2] = target;
          else fd[1] = target;
          written.add(target.file);
        }
      }
      const out = runCommand(cmd.argv, stdin, fs);
      const next: string[] = [];
      const printed: TermLine[] = [];
      write(fd[1], out.stdout, next, 'out', printed);
      write(fd[2], out.stderr, next, 'err', printed);
      stages.push({ argv: cmd.argv, stdinCount: stdin.length, ...out, stdoutTo: describe(fd[1]), stderrTo: describe(fd[2]), printed });
      stdin = next;
    });
    last = stages.at(-1)!.exit; // a pipeline's exit status is its last command's
    runs.push({ op: p.op, source, ran, stages, exit: last });
  }
  return { runs, terminal, fs, written: [...written], error: null };
}

/** argv as you could type it back: empty or spaced arguments get single quotes. */
export const showArgv = (argv: readonly string[]) => argv.map((a) => (a === '' || /[\s'"|;&<>$*?]/.test(a) ? `'${a.replaceAll("'", "'\\''")}'` : a)).join(' ');
