import type { ReactNode } from 'react';
import { latency } from '../../core/format';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { COST_NS, crossings, PRIV_STEPS, READ_STEPS, SYSCALL_NR, totalNs, type CallStep } from './model';

export interface CallFrame extends Frame {
  /** Index into the step list. */
  i: number;
}

const crossingNs = (steps: readonly CallStep[]) => steps.filter((s) => s.crossing).reduce((a, s) => a + s.costNs, 0);

const READ_SAY: Record<string, ReactNode> = {
  call: <>Your code calls <code>read(3, buf, 4096)</code>. So far it's an ordinary function call into libc: still user mode, ring 3.</>,
  setup: (
    <>
      The libc wrapper puts the system call number in <code>rax</code> (read is {SYSCALL_NR.read}) and the arguments in <code>rdi</code>, <code>rsi</code>, <code>rdx</code>: fd 3, the buffer's
      address, 4096.
    </>
  ),
  trap: (
    <>
      The <code>syscall</code> instruction traps: the CPU saves where it was, flips the mode bit to ring 0 and jumps to the kernel's one entry point. User code can't jump into the kernel anywhere
      else.
    </>
  ),
  dispatch: <>The kernel indexes its system call table with <code>rax</code>: entry {SYSCALL_NR.read} is <code>sys_read</code>.</>,
  vfs: <>sys_read finds the open file behind fd 3, and its data is already in the page cache (RAM), so nothing waits for the disk this time.</>,
  copy: <>copy_to_user copies 4096 bytes into your buffer, after checking that buf really is a user address. Only the kernel can reach across the wall like this.</>,
  sysret: <>sysret puts the result in <code>rax</code> (4096 bytes read), flips the mode bit back to ring 3 and resumes the wrapper just after <code>syscall</code>.</>,
  return: (
    <>
      read() returns 4096 to your code. The two crossings alone took {latency(crossingNs(READ_STEPS))}, against {latency(COST_NS.call)} for an ordinary function call (illustrative numbers).
    </>
  ),
};

const PRIV_SAY: Record<string, ReactNode> = {
  hlt: <>User code runs <code>hlt</code> (stop the CPU until the next interrupt). It's a privileged instruction: only ring 0 may run it.</>,
  gp: <>The CPU checks the mode bit, sees ring 3, and refuses: instead of halting it raises a general-protection fault, which traps into the kernel.</>,
  signal: <>The kernel's fault handler sees a user process broke the rules, and sends it SIGSEGV.</>,
  killed: (
    <>
      Nothing in the program handles SIGSEGV, so it is <span className="hl bad">killed</span>: "Segmentation fault". The machine carries on. That's what the wall is for.
    </>
  ),
};

export function readFrames(): CallFrame[] {
  const rec = createRecorder<CallFrame>({ i: 0 });
  READ_STEPS.forEach((s, i) => rec.snap(READ_SAY[s.id], s.crossing ? 1.5 : undefined, { i }));
  rec.close(
    <>
      One read() = {crossings(READ_STEPS)} crossings and about {latency(totalNs(READ_STEPS))} in all here (illustrative). A function call is a few ns, which is why programs read in big chunks, not
      byte by byte.
    </>,
    2,
  );
  return rec.frames;
}

export function privFrames(): CallFrame[] {
  const rec = createRecorder<CallFrame>({ i: 0 });
  PRIV_STEPS.forEach((s, i) => rec.snap(PRIV_SAY[s.id], s.move?.fault ? 1.4 : undefined, { i }));
  return rec.frames;
}
