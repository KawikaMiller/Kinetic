import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Controls, Legend, Segmented, Stat, Stats } from '../../components/ui';
import type { Frame } from '../../core/types';
import { usePlayer } from '../../core/usePlayer';
import './styles.css';

type PId = 'A' | 'B';
type TState = 'ready' | 'running' | 'blocked' | 'crash' | 'dead';
type Scenario = 'slicing' | 'crash' | 'talk';

interface ThreadDef {
  id: string;
  name: string;
  proc: PId;
}

const PROCS: { id: PId; name: string; pid: number; color: string }[] = [
  { id: 'A', name: 'Browser', pid: 4120, color: 'var(--info)' },
  { id: 'B', name: 'Music', pid: 5306, color: 'var(--violet)' },
];

const THREADS: ThreadDef[] = [
  { id: 'A1', name: 'ui', proc: 'A' },
  { id: 'A2', name: 'network', proc: 'A' },
  { id: 'A3', name: 'render', proc: 'A' },
  { id: 'B1', name: 'decode', proc: 'B' },
  { id: 'B2', name: 'playback', proc: 'B' },
];

const procOf = (tid: string) => THREADS.find((t) => t.id === tid)!.proc;
const colorOf = (p: PId) => PROCS.find((x) => x.id === p)!.color;

interface PtFrame extends Frame {
  cores: (string | null)[];
  switching: boolean;
  states: Record<string, TState>;
  procDead: Record<PId, boolean>;
  heap: Record<PId, string[]>;
  /** Heap cell (by index) glowing this frame. */
  heapHot: { proc: PId; index: number; kind: 'write' | 'read' | 'denied' } | null;
  /** Threads glowing because they touch memory this frame. */
  touching: string[];
  /** A message travelling through the kernel. */
  ipc: { label: string; from: PId } | null;
  switches: number;
}

function base(): PtFrame {
  return {
    cores: [null, null],
    switching: false,
    states: Object.fromEntries(THREADS.map((t) => [t.id, 'ready' as TState])),
    procDead: { A: false, B: false },
    heap: { A: ['tabs = 2', 'cache[ ]'], B: ['track = "Aria"', 'state = playing'] },
    heapHot: null,
    touching: [],
    ipc: null,
    switches: 0,
  };
}

/** Builds each frame from the previous one so scenarios read like a script. */
function script(steps: ((f: PtFrame) => Partial<PtFrame> & { say: ReactNode; hold?: number })[]): PtFrame[] {
  const frames: PtFrame[] = [];
  let cur = base();
  for (const step of steps) {
    const prev: PtFrame = { ...cur, states: { ...cur.states }, heap: { A: [...cur.heap.A], B: [...cur.heap.B] }, heapHot: null, touching: [], ipc: null, switching: false };
    const patch = step(prev);
    cur = { ...prev, ...patch };
    // whoever is on a core is running; everyone else alive and not blocked is ready
    for (const t of THREADS) {
      const s = cur.states[t.id];
      if (s === 'dead' || s === 'crash' || s === 'blocked') continue;
      cur.states[t.id] = cur.cores.includes(t.id) && !cur.switching ? 'running' : 'ready';
    }
    frames.push(cur);
  }
  return frames;
}

const run = (a: string | null, b: string | null) => (f: PtFrame) => ({ cores: [a, b], switches: f.switches });
const swap = (f: PtFrame) => ({ switching: true, switches: f.switches + 2 });

const SCENARIOS: Record<Scenario, () => PtFrame[]> = {
  slicing: () =>
    script([
      () => ({ say: <>Two processes, <b>five threads</b>, but only <b>two CPU cores</b>. Who gets to run?</> }),
      (f) => ({ ...run('A1', 'B1')(f), say: <>The scheduler puts one thread on each core: <span className="hl info">Browser·ui</span> and <span className="hl violet">Music·decode</span>.</> }),
      (f) => ({ ...swap(f), say: <>Time slice over (a few ms). The OS saves each thread's registers and loads the next one: a <span className="hl">context switch</span>.</> }),
      (f) => ({ ...run('A2', 'B2')(f), say: <>Now network and playback run. The others wait in the <b>ready</b> line.</> }),
      (f) => ({ ...swap(f), say: <>Switch again. Each switch costs a little CPU time that does no useful work.</> }),
      (f) => ({ ...run('A3', 'A1')(f), say: <>Both cores run Browser threads. Switching between threads of the <b>same</b> process is cheaper: the memory map stays the same.</> }),
      (f) => ({ ...swap(f), say: <>Switch…</> }),
      (f) => ({ ...run('B1', 'A2')(f), say: <>…and round it goes, hundreds of times a second.</> }),
      (f) => ({ ...run('B1', 'A3')(f), states: { ...f.states, A2: 'blocked' }, say: <>Network waits for data, so it's <span className="hl bad">blocked</span>: it leaves the CPU and render gets the core instead.</> }),
      (f) => ({ ...swap(f), states: { ...f.states, A2: 'ready' }, say: <>Data arrived: network is ready again.</> }),
      (f) => ({ ...run('A2', 'B2')(f), hold: 2, say: <>One core runs <b>one thread at a time</b>. Switching fast is what makes it look simultaneous.</> }),
    ]),
  crash: () =>
    script([
      (f) => ({ ...run('A1', 'B2')(f), say: <>Everything's running happily. Music's playback thread is about to hit a bug.</> }),
      (f) => ({ ...run('A1', 'B2')(f), states: { ...f.states, B2: 'crash' }, say: <>Playback dereferences a bad pointer: <span className="hl bad">segfault</span>.</> }),
      (f) => ({
        cores: [f.cores[0], null],
        states: { ...f.states, B1: 'dead', B2: 'dead' },
        procDead: { ...f.procDead, B: true },
        heap: { ...f.heap, B: [] },
        say: <>The OS kills the <b>whole Music process</b>. Decode was fine, but it dies too: it shares memory the bug may have corrupted.</>,
      }),
      (f) => ({ ...run('A1', 'A2')(f), say: <>The Browser is a separate process with its own memory. It doesn't even notice. The core is simply handed to Browser threads.</> }),
      (f) => ({ ...run('A3', 'A2')(f), hold: 2, say: <>That's why Chrome runs tabs in separate processes: one crashing tab can't take the others down. <b>Processes are walls; threads are not.</b></> }),
    ]),
  talk: () =>
    script([
      (f) => ({ ...run('A1', 'B1')(f), say: <>How do threads and processes share information?</> }),
      (f) => ({
        ...run('A1', 'A3')(f),
        heap: { ...f.heap, A: ['tabs = 3', ...f.heap.A.slice(1)] },
        heapHot: { proc: 'A', index: 0, kind: 'write' },
        touching: ['A1'],
        say: <>The ui thread writes <span className="hl">tabs = 3</span> into the Browser's heap…</>,
      }),
      (f) => ({
        ...run('A1', 'A3')(f),
        heapHot: { proc: 'A', index: 0, kind: 'read' },
        touching: ['A3'],
        say: <>…and the render thread reads it <b>directly</b>. Threads share the heap: fast, but they must coordinate (see Race Conditions).</>,
      }),
      (f) => ({
        ...run('A2', 'B1')(f),
        heapHot: { proc: 'B', index: 1, kind: 'denied' },
        touching: ['A2'],
        say: <>Can the Browser just read Music's memory? <span className="hl bad">No.</span> Each process's memory is private, and the OS blocks the access.</>,
      }),
      (f) => ({ ...run('A2', 'B1')(f), ipc: { label: '⏸ pause', from: 'A' }, touching: ['A2'], say: <>Processes talk through the OS instead: pipes, sockets, shared-memory segments. This is <span className="hl violet">IPC</span>.</> }),
      (f) => ({
        ...run('A2', 'B1')(f),
        heap: { ...f.heap, B: [f.heap.B[0], 'state = paused'] },
        heapHot: { proc: 'B', index: 1, kind: 'write' },
        touching: ['B1'],
        hold: 2,
        say: <>Music receives the message and updates its <b>own</b> memory. Safer isolation, but every message is a trip through the kernel.</>,
      }),
    ]),
};

export function Stage() {
  const [scenario, setScenario] = useState<Scenario>('slicing');
  const frames = useMemo(() => SCENARIOS[scenario](), [scenario]);
  const player = usePlayer(frames, { interval: 1500 });
  const f = player.frame;

  const alive = THREADS.filter((t) => f.states[t.id] !== 'dead' && f.states[t.id] !== 'crash').length;
  const procsAlive = PROCS.filter((p) => !f.procDead[p.id]).length;

  return (
    <StageFrame
      player={player}
      height={400}
      stats={
        <Stats>
          <Stat label="Processes alive" value={procsAlive} color={procsAlive < 2 ? 'var(--bad)' : undefined} />
          <Stat label="Threads alive" value={alive} />
          <Stat label="Context switches" value={f.switches} color="var(--hi)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'Browser process' },
            { color: 'var(--violet)', label: 'Music process' },
            { color: 'var(--ok)', label: 'running', shape: 'dot' },
            { color: 'var(--bad)', label: 'crashed / blocked', shape: 'dot' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented
            label="Scenario"
            value={scenario}
            onChange={setScenario}
            options={[
              { value: 'slicing', label: 'Time slicing' },
              { value: 'crash', label: 'Crashes' },
              { value: 'talk', label: 'Talking' },
            ]}
          />
        </Controls>
      }
    >
      <div className="pt">
        <div className="pt-cores">
          {f.cores.map((tid, i) => (
            <div key={i} className={`pt-core ${f.switching ? 'switching' : ''}`}>
              <span className="pt-core-label">CPU core {i}</span>
              <AnimatePresence mode="popLayout" initial={false}>
                {f.switching ? (
                  <motion.span key="sw" className="pt-core-chip sw" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    ⇄ switching
                  </motion.span>
                ) : tid ? (
                  <motion.span
                    key={tid}
                    className="pt-core-chip"
                    style={{ '--c': colorOf(procOf(tid)) } as CSSProperties}
                    initial={{ y: 18, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -18, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 26 }}
                  >
                    {PROCS.find((p) => p.id === procOf(tid))!.name} · {THREADS.find((t) => t.id === tid)!.name}
                  </motion.span>
                ) : (
                  <motion.span key="idle" className="pt-core-chip idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    idle
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>

        <div className="pt-kernel">
          <span>OS kernel · scheduler · IPC</span>
          <AnimatePresence>
            {f.ipc && (
              <motion.span
                key={player.index}
                className="pt-ipc"
                initial={{ left: '6%', opacity: 0 }}
                animate={{ left: '74%', opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.1, ease: 'easeInOut' }}
              >
                ✉ {f.ipc.label}
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <div className="pt-procs">
          {PROCS.map((p) => (
            <motion.div
              key={p.id}
              className={`pt-proc ${f.procDead[p.id] ? 'dead' : ''}`}
              style={{ '--c': p.color } as CSSProperties}
              animate={f.procDead[p.id] ? { scale: [1, 1.02, 0.98], opacity: 0.45 } : { scale: 1, opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              <header className="pt-proc-head">
                <b>{p.name}</b>
                <span className="mono">pid {p.pid}</span>
                {f.procDead[p.id] && <span className="pt-killed">killed · SIGSEGV</span>}
              </header>
              <div className="pt-mem">
                <div className="pt-region pt-code">
                  <span>code</span>
                  <i>{p.id === 'A' ? 'browser.exe' : 'music.exe'}</i>
                </div>
                <div className="pt-region pt-heap">
                  <span>heap · shared by its threads</span>
                  {f.heap[p.id].length ? (
                    f.heap[p.id].map((cell, i) => {
                      const hot = f.heapHot && f.heapHot.proc === p.id && f.heapHot.index === i ? f.heapHot.kind : '';
                      return (
                        <motion.code key={`${i}-${cell}`} className={`pt-cell ${hot}`} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }}>
                          {cell}
                          {hot === 'denied' && <em>✕ access denied</em>}
                        </motion.code>
                      );
                    })
                  ) : (
                    <em className="pt-freed">memory freed</em>
                  )}
                </div>
              </div>
              <div className="pt-threads">
                {THREADS.filter((t) => t.proc === p.id).map((t) => {
                  const s = f.states[t.id];
                  return (
                    <motion.div
                      key={t.id}
                      className={`pt-thread ${s} ${f.touching.includes(t.id) ? 'touch' : ''}`}
                      animate={s === 'crash' ? { x: [0, -5, 5, -4, 4, 0] } : { x: 0 }}
                      transition={{ duration: 0.4 }}
                    >
                      <span className="pt-thread-name">{t.name}</span>
                      <span className="pt-thread-state">{s === 'crash' ? '💥 crash' : s}</span>
                      <span className="pt-stack" aria-label="own stack">
                        <i />
                        <i />
                        <i />
                      </span>
                      <span className="pt-stack-label">own stack</span>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </StageFrame>
  );
}
