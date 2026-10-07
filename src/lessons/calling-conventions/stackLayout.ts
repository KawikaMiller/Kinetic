import type { MemCell, MemPointer, MemRegion } from '../../components/memory';
import type { Tone } from '../../core/tone';
import { liveSlots, STACK_TOP, type RunResult, type Slot } from './model';

/** Plain categories for frames: main, then everything it calls. Recursion alternates so frames stay apart. */
const frameTone = (fn: string, depthIndex: number): Tone => (fn === 'main' ? 'sky' : depthIndex % 2 ? 'muted' : 'amber');

const SLOT_TONE: Partial<Record<Slot['role'], Tone>> = { ret: 'violet', arg: 'info', pad: 'dim' };

export interface StackPicture {
  regions: MemRegion[];
  cells: MemCell[];
  pointers: MemPointer[];
  /** Saved-rbp slots still on the stack and the frame they point at: the chain. */
  chain: { from: number; to: number }[];
  highlight: number[];
}

export function stackPicture(run: RunResult, k: number): StackPicture {
  const s = run.steps[k];
  const rsp = Number(s.cpu.regs.rsp);
  const rbp = Number(s.cpu.regs.rbp);
  const regions: MemRegion[] = [{ from: STACK_TOP, to: STACK_TOP + 16, label: 'libc', tone: 'muted' }];
  s.calls.forEach((c, i) => {
    const next = s.calls[i + 1];
    // the overflowing write lands in the guard page; the frame's bracket stops at its edge
    const from = Math.max(next ? next.retSlot + 8 : Math.min(rsp, c.retSlot), run.guard?.to ?? -Infinity);
    if (from < c.retSlot + 8) regions.push({ from, to: c.retSlot + 8, label: c.fn, tone: frameTone(c.fn, i) });
  });
  if (run.guard) regions.push({ from: run.guard.from, to: run.guard.to, label: 'guard page', tone: 'bad', variant: 'guard' });

  const { live, popped } = liveSlots(s);
  const cells: MemCell[] = [
    // a write that landed in the guard page is the overflow itself
    ...live.map((x) => ({ addr: x.addr, value: x.text, tone: run.guard && x.addr < run.guard.to ? ('bad' as const) : SLOT_TONE[x.role] })),
    ...popped.map((x) => ({ addr: x.addr, value: x.text, tone: 'dim' as const })),
  ];
  const lowest = run.guard ? run.guard.from : -Infinity;
  const pointers: MemPointer[] = [];
  const inMap = (a: number) => a >= lowest && a < STACK_TOP + 16;
  if (rsp === rbp) pointers.push({ addr: rsp, label: 'sp=bp', tone: 'muted' });
  else {
    pointers.push({ addr: rsp, label: 'rsp', tone: 'muted' });
    if (inMap(rbp)) pointers.push({ addr: rbp, label: 'rbp', tone: 'muted' });
  }
  const chain = live
    .filter((x) => x.role === 'saved-rbp' && x.points !== undefined && x.points >= rsp && x.points < STACK_TOP + 16 && x.points !== 0)
    .map((x) => ({ from: x.addr, to: x.points! }));
  const highlight = s.effect?.wroteMem.map((w) => w.addr) ?? [];
  return { regions, cells, pointers, chain, highlight };
}
