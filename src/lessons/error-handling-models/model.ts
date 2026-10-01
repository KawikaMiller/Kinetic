// Pure logic for error-handling-models. The stage shows a small program; its trace is
// not hand-modelled but recorded by running that exact program for real, from an
// instrumented copy with event hooks added. Tests prove the hooks change nothing the
// program prints.

export type Fn = 'main' | 'handleRequest' | 'chargeCard' | 'callBank';
export type Mode = 'exceptions' | 'result';
export type FailAt = 'none' | 'chargeCard' | 'callBank';
export type Preset = 'boundary' | 'swallow' | 'rethrow' | 'unhandled';

export const FN_ARGS: Record<Fn, string> = { main: '', handleRequest: 'req', chargeCard: 'order', callBank: 'order' };

// ── The program ────────────────────────────────────────────────────────

const callBankLines = (fail: boolean, mode: Mode) => [
  'function callBank(order) {',
  mode === 'exceptions'
    ? fail
      ? "  throw new Error('bank timeout');"
      : "  return 'approved';"
    : fail
      ? "  return err('bank timeout');"
      : "  return ok('approved');",
  '}',
];

function chargeCardLines(preset: Preset, fail: boolean): string[] {
  const attempt = fail ? "    throw new Error('card expired');" : '    return callBank(order);';
  if (preset === 'swallow') return ['function chargeCard(order) {', '  try {', attempt, '  } catch {}', '}'];
  if (preset === 'rethrow') {
    return [
      'function chargeCard(order) {',
      '  try {',
      attempt,
      '  } catch (err) {',
      "    throw new Error('payment failed', { cause: err });",
      '  } finally {',
      "    log('chargeCard: release the card lock');",
      '  }',
      '}',
    ];
  }
  return ['function chargeCard(order) {', '  try {', attempt, '  } finally {', "    log('chargeCard: release the card lock');", '  }', '}'];
}

function handleRequestLines(preset: Preset): string[] {
  if (preset === 'unhandled') {
    return ['function handleRequest(req) {', '  const status = chargeCard(req.order);', '  return { ok: true, status };', '}'];
  }
  const caught = preset === 'rethrow' ? "err.message + ' (cause: ' + err.cause.message + ')'" : 'err.message';
  return [
    'function handleRequest(req) {',
    '  try {',
    '    const status = chargeCard(req.order);',
    '    return { ok: true, status };',
    '  } catch (err) {',
    `    log('handleRequest: caught ' + ${caught});`,
    '    return { ok: false, error: err.message };',
    '  }',
    '}',
  ];
}

const MAIN_LINES = [
  'function main() {',
  '  const res = handleRequest({ order: 42 });',
  "  log('main: responded ' + JSON.stringify(res));",
  '}',
];

const RESULT_HELPERS = ['const ok = (value) => ({ ok: true, value });', 'const err = (error) => ({ ok: false, error });', ''];

function resultChargeCard(fail: boolean): string[] {
  if (fail) return ['function chargeCard(order) {', "  return err('card expired');", '}'];
  return ['function chargeCard(order) {', '  const res = callBank(order);', '  if (!res.ok) return res;', '  return ok(res.value);', '}'];
}

const RESULT_HANDLE = [
  'function handleRequest(req) {',
  '  const res = chargeCard(req.order);',
  '  if (!res.ok) return { ok: false, error: res.error };',
  '  return { ok: true, status: res.value };',
  '}',
];

/** The program exactly as the stage shows it. */
export function programLines(mode: Mode, preset: Preset, failAt: FailAt): string[] {
  if (mode === 'result') {
    return [
      ...RESULT_HELPERS,
      ...callBankLines(failAt === 'callBank', 'result'),
      ...resultChargeCard(failAt === 'chargeCard'),
      ...RESULT_HANDLE,
      ...MAIN_LINES,
    ];
  }
  return [
    ...callBankLines(failAt === 'callBank', 'exceptions'),
    ...chargeCardLines(preset, failAt === 'chargeCard'),
    ...handleRequestLines(preset),
    ...MAIN_LINES,
  ];
}

// ── Running it ─────────────────────────────────────────────────────────

export type TraceEvent =
  | { kind: 'enter'; fn: Fn; line: number }
  | { kind: 'return'; fn: Fn; line: number; value: unknown }
  | { kind: 'leave'; fn: Fn; line: number }
  | { kind: 'throw'; fn: Fn; line: number; message: string }
  | { kind: 'unwind'; fn: Fn; line: number; message: string }
  | { kind: 'finally'; fn: Fn; line: number }
  | { kind: 'catch'; fn: Fn; line: number; message: string }
  | { kind: 'swallow'; fn: Fn; line: number; message: string }
  | { kind: 'log'; text: string }
  | { kind: 'crash'; message: string };

export interface RunResult {
  events: TraceEvent[];
  /** What the program printed with `log`. */
  output: string[];
  /** "Error: bank timeout" when an exception escaped main. */
  crash: string | null;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Add event hooks to the program without changing what it does: function entry/exit
 * wrappers, and a hook at every return, throw, catch and finally.
 */
export function instrument(lines: readonly string[]): string {
  let fn: Fn | null = null;
  return lines
    .map((code, i) => {
      const header = /^function (\w+)\(/.exec(code);
      if (header) {
        fn = header[1] as Fn;
        return `${code} __enter('${fn}', ${i}); try {`;
      }
      if (fn && code === '}') {
        const f = fn;
        fn = null;
        return `} catch (__e) { __unwind('${f}', ${i}, __e); throw __e; } finally { __leave('${f}', ${i}); } }`;
      }
      if (!fn) return code;
      return code
        .replace(/return (.*);$/, `return __ret('${fn}', ${i}, $1);`)
        .replace(/throw (.*);$/, `throw __throw('${fn}', ${i}, $1);`)
        .replace(/\} catch \(err\) \{$/, `} catch (err) { __catch('${fn}', ${i}, err);`)
        .replace(/\} catch \{\}$/, `} catch (__lost) { __swallow('${fn}', ${i}, __lost); }`)
        .replace(/\} finally \{$/, `} finally { __finally('${fn}', ${i});`);
    })
    .join('\n');
}

// Runtime code execution, deliberately: runPlain and runTraced run the program with
// `new Function` so the trace on screen is what JavaScript really does, not a hand-drawn
// guess. That's only acceptable because `lines` is built solely from this lesson's fixed
// templates (programLines picks among them from three Segmented choices); no learner input
// ever reaches it, and none must. It also needs 'unsafe-eval', so a strict Content Security
// Policy would break this lesson. See CLAUDE.md, "Runtime code execution".

/** Run the program's plain text (no hooks): what it prints, and whether it crashes. */
export function runPlain(lines: readonly string[]): { output: string[]; crash: string | null } {
  const output: string[] = [];
  try {
    new Function('log', `${lines.join('\n')}\nmain();`)((s: string) => output.push(s));
    return { output, crash: null };
  } catch (e) {
    return { output, crash: `Error: ${errText(e)}` };
  }
}

/** Run the instrumented program and record every event in the order JavaScript produced it. */
export function runTraced(lines: readonly string[]): RunResult {
  const events: TraceEvent[] = [];
  const output: string[] = [];
  const unwound = new Set<number>();
  let depth = 0;
  const hooks = {
    log: (text: string) => {
      output.push(text);
      events.push({ kind: 'log', text });
    },
    __enter: (fn: Fn, line: number) => {
      depth++;
      events.push({ kind: 'enter', fn, line });
    },
    __ret: (fn: Fn, line: number, value: unknown) => {
      events.push({ kind: 'return', fn, line, value });
      return value;
    },
    __throw: (fn: Fn, line: number, e: unknown) => {
      events.push({ kind: 'throw', fn, line, message: errText(e) });
      return e;
    },
    __catch: (fn: Fn, line: number, e: unknown) => events.push({ kind: 'catch', fn, line, message: errText(e) }),
    __swallow: (fn: Fn, line: number, e: unknown) => events.push({ kind: 'swallow', fn, line, message: errText(e) }),
    __finally: (fn: Fn, line: number) => events.push({ kind: 'finally', fn, line }),
    __unwind: (fn: Fn, line: number, e: unknown) => {
      unwound.add(depth);
      events.push({ kind: 'unwind', fn, line, message: errText(e) });
    },
    __leave: (fn: Fn, line: number) => {
      if (!unwound.delete(depth)) events.push({ kind: 'leave', fn, line });
      depth--;
    },
  };
  const names = Object.keys(hooks);
  let crash: string | null = null;
  try {
    new Function(...names, `${instrument(lines)}\nmain();`)(...names.map((n) => hooks[n as keyof typeof hooks]));
  } catch (e) {
    crash = `Error: ${errText(e)}`;
    events.push({ kind: 'crash', message: errText(e) });
  }
  return { events, output, crash };
}

/** Where each function is declared, for highlighting its header. */
export function headerLine(lines: readonly string[], fn: Fn): number {
  return lines.findIndex((l) => l.startsWith(`function ${fn}(`));
}

/** How a value looks in a caption: strings quoted, objects as JSON, undefined as is. */
export function show(v: unknown): string {
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return `'${v}'`;
  return JSON.stringify(v);
}
