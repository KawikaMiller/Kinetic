// The three scripted scenarios, as steps for model.ts's script(). Captions live here.
import { runOn, script, SWITCH, type PtFrame } from './model';

export type Scenario = 'slicing' | 'crash' | 'talk';

export const SCENARIOS: Record<Scenario, () => PtFrame[]> = {
  slicing: () =>
    script([
      () => ({ say: <>Two processes, <b>five threads</b>, but only <b>two CPU cores</b>. Who gets to run?</> }),
      () => ({ ...runOn('A1', 'B1'), say: <>The scheduler puts one thread on each core: <span className="hl info">Browser·ui</span> and <span className="hl violet">Music·decode</span>.</> }),
      () => ({ ...SWITCH, say: <>Time slice over (a few ms). The OS saves each thread's registers and loads the next one: a <span className="hl">context switch</span>.</> }),
      () => ({ ...runOn('A2', 'B2'), say: <>Now network and playback run. The others wait in the <b>ready</b> line.</> }),
      () => ({ ...SWITCH, say: <>Switch again. Each switch costs a little CPU time that does no useful work.</> }),
      () => ({ ...runOn('A3', 'A1'), say: <>Both cores run Browser threads. Switching between threads of the <b>same</b> process is cheaper: the memory map stays the same.</> }),
      () => ({ ...SWITCH, say: <>Switch…</> }),
      () => ({ ...runOn('B1', 'A2'), say: <>…and round it goes, hundreds of times a second.</> }),
      (f) => ({
        ...runOn('B1', 'A3'),
        states: { ...f.states, A2: 'blocked' },
        say: <>Network asks for data and has to <span className="hl">wait</span> for it: it's <b>blocked</b>. A waiting thread gives up its core, so render gets it instead. That's another switch.</>,
      }),
      (f) => ({ ...SWITCH, states: { ...f.states, A2: 'ready' }, say: <>Data arrived: network is ready again.</> }),
      () => ({ ...runOn('A2', 'B2'), hold: 2, say: <>One core runs <b>one thread at a time</b>. Switching fast is what makes it look simultaneous.</> }),
    ]),
  crash: () =>
    script([
      () => ({ ...runOn('A1', 'B2'), say: <>Everything's running happily. Music's playback thread is about to hit a bug.</> }),
      (f) => ({ states: { ...f.states, B2: 'crash' }, say: <>Playback dereferences a bad pointer: <span className="hl bad">segfault</span>.</> }),
      (f) => ({
        cores: [f.cores[0], null],
        states: { ...f.states, B1: 'dead', B2: 'dead' },
        procDead: { ...f.procDead, B: true },
        heap: { ...f.heap, B: [] },
        say: <>The OS kills the <b>whole Music process</b>. Decode was fine, but it dies too: it shares memory the bug may have corrupted.</>,
      }),
      () => ({ ...runOn('A1', 'A2'), say: <>The Browser is a separate process with its own memory. It doesn't even notice. The core is simply handed to Browser threads.</> }),
      () => ({ ...runOn('A3', 'A2'), hold: 2, say: <>That's why Chrome runs tabs in separate processes: one crashing tab can't take the others down. <b>Processes are walls; threads are not.</b></> }),
    ]),
  talk: () =>
    script([
      () => ({ ...runOn('A1', 'B1'), say: <>How do threads and processes share information?</> }),
      (f) => ({
        ...runOn('A1', 'A3'),
        heap: { ...f.heap, A: ['tabs = 3', ...f.heap.A.slice(1)] },
        heapHot: { proc: 'A', index: 0, kind: 'write' },
        touching: ['A1'],
        say: <>The ui thread writes <span className="hl">tabs = 3</span> into the Browser's heap…</>,
      }),
      () => ({
        heapHot: { proc: 'A', index: 0, kind: 'read' },
        touching: ['A3'],
        say: <>…and the render thread reads it <b>directly</b>. Threads share the heap: fast, but they must coordinate (see Race Conditions).</>,
      }),
      () => ({
        ...runOn('A2', 'B1'),
        heapHot: { proc: 'B', index: 1, kind: 'denied' },
        touching: ['A2'],
        say: <>Can the Browser just read Music's memory? <span className="hl bad">No.</span> Each process's memory is private, and the OS blocks the access.</>,
      }),
      () => ({ ipc: { label: '⏸ pause', from: 'A' }, touching: ['A2'], say: <>Processes talk through the OS instead: pipes, sockets, shared-memory segments. This is <span className="hl violet">IPC</span>.</> }),
      (f) => ({
        heap: { ...f.heap, B: [f.heap.B[0], 'state = paused'] },
        heapHot: { proc: 'B', index: 1, kind: 'write' },
        touching: ['B1'],
        hold: 2,
        say: <>Music receives the message and updates its <b>own</b> memory. Safer isolation, but every message is a trip through the kernel.</>,
      }),
    ]),
};
