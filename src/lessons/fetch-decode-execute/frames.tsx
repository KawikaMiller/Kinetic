import { plural } from '../../core/format';
import type { Frame } from '../../core/types';
import { PATHS, type Path, type UnitId } from './layout';
import { MAX_INSTRUCTIONS, disassemble, fields, run, type Cpu, type Effect } from './model';

export type Phase = 'start' | 'fetch' | 'decode' | 'execute' | 'stopped';

export interface CpuFrame extends Frame {
  cpu: Cpu;
  phase: Phase;
  /** How many instructions have finished. */
  done: number;
  /** The instruction being worked on, if any. */
  effect: Effect | null;
  paths: Path[];
  /** Units on the active path (drawn in --hi). */
  active: UnitId[];
  /** Units that were just written (drawn in --ok). */
  wrote: UnitId[];
  /** Memory cells read or addressed now, and the one just written. */
  readCell: number | null;
  wroteCell: number | null;
}

const bits = (n: number, width: number) => n.toString(2).padStart(width, '0');

function executeParts(e: Effect): Pick<CpuFrame, 'paths' | 'active' | 'wrote' | 'readCell' | 'wroteCell'> {
  const { op, reg, addr } = e.instr;
  const regId: UnitId = reg === 0 ? 'r0' : 'r1';
  switch (op) {
    case 'LOAD':
      return { paths: [PATHS.irAddress(addr), PATHS.memToReg(addr, reg)], active: ['ir'], wrote: [regId], readCell: addr, wroteCell: null };
    case 'STORE':
      return { paths: [PATHS.irAddress(addr), PATHS.regToMem(reg, addr)], active: ['ir', regId], wrote: [], readCell: null, wroteCell: addr };
    case 'ADD':
    case 'SUB':
      return { paths: [PATHS.toAlu(0), PATHS.toAlu(1), PATHS.aluToR0(), PATHS.aluToZ()], active: ['r1', 'alu'], wrote: ['r0', 'z'], readCell: null, wroteCell: null };
    case 'JZ':
    case 'JMP':
      return e.jumped
        ? { paths: [PATHS.jump()], active: ['ir'], wrote: ['pc'], readCell: null, wroteCell: null }
        : { paths: [], active: ['z'], wrote: [], readCell: null, wroteCell: null };
    default:
      return { paths: [], active: [], wrote: [], readCell: null, wroteCell: null };
  }
}

function executeSay(e: Effect, before: Cpu) {
  const { op, reg, addr } = e.instr;
  switch (op) {
    case 'LOAD':
      return <>Execute: copy cell {addr} into R{reg}. R{reg} = <span className="hl ok">{e.wroteReg?.value}</span>.</>;
    case 'STORE':
      return <>Execute: write R{reg} into cell {addr}. Cell {addr} = <span className="hl ok">{e.wroteMem?.value}</span>.</>;
    case 'ADD':
    case 'SUB':
      return <>Execute: the ALU computes {e.alu!.a} {op === 'ADD' ? '+' : '−'} {e.alu!.b} = <span className="hl ok">{e.alu!.result}</span> into
        R0{e.alu!.result === 0 ? <>, and sets the <b>zero flag</b></> : <>; not zero, so Z = 0</>}.</>;
    case 'JZ':
      return before.z
        ? <>Execute: Z is 1, so jump. PC = <span className="hl ok">{addr}</span>: the next fetch comes from there.</>
        : <>Execute: Z is 0, so don't jump. PC stays at {e.at + 1}.</>;
    case 'JMP':
      return <>Execute: jump. PC = <span className="hl ok">{addr}</span>, so the next fetch comes from cell {addr}.</>;
    case 'HALT':
      return <>HALT: the CPU stops. That's the end of the program.</>;
    default:
      return <>That number isn't an instruction this CPU knows, so it <span className="hl bad">stops</span>.</>;
  }
}

/** Three frames per instruction (fetch, decode, execute) for the program in `mem`. */
export function cpuFrames(mem: readonly number[]): CpuFrame[] {
  const { states, effects, reason } = run(mem);
  const blank = { effect: null, paths: [], active: [], wrote: [], readCell: null, wroteCell: null };
  const frames: CpuFrame[] = [
    { ...blank, cpu: states[0], phase: 'start', done: 0, say: <>PC starts at 0: the address of the first instruction. Press play.</> },
  ];

  effects.forEach((e, k) => {
    const before = states[k];
    const after = states[k + 1];
    const fetched: Cpu = { ...before, ir: e.word, pc: (e.at + 1) % mem.length };
    const f = fields(e.word);
    frames.push({
      ...blank,
      cpu: fetched,
      phase: 'fetch',
      done: k,
      effect: e,
      paths: [PATHS.fetchAddress(e.at), PATHS.fetchData(e.at)],
      active: ['pc'],
      wrote: ['ir'],
      readCell: e.at,
      say: <>Fetch: PC says {e.at}, so read cell {e.at} (the number <b>{e.word}</b>) into IR, and move PC on.</>,
    });
    frames.push({
      ...blank,
      cpu: fetched,
      phase: 'decode',
      done: k,
      effect: e,
      active: ['ir'],
      say: <>Decode: {bits(f.opcode, 3)} is the opcode, then register {f.reg}, then address {f.addr}. So {e.word} means{' '}
        <span className="hl info">{disassemble(e.word)}</span>.</>,
    });
    frames.push({ ...blank, ...executeParts(e), cpu: after, phase: 'execute', done: k + 1, effect: e, hold: 1.3, say: executeSay(e, before) });
  });

  if (reason === 'limit') {
    const last = frames[frames.length - 1];
    frames.push({
      ...blank,
      cpu: last.cpu,
      phase: 'stopped',
      done: last.done,
      hold: 2,
      say: <>Stopped after {plural(MAX_INSTRUCTIONS, 'instruction')}: this program never reaches HALT. A real CPU would just keep going.</>,
    });
  } else {
    frames[frames.length - 1].hold = 2;
  }
  return frames;
}
