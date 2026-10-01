import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState, type CSSProperties } from 'react';
import { Flyer } from '../../components/scene';
import { StageFrame } from '../../components/StageFrame';
import { Controls, Hint, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { SHAKE } from '../../core/motion';
import { usePlayer } from '../../core/usePlayer';
import { colorOf, PROCS, procOf, THREADS } from './model';
import { SCENARIOS, type Scenario } from './scenarios';
import './styles.css';

/** Thread chips slide onto a core on a firm spring. */
const CHIP_SPRING = { type: 'spring', stiffness: 320, damping: 26 } as const;
/** Seconds an IPC message takes to cross the kernel bar. */
const IPC_TRAVEL = 1.1;
/** The IPC envelope's trip across the kernel bar, in % of its width. */
const IPC_FROM = { x: 6, y: 0 };
const IPC_TO = { x: 74, y: 0 };

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
            { color: 'var(--faint)', label: 'waiting (blocked on I/O)', shape: 'dot' },
            { color: 'var(--bad)', label: 'crashed', shape: 'dot' },
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
                    transition={CHIP_SPRING}
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
              <Flyer
                key={player.index}
                axis="x"
                from={IPC_FROM}
                to={IPC_TO}
                className="pt-ipc"
                fade="in"
                startScale={null}
                exitScale={null}
                duration={IPC_TRAVEL}
              >
                ✉ {f.ipc.label}
              </Flyer>
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
                      animate={s === 'crash' ? SHAKE : { x: 0 }}
                      transition={{ duration: 0.4 }}
                    >
                      <span className="pt-thread-name">{t.name}</span>
                      <span className="pt-thread-state">{s === 'crash' ? '💥 crash' : s === 'blocked' ? 'waiting' : s}</span>
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
        <Hint block>
          Scripted scenarios, slowed right down: a real time slice is a few milliseconds, and which thread runs next
          depends on priorities and load.
        </Hint>
      </div>
    </StageFrame>
  );
}
