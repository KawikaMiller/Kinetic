import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { handle, STREAM, tally, type Instr, type Technique } from './model';

export interface TrapFrame extends Frame {
  /** Index of the instruction running now, or -1 before the first / after the last. */
  i: number;
}

/** What the hypervisor does on a VM exit, per instruction. */
const EXIT_WORK: Record<string, string> = {
  out: 'hands the byte to its emulated serial port',
  hlt: 'can run another guest on this core until this one has an interrupt',
};

export function instrCaption(instr: Instr, technique: Technique): ReactNode {
  const code = <code>{instr.text}</code>;
  const h = handle(instr, technique);
  switch (h) {
    case 'direct':
      if (instr.kind === 'ordinary') return <>{code} ({instr.does}) is an ordinary instruction: it runs straight on the CPU at full speed. The hypervisor isn't involved.</>;
      if (instr.id === 'cr3') {
        return <>{code} runs directly: with nested paging (EPT / NPT) the guest may switch its own page tables, because the CPU adds the hypervisor's second translation underneath. No exit.</>;
      }
      return <>{code} ({instr.does}) runs directly: with hardware assist the guest kernel really is in ring 0 of guest mode, so it changes only its own virtual CPU state. No exit.</>;
    case 'trap':
      return technique === 'classic' ? (
        <>
          {code} ({instr.does}) is privileged. The guest kernel runs deprivileged, in ring 1, so the CPU refuses it and faults into the hypervisor: a trap. The hypervisor emulates the effect on this guest's virtual CPU only, then
          resumes the guest.
        </>
      ) : (
        <>
          {code} ({instr.does}) causes a VM exit: the CPU saves the guest's state and jumps to the hypervisor, which {EXIT_WORK[instr.id] ?? 'emulates it'}. Then a VM entry
          resumes the guest.
        </>
      );
    case 'bad':
      return (
        <>
          <span className="hl bad">{code} goes silently wrong.</span> It's sensitive but not privileged: in ring 1 (with the usual I/O privilege level of 0) it just leaves the interrupt flag alone, without a fault. The
          hypervisor never sees it, and the guest thinks interrupts are back on when they aren't. This is the classic x86 hole (it breaks Popek and Goldberg's rule).
        </>
      );
    case 'translate':
      return (
        <>
          {code} never runs as written. Before this code ran, the hypervisor rewrote the guest kernel's code, replacing it with a call that updates the virtual CPU ({instr.does}). No
          fault needed.
        </>
      );
    case 'shared':
      return (
        <>
          The paravirtualised kernel doesn&apos;t run {code} on the real CPU flag at all: it writes to an event mask in memory it shares with the hypervisor ({instr.does}). An
          ordinary memory write, so no exit and no hypercall.
        </>
      );
    case 'hypercall':
      return <>The paravirtualised kernel was modified: instead of {code} it asks the hypervisor on purpose, with a hypercall ({instr.does}).</>;
  }
}

export const VERDICT: Record<Technique, string> = {
  classic: 'One sensitive instruction that never traps is enough to break trap-only virtualization, which is why x86 needed another way.',
  bt: 'Correct and unmodified guests, at the price of a clever translator in the hypervisor.',
  pv: 'Correct, with few exits, but the guest kernel had to be changed to cooperate.',
  hw: 'Unmodified guests, correct, and most privileged work never leaves guest mode.',
};

export function trapFrames(technique: Technique): TrapFrame[] {
  const rec = createRecorder<TrapFrame>({ i: -1 });
  rec.snap(<>A guest kernel's code path: {plural(STREAM.length, 'instruction')}. Most are ordinary; a few touch the machine itself. Watch where each one gets caught.</>);
  STREAM.forEach((instr, i) => rec.snap(instrCaption(instr, technique), handle(instr, technique) === 'direct' ? 0.8 : 1.5, { i }));
  const t = tally(STREAM, technique);
  rec.set({ i: -1 });
  rec.close(
    <>
      {t.direct} of {STREAM.length} ran directly{t.shared > 0 ? <>, {t.shared} became plain writes to shared memory</> : null}, {t.caught} {t.caught === 1 ? 'was' : 'were'} handled by the hypervisor
      {t.bad > 0 ? <>, and <span className="hl bad">{t.bad} went silently wrong</span></> : null}: {t.cycles.toLocaleString('en-US')} cycles (illustrative). {VERDICT[technique]}
    </>,
    2,
  );
  return rec.frames;
}
