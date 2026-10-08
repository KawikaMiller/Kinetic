import type { Value } from './lang';

/**
 * What a JIT might emit for sumSquares once it has only ever seen numbers: an illustrative
 * x86-64-style listing (Intel syntax, SSE2 doubles, because JavaScript numbers are doubles).
 * It is lesson-authored, not real JIT output; a real engine's code checks value tags, keeps
 * more bookkeeping and is laid out differently. Each line carries a tiny semantic so the
 * step-through can run it and count the instructions it executes; the guard on the first
 * two lines is the JIT's type assumption, and a string fails it (a deoptimisation).
 */

type Reg = 'xmm0' | 'xmm1' | 'xmm2' | 'xmm3';

type Sem =
  | { k: 'label' }
  | { k: 'guard' }
  | { k: 'deoptJump' }
  | { k: 'loadN'; dst: Reg }
  | { k: 'zero'; dst: Reg }
  | { k: 'one'; dst: Reg }
  | { k: 'cmp'; a: Reg; b: Reg }
  | { k: 'jb'; to: string }
  | { k: 'mov'; dst: Reg; src: Reg }
  | { k: 'mul'; dst: Reg; src: Reg }
  | { k: 'add'; dst: Reg; src: Reg }
  | { k: 'addOne'; dst: Reg }
  | { k: 'jmp'; to: string }
  | { k: 'ret' };

interface NativeLine {
  text: string;
  sem: Sem;
  label?: string;
}

export const NATIVE: NativeLine[] = [
  { text: 'sumSquares:', sem: { k: 'label' } },
  { text: '  cmp     n.type, NUMBER   ; guard: is n a number?', sem: { k: 'guard' } },
  { text: '  jne     deopt            ; no: back to the bytecode VM', sem: { k: 'deoptJump' } },
  { text: '  movsd   xmm2, n.value    ; n', sem: { k: 'loadN', dst: 'xmm2' } },
  { text: '  xorpd   xmm0, xmm0       ; s = 0', sem: { k: 'zero', dst: 'xmm0' } },
  { text: '  movsd   xmm1, [one]      ; i = 1', sem: { k: 'one', dst: 'xmm1' } },
  { text: 'loop:', sem: { k: 'label' }, label: 'loop' },
  { text: '  ucomisd xmm2, xmm1       ; compare n with i', sem: { k: 'cmp', a: 'xmm2', b: 'xmm1' } },
  { text: '  jb      done             ; n < i: leave the loop', sem: { k: 'jb', to: 'done' } },
  { text: '  movapd  xmm3, xmm1', sem: { k: 'mov', dst: 'xmm3', src: 'xmm1' } },
  { text: '  mulsd   xmm3, xmm1       ; i * i', sem: { k: 'mul', dst: 'xmm3', src: 'xmm1' } },
  { text: '  addsd   xmm0, xmm3       ; s = s + i * i', sem: { k: 'add', dst: 'xmm0', src: 'xmm3' } },
  { text: '  addsd   xmm1, [one]      ; i = i + 1', sem: { k: 'addOne', dst: 'xmm1' } },
  { text: '  jmp     loop', sem: { k: 'jmp', to: 'loop' } },
  { text: 'done:', sem: { k: 'label' }, label: 'done' },
  { text: '  ret                      ; s is in xmm0', sem: { k: 'ret' } },
];

export const NATIVE_LINES = NATIVE.map((l) => l.text);
/** The register each local lives in, for the readout. */
export const REG_OF: Record<'s' | 'i' | 'n' | 'i * i', Reg> = { s: 'xmm0', i: 'xmm1', n: 'xmm2', 'i * i': 'xmm3' };

export type Regs = Record<Reg, number | null>;

export interface NativeStep {
  line: number;
  regs: Regs;
  /** True on the loop's compare: the start of an iteration check. */
  loopCheck?: boolean;
}

export interface NativeResult {
  /** The value returned, or null when the guard failed and the call deoptimised. */
  result: number | null;
  deopt: boolean;
  /** Machine instructions executed (labels aren't instructions). */
  executed: number;
  /** Instructions before the first loop compare; and how many times that compare ran. */
  entry: number;
  headVisits: number;
  steps?: NativeStep[];
}

const LOOP_CMP = NATIVE.findIndex((l) => l.sem.k === 'cmp');
const labelAt = (name: string) => NATIVE.findIndex((l) => l.label === name);
export const MAX_NATIVE = 50_000_000;

export function runNative(arg: Value, { trace = false } = {}): NativeResult {
  const regs: Regs = { xmm0: null, xmm1: null, xmm2: null, xmm3: null };
  const steps: NativeStep[] | undefined = trace ? [] : undefined;
  let executed = 0;
  let entry = -1;
  let headVisits = 0;
  let below = false;
  let guardOk = true;
  let pc = 0;
  const done = (result: number | null, deopt: boolean): NativeResult => ({ result, deopt, executed, entry, headVisits, steps });
  for (;;) {
    const line = NATIVE[pc];
    const at = pc;
    pc++;
    const sem = line.sem;
    if (sem.k === 'label') continue;
    executed++;
    if (executed > MAX_NATIVE) throw new Error('runNative: instruction limit reached');
    if (at === LOOP_CMP) {
      headVisits++;
      if (entry < 0) entry = executed - 1;
    }
    switch (sem.k) {
      case 'guard': guardOk = typeof arg === 'number'; break;
      case 'deoptJump':
        if (!guardOk) {
          steps?.push({ line: at, regs: { ...regs } });
          return done(null, true);
        }
        break;
      case 'loadN': regs[sem.dst] = arg as number; break;
      case 'zero': regs[sem.dst] = 0; break;
      case 'one': regs[sem.dst] = 1; break;
      // ucomisd sets CF when a < b or when either is NaN, so `jb` also leaves on NaN.
      case 'cmp': { const a = regs[sem.a]!, b = regs[sem.b]!; below = a < b || Number.isNaN(a) || Number.isNaN(b); break; }
      case 'jb': if (below) pc = labelAt(sem.to); break;
      case 'mov': regs[sem.dst] = regs[sem.src]; break;
      case 'mul': regs[sem.dst] = regs[sem.dst]! * regs[sem.src]!; break;
      case 'add': regs[sem.dst] = regs[sem.dst]! + regs[sem.src]!; break;
      case 'addOne': regs[sem.dst] = regs[sem.dst]! + 1; break;
      case 'jmp': pc = labelAt(sem.to); break;
      case 'ret':
        steps?.push({ line: at, regs: { ...regs } });
        return done(regs.xmm0, false);
    }
    steps?.push({ line: at, regs: { ...regs }, loopCheck: at === LOOP_CMP || undefined });
  }
}
