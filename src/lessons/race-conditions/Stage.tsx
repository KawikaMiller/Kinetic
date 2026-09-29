import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { PROGRAMS, simulate, TNAME, type ProgramKey, type RcFrame, type Tid } from './sim';
import './styles.css';

type Mode = 'race' | 'mutex' | 'deadlock';
type Interleave = 'serial' | 'unlucky' | 'sneaky' | 'custom';

const PRESETS: Record<Exclude<Interleave, 'custom'>, Tid[]> = {
  serial: [0, 0, 0, 1, 1, 1],
  unlucky: [0, 1, 0, 1, 0, 1],
  sneaky: [0, 0, 1, 1, 0, 1],
};
const ALTERNATE: Tid[] = Array.from({ length: 40 }, (_, i) => (i % 2) as Tid);

export function Stage() {
  const [mode, setMode] = useState<Mode>('race');
  const [interleave, setInterleave] = useState<Interleave>('unlucky');
  const [custom, setCustom] = useState<Tid[]>([]);
  const [fixed, setFixed] = useState(false);

  const key: ProgramKey = mode === 'race' ? 'race' : mode === 'mutex' ? 'mutex' : fixed ? 'ordered' : 'deadlock';
  const frames = useMemo(() => {
    if (mode === 'race') return simulate('race', interleave === 'custom' ? custom : PRESETS[interleave], true);
    return simulate(key, ALTERNATE);
  }, [mode, interleave, custom, key]);
  const player = usePlayer(frames, { interval: 1300 });
  const f = player.frame;
  const progs = PROGRAMS[key];

  const remaining = (t: Tid) => 3 - custom.filter((x) => x === t).length;
  const stepCustom = (t: Tid) => {
    const next = [...custom, t];
    player.queueNext({ play: false, from: next.length });
    setCustom(next);
  };

  const lockNames = Object.keys(f.locks);
  const isDeadlock = f.event === 'deadlock';

  return (
    <StageFrame
      player={player}
      height={430}
      stats={
        <Stats>
          {mode === 'deadlock' ? (
            <>
              <Stat label="locks held" value={Object.values(f.locks).filter((o) => o !== null).length} />
              <Stat
                label="threads blocked"
                value={([0, 1] as Tid[]).filter((t) => f.waiting[t] !== null && f.locks[f.waiting[t]!] !== null && f.locks[f.waiting[t]!] !== t).length}
                color={isDeadlock ? 'var(--bad)' : undefined}
              />
            </>
          ) : (
            <>
              <Stat label="count" value={f.count} color={f.event === 'done' ? (f.count === 2 ? 'var(--ok)' : 'var(--bad)') : 'var(--hi)'} />
              <Stat label="expected" value={2} />
            </>
          )}
          <Stat label="steps run" value={f.log.filter((l) => l.kind !== 'wait').length} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'T1' },
            { color: 'var(--violet)', label: 'T2' },
            { color: 'var(--hi)', label: 'just ran' },
            { color: 'var(--bad)', label: 'lost update / blocked' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented
            label="Demo"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'race', label: 'Race condition' },
              { value: 'mutex', label: 'With a mutex' },
              { value: 'deadlock', label: 'Deadlock' },
            ]}
          />
          {mode === 'race' && (
            <Segmented
              label="Interleaving"
              value={interleave}
              onChange={(v) => {
                if (v === 'custom') setCustom([]);
                setInterleave(v);
              }}
              options={[
                { value: 'serial', label: 'T1 then T2' },
                { value: 'unlucky', label: 'Alternating' },
                { value: 'sneaky', label: 'Sneaky' },
                { value: 'custom', label: 'You schedule' },
              ]}
            />
          )}
          {mode === 'race' && interleave === 'custom' && (
            <>
              <Button onClick={() => stepCustom(0)} disabled={remaining(0) === 0}>
                ▶ Run T1 step
              </Button>
              <Button onClick={() => stepCustom(1)} disabled={remaining(1) === 0}>
                ▶ Run T2 step
              </Button>
              <Button onClick={() => setCustom([])} disabled={!custom.length}>
                Clear
              </Button>
            </>
          )}
          {mode === 'deadlock' && (
            <Segmented
              label="Lock order"
              value={fixed ? 'same' : 'opposite'}
              onChange={(v) => setFixed(v === 'same')}
              options={[
                { value: 'opposite', label: 'Opposite (A→B vs B→A)' },
                { value: 'same', label: 'Same order (fix)' },
              ]}
            />
          )}
        </Controls>
      }
    >
      <div className="rc">
        <div className="rc-main">
          <ThreadPanel t={0} f={f} prog={progs[0]} />

          <div className="rc-shared">
            <span className="rc-label">shared memory</span>
            {mode !== 'deadlock' && (
              <div className={`rc-count ${f.event === 'lost' ? 'lost' : f.active !== null && progs[f.active][f.line ?? -1] === 'count = tmp' ? 'hot' : ''}`}>
                <span>count</span>
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.b
                    key={f.count}
                    initial={{ y: -22, opacity: 0, scale: 1.4 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    exit={{ y: 22, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 24 }}
                  >
                    {f.count}
                  </motion.b>
                </AnimatePresence>
              </div>
            )}
            {lockNames.length > 0 && (
              <div className="rc-locks">
                {lockNames.map((l) => {
                  const owner = f.locks[l];
                  const waiters = ([0, 1] as Tid[]).filter((t) => f.waiting[t] === l && owner !== t && owner !== null);
                  return (
                    <motion.div
                      key={l}
                      className={`rc-lock ${owner === null ? 'free' : `held t${owner}`} ${isDeadlock ? 'dl' : ''}`}
                      animate={owner !== null ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                      transition={{ duration: 0.35 }}
                    >
                      <span className="rc-lock-icon">{owner === null ? '🔓' : '🔒'}</span>
                      <b>{mode === 'mutex' ? 'mutex m' : `lock ${l}`}</b>
                      <span className="rc-lock-owner">{owner === null ? 'free' : `held by ${TNAME[owner]}`}</span>
                      {waiters.map((w) => (
                        <span key={w} className={`rc-waiter t${w}`}>
                          ⏳ {TNAME[w]} waiting
                        </span>
                      ))}
                    </motion.div>
                  );
                })}
              </div>
            )}
            {isDeadlock && (
              <motion.div className="rc-cycle" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                T1 ⟶ waits for B ⟶ held by T2 ⟶ waits for A ⟶ held by T1
                <span>a cycle: nobody can move</span>
              </motion.div>
            )}
          </div>

          <ThreadPanel t={1} f={f} prog={progs[1]} />
        </div>

        <div className="rc-timeline">
          <span className="rc-label">what actually ran, in order</span>
          <div className="rc-chips">
            {f.log.length === 0 && <span className="rc-empty">nothing yet</span>}
            {f.log.map((l, i) => (
              <motion.span
                key={i}
                className={`rc-chip t${l.t} ${l.kind}`}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 26 }}
              >
                <i>{TNAME[l.t]}</i> {l.text}
              </motion.span>
            ))}
          </div>
        </div>
      </div>
    </StageFrame>
  );
}

function ThreadPanel({ t, f, prog }: { t: Tid; f: RcFrame; prog: string[] }) {
  const waiting = f.waiting[t] !== null && f.locks[f.waiting[t]!] !== t && f.locks[f.waiting[t]!] !== null;
  const finished = f.pc[t] >= prog.length;
  return (
    <div className={`rc-thread t${t} ${f.active === t ? 'active' : ''} ${waiting ? 'waiting' : ''}`}>
      <header>
        <b>{TNAME[t]}</b>
        <span>{finished ? 'finished' : waiting ? 'blocked' : f.active === t ? 'running' : 'ready'}</span>
      </header>
      <ol className="rc-code">
        {prog.map((line, i) => {
          const ran = f.active === t && f.line === i;
          const next = !finished && f.pc[t] === i;
          return (
            <li key={i} className={`${ran ? 'ran' : ''} ${next ? 'next' : ''} ${i < f.pc[t] ? 'past' : ''}`}>
              <span className="rc-arrow">{next ? '▶' : ''}</span>
              <code>{line}</code>
            </li>
          );
        })}
      </ol>
      <div className="rc-reg">
        <span>register tmp</span>
        <b>{f.tmp[t] ?? '–'}</b>
      </div>
    </div>
  );
}
