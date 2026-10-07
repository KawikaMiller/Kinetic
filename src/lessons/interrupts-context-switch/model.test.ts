import { describe, expect, it } from 'vitest';
import {
  fire, HZ, mergeSegments, nextAt, overhead, runFor, sandboxStart, SLICE_TICKS, switchesPerSecond, switchScript, TICK_MS,
  type IrqSource, type Sandbox, type SwitchKind,
} from './model';

const COMBOS: [SwitchKind, boolean][] = [
  ['involuntary', true],
  ['involuntary', false],
  ['voluntary', true],
  ['voluntary', false],
];

describe('the cost maths', () => {
  it('overhead = cost / (slice + cost)', () => {
    expect(overhead(4000, 5)).toBeCloseTo(5 / 4005, 12);
    expect(overhead(50, 50)).toBe(0.5);
    expect(overhead(1, 0)).toBe(0);
  });
  it('switches per second = 1 / (slice + cost)', () => {
    expect(switchesPerSecond(4000, 0)).toBe(250);
    expect(switchesPerSecond(995, 5)).toBe(1000);
    expect(switchesPerSecond(20, 30)).toBe(20_000);
  });
  it('HZ = 250 is a 4 ms tick', () => expect(HZ * TICK_MS).toBe(1000));
});

describe('switchScript', () => {
  for (const [kind, same] of COMBOS) {
    const label = `${kind}, ${same ? 'thread switch' : 'process switch'}`;
    it(`${label}: every thread resumes with exactly the registers it was saved with`, () => {
      const { steps } = switchScript(kind, same);
      const lastInCpu: Record<string, unknown> = {};
      let loads = 0;
      steps.forEach((s, i) => {
        if (s.phase === 'save') {
          // The saved copy equals what was in the CPU just before.
          expect(s.pcb[s.subject]).toEqual(steps[i - 1].cpu!.regs);
          lastInCpu[s.subject] = steps[i - 1].cpu!.regs;
        }
        if (s.phase === 'load') {
          loads++;
          expect(s.cpu!.owner).toBe(s.subject);
          if (lastInCpu[s.subject]) expect(s.cpu!.regs).toEqual(lastInCpu[s.subject]);
          expect(s.roundTrip).toBe(true);
          expect(s.pcb[s.subject]).toBeNull();
        }
      });
      expect(loads).toBeGreaterThanOrEqual(1);
    });
    it(`${label}: registers are only ever in one place`, () => {
      for (const s of switchScript(kind, same).steps) {
        for (const id of ['A', 'B'] as const) {
          const inCpu = s.cpu?.owner === id;
          expect(inCpu && s.pcb[id] !== null).toBe(false);
          if (s.states[id] === 'running' && s.phase !== 'save') expect(inCpu || s.cpu === null).toBe(true);
        }
      }
    });
    it(`${label}: the address space changes only on a process switch, and always does`, () => {
      const { steps, threads } = switchScript(kind, same);
      steps.forEach((s, i) => {
        if (i > 0 && s.asid !== steps[i - 1].asid) expect(s.phase).toBe('mm');
        if (s.phase === 'pick') expect(s.newAsid).toBe(!same);
        if (s.phase === 'iret' || s.phase === 'run') expect(s.asid).toBe(threads[s.subject].asid);
      });
      expect(steps.some((s) => s.phase === 'mm')).toBe(!same);
    });
    it(`${label}: user code only runs in user mode, and the kernel lane never overlaps a thread running`, () => {
      const { steps, segments } = switchScript(kind, same);
      steps.filter((s) => s.phase === 'run').forEach((s) => expect(s.mode).toBe('user'));
      steps.filter((s) => ['irq', 'handler', 'save', 'pick', 'mm', 'load', 'syscall'].includes(s.phase)).forEach((s) => expect(s.mode).toBe('kernel'));
      const kernel = segments.filter((s) => s.lane === 'kernel');
      const runs = segments.filter((s) => s.kind === 'run');
      for (const k of kernel) for (const r of runs) expect(r.end <= k.start + 1e-9 || r.start >= k.end - 1e-9).toBe(true);
    });
  }
  it('involuntary: the timer fires on tick boundaries and each thread gets a whole tick', () => {
    const { steps } = switchScript('involuntary', true);
    const irqs = steps.filter((s) => s.phase === 'irq');
    expect(irqs.map((s) => s.source)).toEqual(['timer', 'timer']);
    const before = steps.filter((_, i) => steps[i + 1]?.phase === 'irq').map((s) => s.t);
    expect(before.map((t) => t % TICK_MS)).toEqual([0, 0]);
  });
  it('voluntary: B blocks in read(), the disk interrupt wakes it without a switch, the next tick runs it', () => {
    const { steps } = switchScript('voluntary', false);
    expect(steps.find((s) => s.phase === 'syscall')!.subject).toBe('B');
    const disk = steps.findIndex((s) => s.phase === 'irq' && s.source === 'disk');
    expect(steps[disk - 1].states.B).toBe('blocked');
    expect(steps[disk + 1].states.B).toBe('ready');
    expect(steps[disk + 2].phase).toBe('resume');
    expect(steps[disk + 2].cpu!.owner).toBe('A');
    expect(steps.at(-1)!.cpu!.owner).toBe('B');
  });
  it('runFor is deterministic and moves PC by 4 bytes per instruction', () => {
    const r = { pc: 0x1000, sp: 0x2000, flags: 0x202, rax: 1, rbx: 0 };
    expect(runFor(r, 1).pc).toBe(0x1000 + 4 * 1000);
    expect(runFor(r, 1)).toEqual(runFor(r, 1));
    expect(runFor(r, 0)).toEqual({ ...r, flags: 0x202 });
  });
});

describe('interrupt sources sandbox', () => {
  const run = (sources: IrqSource[]) => sources.reduce<Sandbox>((s, src) => fire(s, src), sandboxStart());

  it('a timer tick lands on the next tick boundary', () => {
    const s = sandboxStart();
    expect(nextAt(s, 'timer')).toBe(TICK_MS);
    expect(nextAt(fire(s, 'disk'), 'timer')).toBe(TICK_MS);
  });
  it('disk wakes B and keypress wakes C, but neither runs until a tick reschedules', () => {
    const s = run(['disk', 'key']);
    expect(s.states).toEqual({ A: 'running', B: 'ready', C: 'ready' });
    expect(s.log.map((o) => [o.woke, o.reschedule])).toEqual([['B', false], ['C', false]]);
  });
  it('the network interrupt wakes nobody here', () => {
    const s = run(['network']);
    expect(s.log[0].woke).toBeNull();
    expect(s.states).toEqual(sandboxStart().states);
  });
  it('the timer reschedules only when the slice is used up and someone is ready', () => {
    // Nobody ready: the slice runs out but A keeps the CPU.
    const alone = run(Array(SLICE_TICKS).fill('timer'));
    expect(alone.log.at(-1)).toMatchObject({ sliceUp: true, reschedule: false, to: 'A' });
    // B ready: the first tick isn't enough, the second switches.
    const s = run(['disk', ...Array(SLICE_TICKS).fill('timer')]);
    expect(s.log.slice(1).map((o) => o.reschedule)).toEqual([...Array(SLICE_TICKS - 1).fill(false), true]);
    expect(s.running).toBe('B');
    expect(s.states.A).toBe('ready');
  });
  it('round robin among ready threads', () => {
    const s = run(['disk', 'key', 'timer', 'timer', 'timer', 'timer']);
    expect(s.log.filter((o) => o.reschedule).map((o) => o.to)).toEqual(['B', 'C']);
  });
  it('the timeline has a kernel bar per interrupt and never two runs at once', () => {
    const s = run(['disk', 'timer', 'network', 'key', 'timer', 'timer']);
    expect(s.segments.filter((x) => x.lane === 'kernel')).toHaveLength(6);
    const runs = s.segments.filter((x) => x.kind === 'run' || x.kind === 'kernel').sort((a, b) => a.start - b.start);
    runs.forEach((r, i) => i > 0 && expect(r.start).toBeGreaterThanOrEqual(runs[i - 1].end - 1e-9));
  });
});

describe('mergeSegments', () => {
  it('joins touching bars of one kind on one lane, but never two different handlers', () => {
    const merged = mergeSegments([
      { lane: 'A', start: 0, end: 1, kind: 'run' },
      { lane: 'A', start: 1, end: 2, kind: 'run' },
      { lane: 'A', start: 2, end: 3, kind: 'ready' },
      { lane: 'kernel', start: 3, end: 4, kind: 'kernel', source: 'disk' as const },
      { lane: 'kernel', start: 4, end: 5, kind: 'kernel', source: 'timer' as const },
    ]);
    expect(merged.map((s) => [s.lane, s.start, s.end, s.kind])).toEqual([
      ['A', 0, 2, 'run'],
      ['A', 2, 3, 'ready'],
      ['kernel', 3, 4, 'kernel'],
      ['kernel', 4, 5, 'kernel'],
    ]);
  });
});
