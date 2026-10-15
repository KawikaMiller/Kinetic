import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Controls, Legend, Provenance, Segmented } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { usePlayer } from '../../core/usePlayer';
import { buildFrames } from './frames';
import { ANOMALIES, deriveMatrix, interleavingCounts, LEVELS, type AnomalyId, type Level, type Outcome } from './model';
import './styles.css';

/** T1 and T2 colours, via the kit's tone classes. */
const TONE = { T1: 'tone-info', T2: 'tone-violet' } as const;
/** Room each step's op box needs so its SQL and result stay readable, and the lane-label column and padding around them. */
const STEP_COL_PX = 104;
const TIMELINE_CHROME_PX = 44 + 40;
const timelineMinWidth = (steps: number) => TIMELINE_CHROME_PX + steps * STEP_COL_PX;

const ARROW_STEP: Record<string, { row: number; col: number }> = {
  ArrowUp: { row: -1, col: 0 },
  ArrowDown: { row: 1, col: 0 },
  ArrowLeft: { row: 0, col: -1 },
  ArrowRight: { row: 0, col: 1 },
};
const cellKey = (a: AnomalyId, l: Level) => `${a}/${l}`;

const OP_SPRING = { type: 'spring', stiffness: 300, damping: 24 } as const;

const OUTCOME_ICON: Record<Outcome, string> = { happens: '✗', prevented: '✓', aborted: '⟲' };
const OUTCOME_TEXT: Record<Outcome, string> = {
  happens: 'anomaly happens',
  prevented: 'prevented',
  aborted: 'prevented by aborting a transaction',
};

export function Stage() {
  const [anomaly, setAnomaly] = useState<AnomalyId>('dirty');
  const [level, setLevel] = useState<Level>('ru');
  // The matrix is one tab stop (roving focus): arrows move between its cells, Enter or Space plays one.
  const [cursor, setCursor] = useState<{ a: AnomalyId; l: Level }>({ a: 'dirty', l: 'ru' });
  const cellRefs = useRef(new Map<string, HTMLButtonElement>());

  const moveCursor = (e: KeyboardEvent<HTMLButtonElement>, a: AnomalyId, l: Level) => {
    const step = ARROW_STEP[e.key];
    if (!step) return;
    e.preventDefault();
    const row = Math.min(ANOMALIES.length - 1, Math.max(0, ANOMALIES.findIndex((x) => x.id === a) + step.row));
    const col = Math.min(LEVELS.length - 1, Math.max(0, LEVELS.findIndex((x) => x.id === l) + step.col));
    const next = { a: ANOMALIES[row].id, l: LEVELS[col].id };
    setCursor(next);
    cellRefs.current.get(cellKey(next.a, next.l))?.focus();
  };
  const frames = useMemo(() => buildFrames(anomaly, level), [anomaly, level]);
  const player = usePlayer(frames, { interval: 1800 });
  const f = player.frame;
  const cols = frames.length - 1;
  const current = LEVELS.find((l) => l.id === level)!;
  // The table is generated here by running every interleaving, so "each cell is checked" is literally true.
  const matrix = useMemo(() => deriveMatrix(), []);
  const counts = ANOMALIES.map((a) => `${a.label.toLowerCase()} ${interleavingCounts()[a.id]}`).join(', ');

  const pick = (a: AnomalyId, l: Level) => {
    setAnomaly(a);
    setLevel(l);
  };

  return (
    <StageFrame
      player={player}
      height={470}
      legend={
        <>
          <Legend
            items={[
              { color: 'var(--ok)', label: 'committed version' },
              { color: 'var(--hi)', label: 'pending (uncommitted)' },
              { color: 'var(--bad)', label: 'rolled back' },
              { color: 'var(--info)', label: 'T1 read this' },
              { color: 'var(--violet)', label: 'T2 read this' },
            ]}
          />
          <div className="iso-prov">
            <Provenance kind="toy">a small multi-version engine with a stated rule for each level, not a real database</Provenance>
            <Provenance kind="scripted">the one interleaving of T1 and T2 that is played</Provenance>
          </div>
        </>
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
          <WideRegion
            minWidth={timelineMinWidth(cols)}
            label="Timeline: scroll sideways to see every step"
            reveal={f.col >= 0 ? { from: (f.col + 1) / (cols + 1), to: (f.col + 2) / (cols + 1) } : null}
          >
          <section className="iso-timeline" style={{ '--cols': cols } as CSSProperties}>
            <div className="iso-lane-label">time →</div>
            {Array.from({ length: cols }, (_, c) => (
              <div key={c} className={`iso-tick ${c === f.col ? 'now' : ''}`}>
                {c + 1}
              </div>
            ))}
            {(['T1', 'T2'] as const).map((who, r) => (
              <div key={who} className="iso-lane" style={{ gridRow: r + 2 }}>
                <span className={`iso-tx ${TONE[who]}`}>{who}</span>
              </div>
            ))}
            <AnimatePresence initial={false}>
              {f.ops.map((op) => (
                <motion.div
                  key={`${anomaly}-${level}-${op.col}`}
                  className={`iso-op ${TONE[op.who]} ${op.col === f.col ? 'now' : ''}`}
                  style={{ gridColumn: op.col + 2, gridRow: op.who === 'T1' ? 2 : 3 }}
                  initial={{ opacity: 0, y: op.who === 'T1' ? -10 : 10, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={OP_SPRING}
                >
                  <code>{op.sql}</code>
                  {op.result && <span className={`iso-result ${op.tone ?? ''}`}>→ {op.result}</span>}
                </motion.div>
              ))}
            </AnimatePresence>
          </section>
          </WideRegion>

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
                    const o = matrix[a.id][l.id];
                    const current = a.id === anomaly && l.id === level;
                    return (
                      <td key={l.id}>
                        <button
                          type="button"
                          ref={(el) => {
                            if (el) cellRefs.current.set(cellKey(a.id, l.id), el);
                            else cellRefs.current.delete(cellKey(a.id, l.id));
                          }}
                          className={`iso-cell ${o} ${current ? 'current' : ''}`}
                          title={`${a.label} at ${l.label}: ${OUTCOME_TEXT[o]}`}
                          aria-label={`${a.label} at ${l.label}: ${OUTCOME_TEXT[o]}`}
                          aria-pressed={current}
                          tabIndex={cursor.a === a.id && cursor.l === l.id ? 0 : -1}
                          onFocus={() => setCursor({ a: a.id, l: l.id })}
                          onKeyDown={(e) => moveCursor(e, a.id, l.id)}
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
          <p className="iso-model">
            <b>{current.short} in the toy engine:</b> {current.model}
          </p>
          <p className="iso-foot">
            <Provenance kind="simulated">
              each cell is computed when this page loads, by running every interleaving of the two toy transactions through the engine ({counts})
            </Provenance>{' '}
            Click any cell to play it. The toy does not wait on a row lock: a write conflict aborts at once, where real engines usually block first.
          </p>
          <p className="iso-foot">
            <Provenance kind="from-memory">real engines differ; check your database's docs</Provenance> Level names are not portable. For example,
            Postgres treats Read Uncommitted as Read Committed, so it never shows a dirty read, and MySQL's InnoDB Repeatable Read does not abort the second
            writer the way this toy snapshot level does (an UPDATE overwrites, so the lost update happens there). The SQL standard's Repeatable Read allows
            phantoms; snapshot reads, as here, do not. Lock-based serializable (InnoDB, SQL Server) blocks instead of aborting, and Oracle's SERIALIZABLE is
            snapshot isolation, which still allows write skew.
          </p>
        </aside>
      </div>
    </StageFrame>
  );
}
