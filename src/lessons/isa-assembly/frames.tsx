import type { ReactNode } from 'react';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { cResult, formatValue, runProgram, type ProgId, type RunResult, type Variant } from './model';
import { CONDITIONS, effectiveAddress, hex, operandText, readMem, type Cpu, type Flag, type Operand, type StepEffect } from '../../core/x86';

export interface IsaFrame extends Frame {
  /** Index into the run's states: 0 = just called, k = after the k-th instruction. */
  k: number;
}

/** What each condition means, for the caption. */
const MEANING: Record<string, string> = {
  e: 'equal', ne: 'not equal', l: 'signed less than', le: 'signed less or equal', g: 'signed greater than', ge: 'signed greater or equal',
  b: 'unsigned below', be: 'unsigned below or equal', a: 'unsigned above', ae: 'unsigned above or equal',
};
const RULE: Record<string, string> = {
  e: 'ZF = 1', ne: 'ZF = 0', l: 'SF ≠ OF', le: 'ZF = 1 or SF ≠ OF', g: 'ZF = 0 and SF = OF', ge: 'SF = OF',
  b: 'CF = 1', be: 'CF = 1 or ZF = 1', a: 'CF = 0 and ZF = 0', ae: 'CF = 0',
};

const flagList = (cpu: Cpu, fs: readonly Flag[]) => fs.map((f) => `${f} = ${cpu.flags[f] ? 1 : 0}`).join(', ');
const opText = operandText;

function value(cpu: Cpu, o: Operand, v: Variant): string {
  if (o.kind === 'reg') return formatValue(cpu.regs[o.ref.reg] & ((1n << BigInt(o.ref.bits)) - 1n), v.unsignedTypes);
  if (o.kind === 'imm') return o.value.toString();
  if (o.kind === 'mem') return formatValue(readMem(cpu.mem, effectiveAddress(cpu, o), 64), v.unsignedTypes);
  return o.name;
}

export function stepSay(run: RunResult, k: number, v: Variant): ReactNode {
  const e: StepEffect = run.effects[k - 1];
  const before = run.cpus[k - 1];
  const after = run.cpus[k];
  const ins = e.instr;
  const [d, s] = ins.operands;
  const code = <code>{ins.text}</code>;
  const op = ins.op;
  const dst = d ? opText(d) : '';
  const res = d ? value(after, d, v) : '';
  const changed = (o: Operand | undefined) => (o?.kind === 'reg' ? <span className="hl">{o.ref.reg}</span> : null);

  if (op === 'mov') {
    const zeroExt = d.kind === 'reg' && d.ref.bits === 32;
    const from = s.kind === 'mem' ? <> the 8 bytes at {hex(effectiveAddress(before, s))}</> : s.kind === 'reg' ? <> {opText(s)}</> : null;
    return (
      <>
        {code}: {s.kind === 'imm' ? <>put {s.value.toString()} into</> : <>copy{from} into</>} {changed(d)}, which is now {res}.
        {zeroExt ? <> Writing {dst}, the low 32 bits, also clears the top 32 bits of {d.kind === 'reg' ? d.ref.reg : ''}: a 32-bit write zero-extends.</> : null}
      </>
    );
  }
  if (op === 'lea') {
    return (
      <>
        {code}: compute the address {opText(s)} = {hex(effectiveAddress(before, s as Extract<Operand, { kind: 'mem' }>))} and put it in {changed(d)}. lea does the arithmetic only: it doesn't read memory.
      </>
    );
  }
  if (op === 'add' || op === 'sub' || op === 'imul') {
    const sym = op === 'add' ? '+' : op === 'sub' ? '−' : '×';
    const src = s.kind === 'mem' ? <>the 8 bytes at {hex(effectiveAddress(before, s))} ({value(before, s, v)})</> : <>{opText(s)} ({value(before, s, v)})</>;
    return (
      <>
        {code}: {changed(d)} = {value(before, d, v)} {sym} {src} = {res}.{op === 'imul' ? null : <> Flags: {flagList(after, ['ZF', 'SF', 'CF', 'OF'])}.</>}
      </>
    );
  }
  if (op === 'cmp' || op === 'test') {
    const what = op === 'cmp' ? <>{dst} − {opText(s)}</> : <>{dst} AND {opText(s)}</>;
    return (
      <>
        {code}: work out {what} ({value(before, d, v)} {op === 'cmp' ? '−' : 'AND'} {value(before, s, v)}), throw the answer away, and keep only the flags:{' '}
        <span className="hl">{flagList(after, ['ZF', 'SF', 'CF', 'OF'])}</span>.
      </>
    );
  }
  if (op === 'jmp') return <>{code}: always jump, to {opText(d)}.</>;
  if (op.startsWith('j') || op.startsWith('cmov')) {
    const cc = op.startsWith('j') ? op.slice(1) : op.slice(4);
    const flags = <span className="hl violet">{flagList(before, CONDITIONS[cc].flags)}</span>;
    const rule = `${RULE[cc]} (${MEANING[cc]})`;
    if (op.startsWith('j')) {
      return e.taken ? (
        <>
          {code} jumps when {rule}. It reads {flags}: true, so it jumps to {opText(d)}.
        </>
      ) : (
        <>
          {code} jumps when {rule}. It reads {flags}: false, so it falls through to the next line.
        </>
      );
    }
    return e.taken ? (
      <>
        {code} copies when {rule}. It reads {flags}: true, so it copies {opText(s)} into {changed(d)} ({res}). No jump either way.
      </>
    ) : (
      <>
        {code} copies when {rule}. It reads {flags}: false, so {dst} keeps its value ({res}). No jump either way.
      </>
    );
  }
  if (op === 'ret') {
    return (
      <>
        {code}: pop the return address {hex(after.rip)} off the stack into rip and go back to the caller. The result is in rax: <span className="hl ok">{formatValue(after.regs.rax, v.unsignedTypes)}</span>.
      </>
    );
  }
  return <>{code}.</>;
}

export function introSay(run: RunResult, prog: ProgId, values: readonly bigint[], v: Variant): ReactNode {
  const args = run.args.map((a) => (
    <span key={a.reg}>
      {' '}
      {a.name} in <span className="hl info">{a.reg}</span> ({formatValue(run.start.regs[a.reg], v.unsignedTypes)}),
    </span>
  ));
  return (
    <>
      The caller has just run <code>call</code>: the arguments are in registers,{args} and the return address is on top of the stack at rsp. {prog === 'sum' && values.length === 0 ? 'n is 0, so watch the first jump. ' : ''}Press
      Step.
    </>
  );
}

/** The verdict at the end: the listing's rax against C's answer, worked out separately. */
export function resultSay(run: RunResult, prog: ProgId, values: readonly bigint[], v: Variant): ReactNode {
  const rax = run.cpus.at(-1)!.regs.rax;
  const want = cResult(prog, v, values);
  return rax === want ? (
    <>
      Returned rax = <span className="hl ok">{formatValue(rax, v.unsignedTypes)}</span>, the same as the C code gives, in {run.effects.length} instructions.
    </>
  ) : (
    <>
      Returned rax = <span className="hl bad">{formatValue(rax, v.unsignedTypes)}</span>, but the C code gives {formatValue(want, v.unsignedTypes)}.
    </>
  );
}

export function isaFrames(prog: ProgId, v: Variant, values: readonly bigint[]): { run: RunResult; frames: IsaFrame[] } {
  const run = runProgram(prog, v, values);
  const rec = createRecorder<IsaFrame>({ k: 0 });
  rec.snap(introSay(run, prog, values, v), 1.2);
  for (let k = 1; k < run.cpus.length; k++) rec.snap(stepSay(run, k, v), undefined, { k });
  rec.close(resultSay(run, prog, values, v), 2);
  return { run, frames: rec.frames };
}
