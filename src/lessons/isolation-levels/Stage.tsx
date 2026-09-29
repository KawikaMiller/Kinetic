import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState, type CSSProperties } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Controls, Legend, Segmented } from '../../components/ui';
import type { Frame } from '../../core/types';
import { usePlayer } from '../../core/usePlayer';
import {
  ANOMALIES, LEVELS, MATRIX, SCENARIOS,
  type AnomalyId, type Level, type Outcome, type Snapshot,
} from './scenarios';
import './styles.css';

type IsoFrame = Snapshot & Frame;

const OUTCOME_ICON: Record<Outcome, string> = { happens: '✗', prevented: '✓', aborted: '⟲' };
const OUTCOME_TEXT: Record<Outcome, string> = {
  happens: 'anomaly happens',
  prevented: 'prevented',
  aborted: 'prevented by aborting a transaction',
};

export function Stage() {
  const [anomaly, setAnomaly] = useState<AnomalyId>('dirty');
  const [level, setLevel] = useState<Level>('ru');
  const frames = useMemo<IsoFrame[]>(() => SCENARIOS[anomaly](level), [anomaly, level]);
  const player = usePlayer(frames, { interval: 1800 });
  const f = player.frame;
  const cols = frames.length - 1;

  const pick = (a: AnomalyId, l: Level) => {
    setAnomaly(a);
    setLevel(l);
  };

  return (
    <StageFrame
      player={player}
      height={470}
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'committed version' },
            { color: 'var(--hi)', label: 'pending (uncommitted)' },
            { color: 'var(--bad)', label: 'rolled back' },
            { color: 'var(--info)', label: 'T1 read this' },
            { color: 'var(--violet)', label: 'T2 read this' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented
            label="Anomaly"
            value={anomaly}
            onChange={(a) => pick(a, level)}
            options={ANOMALIES.map((a) => ({ value: a.id, label: a.label }))}
          />
          <Segmented
            label="Isolation level"
            value={level}
            onChange={(l) => pick(anomaly, l)}
            options={LEVELS.map((l) => ({ value: l.id, label: l.label }))}
          />
        </Controls>
      }
    >
      <div className="iso">
        <div className="iso-main">
          <section className="iso-timeline" style={{ '--cols': cols } as CSSProperties}>
            <div className="iso-lane-label">time →</div>
            {Array.from({ length: cols }, (_, c) => (
              <div key={c} className={`iso-tick ${c === f.col ? 'now' : ''}`}>
                {c + 1}
              </div>
            ))}
            {(['T1', 'T2'] as const).map((who, r) => (
              <div key={who} className="iso-lane" style={{ gridRow: r + 2 }}>
                <span className={`iso-tx iso-${who}`}>{who}</span>
              </div>
            ))}
            <AnimatePresence initial={false}>
              {f.ops.map((op) => (
                <motion.div
                  key={`${anomaly}-${level}-${op.col}`}
                  className={`iso-op iso-op-${op.who} ${op.col === f.col ? 'now' : ''}`}
                  style={{ gridColumn: op.col + 2, gridRow: op.who === 'T1' ? 2 : 3 }}
                  initial={{ opacity: 0, y: op.who === 'T1' ? -10 : 10, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 24 }}
                >
                  <code>{op.sql}</code>
                  {op.result && <span className={`iso-result ${op.tone ?? ''}`}>→ {op.result}</span>}
                </motion.div>
              ))}
            </AnimatePresence>
          </section>

          <section className="iso-table">
            <h4>
              Shared table <span>(every version the database keeps: MVCC)</span>
            </h4>
            <AnimatePresence initial={false}>
              {f.rows.map((r) => {
                const hidden = f.hidden.includes(r.key);
                return (
                  <motion.div
                    key={r.key}
                    className={`iso-row ${hidden ? 'hidden' : ''}`}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    layout
                  >
                    <span className="iso-row-key">{r.label}</span>
                    <div className="iso-versions">
                      {r.versions.map((v, i) => {
                        const readers = f.saw.filter((s) => s.key === r.key && s.idx === i).map((s) => s.who);
                        return (
                          <motion.span
                            key={i}
                            className={`iso-ver st-${v.st} ${readers.includes('T1') ? 'read-T1' : ''} ${readers.includes('T2') ? 'read-T2' : ''}`}
                            initial={{ opacity: 0, scale: 0.6 }}
                            animate={{ opacity: 1, scale: 1 }}
                          >
                            <b>{v.v}</b>
                            <small>
                              {v.by === 'T0' ? 'initial' : v.by} · {v.st === 'c' ? 'committed' : v.st === 'p' ? 'pending' : 'rolled back'}
                            </small>
                          </motion.span>
                        );
                      })}
                    </div>
                    {hidden && <span className="iso-hidden-tag">not in T1's snapshot</span>}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </section>

          <AnimatePresence>
            {f.verdict && (
              <motion.div
                className={`iso-verdict ${f.verdict.tone}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                {f.verdict.text}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <aside className="iso-matrix">
          <h4>What each level allows</h4>
          <table>
            <thead>
              <tr>
                <th />
                {LEVELS.map((l) => (
                  <th key={l.id} className={l.id === level ? 'on' : ''} title={l.label}>
                    {l.short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ANOMALIES.map((a) => (
                <tr key={a.id} className={a.id === anomaly ? 'on' : ''}>
                  <th title={a.blurb}>{a.label}</th>
                  {LEVELS.map((l) => {
                    const o = MATRIX[a.id][l.id];
                    const current = a.id === anomaly && l.id === level;
                    return (
                      <td key={l.id}>
                        <button
                          type="button"
                          className={`iso-cell ${o} ${current ? 'current' : ''}`}
                          title={`${a.label} at ${l.label}: ${OUTCOME_TEXT[o]}`}
                          onClick={() => pick(a.id, l.id)}
                        >
                          {OUTCOME_ICON[o]}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="iso-key">
            <span className="happens">✗ happens</span> <span className="prevented">✓ prevented</span>{' '}
            <span className="aborted">⟲ one tx aborted</span>
          </p>
          <p className="iso-foot">
            Shown as snapshot-based engines like Postgres behave. Engines differ: Postgres treats Read Uncommitted as Read
            Committed, and MySQL's Repeatable Read does <b>not</b> stop lost updates. Click any cell.
          </p>
        </aside>
      </div>
    </StageFrame>
  );
}
