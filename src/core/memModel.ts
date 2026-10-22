/**
 * memModel (K4-3): a tiny litmus-test language and three memory models, enumerated exhaustively.
 *
 *  - `sc`:      sequential consistency. One step at a time, every thread in program order, a store is
 *               visible to every thread at once.
 *  - `tso`:     x86-style. One FIFO store buffer per thread; a store enters the buffer and drains to
 *               memory later, in order; a load reads the thread's own newest buffered store to that
 *               location, else memory; a full fence is only possible with an empty buffer.
 *  - `relaxed`: a view-based weak model, scoped to what message passing needs. Every location keeps the
 *               history of writes to it (appended in the order the stores execute); every thread has a
 *               VIEW per location (the oldest write it may still read). A load may read any write at
 *               or after its view and moves the view up to it; a store moves the writer's view to its
 *               own write; a release store records the writer's whole view with the write; an acquire
 *               load that reads such a write merges that view into its own; a full fence moves the
 *               thread's view to the newest write of every location. A `sc` access is modelled as a
 *               full fence immediately before the access, which then acts as acquire (load) or release
 *               (store). Tags (`@rlx @acq @rel @sc`) are ignored by `sc` and `tso`, which order every
 *               access anyway.
 *
 * NOT MODELLED, and the lesson must say so on screen: load buffering (r0 = r1 = 1), IRIW and multi-copy
 * atomicity, 2+2W (stores are appended to a location's history in execution order, so two writers never
 * disagree about it), out-of-thin-air values, `consume`, compiler reordering, loops, conditional retry,
 * indirect addressing, and compare-and-swap (lock-free-cas is lesson-local over core/explore). The
 * relaxed model reorders on the READING side only (stale reads); a store never overtakes an earlier store
 * of its own thread in the history, so on this model a fence on the reader alone already restores
 * message passing, which is not true of every real architecture. The LB fixture documents the gap: its
 * 1,1 outcome is never reported by any model here, which says nothing about real hardware. The `sc`
 * tag (a fence before the access) is stronger than C++ seq_cst in corners: with seq_cst on only the stores,
 * or only the loads, of store buffering, C++ still allows 0,0 and this model does not (tested).
 *
 * What an outcome table may claim (AC-0/T4 #27, #28, #31): "allowed by the model", never "observed", and
 * "not reachable" only when `truncated` is false.
 *
 * The expected-outcome tables pinned in memModel.test.ts (SB, MP, CoRR, Dekker) are typed from memory
 * of the published litmus results (Sewell et al. x86-TSO; the ARM and POWER catalogues), not copied from
 * a source: a reviewer verifies each cell. Built on core/explore, so every action carries the acting
 * thread's label and every outcome has a SHORTEST witness schedule.
 *
 * Learner text: `parseLitmus` reads one thread per line through core/parseKit (positioned refusals,
 * size caps); no eval, no RegExp on learner text.
 *
 *     init x=0 y=0          # optional; unlisted locations start at 0
 *     T0: x = 1 ; r0 = y    # `Tn:` is optional; registers are r0, r1, ...; locations are the rest
 *     T1: y = 1 @rel ; r1 = x @acq ; fence
 */
import { explore, DEFAULT_MAX_STATES, type ActionLabel, type PathStep } from './explore';
import { cursorOf, parseKitRows, type KitRead, type KitRows, type TokenCursor, type TokenRule } from './parseKit';

export type Ord = 'rlx' | 'acq' | 'rel' | 'sc';
export type Instr =
  | { op: 'store'; loc: string; value: number; ord?: Ord }
  | { op: 'load'; reg: string; loc: string; ord?: Ord }
  | { op: 'fence' };
export interface Litmus {
  name: string;
  /** Initial memory; a location that is used but not listed starts at 0. */
  init: Record<string, number>;
  threads: Instr[][];
}
export type Model = 'sc' | 'tso' | 'relaxed';
export const MODELS: readonly Model[] = ['sc', 'tso', 'relaxed'];

// ── Limits ──────────────────────────────────────────────────────────────

export const MAX_THREADS = 3;
export const MAX_INSTRS_PER_THREAD = 5;
export const MAX_INSTRS_TOTAL = 10;
export const MAX_LOCATIONS = 3;
export const MAX_VALUE = 9;
export const MAX_LINE_CHARS = 120;

/** null when the program is within the limits, else the sentence to show. */
export function litmusSizeError(l: Litmus): string | null {
  if (l.threads.length < 1) return 'Write at least one thread.';
  if (l.threads.length > MAX_THREADS) return `Use at most ${MAX_THREADS} threads: that is ${l.threads.length}.`;
  const long = l.threads.findIndex((t) => t.length > MAX_INSTRS_PER_THREAD);
  if (long >= 0) return `Use at most ${MAX_INSTRS_PER_THREAD} instructions per thread: T${long} has ${l.threads[long].length}.`;
  const total = l.threads.reduce((n, t) => n + t.length, 0);
  if (total > MAX_INSTRS_TOTAL) return `Use at most ${MAX_INSTRS_TOTAL} instructions in all: that is ${total}.`;
  const locs = locationsOf(l);
  if (locs.length > MAX_LOCATIONS) return `Use at most ${MAX_LOCATIONS} locations: that is ${locs.length} (${locs.join(', ')}).`;
  return null;
}

function locationsOf(l: Litmus): string[] {
  const set = new Set(Object.keys(l.init));
  for (const t of l.threads) for (const i of t) if (i.op !== 'fence') set.add(i.loc);
  return [...set].sort();
}

// ── Reading learner text ────────────────────────────────────────────────

const RULES: TokenRule[] = [
  { kind: 'num', pattern: /\d+/ },
  { kind: 'id', pattern: /[A-Za-z_][A-Za-z0-9_]*/ },
  { kind: '=', pattern: /=/ },
  { kind: ';', pattern: /;/ },
  { kind: ':', pattern: /:/ },
  { kind: '@', pattern: /@/ },
  { kind: ',', pattern: /,/ },
];
const ORD_NAMES: readonly Ord[] = ['rlx', 'acq', 'rel', 'sc'];
const isRegister = (name: string) => /^r\d+$/.test(name);
const isKeyword = (name: string) => name === 'fence' || name === 'init';

type Row = { kind: 'init'; values: Record<string, number> } | { kind: 'thread'; instrs: Instr[] };

function readValue(c: TokenCursor): KitRead<number> {
  const t = c.accept('num');
  if (!t) return c.fail('expected a whole number.');
  const value = Number(t.text);
  return value > MAX_VALUE ? c.failAt(t, `${value} is too big: values go from 0 to ${MAX_VALUE}.`) : { ok: true, value };
}

function readTag(c: TokenCursor, allowed: readonly Ord[], what: string): KitRead<Ord | undefined> {
  if (!c.accept('@')) return { ok: true, value: undefined };
  const t = c.accept('id');
  if (!t) return c.fail(`expected a tag after "@": ${allowed.map((o) => `@${o}`).join(', ')}.`);
  const ord = ORD_NAMES.find((o) => o === t.text);
  if (!ord) return c.failAt(t, `"${t.text}" is not a tag: use ${ORD_NAMES.map((o) => `@${o}`).join(', ')}.`);
  if (!allowed.includes(ord)) return c.failAt(t, `a ${what} cannot be @${ord}: use ${allowed.map((o) => `@${o}`).join(', ')}.`);
  return { ok: true, value: ord };
}

function readInstr(c: TokenCursor): KitRead<Instr> {
  const first = c.accept('id');
  if (!first) return c.fail('expected an instruction: "x = 1", "r0 = x" or "fence".');
  if (first.text === 'fence') return { ok: true, value: { op: 'fence' } };
  if (isKeyword(first.text)) return c.failAt(first, `"${first.text}" cannot be used here.`);
  if (!c.accept('=')) return c.fail(`expected "=" after ${first.text}.`);
  if (isRegister(first.text)) {
    const loc = c.accept('id');
    if (!loc) return c.fail(`${first.text} is a register: it can only be loaded into, from a location ("${first.text} = x").`);
    if (isRegister(loc.text) || isKeyword(loc.text)) return c.failAt(loc, `"${loc.text}" is not a location: a load reads a location such as x.`);
    const ord = readTag(c, ['rlx', 'acq', 'sc'], 'load');
    if (!ord.ok) return ord;
    return { ok: true, value: { op: 'load', reg: first.text, loc: loc.text, ...(ord.value ? { ord: ord.value } : {}) } };
  }
  const value = readValue(c);
  if (!value.ok) return value;
  const ord = readTag(c, ['rlx', 'rel', 'sc'], 'store');
  if (!ord.ok) return ord;
  return { ok: true, value: { op: 'store', loc: first.text, value: value.value, ...(ord.value ? { ord: ord.value } : {}) } };
}

function readRow(c: TokenCursor): KitRead<Row> {
  const head = c.peek();
  if (head?.kind === 'id' && head.text === 'init') {
    c.next();
    const values: Record<string, number> = {};
    while (!c.atEnd()) {
      c.accept(',');
      const name = c.accept('id');
      if (!name) return c.fail('expected a location name.');
      if (isRegister(name.text) || isKeyword(name.text)) return c.failAt(name, `"${name.text}" is not a location.`);
      if (!c.accept('=')) return c.fail(`expected "=" after ${name.text}.`);
      const value = readValue(c);
      if (!value.ok) return value;
      if (name.text in values) return c.failAt(name, `${name.text} is initialised twice.`);
      values[name.text] = value.value;
    }
    return { ok: true, value: { kind: 'init', values } };
  }
  const label = c.rest();
  const body = label[0]?.kind === 'id' && label[1]?.kind === ':' ? label.slice(2) : label;
  const instrs: Instr[] = [];
  const inner = cursorOf(body, 1);
  while (true) {
    const instr = readInstr(inner);
    if (!instr.ok) return instr;
    instrs.push(instr.value);
    if (inner.atEnd()) break;
    if (!inner.accept(';')) return inner.fail(`expected ";" or the end of the line, not "${inner.peek()?.text}".`);
  }
  return { ok: true, value: { kind: 'thread', instrs } };
}

export type LitmusParse = { ok: true; litmus: Litmus } | { ok: false; error: string; line?: number; column?: number };

/** Read a litmus test from text. Refuses by line and column; also refuses a program over the size limits. */
export function parseLitmus(text: string, name = 'litmus'): LitmusParse {
  const read: KitRows<Row> = parseKitRows(text, {
    tokens: RULES,
    maxRows: MAX_THREADS + 2,
    maxLineChars: MAX_LINE_CHARS,
    trailingComments: true,
    noun: { one: 'line', many: 'lines' },
    row: (cursor) => readRow(cursor),
  });
  if (!read.ok) return read;
  const init: Record<string, number> = {};
  const threads: Instr[][] = [];
  for (const { line, value } of read.rows) {
    if (value.kind === 'init') {
      if (Object.keys(init).length > 0) return { ok: false, line, error: `Line ${line}: only one "init" line.` };
      Object.assign(init, value.values);
    } else {
      threads.push(value.instrs);
    }
  }
  const litmus: Litmus = { name, init, threads };
  const tooBig = litmusSizeError(litmus);
  return tooBig ? { ok: false, error: tooBig } : { ok: true, litmus };
}

const tagText = (ord: Ord | undefined) => (ord ? ` @${ord}` : '');
export const instrText = (i: Instr): string =>
  i.op === 'fence' ? 'fence' : i.op === 'store' ? `${i.loc} = ${i.value}${tagText(i.ord)}` : `${i.reg} = ${i.loc}${tagText(i.ord)}`;

/** The text `parseLitmus` reads back to the same program. */
export function formatLitmus(l: Litmus): string {
  const init = Object.entries(l.init)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`);
  return [...(init.length ? [`init ${init.join(' ')}`] : []), ...l.threads.map((t, i) => `T${i}: ${t.map(instrText).join(' ; ')}`)].join('\n');
}

// ── Enumeration ─────────────────────────────────────────────────────────

/** One state along a witness schedule, in names a lesson can draw. Registers are keyed "T0.r0". */
export interface Snapshot {
  pcs: number[];
  regs: Record<string, number>;
  /** Memory (for `relaxed`: the newest write of each location). */
  mem: Record<string, number>;
  /** TSO only: each thread's store buffer, oldest first, as "x=1". Empty lists otherwise. */
  buffers: string[][];
  /** Relaxed only: for each thread, the history index it may read each location from. */
  views: Record<string, number>[];
}
export type Step = PathStep<Snapshot, ActionLabel>;

export interface Outcome {
  /** Registers and memory at the end: "T0.r0=0 T1.r1=0 | x=1 y=1". */
  key: string;
  /** Registers only: "T0.r0=0 T1.r1=0". Two outcomes may share it when the final memory differs. */
  regsKey: string;
  regs: Record<string, number>;
  mem: Record<string, number>;
  /** The shortest schedule that reaches it. */
  example: Step[];
}
export interface Outcomes {
  /** The state before any step, for a trace player's start. */
  start: Snapshot;
  outcomes: Map<string, Outcome>;
  /** Distinct states visited. */
  states: number;
  /** True when the budget stopped the search: absent outcomes are then NOT proven unreachable. */
  truncated: boolean;
}

interface Compiled {
  locs: string[];
  regNames: string[][];
  threads: Instr[][];
  init: number[];
}

function compile(l: Litmus): Compiled {
  const locs = locationsOf(l);
  return {
    locs,
    regNames: l.threads.map((t) => [...new Set(t.flatMap((i) => (i.op === 'load' ? [i.reg] : [])))].sort()),
    threads: l.threads,
    init: locs.map((x) => l.init[x] ?? 0),
  };
}

/** The union of the three models' states; fields a model does not use stay empty. */
interface State {
  pcs: number[];
  regs: number[][];
  mem: number[];
  buffers: [number, number][][];
  /** relaxed: per location, the writes in order: value and the release view carried (or null). */
  hist: { v: number; carry: number[] | null }[][];
  views: number[][];
}

const replace = <T>(xs: readonly T[], i: number, x: T): T[] => xs.map((y, j) => (j === i ? x : y));

function initial(c: Compiled, model: Model): State {
  return {
    pcs: c.threads.map(() => 0),
    regs: c.regNames.map((r) => r.map(() => 0)),
    mem: c.init,
    buffers: c.threads.map(() => []),
    hist: model === 'relaxed' ? c.init.map((v) => [{ v, carry: null }]) : [],
    views: model === 'relaxed' ? c.threads.map(() => c.locs.map(() => 0)) : [],
  };
}

const stateKey = (s: State): string => JSON.stringify([s.pcs, s.regs, s.mem, s.buffers, s.hist, s.views]);

function isTerminal(c: Compiled, s: State): boolean {
  return s.pcs.every((p, t) => p >= c.threads[t].length) && s.buffers.every((b) => b.length === 0);
}

type Move = { label: ActionLabel; next: State };

function withReg(c: Compiled, s: State, t: number, reg: string, v: number): number[][] {
  return replace(s.regs, t, replace(s.regs[t], c.regNames[t].indexOf(reg), v));
}

function movesSc(c: Compiled, s: State): Move[] {
  const out: Move[] = [];
  c.threads.forEach((prog, t) => {
    const i = prog[s.pcs[t]];
    if (!i) return;
    const pcs = replace(s.pcs, t, s.pcs[t] + 1);
    const actor = `T${t}`;
    if (i.op === 'store') {
      out.push({ label: { actor, text: `store ${instrText(i)}` }, next: { ...s, pcs, mem: replace(s.mem, c.locs.indexOf(i.loc), i.value) } });
    } else if (i.op === 'load') {
      const v = s.mem[c.locs.indexOf(i.loc)];
      out.push({ label: { actor, text: `${i.reg} = ${i.loc} reads ${v}` }, next: { ...s, pcs, regs: withReg(c, s, t, i.reg, v) } });
    } else {
      out.push({ label: { actor, text: 'fence' }, next: { ...s, pcs } });
    }
  });
  return out;
}

function movesTso(c: Compiled, s: State): Move[] {
  const out: Move[] = [];
  c.threads.forEach((prog, t) => {
    const actor = `T${t}`;
    const buffer = s.buffers[t];
    const i = prog[s.pcs[t]];
    if (i) {
      const pcs = replace(s.pcs, t, s.pcs[t] + 1);
      if (i.op === 'store') {
        const entry: [number, number] = [c.locs.indexOf(i.loc), i.value];
        out.push({ label: { actor, text: `store ${i.loc} = ${i.value} into the buffer` }, next: { ...s, pcs, buffers: replace(s.buffers, t, [...buffer, entry]) } });
      } else if (i.op === 'load') {
        const li = c.locs.indexOf(i.loc);
        const own = [...buffer].reverse().find(([l]) => l === li);
        const v = own ? own[1] : s.mem[li];
        const from = own ? 'its own buffer' : 'memory';
        out.push({ label: { actor, text: `${i.reg} = ${i.loc} reads ${v} from ${from}` }, next: { ...s, pcs, regs: withReg(c, s, t, i.reg, v) } });
      } else if (buffer.length === 0) {
        out.push({ label: { actor, text: 'fence (buffer already empty)' }, next: { ...s, pcs } });
      }
    }
    if (buffer.length > 0) {
      const [li, v] = buffer[0];
      out.push({ label: { actor, text: `drain ${c.locs[li]} = ${v} to memory` }, next: { ...s, mem: replace(s.mem, li, v), buffers: replace(s.buffers, t, buffer.slice(1)) } });
    }
  });
  return out;
}

const newest = (s: State): number[] => s.hist.map((h) => h.length - 1);

function movesRelaxed(c: Compiled, s: State): Move[] {
  const out: Move[] = [];
  c.threads.forEach((prog, t) => {
    const i = prog[s.pcs[t]];
    if (!i) return;
    const actor = `T${t}`;
    const pcs = replace(s.pcs, t, s.pcs[t] + 1);
    const sc = i.op !== 'fence' && i.ord === 'sc';
    const fenced = i.op === 'fence' || sc;
    const start = fenced ? newest(s) : s.views[t];
    const prefix = sc ? 'fence, then ' : '';
    if (i.op === 'fence') {
      out.push({ label: { actor, text: 'fence: sees the newest write of every location' }, next: { ...s, pcs, views: replace(s.views, t, start) } });
    } else if (i.op === 'store') {
      const li = c.locs.indexOf(i.loc);
      const index = s.hist[li].length;
      const view = replace(start, li, index);
      const release = i.ord === 'rel' || i.ord === 'sc';
      const write = { v: i.value, carry: release ? view : null };
      const hist = replace(s.hist, li, [...s.hist[li], write]);
      out.push({ label: { actor, text: `${prefix}store ${i.loc} = ${i.value}${release ? ' (release)' : ''}` }, next: { ...s, pcs, hist, mem: replace(s.mem, li, i.value), views: replace(s.views, t, view) } });
    } else {
      const li = c.locs.indexOf(i.loc);
      const acquire = i.ord === 'acq' || i.ord === 'sc';
      for (let k = start[li]; k < s.hist[li].length; k++) {
        const { v, carry } = s.hist[li][k];
        const merged = acquire && carry ? start.map((x, j) => Math.max(x, carry[j])) : start;
        const view = replace(merged, li, Math.max(merged[li], k));
        const age = k === s.hist[li].length - 1 ? 'the newest write' : 'an older write';
        out.push({ label: { actor, text: `${prefix}${i.reg} = ${i.loc} reads ${v} (${age})` }, next: { ...s, pcs, regs: withReg(c, s, t, i.reg, v), views: replace(s.views, t, view) } });
      }
    }
  });
  return out;
}

function snapshot(c: Compiled, s: State): Snapshot {
  const regs: Record<string, number> = {};
  c.regNames.forEach((names, t) => names.forEach((r, k) => (regs[`T${t}.${r}`] = s.regs[t][k])));
  const mem: Record<string, number> = {};
  c.locs.forEach((x, k) => (mem[x] = s.mem[k]));
  return {
    pcs: s.pcs,
    regs,
    mem,
    buffers: s.buffers.map((b) => b.map(([li, v]) => `${c.locs[li]}=${v}`)),
    views: s.views.map((v) => Object.fromEntries(c.locs.map((x, k) => [x, v[k]]))),
  };
}

const regsKeyOf = (regs: Record<string, number>) => Object.entries(regs).map(([k, v]) => `${k}=${v}`).join(' ');
const memKeyOf = (mem: Record<string, number>) => Object.entries(mem).map(([k, v]) => `${k}=${v}`).join(' ');

/**
 * Every final outcome `l` can reach under `model`, each with a shortest witness schedule, found by
 * exploring the state space breadth-first. `budget` caps distinct states (default 250,000); when it
 * is hit `truncated` is true and absent outcomes are not proven unreachable. Throws a RangeError for a
 * program over the size limits (`parseLitmus` refuses those before they get here).
 */
export function outcomes(l: Litmus, model: Model, budget: number = DEFAULT_MAX_STATES): Outcomes {
  const tooBig = litmusSizeError(l);
  if (tooBig) throw new RangeError(tooBig);
  const c = compile(l);
  const moves = model === 'sc' ? movesSc : model === 'tso' ? movesTso : movesRelaxed;
  const terminals: number[] = [];
  const result = explore<State, ActionLabel>({
    init: initial(c, model),
    actions: (s) => moves(c, s),
    key: stateKey,
    maxStates: budget,
    graph: true,
    onVisit: ({ state, index }) => {
      if (isTerminal(c, state)) terminals.push(index);
    },
  });
  const graph = result.graph!;
  // BFS over the explored graph for the shortest path to each terminal state.
  const parent = new Map<number, { from: number; label: ActionLabel }>();
  const queue = [0];
  for (let head = 0; head < queue.length; head++) {
    for (const { to, label } of graph.edges[queue[head]] ?? []) {
      if (to === 0 || parent.has(to)) continue;
      parent.set(to, { from: queue[head], label });
      queue.push(to);
    }
  }
  const found = new Map<string, Outcome>();
  for (const index of terminals) {
    const snap = snapshot(c, graph.states[index]);
    const key = `${regsKeyOf(snap.regs)} | ${memKeyOf(snap.mem)}`;
    if (found.has(key)) continue;
    const example: Step[] = [];
    for (let i = index; i !== 0; i = parent.get(i)!.from) example.push({ label: parent.get(i)!.label, state: snapshot(c, graph.states[i]) });
    found.set(key, { key, regsKey: regsKeyOf(snap.regs), regs: snap.regs, mem: snap.mem, example: example.reverse() });
  }
  return { start: snapshot(c, graph.states[0]), outcomes: found, states: result.states, truncated: result.truncated };
}

/** The distinct register outcomes (`regsKey`s) of a result, sorted: what a "(r0, r1)" table lists. */
export const regsKeys = (r: Outcomes): string[] => [...new Set([...r.outcomes.values()].map((o) => o.regsKey))].sort();

// ── Fixtures ────────────────────────────────────────────────────────────

const fixture = (name: string, text: string): Litmus => {
  const read = parseLitmus(text, name);
  if (!read.ok) throw new Error(`fixture ${name}: ${read.error}`);
  return read.litmus;
};

export const SB = fixture('Store buffering (SB)', 'T0: x = 1 ; r0 = y\nT1: y = 1 ; r1 = x');
export const MP = fixture('Message passing (MP)', 'T0: x = 1 ; y = 1\nT1: r1 = y ; r2 = x');
/** Load buffering: its 1,1 outcome is NOT modelled, so no model here reports it. */
export const LB = fixture('Load buffering (LB, not modelled)', 'T0: r0 = x ; y = 1\nT1: r1 = y ; x = 1');
/** Coherence of two reads of one location: reading it backwards is never allowed. */
export const CORR = fixture('Coherence (CoRR)', 'T0: x = 1 ; x = 2\nT1: r1 = x ; r2 = x');
export const MP_RELACQ = fixture('MP with release and acquire', 'T0: x = 1 ; y = 1 @rel\nT1: r1 = y @acq ; r2 = x');
export const SB_FENCED = fixture('SB with a fence in both threads', 'T0: x = 1 ; fence ; r0 = y\nT1: y = 1 ; fence ; r1 = x');
export const FIXTURES: readonly Litmus[] = [SB, MP, LB, CORR, MP_RELACQ, SB_FENCED];
