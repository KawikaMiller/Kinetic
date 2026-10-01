// Small, pure re-implementations of the commands the lesson uses, matching GNU coreutils
// and grep on the cases shown (output formats, exit codes, error messages).
import type { Fs } from './fixture';

export interface Output {
  stdout: string[];
  stderr: string[];
  exit: number;
}

type Command = (args: string[], stdin: string[], fs: Fs) => Output;

const lines = (text: string) => (text === '' ? [] : text.split('\n'));
const ok = (stdout: string[]): Output => ({ stdout, stderr: [], exit: 0 });

/** Split combined short flags: -rn → r, n. Returns the flags and the remaining operands. */
function flags(args: string[], withValue: readonly string[] = []): { set: Set<string>; values: Record<string, string>; rest: string[] } {
  const set = new Set<string>();
  const values: Record<string, string> = {};
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('-') || a === '-') {
      rest.push(a);
      continue;
    }
    for (let k = 1; k < a.length; k++) {
      const f = a[k];
      if (withValue.includes(f)) {
        values[f] = a.slice(k + 1) || args[++i] || '';
        break;
      }
      set.add(f);
    }
  }
  return { set, values, rest };
}

/** Each named file's lines, or stdin when no files are named; missing files become errors. */
function inputs(cmd: string, files: string[], stdin: string[], fs: Fs) {
  if (files.length === 0) return { chunks: [{ name: '(stdin)', lines: stdin }], errors: [] as string[] };
  const chunks: { name: string; lines: string[] }[] = [];
  const errors: string[] = [];
  for (const f of files) {
    if (f in fs) chunks.push({ name: f, lines: lines(fs[f]) });
    else errors.push(`${cmd}: ${f}: No such file or directory`);
  }
  return { chunks, errors };
}

const cat: Command = (args, stdin, fs) => {
  const { chunks, errors } = inputs('cat', args, stdin, fs);
  return { stdout: chunks.flatMap((c) => c.lines), stderr: errors, exit: errors.length ? 1 : 0 };
};

/** grep with a fixed-string pattern. Exit 0 if a line matched, 1 if none, 2 on an error. */
const grep: Command = (args, stdin, fs) => {
  const { set, rest } = flags(args);
  const [pattern, ...files] = rest;
  if (pattern === undefined) return { stdout: [], stderr: ['Usage: grep [OPTION]... PATTERNS [FILE]...'], exit: 2 };
  const { chunks, errors } = inputs('grep', files, stdin, fs);
  const needle = set.has('i') ? pattern.toLowerCase() : pattern;
  const prefix = chunks.length > 1;
  const stdout: string[] = [];
  let matched = 0;
  for (const c of chunks) {
    const hits = c.lines.filter((l) => (set.has('i') ? l.toLowerCase() : l).includes(needle) !== set.has('v'));
    matched += hits.length;
    if (set.has('c')) stdout.push(prefix ? `${c.name}:${hits.length}` : String(hits.length));
    else stdout.push(...hits.map((h) => (prefix ? `${c.name}:${h}` : h)));
  }
  return { stdout, stderr: errors, exit: errors.length ? 2 : matched > 0 ? 0 : 1 };
};

/** cut -d D -f N[,M…]: lines without the delimiter pass through whole (GNU default). */
const cut: Command = (args, stdin, fs) => {
  const { values, rest } = flags(args, ['d', 'f']);
  const delimiter = values.d ?? '\t';
  if (!values.f) return { stdout: [], stderr: ['cut: you must specify a list of bytes, characters, or fields'], exit: 1 };
  const asked = values.f.split(',').map(Number);
  if (asked.some((n) => !Number.isInteger(n) || n < 1)) return { stdout: [], stderr: [`cut: invalid field value '${values.f}'`], exit: 1 };
  // GNU cut prints the selected fields once each, in increasing order, skipping any past the end.
  const fields = [...new Set(asked)].sort((a, b) => a - b);
  const { chunks, errors } = inputs('cut', rest, stdin, fs);
  const pick = (line: string) => {
    if (!line.includes(delimiter)) return line;
    const parts = line.split(delimiter);
    return fields.filter((n) => n <= parts.length).map((n) => parts[n - 1]).join(delimiter);
  };
  const stdout = chunks.flatMap((c) => c.lines.map(pick));
  return { stdout, stderr: errors, exit: errors.length ? 1 : 0 };
};

/** Byte-order comparison, as sort does with LC_ALL=C. */
const byteCompare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const leadingNumber = (l: string) => {
  const m = /^\s*(-?\d+(?:\.\d+)?)/.exec(l);
  return m ? Number(m[1]) : 0;
};

/** sort [-n] [-r] [-u]: ties under -n fall back to comparing the whole line, like GNU sort. */
const sort: Command = (args, stdin, fs) => {
  const { set, rest } = flags(args);
  const { chunks, errors } = inputs('sort', rest, stdin, fs);
  const all = chunks.flatMap((c) => c.lines);
  const cmp = (a: string, b: string) => (set.has('n') ? leadingNumber(a) - leadingNumber(b) || byteCompare(a, b) : byteCompare(a, b));
  let out = [...all].sort((a, b) => (set.has('r') ? -cmp(a, b) : cmp(a, b)));
  if (set.has('u')) out = out.filter((l, i) => i === 0 || l !== out[i - 1]);
  return { stdout: out, stderr: errors, exit: errors.length ? 2 : 0 };
};

/** uniq [-c]: collapses ADJACENT duplicates only (which is why it comes after sort). */
const uniq: Command = (args, stdin, fs) => {
  const { set, rest } = flags(args);
  const { chunks, errors } = inputs('uniq', rest.slice(0, 1), stdin, fs);
  const runs: { line: string; count: number }[] = [];
  for (const l of chunks.flatMap((c) => c.lines)) {
    const last = runs.at(-1);
    if (last && last.line === l) last.count++;
    else runs.push({ line: l, count: 1 });
  }
  // GNU uniq -c right-aligns the count in a 7-character field.
  const stdout = runs.map((r) => (set.has('c') ? `${String(r.count).padStart(7)} ${r.line}` : r.line));
  return { stdout, stderr: errors, exit: errors.length ? 1 : 0 };
};

function countFlag(args: string[]): { n: number; rest: string[] } {
  const rest: string[] = [];
  let n = 10;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-n') n = Number(args[++i]);
    else if (/^-n\d+$/.test(a)) n = Number(a.slice(2));
    else if (/^-\d+$/.test(a)) n = Number(a.slice(1));
    else rest.push(a);
  }
  return { n, rest };
}

const head: Command = (args, stdin, fs) => {
  const { n, rest } = countFlag(args);
  const { chunks, errors } = inputs('head', rest, stdin, fs);
  return { stdout: chunks.flatMap((c) => c.lines.slice(0, n)), stderr: errors, exit: errors.length ? 1 : 0 };
};

const tail: Command = (args, stdin, fs) => {
  const { n, rest } = countFlag(args);
  const { chunks, errors } = inputs('tail', rest, stdin, fs);
  return { stdout: chunks.flatMap((c) => c.lines.slice(Math.max(0, c.lines.length - n))), stderr: errors, exit: errors.length ? 1 : 0 };
};

/** Bytes on disk: the fixture stores contents without the final newline a real file ends with. */
const fileBytes = (text: string) => new TextEncoder().encode(text).length + 1;

/**
 * wc -l: "12" for stdin, "12 access.log" for one named file. With several files GNU wc adds a
 * "total" line and right-aligns every count to the digit count of the files' combined size.
 */
const wc: Command = (args, stdin, fs) => {
  const { rest } = flags(args);
  const { chunks, errors } = inputs('wc', rest, stdin, fs);
  const exit = errors.length ? 1 : 0;
  if (rest.length === 0) return { stdout: chunks.map((c) => String(c.lines.length)), stderr: errors, exit };
  if (rest.length === 1) return { stdout: chunks.map((c) => `${c.lines.length} ${c.name}`), stderr: errors, exit };
  const width = String(chunks.reduce((n, c) => n + fileBytes(fs[c.name]), 0)).length;
  const row = (count: number, name: string) => `${String(count).padStart(width)} ${name}`;
  const total = chunks.reduce((n, c) => n + c.lines.length, 0);
  return { stdout: [...chunks.map((c) => row(c.lines.length, c.name)), row(total, 'total')], stderr: errors, exit };
};

const echo: Command = (args) => ok([args.join(' ')]);
const ls: Command = (_args, _stdin, fs) => ok(Object.keys(fs).sort(byteCompare));
const trueCmd: Command = () => ok([]);
const falseCmd: Command = () => ({ stdout: [], stderr: [], exit: 1 });

export const COMMANDS: Record<string, Command> = {
  cat, grep, cut, sort, uniq, head, tail, wc, echo, ls, true: trueCmd, false: falseCmd,
};

export function runCommand(argv: string[], stdin: string[], fs: Fs): Output {
  const [name, ...args] = argv;
  const cmd = COMMANDS[name];
  if (!cmd) return { stdout: [], stderr: [`bash: ${name}: command not found`], exit: 127 };
  return cmd(args, stdin, fs);
}
