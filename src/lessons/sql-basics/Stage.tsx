import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Controls, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { cssVar } from '../../core/palette';
import { usePlayer } from '../../core/usePlayer';
import { ORDERS, ORDER_COLS, QUERIES, USERS, USER_COLS, type Mark, type SqlFrame } from './queries';
import './styles.css';

// Fixed geometry so the join lines can be drawn between table rows.
const TITLE = 26;
const HEAD = 30;
const ROW = 30;
const LINK_W = 60;
const rowY = (i: number) => TITLE + HEAD + i * ROW + ROW / 2;

/** One colour per GROUP BY bucket. */
const TINTS = [cssVar('violet'), cssVar('info'), cssVar('amber'), cssVar('ok'), cssVar('pink')];

export function Stage() {
  const [qid, setQid] = useState('where');
  const query = QUERIES.find((q) => q.id === qid)!;
  const frames = useMemo(() => query.build(), [query]);
  const player = usePlayer(frames, { interval: 1000 });
  const f = player.frame;

  return (
    <StageFrame minWidth={620}
      player={player}
      height={440}
      stats={
        <Stats>
          <Stat label={query.usesOrders ? 'Row pairs checked' : 'Rows examined'} value={f.examined} color="var(--info)" />
          <Stat label="Result rows" value={f.result.length} color="var(--ok)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'being read' },
            { color: 'var(--ok)', label: 'kept / matched' },
            { color: 'var(--dim)', label: 'filtered out' },
            { color: 'var(--violet)', label: 'NULL' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented
            label="Query"
            value={qid}
            onChange={setQid}
            options={QUERIES.map((q) => ({ value: q.id, label: q.label }))}
          />
        </Controls>
      }
    >
      <div className="sq">
        <SqlLine query={query} f={f} />
        <ExecOrder steps={query.steps} f={f} />

        <div className="sq-body">
          <div className="sq-sources">
            <Table
              title="users"
              cols={[...USER_COLS]}
              rows={USERS.map((u) => ({ id: u.id, cells: [u.id, u.name, u.city] }))}
              marks={f.users}
              dimCols={f.dimUserCols}
            />
            <svg className="sq-links" width={LINK_W} height={rowY(ORDERS.length)} aria-hidden="true">
              {f.links.map(({ u, o }) => {
                const y1 = rowY(USERS.findIndex((x) => x.id === u));
                const y2 = rowY(ORDERS.findIndex((x) => x.id === o));
                return (
                  <motion.path
                    key={`${u}-${o}`}
                    d={`M0 ${y1} C ${LINK_W / 2} ${y1}, ${LINK_W / 2} ${y2}, ${LINK_W} ${y2}`}
                    className="sq-link"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 0.45 }}
                  />
                );
              })}
            </svg>
            <Table
              title="orders"
              cols={[...ORDER_COLS]}
              rows={ORDERS.map((o) => ({ id: o.id, cells: [o.id, o.userId, o.item, o.total] }))}
              marks={f.orders}
              dimCols={f.dimOrderCols}
              faded={!query.usesOrders}
            />
          </div>

          <div className="sq-arrow" aria-hidden="true">
            →
          </div>

          <Result f={f} />
        </div>
      </div>
    </StageFrame>
  );
}

function SqlLine({ query, f }: { query: (typeof QUERIES)[number]; f: SqlFrame }) {
  return (
    <div className="sq-sql">
      {query.sql.map((tok, i) => {
        const state = f.step === tok.step ? 'on' : f.done.includes(tok.step) || f.step === null ? 'done' : '';
        return (
          <span key={i} className={`sq-tok ${state}`}>
            {tok.text}
          </span>
        );
      })}
      <span className="sq-semi">;</span>
    </div>
  );
}

function ExecOrder({ steps, f }: { steps: string[]; f: SqlFrame }) {
  return (
    <div className="sq-order">
      <span className="sq-order-label">runs in this order:</span>
      {steps.map((s, i) => {
        const state = f.step === s ? 'on' : f.done.includes(s as SqlFrame['done'][number]) || f.step === null ? 'done' : '';
        return (
          <span key={s} className="sq-order-item">
            {i > 0 && <span className="sq-order-arrow">→</span>}
            <span className={`sq-order-chip ${state}`}>
              {i + 1}. {s}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function Table({
  title, cols, rows, marks, dimCols, faded,
}: {
  title: string;
  cols: string[];
  rows: { id: number; cells: (string | number)[] }[];
  marks: Record<number, Mark>;
  dimCols: string[];
  faded?: boolean;
}) {
  const width = (c: string) => (c === 'id' ? '0.7fr' : c === 'user_id' ? '1.1fr' : c === 'total' ? '0.9fr' : '1.3fr');
  const tmpl = { gridTemplateColumns: cols.map(width).join(' ') };
  return (
    <div className={`sq-table ${faded ? 'faded' : ''}`}>
      <div className="sq-title" style={{ height: TITLE }}>
        {title}
        {faded && <span className="sq-unused">not used by this query</span>}
      </div>
      <div className="sq-row sq-head" style={{ ...tmpl, height: HEAD }}>
        {cols.map((c) => (
          <span key={c} className={dimCols.includes(c) ? 'dim' : ''}>
            {c}
          </span>
        ))}
      </div>
      {rows.map((r) => (
        <div key={r.id} className={`sq-row ${marks[r.id] ?? ''}`} style={{ ...tmpl, height: ROW }}>
          {r.cells.map((v, i) => (
            <span key={i} className={dimCols.includes(cols[i]) ? 'dim' : ''}>
              {v}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function Result({ f }: { f: SqlFrame }) {
  return (
    <div className="sq-table sq-result">
      <div className="sq-title" style={{ height: TITLE }}>
        result
      </div>
      <div className="sq-row sq-head" style={{ gridTemplateColumns: `repeat(${Math.max(1, f.resultCols.length)}, 1fr)`, height: HEAD }}>
        {f.resultCols.length ? f.resultCols.map((c) => <span key={c}>{c}</span>) : <span className="sq-empty">empty</span>}
      </div>
      <AnimatePresence initial={false}>
        {f.result.map((r) => (
          <motion.div
            key={r.key}
            layout
            className="sq-row sq-res-row"
            style={{
              gridTemplateColumns: `repeat(${f.resultCols.length}, 1fr)`,
              height: ROW,
              borderLeftColor: r.tint !== undefined ? TINTS[r.tint % TINTS.length] : undefined,
              background: r.tint !== undefined ? `color-mix(in srgb, ${TINTS[r.tint % TINTS.length]} 14%, transparent)` : undefined,
            }}
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, scaleY: 0.2, transition: { duration: 0.3 } }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            {r.cells.map((v, i) => (
              <span key={i} className={v === null ? 'sq-null' : ''}>
                {v === null ? 'NULL' : v}
              </span>
            ))}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
