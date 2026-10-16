/**
 * The defender's test: a tiny lesson-authored machine records what an observer of a shared resource could see (the branches
 * taken and the memory lines touched), and a program is reported as leaking when two secrets give different traces.
 * Every program here is fixed text of the lesson; the secrets are 4 bytes and never become code.
 */

export const LINE_BYTES = 64;
export const SECRET_BYTES = 4;

export type TraceEvent =
  | { kind: 'branch'; at: string; taken: boolean }
  | { kind: 'load'; at: string; line: number };

export const eventText = (e: TraceEvent) => (e.kind === 'branch' ? `branch ${e.at}: ${e.taken ? 'taken' : 'not taken'}` : `load ${e.at}: line ${e.line}`);
export const sameEvent = (a: TraceEvent, b: TraceEvent) => eventText(a) === eventText(b);

/** What the machine hands a program: a way to branch and a way to touch memory, each of which is recorded. */
interface Machine {
  branch: (at: string, taken: boolean) => boolean;
  load: (at: string, address: number) => void;
}

function recorder(): { machine: Machine; trace: TraceEvent[] } {
  const trace: TraceEvent[] = [];
  return {
    trace,
    machine: {
      branch: (at, taken) => {
        trace.push({ kind: 'branch', at, taken });
        return taken;
      },
      load: (at, address) => {
        trace.push({ kind: 'load', at, line: Math.floor(address / LINE_BYTES) });
      },
    },
  };
}

export type ProgramId = 'secret-if' | 'table-lookup' | 'masked-select' | 'ct-compare' | 'broken-compare';

export interface Program {
  id: ProgramId;
  label: string;
  /** The program as the learner reads it. */
  code: readonly string[];
  /** Run on a secret (4 bytes); the machine records what an observer could see. */
  run: (secret: readonly number[], m: Machine) => void;
}

const TABLE_BASE = 0x1000;
const A_ADDRESS = 0x2000;
const B_ADDRESS = 0x2040;
const SECRET_ADDRESS = 0x3000;
const GUESS_ADDRESS = 0x3040;

export const PROGRAMS: readonly Program[] = [
  {
    id: 'secret-if',
    label: 'A secret-dependent if',
    code: ['if (secret[0] & 1) {', '  r = a;', '} else {', '  r = b;', '}'],
    run: (s, m) => {
      m.branch('secret[0] is odd', (s[0] & 1) === 1);
    },
  },
  {
    id: 'table-lookup',
    label: 'A lookup indexed by a secret byte',
    code: ['r = TABLE[secret[0]];'],
    run: (s, m) => {
      m.load('TABLE[secret[0]]', TABLE_BASE + s[0]);
    },
  },
  {
    id: 'masked-select',
    label: 'A masked select',
    code: ['mask = -(secret[0] & 1);', 'r = (a & mask) | (b & ~mask);'],
    run: (_s, m) => {
      m.load('a', A_ADDRESS);
      m.load('b', B_ADDRESS);
    },
  },
  {
    id: 'ct-compare',
    label: 'The constant-time compare',
    code: ['diff = 0;', 'for (i = 0; i < 4; i++)', '  diff |= secret[i] ^ guess[i];', 'return diff == 0;'],
    run: (s, m) => {
      for (let i = 0; i < s.length; i++) {
        m.load('secret[i]', SECRET_ADDRESS + i);
        m.load('guess[i]', GUESS_ADDRESS + i);
        m.branch('i < 4', true);
      }
      m.branch('i < 4', false);
    },
  },
  {
    id: 'broken-compare',
    label: 'A broken compare: returns early on a zero byte',
    code: ['diff = 0;', 'for (i = 0; i < 4; i++) {', '  if (secret[i] == 0) return diff == 0;', '  diff |= secret[i] ^ guess[i];', '}', 'return diff == 0;'],
    run: (s, m) => {
      for (let i = 0; i < s.length; i++) {
        m.branch('i < 4', true);
        m.load('secret[i]', SECRET_ADDRESS + i);
        if (m.branch('secret[i] is zero', s[i] === 0)) return;
        m.load('guess[i]', GUESS_ADDRESS + i);
      }
      m.branch('i < 4', false);
    },
  },
];

export const programOf = (id: ProgramId): Program => PROGRAMS.find((p) => p.id === id)!;

export function traceOf(program: Program, secret: readonly number[]): TraceEvent[] {
  const { machine, trace } = recorder();
  program.run(secret, machine);
  return trace;
}

export interface Verdict {
  programId: ProgramId;
  traceA: TraceEvent[];
  traceB: TraceEvent[];
  /** The first position where the traces differ (or where one ends early); null when identical. */
  firstDifference: number | null;
  leaks: boolean;
}

export function verdict(program: Program, a: readonly number[], b: readonly number[]): Verdict {
  const traceA = traceOf(program, a);
  const traceB = traceOf(program, b);
  const longest = Math.max(traceA.length, traceB.length);
  let firstDifference: number | null = null;
  for (let i = 0; i < longest; i++) {
    if (!traceA[i] || !traceB[i] || !sameEvent(traceA[i], traceB[i])) {
      firstDifference = i;
      break;
    }
  }
  return { programId: program.id, traceA, traceB, firstDifference, leaks: firstDifference !== null };
}

/** 32-bit integer to four big-endian bytes. */
export const secretBytes = (value: number): number[] => [24, 16, 8, 0].map((shift) => Math.floor(value / 2 ** shift) % 256);
export const secretHex = (value: number) => secretBytes(value).map((b) => b.toString(16).padStart(2, '0')).join(' ');

export interface PairPreset {
  id: string;
  label: string;
  a: number;
  b: number;
}

export const PAIR_PRESETS: readonly PairPreset[] = [
  { id: 'far', label: 'Odd and even first byte, far apart', a: 0x13219c03, b: 0xc4219c03 },
  { id: 'near', label: 'Same parity, same line', a: 0x13219c03, b: 0x15219c03 },
  { id: 'zero', label: 'One has a zero byte', a: 0x13219c03, b: 0x13009c03 },
];

export const DEFAULT_PAIR = PAIR_PRESETS[0];
export const PAIR_MIN = 0;
export const PAIR_MAX = 0xffffffff;

export const tracesOpening = (): { program: ProgramId; a: number; b: number } => ({ program: 'secret-if', a: DEFAULT_PAIR.a, b: DEFAULT_PAIR.b });
