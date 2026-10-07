import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { ABI, argCount, REAL_STACK_BYTES, runScene, TOY_STACK_BYTES, type RunResult, type SceneId, type SceneOptions } from './model';
import { NO_PAD_NOTE } from './listings';
import { functionAt } from './unwind';
import { hex, operandText, signed, type Reg64 } from './x86';

export interface CallFrame extends Frame {
  /** Index into the run's steps. */
  k: number;
}

const ARG_NAMES: Record<string, string[]> = { area: ['w', 'h'], mul: ['a', 'b'], sum7: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], depth: ['n'] };

/** Caller-saved registers (not rax, the return value) whose value a call changed. */
export function clobbered(run: RunResult, k: number): Reg64[] {
  const s = run.steps[k];
  if (s.effect?.instr.op !== 'ret' || s.cpu.halted) return [];
  const call = run.steps[k - 1].calls.at(-1)!;
  const at = run.steps.findIndex((x) => x.calls.some((c) => c.id === call.id)) - 1;
  return ABI.callerSaved.filter((r) => r !== 'rax' && s.cpu.regs[r] !== run.steps[at].cpu.regs[r]);
}

const noteOf = (run: RunResult, addr: number) => {
  const i = run.program.instrs.findIndex((x) => x.addr === addr);
  const line = run.listing.asm[run.program.lineOf.indexOf(i)];
  return line?.note;
};

export function stepSay(run: RunResult, k: number): ReactNode {
  const s = run.steps[k];
  const before = run.steps[k - 1];
  const e = s.effect!;
  const ins = e.instr;
  const code = <code>{ins.text}</code>;
  const fn = functionAt(run.fns, ins.addr)!.name;
  const note = noteOf(run, ins.addr);
  const tail = note ? <> ({note})</> : null;
  const rspBefore = Number(before.cpu.regs.rsp);

  if (s.overflow) {
    return (
      <>
        {code} would write below the toy stack, into the <span className="hl bad">guard page</span>. That page is unmapped on purpose, so the CPU faults and the kernel kills the program:{' '}
        <span className="hl bad">stack overflow</span> (a segmentation fault) after {plural(s.calls.filter((c) => c.fn === 'depth').length, 'call')} of depth. With the real 8 MiB stack it would get about{' '}
        {Math.floor(REAL_STACK_BYTES / 16).toLocaleString('en-US')} calls deep first.
      </>
    );
  }
  if (ins.op === 'call') {
    const callee = s.calls.at(-1)!;
    const names = ARG_NAMES[callee.fn] ?? [];
    const inRegs = Math.min(6, argCount(callee.fn));
    const args = callee.args.map((v, i) => (
      <span key={i}>
        {i ? ', ' : ''}
        <span className="hl info">{ABI.argRegs[i]}</span> = {signed(v).toString()}
        {names[i] ? ` (${names[i]})` : ''}
      </span>
    ));
    const aligned = rspBefore % ABI.callAlignment === 0;
    return (
      <>
        {code}: push the return address and jump to {callee.fn}.{' '}
        {inRegs > 0 ? <>Arguments go in registers: {args}.</> : null}
        {argCount(callee.fn) > 6 ? <> The 7th has no register left, so it was pushed on the stack.</> : null} rsp was {hex(rspBefore)},{' '}
        {aligned ? <>a multiple of 16, as the ABI asks</> : <>8 bytes short of 16-byte alignment ({NO_PAD_NOTE})</>}; {callee.fn} starts with rsp = {hex(Number(s.cpu.regs.rsp))}.
      </>
    );
  }
  if (ins.op === 'ret') {
    if (s.cpu.halted) return <>{code}: main returns <span className="hl ok">{signed(s.cpu.regs.rax).toString()}</span> to libc.</>;
    const back = functionAt(run.fns, s.cpu.rip)!.name;
    const lost = clobbered(run, k);
    return (
      <>
        {code}: pop the return address into rip, back to {back}. The result is in rax = <span className="hl ok">{signed(s.cpu.regs.rax).toString()}</span>.
        {lost.length ? (
          <>
            {' '}
            <span className="hl orange">{lost.join(', ')}</span> came back changed: caller-saved, so {fn} was free to overwrite {lost.length === 1 ? 'it' : 'them'}.
          </>
        ) : null}
        {run.scene === 'saved' ? <> rbx is {signed(s.cpu.regs.rbx).toString()} again: callee-saved, so {fn} put it back.</> : null}
      </>
    );
  }
  if (ins.text === 'push rbp') return <>{code}: the prologue starts by saving the caller's frame pointer.</>;
  if (ins.text === 'mov rbp, rsp') return <>{code}: rbp now marks {fn}'s frame. The saved rbp is at [rbp] and the return address at [rbp+8], and each saved rbp points at the frame before: the chain.</>;
  if (ins.op === 'leave') return <>{code}: the epilogue. It does mov rsp, rbp then pop rbp, so {fn}'s frame is gone and rbp points at the caller's frame again.</>;
  if (ins.text === 'pop rbp') return <>{code}: restore the caller's frame pointer.</>;
  if (ins.text.startsWith('sub rsp,')) return <>{code}: move rsp down {operandText(ins.operands[1])} bytes to make room{tail}.</>;
  if (ins.text.startsWith('add rsp,')) return <>{code}: give the stack space back{tail}.</>;
  if (ins.op === 'push' || ins.op === 'pop') return <>{code}{tail}.</>;
  const d = ins.operands[0];
  const v = d?.kind === 'reg' ? signed(s.cpu.regs[d.ref.reg]).toString() : '';
  return (
    <>
      {code}: {d?.kind === 'reg' ? <>{d.ref.reg} = {v}</> : 'done'}
      {tail}.
    </>
  );
}

export function introSay(run: RunResult): ReactNode {
  switch (run.scene) {
    case 'calls':
      return <>libc has just called main. Step through main → area → mul and watch the stack grow down: each call pushes a return address, and each prologue builds a frame.</>;
    case 'seven':
      return <>sum7 takes 7 arguments. Only 6 fit in registers (rdi, rsi, rdx, rcx, r8, r9): watch where the 7th goes.</>;
    case 'saved':
      return <>main keeps one value in rcx and one in rbx, then calls helper. This listing is hand-written to show the rule. Across a call to code it can't see, a compiler never leaves a value it still needs in rcx; it only does when it can see the callee won't touch rcx (gcc's -fipa-ra).</>;
    case 'deep':
      return <>depth calls itself, 16 bytes of stack per call. This toy stack holds only {TOY_STACK_BYTES} bytes before its guard page (a real one gets 8 MiB).</>;
  }
}

export function callFrames(scene: SceneId, o: SceneOptions): { run: RunResult; frames: CallFrame[] } {
  const run = runScene(scene, o);
  const rec = createRecorder<CallFrame>({ k: 0 });
  rec.snap(introSay(run), 1.3);
  for (let k = 1; k < run.steps.length; k++) rec.snap(stepSay(run, k), run.steps[k].overflow ? 2 : undefined, { k });
  if (!run.steps.at(-1)!.overflow) rec.close(<>Done: main returned {signed(run.steps.at(-1)!.cpu.regs.rax).toString()}, and rsp is back where libc left it.</>, 2);
  return { run, frames: rec.frames };
}
