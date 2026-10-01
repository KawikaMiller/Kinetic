import { describe, expect, it } from 'vitest';
import { CORES, procOf, runOn, script, SWITCH, THREADS } from './model';
import { SCENARIOS, type Scenario } from './scenarios';

const all = Object.keys(SCENARIOS) as Scenario[];

describe('scheduling invariants, in every frame of every scenario', () => {
  it.each(all)('%s', (name) => {
    for (const f of SCENARIOS[name]()) {
      expect(f.cores).toHaveLength(CORES);
      const onCores = f.cores.filter(Boolean);
      expect(new Set(onCores).size).toBe(onCores.length); // a thread is on at most one core
      for (const t of THREADS) {
        const s = f.states[t.id];
        // running ⇔ on a core and not mid-switch (crashed threads may still hold their core)
        if (s === 'running') expect(f.cores.includes(t.id) && !f.switching).toBe(true);
        if (s === 'ready') expect(f.cores.includes(t.id) && !f.switching).toBe(false);
        if (s === 'dead' || s === 'blocked') expect(f.cores.includes(t.id)).toBe(false);
        if (f.procDead[t.proc]) expect(s).toBe('dead');
      }
    }
  });
});

describe('context switches are counted from the cores', () => {
  it('counts each core that goes from one thread to a different one', () => {
    const frames = script([() => runOn('A1', 'B1'), () => runOn('A1', 'A2'), () => runOn('B1', 'A3')]);
    expect(frames.map((f) => f.switches)).toEqual([0, 1, 3]);
  });

  it('a core starting from idle, or going idle, is not a switch', () => {
    const frames = script([() => runOn(null, 'B1'), () => runOn('A1', 'B1'), () => runOn('A1', null)]);
    expect(frames.map((f) => f.switches)).toEqual([0, 0, 0]);
  });

  it('a switch frame is charged with the changes it leads into, and the next frame adds nothing', () => {
    const frames = script([() => runOn('A1', 'B1'), () => SWITCH, () => runOn('A2', 'B2')]);
    expect(frames.map((f) => f.switches)).toEqual([0, 2, 2]);
  });

  it('gives each scenario the total its frames actually show', () => {
    const final = (s: Scenario) => SCENARIOS[s]().at(-1)!.switches;
    // slicing: 2 + 2 + 2, then render replaces the blocked network thread (+1), then 2 more
    expect(final('slicing')).toBe(9);
    // crash: ui is replaced by render once at the end
    expect(final('crash')).toBe(1);
    // talk: decode → render, then ui → network and render → decode
    expect(final('talk')).toBe(3);
  });

  it('counts the switch when a blocked thread gives up its core', () => {
    const frames = SCENARIOS.slicing();
    const blockedAt = frames.findIndex((f) => f.states.A2 === 'blocked');
    expect(frames[blockedAt].switches - frames[blockedAt - 1].switches).toBe(1);
  });
});

describe('what each scenario demonstrates', () => {
  it('a thread crash kills its whole process, frees its memory, and leaves the other process running', () => {
    const frames = SCENARIOS.crash();
    const killed = frames.find((f) => f.procDead.B)!;
    expect(killed.states.B1).toBe('dead'); // the healthy sibling thread dies too
    expect(killed.states.B2).toBe('dead');
    expect(killed.heap.B).toEqual([]);
    expect(killed.procDead.A).toBe(false);
    const end = frames.at(-1)!;
    expect(THREADS.filter((t) => t.proc === 'A').some((t) => end.states[t.id] === 'running')).toBe(true);
  });

  it('threads of one process read each other’s heap writes directly', () => {
    const frames = SCENARIOS.talk();
    const write = frames.findIndex((f) => f.heapHot?.kind === 'write' && f.heapHot.proc === 'A');
    const read = frames[write + 1];
    expect(read.heapHot).toEqual({ proc: 'A', index: 0, kind: 'read' });
    expect(read.heap.A[0]).toBe('tabs = 3');
    expect(procOf(frames[write].touching[0])).toBe(procOf(read.touching[0]));
  });

  it('a process can’t read another’s memory, so it sends a message through the kernel instead', () => {
    const frames = SCENARIOS.talk();
    const denied = frames.find((f) => f.heapHot?.kind === 'denied')!;
    expect(procOf(denied.touching[0])).not.toBe(denied.heapHot!.proc);
    const ipc = frames.findIndex((f) => f.ipc);
    expect(frames[ipc].ipc!.from).toBe('A');
    const after = frames[ipc + 1];
    expect(after.heapHot).toMatchObject({ proc: 'B', kind: 'write' });
    expect(procOf(after.touching[0])).toBe('B'); // Music updates its own memory
  });

  it('every frame has a caption', () => {
    for (const s of all) for (const f of SCENARIOS[s]()) expect(f.say).toBeTruthy();
  });
});
