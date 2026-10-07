import type { ReactNode } from 'react';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { HZ, KERNEL_STEP_MS, TICK_MS, type IrqSource, type Outcome, type Script, type Step, type SwitchKind } from './model';

export interface SwitchFrame extends Frame {
  /** Index into script.steps. */
  i: number;
}

export const hex = (n: number) => `0x${n.toString(16)}`;
const ms = (t: number) => `${Number(t.toFixed(2))} ms`;

function stepCaption(s: Step, i: number, sc: Script): ReactNode {
  const n = <b>{s.subject}</b>;
  const info = sc.threads[s.subject];
  const next = sc.steps[i + 1];
  switch (s.phase) {
    case 'run': {
      const other = s.subject === 'A' ? 'B' : 'A';
      if (i === 0) {
        return (
          <>
            Thread {n} is running in user mode. {other} is {s.states[other]}: its registers wait in its PCB (Linux calls it a <code>task_struct</code>), not in the CPU.
          </>
        );
      }
      return <>{n} runs user code until t = {ms(s.t)}: its PC and RAX move as it executes.</>;
    }
    case 'irq':
      return s.source === 'timer' ? (
        <>
          Timer interrupt at t = {ms(s.t - KERNEL_STEP_MS)} (HZ = {HZ}, one tick every {TICK_MS} ms). The CPU finishes {n}'s current instruction, saves its PC, SP and flags on the kernel stack,
          switches to kernel mode and jumps to the handler.
        </>
      ) : (
        <>Disk interrupt: the read B asked for is done. The CPU stops {n} after its current instruction and runs the disk handler.</>
      );
    case 'syscall':
      return <>{n} calls <code>read(fd, buf, 4096)</code>: the syscall instruction traps into the kernel, just like an interrupt but on purpose.</>;
    case 'handler':
      if (s.source === 'timer') return <>The tick handler charges this tick to {n}. Its time slice is used up, so the handler asks for a reschedule.</>;
      if (s.subject === 'B') {
        return <>The data isn't in memory, so the kernel starts a disk read and marks {n} blocked. {n} can't go on, so it gives up the CPU: a voluntary switch.</>;
      }
      return <>The handler hands the data to B and marks it ready (hatched). Nobody's slice is up, so there's no switch: not every interrupt reschedules.</>;
    case 'save':
      return (
        <>
          Save {n}'s registers into {n}'s PCB: PC {hex(s.pcb[s.subject]!.pc)}, SP {hex(s.pcb[s.subject]!.sp)}, flags, RAX, RBX. {s.states[s.subject] === 'blocked' ? <>{n} stays blocked until its disk read is done.</> : <>{n} is now ready, not running.</>}
        </>
      );
    case 'pick':
      return s.newAsid ? (
        <>The scheduler picks {n}. It belongs to another process ({info.process}), so the CPU must switch to {info.process}'s page tables too.</>
      ) : (
        <>The scheduler picks {n}. It's a thread of the same process ({info.process}), so the page tables stay as they are: same address space.</>
      );
    case 'mm':
      return <>Switch address space: the CPU now uses {info.process}'s page tables (address space {s.asid}). Translations cached for the old process are useless now, one reason a process switch costs more than a thread switch.</>;
    case 'load':
      return (
        <>
          Load {n}'s saved registers into the CPU: PC {hex(s.cpu!.regs.pc)}, SP {hex(s.cpu!.regs.sp)}.{' '}
          {s.roundTrip ? <span className="hl ok">Exactly the values it was saved with.</span> : <>These are the values it started with.</>}
        </>
      );
    case 'iret':
      return (
        <>
          Return to user mode. {n} carries on from PC {hex(s.cpu!.regs.pc)} as if it had never stopped{next ? <> until the next interrupt</> : null}.
        </>
      );
    case 'resume':
      return <>Return from the interrupt straight to {n}: its registers never left the CPU, so there's no context switch.</>;
  }
}

export function switchFrames(sc: Script, kind: SwitchKind): SwitchFrame[] {
  const rec = createRecorder<SwitchFrame>({ i: 0 });
  sc.steps.forEach((s, i) => rec.snap(stepCaption(s, i, sc), s.phase === 'save' || s.phase === 'load' ? 1.4 : undefined, { i }));
  const switches = sc.steps.filter((s) => s.phase === 'load').length;
  const spaces = sc.steps.filter((s) => s.phase === 'mm').length;
  rec.close(
    kind === 'involuntary' ? (
      <>
        A thread doesn't keep the CPU until it finishes: the timer took it back {switches === 1 ? 'once' : `${switches} times`} in {ms(sc.end)}, and every switch saved and restored the registers
        exactly. {spaces > 0 ? <>Each one also switched address space.</> : <>Same process, so the address space never changed.</>}
      </>
    ) : (
      <>
        B gave up the CPU itself by blocking in read(); the disk interrupt only made it ready, and the timer gave it the CPU back. {switches} switches,{' '}
        {spaces > 0 ? <>each with an address-space change.</> : <>none of them changing address space.</>}
      </>
    ),
    2,
  );
  return rec.frames;
}

const SOURCE_NAME: Record<IrqSource, string> = { timer: 'Timer', disk: 'Disk', network: 'Network', key: 'Keypress' };
export const sourceName = (s: IrqSource) => SOURCE_NAME[s];

/** One sandbox outcome as a sentence. */
export function outcomeText(o: Outcome): string {
  const at = `t = ${ms(o.at)}`;
  switch (o.source) {
    case 'timer':
      if (o.reschedule) return `${at}: timer tick. ${o.from}'s slice is used up and ${o.to} is ready: context switch to ${o.to}.`;
      if (o.sliceUp) return `${at}: timer tick. ${o.from}'s slice is used up, but nobody else is ready, so ${o.from} carries on.`;
      return `${at}: timer tick. ${o.from} still has slice left, so it carries on.`;
    case 'disk':
      return o.woke ? `${at}: disk done. B's read is ready, so B becomes ready, but ${o.from} keeps the CPU until a tick.` : `${at}: disk interrupt, but nobody is waiting on the disk now.`;
    case 'key':
      return o.woke ? `${at}: keypress. The shell C wakes up and becomes ready; ${o.from} keeps the CPU until a tick.` : `${at}: keypress, buffered: C isn't waiting for one now.`;
    case 'network':
      return `${at}: network packet, copied into a socket buffer. No thread here waits on a socket, so nothing wakes.`;
  }
}
