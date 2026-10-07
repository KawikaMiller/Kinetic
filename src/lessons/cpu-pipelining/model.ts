/**
 * A classic 5-stage teaching pipeline (IF, ID, EX, MEM, WB), MIPS-style, over a tiny
 * lesson-authored instruction set. Not a model of any real x86 or ARM core.
 *
 * - `run` is the reference interpreter: it executes a program one instruction at a time and
 *   is the truth for register values and branch outcomes.
 * - `pipeline` simulates the pipeline cycle by cycle (pipeline latches, a hazard unit,
 *   optional forwarding, branch resolution in EX with predict-not-taken, and an optional
 *   shared memory port), and records which stage every fetched instruction is in each cycle.
 *
 * Timing rules (Patterson & Hennessy's textbook pipeline):
 * - The register file is written in the first half of a cycle and read in the second, so an
 *   instruction in ID can read a value written back in the same cycle.
 * - Forwarding feeds the EX stage from the EX/MEM and MEM/WB latches. An ALU result is ready
 *   at the end of EX; a loaded value only at the end of MEM (the load-use stall).
 * - Simplification: every source register (a store's data register included) is needed at
 *   the start of EX. There is no forwarding into MEM or into ID.
 */

export type Op = 'add' | 'sub' | 'and' | 'or' | 'lw' | 'sw' | 'beq';
export type StageName = 'IF' | 'ID' | 'EX' | 'MEM' | 'WB';
export const STAGES: readonly StageName[] = ['IF', 'ID', 'EX', 'MEM', 'WB'];
export const DEPTH = STAGES.length;
export const REG_COUNT = 8;

export interface Instr {
  op: Op;
  /** Destination register (add/sub/and/or/lw), or null. */
  rd: number | null;
  /** Source registers, in operand order. For sw: [base, data]; for lw: [base]. */
  srcs: number[];
  /** Byte offset for lw/sw. */
  offset: number;
  /** Branch target label, for beq. */
  target: string | null;
  /** Label on this instruction, if any. */
  label: string | null;
  /** The instruction as written, without its label. */
  text: string;
}

export interface Machine {
  regs: number[];
  /** Word memory keyed by byte address. */
  mem: Record<number, number>;
}

const REG = /^r([0-7])$/;
const reg = (s: string) => {
  const m = REG.exec(s.trim());
  if (!m) throw new Error(`bad register "${s}"`);
  return Number(m[1]);
};

/** Parses one lesson-authored line, e.g. "done: lw r1, 4(r2)". Throws on anything else. */
export function parseInstr(line: string): Instr {
  let rest = line.trim();
  let label: string | null = null;
  const lm = /^([a-z][a-z0-9]*):\s*(.*)$/.exec(rest);
  if (lm) {
    label = lm[1];
    rest = lm[2];
  }
  const m = /^([a-z]+)\s+(.*)$/.exec(rest);
  if (!m) throw new Error(`bad instruction "${line}"`);
  const op = m[1] as Op;
  const args = m[2].split(',').map((a) => a.trim());
  const base = { label, text: `${op} ${args.join(', ')}`, offset: 0, target: null };
  switch (op) {
    case 'add':
    case 'sub':
    case 'and':
    case 'or':
      if (args.length !== 3) throw new Error(`${op} takes 3 registers`);
      return { ...base, op, rd: reg(args[0]), srcs: [reg(args[1]), reg(args[2])] };
    case 'lw':
    case 'sw': {
      const mm = /^(-?\d+)\((r[0-7])\)$/.exec(args[1] ?? '');
      if (args.length !== 2 || !mm) throw new Error(`${op} takes "rt, offset(rs)"`);
      const rt = reg(args[0]);
      const rs = reg(mm[2]);
      return op === 'lw' ? { ...base, op, rd: rt, srcs: [rs], offset: Number(mm[1]) } : { ...base, op, rd: null, srcs: [rs, rt], offset: Number(mm[1]) };
    }
    case 'beq':
      if (args.length !== 3) throw new Error('beq takes "rs, rt, label"');
      return { ...base, op, rd: null, srcs: [reg(args[0]), reg(args[1])], target: args[2] };
    default:
      throw new Error(`unknown op "${op}"`);
  }
}

export const parseProgram = (lines: readonly string[]) => lines.map(parseInstr);
export const formatInstr = (ins: Instr) => (ins.label ? `${ins.label}: ${ins.text}` : ins.text);
/** Registers an instruction writes (r0 is hard-wired to zero, so it never counts). */
export const writes = (ins: Instr) => (ins.rd !== null && ins.rd !== 0 ? [ins.rd] : []);
export const reads = (ins: Instr) => ins.srcs.filter((r) => r !== 0);
export const isMemOp = (ins: Instr) => ins.op === 'lw' || ins.op === 'sw';

function labelIndex(program: readonly Instr[], label: string): number {
  const i = program.findIndex((p) => p.label === label);
  if (i < 0) throw new Error(`no label "${label}"`);
  return i;
}

/** The address a lw/sw touches. */
const addressOf = (ins: Instr, regs: readonly number[]) => regs[ins.srcs[0]] + ins.offset;

/** Upper bound on executed instructions, so a looping program can't hang the lesson. */
export const STEP_LIMIT = 200;

export interface RunResult extends Machine {
  /** Program indices in execution order. */
  trace: number[];
  /** For each traced beq, whether it was taken (by trace position). */
  taken: boolean[];
}

/** The reference interpreter: executes `program` from `start` one instruction at a time. */
export function run(program: readonly Instr[], start: Machine): RunResult {
  const regs = [...start.regs];
  const mem = { ...start.mem };
  const trace: number[] = [];
  const taken: boolean[] = [];
  let pc = 0;
  while (pc < program.length) {
    if (trace.length >= STEP_LIMIT) throw new Error('step limit reached');
    const ins = program[pc];
    trace.push(pc);
    let next = pc + 1;
    let tk = false;
    const [a, b] = ins.srcs.map((r) => regs[r]);
    switch (ins.op) {
      case 'add': regs[ins.rd!] = a + b; break;
      case 'sub': regs[ins.rd!] = a - b; break;
      case 'and': regs[ins.rd!] = a & b; break;
      case 'or': regs[ins.rd!] = a | b; break;
      case 'lw': regs[ins.rd!] = mem[addressOf(ins, regs)] ?? 0; break;
      case 'sw': mem[addressOf(ins, regs)] = b; break;
      case 'beq':
        tk = a === b;
        if (tk) next = labelIndex(program, ins.target!);
        break;
    }
    regs[0] = 0;
    taken.push(tk);
    pc = next;
  }
  return { regs, mem, trace, taken };
}

export interface PipelineOptions {
  forwarding: boolean;
  /** 2 = separate instruction and data memories; 1 = one port shared by IF and MEM. */
  memPorts: 1 | 2;
}

/** What one fetched instruction is doing in one cycle. */
export type CellKind =
  | { kind: 'stage'; stage: StageName; held: boolean }
  /** Waiting to be fetched: the memory port is busy with a load or store in MEM. */
  | { kind: 'port-wait' };

export interface Row {
  /** Program index of the instruction. */
  pc: number;
  /** Position in the executed trace, or null for a wrong-path instruction that was flushed. */
  traceIndex: number | null;
  /** Cycle in which this row was flushed (it was fetched down the wrong path), or null. */
  flushedAt: number | null;
  /** 1-based cycle → what the row is doing. */
  cells: Record<number, CellKind>;
}

/** A value sent straight from a pipeline latch to EX instead of through the register file. */
export interface Forward {
  fromRow: number;
  toRow: number;
  reg: number;
  /** The cycle the consumer is in EX. */
  cycle: number;
  /** The producer's stage in the cycle before (EX: the EX/MEM latch; MEM: the MEM/WB latch). */
  fromStage: 'EX' | 'MEM';
}

export type CycleEvent =
  | { kind: 'fetch'; row: number }
  | { kind: 'data-stall'; row: number; reg: number; producer: number; load: boolean }
  | { kind: 'port-stall'; memRow: number }
  | { kind: 'flush'; branchRow: number; flushed: number[]; targetPc: number }
  | { kind: 'not-taken'; branchRow: number }
  | { kind: 'forward'; forward: Forward }
  | { kind: 'commit'; row: number };

export interface PipelineResult {
  rows: Row[];
  /** Index 0 = cycle 1. */
  events: CycleEvent[][];
  forwards: Forward[];
  totalCycles: number;
  /** Instructions that completed (the executed trace). */
  committed: number;
  /** Empty pipeline slots that reached WB because of a hazard stall, by cause. */
  stalls: { data: number; port: number };
  /** Pipeline slots thrown away by taken branches: the branch penalty, in cycles. */
  flushes: number;
  final: Machine;
}

type Slot = { kind: 'instr'; row: number } | { kind: 'bubble'; cause: 'data' | 'port' } | { kind: 'flushed'; row: number } | null;
type Pipe = [Slot, Slot, Slot, Slot, Slot];

export const CYCLE_LIMIT = 400;

/** Cycle-by-cycle simulation of the 5-stage pipeline over `program`. */
export function pipeline(program: readonly Instr[], start: Machine, opts: PipelineOptions): PipelineResult {
  const ref = run(program, start);
  const rows: Row[] = [];
  const events: CycleEvent[][] = [];
  const forwards: Forward[] = [];
  const stalls = { data: 0, port: 0 };
  let flushes = 0;
  let committed = 0;
  let pc = 0;
  /** Trace position the next correct-path fetch will be. */
  let nextTrace = 0;
  /** Cycles a not-yet-fetched instruction spent waiting for the port. */
  let portWaits: number[] = [];
  let pipe: Pipe = [null, null, null, null, null];
  let total = 0;

  const ins = (s: Slot) => (s && s.kind === 'instr' ? program[rows[s.row].pc] : null);
  const writer = (s: Slot, r: number) => {
    const i = ins(s);
    return i && writes(i).includes(r) ? i : null;
  };

  for (let c = 1; c <= CYCLE_LIMIT; c++) {
    const prev = pipe;
    const ev: CycleEvent[] = [];
    const next: Pipe = [null, null, prev[2], prev[3], null];
    next[4] = prev[3];
    next[3] = prev[2];

    // Fetch into IF this cycle, unless the single memory port is busy with MEM.
    const fetch = (): Slot => {
      if (pc >= program.length) return null;
      const inMem = ins(next[3]);
      if (opts.memPorts === 1 && inMem && isMemOp(inMem)) {
        portWaits.push(c);
        ev.push({ kind: 'port-stall', memRow: (next[3] as { row: number }).row });
        return { kind: 'bubble', cause: 'port' };
      }
      const onPath = nextTrace < ref.trace.length && ref.trace[nextTrace] === pc;
      const row: Row = { pc, traceIndex: onPath ? nextTrace : null, flushedAt: null, cells: {} };
      for (const w of portWaits) row.cells[w] = { kind: 'port-wait' };
      portWaits = [];
      rows.push(row);
      if (onPath) nextTrace++;
      ev.push({ kind: 'fetch', row: rows.length - 1 });
      pc++;
      return { kind: 'instr', row: rows.length - 1 };
    };

    const branch = ins(prev[2]);
    const branchRow = prev[2]?.kind === 'instr' ? prev[2].row : -1;
    const taken = branch?.op === 'beq' && ref.taken[rows[branchRow].traceIndex!];
    if (branch?.op === 'beq' && !taken) ev.push({ kind: 'not-taken', branchRow });

    if (taken) {
      // Resolved in EX (the previous cycle): throw away what was fetched behind it.
      const flushed: number[] = [];
      const kill = (s: Slot): Slot => {
        if (s?.kind === 'instr') {
          rows[s.row].flushedAt = c;
          rows[s.row].traceIndex = null;
          flushed.push(s.row);
          return { kind: 'flushed', row: s.row };
        }
        // A bubble or an empty slot behind the branch is a lost cycle all the same.
        return { kind: 'flushed', row: -1 };
      };
      next[2] = kill(prev[1]);
      next[1] = kill(prev[0]);
      portWaits = [];
      // Whatever was fetched behind the branch is off the path, even if it matched the trace.
      nextTrace = rows[branchRow].traceIndex! + 1;
      pc = labelIndex(program, branch.target!);
      ev.push({ kind: 'flush', branchRow, flushed, targetPc: pc });
      next[0] = fetch();
    } else {
      // Hazard unit: can the instruction in ID move to EX this cycle?
      const waiting = ins(prev[1]);
      let stall: CycleEvent | null = null;
      if (waiting) {
        for (const r of reads(waiting)) {
          // the nearest older writer of r still in the pipe
          const inEx = writer(prev[2], r);
          const inMem = inEx ? null : writer(prev[3], r);
          const producer = inEx ? prev[2] : inMem ? prev[3] : null;
          if (!producer || producer.kind !== 'instr') continue;
          const load = program[rows[producer.row].pc].op === 'lw';
          const mustWait = opts.forwarding ? !!inEx && load : true;
          if (mustWait) {
            stall = { kind: 'data-stall', row: (prev[1] as { row: number }).row, reg: r, producer: producer.row, load };
            break;
          }
        }
      }
      if (stall) {
        ev.push(stall);
        next[2] = { kind: 'bubble', cause: 'data' };
        next[1] = prev[1];
        // IF holds its instruction; an empty IF may still fetch.
        next[0] = prev[0]?.kind === 'instr' ? prev[0] : fetch();
      } else {
        next[2] = prev[1];
        next[1] = prev[0];
        next[0] = fetch();
      }
    }

    // Forwarding into EX: sources whose producer hasn't written back before this EX cycle.
    const exNow = next[2];
    const exIns = ins(exNow);
    if (exIns && exNow?.kind === 'instr' && opts.forwarding) {
      for (const r of reads(exIns)) {
        const fromEx = writer(prev[2], r);
        const fromMem = fromEx ? null : writer(prev[3], r);
        const src = fromEx ? prev[2] : fromMem ? prev[3] : null;
        if (src?.kind !== 'instr') continue;
        const f: Forward = { fromRow: src.row, toRow: exNow.row, reg: r, cycle: c, fromStage: fromEx ? 'EX' : 'MEM' };
        forwards.push(f);
        ev.push({ kind: 'forward', forward: f });
      }
    }

    // Record where every live row is.
    next.forEach((s, k) => {
      if (s?.kind !== 'instr') return;
      const stage = STAGES[k];
      const before = rows[s.row].cells[c - 1];
      rows[s.row].cells[c] = { kind: 'stage', stage, held: before?.kind === 'stage' && before.stage === stage };
    });

    // What reached WB this cycle.
    const wb = next[4];
    if (wb?.kind === 'instr') {
      committed++;
      ev.push({ kind: 'commit', row: wb.row });
    } else if (wb?.kind === 'bubble') stalls[wb.cause]++;
    else if (wb?.kind === 'flushed') flushes++;

    pipe = next;
    if (pipe.every((s) => s === null) && pc >= program.length) break;
    events.push(ev);
    if (c === CYCLE_LIMIT) throw new Error('cycle limit reached');
  }
  // The total is the last cycle any instruction was in a stage (its write-back).
  for (const r of rows) for (const c of Object.keys(r.cells)) total = Math.max(total, Number(c));
  events.length = total;
  return { rows, events, forwards, totalCycles: total, committed, stalls, flushes, final: { regs: ref.regs, mem: ref.mem } };
}

/** The same trace with no overlap: each instruction runs all 5 stages before the next is fetched. */
export function unpipelined(program: readonly Instr[], start: Machine): { rows: Row[]; totalCycles: number } {
  const ref = run(program, start);
  const rows: Row[] = ref.trace.map((pc, k) => {
    const cells: Record<number, CellKind> = {};
    STAGES.forEach((stage, s) => (cells[k * DEPTH + s + 1] = { kind: 'stage', stage, held: false }));
    return { pc, traceIndex: k, flushedAt: null, cells };
  });
  return { rows, totalCycles: ref.trace.length * DEPTH };
}

/** Cycle a row spends in `stage` for the first time, or null. */
export function firstCycle(row: Row, stage: StageName): number | null {
  const cs = Object.keys(row.cells).map(Number).sort((a, b) => a - b);
  for (const c of cs) {
    const k = row.cells[c];
    if (k.kind === 'stage' && k.stage === stage) return c;
  }
  return null;
}

/** Cycles per instruction, for the executed trace. */
export const cpi = (totalCycles: number, committed: number) => (committed === 0 ? 0 : totalCycles / committed);

/**
 * Why two adjacent instructions can't swap, or null if they're independent: no register
 * read-after-write, write-after-read or write-after-write between them, no branch or label
 * (that would change control flow), and no store that might hit the other's address.
 */
export function swapBlocker(a: Instr, b: Instr): string | null {
  if (a.op === 'beq' || b.op === 'beq') return 'a branch decides what runs next, so it stays put';
  if (a.label || b.label) return 'a branch jumps to this label, so it stays put';
  const raw = writes(a).find((r) => reads(b).includes(r));
  if (raw !== undefined) return `the second reads r${raw}, which the first writes`;
  const war = writes(b).find((r) => reads(a).includes(r));
  if (war !== undefined) return `the second overwrites r${war}, which the first still reads`;
  const waw = writes(a).find((r) => writes(b).includes(r));
  if (waw !== undefined) return `both write r${waw}`;
  if (isMemOp(a) && isMemOp(b) && (a.op === 'sw' || b.op === 'sw')) {
    // Same base register (unchanged by either) and different offsets: provably different words.
    const sameBase = a.srcs[0] === b.srcs[0];
    if (!sameBase || a.offset === b.offset) return 'a store might touch the same memory word';
  }
  return null;
}

/** Swaps program[i] and program[i + 1]; null if they aren't independent. */
export function swapped(program: readonly Instr[], i: number): Instr[] | null {
  if (i < 0 || i + 1 >= program.length || swapBlocker(program[i], program[i + 1])) return null;
  const p = [...program];
  [p[i], p[i + 1]] = [p[i + 1], p[i]];
  return p;
}

export type PresetId = 'raw' | 'load' | 'branch' | 'port' | 'reorder';

export interface Preset {
  id: PresetId;
  label: string;
  lines: string[];
  start: Machine;
  /** Options the preset loads with (the learner can change them). */
  opts: PipelineOptions;
  intro: string;
}

const regs = (values: Partial<Record<number, number>>) => Array.from({ length: REG_COUNT }, (_, i) => (i === 0 ? 0 : values[i] ?? i));

export const PRESETS: Preset[] = [
  {
    id: 'raw',
    label: 'Data hazard',
    lines: ['add r1, r2, r3', 'sub r4, r1, r5', 'and r6, r2, r7', 'or r3, r2, r5'],
    start: { regs: regs({}), mem: {} },
    opts: { forwarding: false, memPorts: 2 },
    intro: 'sub needs r1, which add is still computing: a read-after-write (RAW) hazard.',
  },
  {
    id: 'load',
    label: 'Load-use',
    lines: ['lw r1, 0(r2)', 'add r3, r1, r4', 'sub r5, r2, r4'],
    start: { regs: regs({ 2: 64 }), mem: { 64: 40 } },
    opts: { forwarding: true, memPorts: 2 },
    intro: 'add needs the value lw is loading. A load only has its data at the end of MEM.',
  },
  {
    id: 'branch',
    label: 'Branch',
    lines: ['add r1, r2, r3', 'beq r4, r5, done', 'sub r6, r1, r2', 'or r7, r1, r2', 'done: and r2, r1, r3'],
    start: { regs: regs({ 4: 7, 5: 7 }), mem: {} },
    opts: { forwarding: true, memPorts: 2 },
    intro: 'r4 equals r5, so beq is taken. The pipeline keeps fetching the next lines until EX knows that.',
  },
  {
    id: 'port',
    label: 'Structural',
    lines: ['lw r1, 0(r2)', 'add r3, r4, r5', 'sub r6, r4, r5', 'and r7, r4, r5', 'or r3, r1, r4'],
    start: { regs: regs({ 2: 64 }), mem: { 64: 9 } },
    opts: { forwarding: true, memPorts: 1 },
    intro: 'One memory port shared by IF and MEM: when lw reads data, no instruction can be fetched.',
  },
  {
    id: 'reorder',
    label: 'Reorder',
    lines: ['lw r1, 0(r7)', 'lw r2, 4(r7)', 'add r3, r1, r2', 'sw r3, 12(r7)', 'lw r4, 8(r7)', 'add r5, r1, r4', 'sw r5, 16(r7)'],
    start: { regs: regs({ 7: 64 }), mem: { 64: 10, 68: 20, 72: 30 } },
    opts: { forwarding: true, memPorts: 2 },
    intro: 'a = b + e; c = b + f. Two load-use stalls. Move an independent load up to fill them.',
  },
];

export const presetById = (id: PresetId) => PRESETS.find((p) => p.id === id)!;

export const HONESTY = 'A textbook 5-stage pipeline (MIPS-style), not any real x86 or ARM core. Real cores also predict branches and run instructions out of order.';
