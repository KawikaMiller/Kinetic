import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { AnimatedValue } from '../../components/AnimatedValue';
import { Bar } from '../../components/Bar';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Hint, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { enterFromLeft } from '../../core/motion';
import { usePlayer } from '../../core/usePlayer';
import { buildFrames, LETTER_NAMES, PROGRAMS, TOTAL, type Letter, type Mode } from './frames';
import './styles.css';

export function Stage() {
  const [mode, setMode] = useState<Mode>('txn');
  const [crashAt, setCrashAt] = useState<number | null>(null);
  const frames = useMemo(() => buildFrames(mode, crashAt), [mode, crashAt]);
  const player = usePlayer(frames, { interval: 1300 });
  const f = player.frame;
  const program = PROGRAMS[mode];
  const total = f.alice + f.bob;
  const consistent = total === TOTAL;
  const canCrash = f.phase === 'run' && f.ran < program.length;

  const crash = () => {
    setCrashAt(f.ran === 0 ? 1 : f.ran);
    player.queueNext({ play: true, from: f.ran === 0 ? 1 : player.index });
  };
  const switchMode = (m: Mode) => {
    player.queueNext({ play: false });
    setMode(m);
    setCrashAt(null);
  };

  return (
    <StageFrame
      player={player}
      height={440}
      stats={
        <Stats>
          <Stat label="Alice" value={`$${f.alice}`} />
          <Stat label="Bob" value={`$${f.bob}`} />
          <Stat label="Total" value={`$${total}`} color={consistent ? 'var(--ok)' : 'var(--bad)'} sub="must always be $800" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'running now' },
            { color: 'var(--info)', label: 'log record' },
            { color: 'var(--ok)', label: 'commit / guaranteed' },
            { color: 'var(--bad)', label: 'crash / broken' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented
            label="Mode"
            value={mode}
            onChange={switchMode}
            options={[
              { value: 'none', label: 'No transaction' },
              { value: 'txn', label: 'Transaction + log' },
            ]}
          />
          <Button variant="danger" onClick={crash} disabled={!canCrash}>
            💥 Crash now
          </Button>
          <Button
            onClick={() => {
              player.queueNext({ play: false });
              setCrashAt(null);
            }}
            disabled={crashAt === null}
          >
            Undo crash
          </Button>
          <Hint>Pause on any step, then crash there.</Hint>
        </Controls>
      }
    >
      <div className={`tx ${f.phase === 'crash' ? 'tx-crashed' : ''}`}>
        <AnimatePresence>
          {f.phase === 'crash' && (
            <motion.div
              className="tx-flash"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.55, 0.2] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
            />
          )}
        </AnimatePresence>

        <div className="tx-acid">
          {(Object.keys(LETTER_NAMES) as Letter[]).map((l) => (
            <motion.div
              key={l}
              className={`tx-letter ${f.letters[l]}`}
              animate={f.letters[l] === 'off' ? { scale: 1 } : { scale: [1, 1.15, 1] }}
              transition={{ duration: 0.4 }}
            >
              <b>{l}</b>
              <span>{LETTER_NAMES[l]}</span>
            </motion.div>
          ))}
        </div>

        <div className="tx-grid">
          <section className="tx-panel">
            <h4>Program</h4>
            <ol className="tx-code">
              {program.map((line, i) => {
                const state = i < f.ran - 1 ? 'done' : i === f.ran - 1 && f.phase === 'run' ? 'now' : i < f.ran ? 'done' : '';
                const cut = f.phase !== 'run' && crashAt !== null && i === f.ran;
                return (
                  <li key={i} className={`${state} ${cut ? 'cut' : ''}`}>
                    <code>{line}</code>
                    {cut && <em>💥 never ran</em>}
                  </li>
                );
              })}
            </ol>
            <div className={`tx-client ${f.clientTone}`}>
              <span>Client</span>
              {f.client}
            </div>
          </section>

          <section className="tx-panel">
            <h4>Disk: accounts table</h4>
            <div className="tx-accounts">
              {(['alice', 'bob'] as const).map((who) => {
                const balance = who === 'alice' ? f.alice : f.bob;
                return (
                  <motion.div
                    key={who}
                    className={`tx-account ${f.focus === who ? 'focus' : ''}`}
                    animate={f.focus === who ? { y: [0, -6, 0] } : { y: 0 }}
                    transition={{ duration: 0.45 }}
                  >
                    <span>{who === 'alice' ? 'Alice' : 'Bob'}</span>
                    <AnimatedValue variant="flip" as="b" id={balance} value={<>${balance}</>} />
                  </motion.div>
                );
              })}
            </div>
            <div className="tx-total">
              <Bar value={total} max={TOTAL} tone={consistent ? 'ok' : 'bad'} />
              <span className={consistent ? 'ok' : 'bad'}>
                {consistent ? 'total $800 ✓' : `total $${total}: $${TOTAL - total} missing`}
              </span>
            </div>
          </section>

          <section className={`tx-panel ${mode === 'none' ? 'tx-nolog' : ''}`}>
            <h4>Disk: write-ahead log</h4>
            {mode === 'none' ? (
              <p className="tx-empty">No log. If it crashes, the database can't tell what was half-done.</p>
            ) : (
              <ul className="tx-wal">
                <AnimatePresence initial={false}>
                  {f.wal.map((r) => (
                    <motion.li key={r.id} className={`tx-rec ${r.kind}`} {...enterFromLeft}>
                      <code>{r.text}</code>
                    </motion.li>
                  ))}
                </AnimatePresence>
                {f.wal.length === 0 && <li className="tx-empty">empty</li>}
              </ul>
            )}
          </section>
        </div>
      </div>
    </StageFrame>
  );
}
