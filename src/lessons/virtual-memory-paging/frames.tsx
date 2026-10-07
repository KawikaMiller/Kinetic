import type { ReactNode } from 'react';
import { latency, pct, plural } from '../../core/format';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { access, FRAMES, LAYOUT, MAJOR_FAULT_NS, MINOR_FAULT_NS, RAM_NS, startMachine, thrashAccesses, usefulShare, WORKING_SET, type Access, type AccessStep, type Machine, type Policy } from './model';

export interface VmFrame extends Frame {
  m: Machine;
  step: AccessStep | null;
  access: Access | null;
}

export const hex4 = (n: number) => `0x${n.toString(16).padStart(4, '0')}`;
export const hex3 = (n: number) => `0x${n.toString(16).padStart(3, '0')}`;
const owners = (os: { proc: string; vpn: number }[]) => os.map((o) => `${o.proc}'s page ${o.vpn}`).join(' and ');

function stepCaption(s: AccessStep, a: Access, policy: Policy, before: Machine): ReactNode {
  const vpn = a.vaddr >>> 12;
  const off = a.vaddr & 0xfff;
  const pte = s.m.tables[a.proc][vpn];
  const verb = a.write ? 'writes' : 'reads';
  switch (s.kind) {
    case 'split':
      return (
        <>
          {a.proc} {verb} <span className="hl">{hex4(a.vaddr)}</span>. The top 4 bits are the page number (<span className="hl violet">VPN {vpn}</span>), the low 12 the offset inside the page (
          <span className="hl info">{hex3(off)}</span>).
        </>
      );
    case 'lookup': {
      const row = before.tables[a.proc][vpn];
      if (!row.kind) return <>{a.proc}'s page table, row {vpn}: nothing is mapped there.</>;
      return (
        <>
          {a.proc}'s page table, row {vpn} ({row.kind}): present = {row.present ? 1 : 0}
          {row.present ? <>, frame {row.frame}</> : null}, writable = {row.writable ? 1 : 0}, dirty = {row.dirty ? 1 : 0}.
        </>
      );
    }
    case 'segv':
      return s.reason === 'unmapped' ? (
        <>
          <span className="hl bad">Segmentation fault.</span> Page {vpn} is in the gap between heap and stack: nothing is mapped there, so the kernel kills {a.proc}.
        </>
      ) : (
        <>
          <span className="hl bad">Segmentation fault.</span> Page {vpn} is {pte.kind}, mapped read-only, so a write is a protection fault and the kernel kills {a.proc}.
        </>
      );
    case 'fault':
      return (
        <>
          Present = 0: a <span className="hl orange">page fault</span>. The CPU traps into the kernel to bring the page in. That's a normal event, not an error.
        </>
      );
    case 'free':
      return <>Frame {s.frame} is free, so the page can go straight there.</>;
    case 'shared':
      return <>libc's page is already in frame {s.frame} for the other process: map it into {a.proc}'s table too, read-only. No disk read at all: a minor fault.</>;
    case 'victim': {
      const dirty = s.evicted!.some((o) => before.tables[o.proc][o.vpn].dirty);
      const why =
        policy === 'fifo' ? (
          <>FIFO evicts the frame loaded longest ago: frame {s.frame}</>
        ) : s.cleared!.length > 0 ? (
          <>
            Clock sweeps from its hand, clearing the reference bit of {plural(s.cleared!.length, 'frame')} ({s.cleared!.join(', ')}) as a second chance, and evicts frame {s.frame}, whose bit was
            already clear
          </>
        ) : (
          <>Clock's hand is on frame {s.frame}, whose reference bit is clear, so it's the victim</>
        );
      return (
        <>
          RAM is full. {why} ({owners(s.evicted!)}). {dirty ? (
            <>It's dirty, so it must be written out first.</>
          ) : s.evicted!.every((o) => before.tables[o.proc][o.vpn].backing === 'zero') ? (
            <>It's clean and was never written: it can be zero-filled again later, so it's just dropped.</>
          ) : (
            <>It's clean: its copy on disk (the program file or swap) is still good, so it's just dropped.</>
          )}
        </>
      );
    }
    case 'swapout':
      return <>Write the dirty page to swap (a disk write, illustrative milliseconds), then mark {owners(s.evicted!)} not present. Swap writes so far: {s.m.swapWrites}.</>;
    case 'load':
      return s.from === 'swap' ? (
        <>Read page {vpn} back from swap into frame {s.frame} (a disk read), then set present = 1, frame = {s.frame}.</>
      ) : s.from === 'file' ? (
        <>Read page {vpn} from the program file into frame {s.frame}, then set present = 1, frame = {s.frame}.</>
      ) : (
        <>{a.proc} never used page {vpn} before: give it frame {s.frame}, filled with zeros, and set present = 1. No disk needed: a minor fault.</>
      );
    case 'retry':
      return <>Return from the fault and run the same instruction again. This time the page is present.</>;
    case 'done':
      return (
        <>
          Frame {s.frame} × 4096 + {hex3(off)} = physical <span className="hl ok">{hex4(s.paddr!)}</span>.{a.write ? <> A write, so the dirty bit is set.</> : null}
          {s.m.frames[s.frame!].owners.length > 1 ? <> This frame is shared: both processes see the same libc bytes.</> : null}
        </>
      );
  }
}

export function idleFrames(m: Machine): VmFrame[] {
  return [
    {
      m, step: null, access: null,
      say: (
        <>
          Two processes, each with its own 64 KiB of virtual addresses, share 8 frames of RAM. Pick an address preset, or type an address and press Read or Write.
        </>
      ),
    },
  ];
}

export function accessFrames(before: Machine, a: Access, policy: Policy): VmFrame[] {
  const r = access(before, a, policy);
  const rec = createRecorder<VmFrame>({ m: before, step: null, access: a });
  r.steps.forEach((s) => rec.snap(stepCaption(s, a, policy, before), s.kind === 'victim' || s.kind === 'segv' ? 1.6 : undefined, { m: s.m, step: s }));
  return rec.frames;
}

/** The thrashing loop: one frame per access, from the start machine. */
export function thrashFrames(policy: Policy): VmFrame[] {
  let m = startMachine();
  const rec = createRecorder<VmFrame>({ m, step: null, access: null });
  rec.snap(
    <>
      Thrashing: A loops over its working set of {WORKING_SET} pages, but RAM has only {FRAMES} frames. Every page it needs next was just evicted to make room for the one before.
    </>,
    1.5,
  );
  thrashAccesses().forEach((a, i) => {
    const r = access(m, a, policy);
    const victim = r.steps.find((s) => s.kind === 'victim');
    const vpn = a.vaddr >>> 12;
    rec.snap(
      r.outcome === 'hit' ? (
        <>
          Access {i + 1}: page {vpn} ({LAYOUT[vpn]}) is in RAM: a hit.
        </>
      ) : (
        <>
          Access {i + 1}: page {vpn} ({LAYOUT[vpn]}) <span className="hl orange">faults</span>
          {victim ? <>, evicting frame {victim.frame} ({owners(victim.evicted!)})</> : null}. Faults so far: {r.m.faults} ({r.m.major} major, from disk).
        </>
      ),
      0.55,
      { m: r.m, step: r.steps[r.steps.length - 1], access: a },
    );
    m = r.m;
  });
  rec.close(
    <>
      {plural(m.faults, 'fault')} ({m.major} major, from disk; {m.minor} minor) and {plural(m.hits, 'hit')} in {thrashAccesses().length} accesses. With illustrative costs ({latency(RAM_NS)}{' '}
      per RAM access, {latency(MINOR_FAULT_NS)} per minor fault, {latency(MAJOR_FAULT_NS)} per major fault) only <span className="hl bad">{pct(usefulShare(m), 2)}</span> of the time is useful
      work. The fix is more RAM, a smaller working set, or fewer processes competing for frames.
    </>,
    2,
  );
  return rec.frames;
}
