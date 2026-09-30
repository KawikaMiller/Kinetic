import { motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { useInterval } from '../../core/useInterval';
import { ERROR_PCT, health, makeRequest, metrics, SERVICES, SLOW_P99_MS, SVC_COLOR, type Incident, type Req, type Svc } from './sim';
import './styles.css';

const TICK_MS = 400;
/** Requests kept in memory, and p99 samples kept per service for the sparklines. */
const KEEP = 160;
const HISTORY = 30;
/** How far back 'Slowest recent' / 'Latest error' look, in requests. */
const TRACE_LOOKBACK = 60;
/** The unfiltered log view: lines from this many recent requests, newest first, capped. */
const LOG_REQUESTS = 24;
const LOG_LINES = 40;
/** A span doing at least this much work itself (not waiting on children) is outlined. */
const LONG_SELF_MS = 100;
/** Sparkline y-axis never shrinks below this, so a healthy service reads as flat. */
const SPARK_FLOOR_MS = 250;
/** Metric-series cardinality: label values multiplied. */
const BASE_SERIES = 5 * 4 * 5; // service × route × status
const USER_IDS = 1_000_000;

const CULPRITS: Record<Incident, Svc[]> = { healthy: [], slow: ['payments', 'fraud'], errors: ['inventory'] };

interface Sim {
  reqs: Req[];
  now: number;
  history: Record<Svc, number[]>;
}

const emptyHistory = () => Object.fromEntries(SERVICES.map((s) => [s, [] as number[]])) as unknown as Record<Svc, number[]>;

interface Checks {
  metrics: boolean;
  trace: boolean;
  logs: boolean;
}
const NO_CHECKS: Checks = { metrics: false, trace: false, logs: false };

const INTRO: Record<Incident, ReactNode> = {
  healthy: (
    <>
      All green. Every request leaves three kinds of evidence: <span className="hl info">logs</span>,{' '}
      <span className="hl violet">metrics</span> and a <span className="hl">trace</span>.
    </>
  ),
  slow: (
    <>
      <span className="hl bad">Checkout is slow</span> and users are complaining. Step 1: which service's <b>p99</b> jumped in the
      metrics? Click its row.
    </>
  ),
  errors: (
    <>
      <span className="hl bad">Checkout is failing</span> for some users. Step 1: which service's <b>error rate</b> moved? Click its
      row.
    </>
  ),
};

export function Stage() {
  const setCaption = useSetCaption();
  const [incident, setIncident] = useState<Incident>('healthy');
  const [sim, setSim] = useState<Sim>({ reqs: [], now: 0, history: emptyHistory() });
  const [picked, setPicked] = useState<Req | null>(null);
  const [filterLogs, setFilterLogs] = useState(false);
  const [checks, setChecks] = useState<Checks>(NO_CHECKS);
  const [userIdLabel, setUserIdLabel] = useState(false);

  useInterval(() => {
    setSim((s) => {
      const now = s.now + TICK_MS / 1000;
      const reqs = [...s.reqs, makeRequest((s.reqs.at(-1)?.id ?? 0) + 1, now, incident)].slice(-KEEP);
      const m = metrics(reqs, now);
      const history = { ...s.history };
      for (const row of m) history[row.svc] = [...history[row.svc], row.p99].slice(-HISTORY);
      return { reqs, now, history };
    });
  }, TICK_MS);

  useIntroCaption(INTRO[incident], [incident]);

  const rows = metrics(sim.reqs, sim.now);
  const gateway = rows[0];
  const trace = picked ?? sim.reqs.at(-1) ?? null;
  const culprits = CULPRITS[incident];
  const isProblem = (q: Req) => (incident === 'slow' && q.slow) || (incident === 'errors' && q.error);

  const changeIncident = (i: Incident) => {
    setIncident(i);
    setPicked(null);
    setFilterLogs(false);
    setChecks(NO_CHECKS);
  };

  const clickRow = (svc: Svc) => {
    if (incident === 'healthy') {
      setCaption(<>Nothing is wrong yet. Inject an incident with the controls below, then investigate.</>);
      return;
    }
    const row = rows.find((m) => m.svc === svc);
    if (row && health(row) !== 'ok') {
      setChecks((c) => ({ ...c, metrics: true }));
      setCaption(
        <>
          <span className="hl ok">✓ Metrics</span> say <b>something is wrong</b>: {svc}'s {incident === 'slow' ? `p99 is ${Math.round(row.p99)} ms` : `error rate is ${row.errPct.toFixed(0)}%`}.
          But every caller of a sick service looks sick too, so metrics can't say <i>where</i>. Step 2: open a{' '}
          {incident === 'slow' ? 'slow' : 'failing'} <span className="hl">trace</span>.
        </>,
      );
    } else {
      setCaption(<>{svc} looks normal. Compare the p99 and error columns (and the sparklines) across services.</>);
    }
  };

  const openTrace = (kind: 'slowest' | 'error') => {
    const recent = sim.reqs.slice(-TRACE_LOOKBACK);
    const q = kind === 'slowest'
      ? recent.reduce<Req | null>((a, b) => (!a || b.total > a.total ? b : a), null)
      : [...recent].reverse().find((x) => x.error) ?? null;
    if (!q) {
      setCaption(<>No {kind === 'error' ? 'failing' : ''} requests in the last few seconds.</>);
      return;
    }
    setPicked(q);
    setFilterLogs(false);
    if (incident !== 'healthy' && isProblem(q)) {
      setChecks((c) => ({ ...c, trace: true }));
      const culprit = incident === 'slow' ? q.spans.find((s) => s.svc === 'fraud') : q.spans.find((s) => s.error && s.depth === 2);
      setCaption(
        <>
          <span className="hl ok">✓ Trace</span> shows <b>where</b>: {incident === 'slow'
            ? <>the <span className="hl">fraud</span> call inside payments takes {Math.round(culprit?.dur ?? 0)} ms.</>
            : <><span className="hl bad">inventory</span> failed and the error bubbled up.</>}{' '}
          Step 3: read this trace's <b>logs</b> to learn why.
        </>,
      );
    } else {
      setCaption(<>Trace <code>{q.trace}</code>: {Math.round(q.total)} ms end to end. Each bar is one service's span.</>);
    }
  };

  const toggleLogs = () => {
    const on = !filterLogs;
    setFilterLogs(on);
    if (on && trace && incident !== 'healthy' && isProblem(trace)) {
      setChecks((c) => ({ ...c, logs: true }));
      setCaption(
        incident === 'slow' ? (
          <>
            <span className="hl ok">✓ Logs</span> say <b>why</b>: the payments → fraud-api <b>connection pool is exhausted</b>, so
            requests queue for a connection. Metrics → trace → logs: found.
          </>
        ) : (
          <>
            <span className="hl ok">✓ Logs</span> say <b>why</b>: inventory can't reach <b>database replica-2</b>. Metrics → trace →
            logs: found.
          </>
        ),
      );
    }
  };

  const logLines = filterLogs && trace
    ? trace.logs
    : sim.reqs.slice(-LOG_REQUESTS).flatMap((q) => q.logs).reverse().slice(0, LOG_LINES);

  const done = Object.values(checks).filter(Boolean).length;

  return (
    <StageFrame
      height={560}
      stats={
        <Stats>
          <Stat label="Checkout p99" value={`${Math.round(gateway?.p99 ?? 0)} ms`} color={(gateway?.p99 ?? 0) >= SLOW_P99_MS ? 'var(--bad)' : 'var(--ok)'} />
          <Stat label="Checkout errors" value={`${(gateway?.errPct ?? 0).toFixed(1)}%`} color={(gateway?.errPct ?? 0) >= ERROR_PCT ? 'var(--bad)' : 'var(--ok)'} />
          <Stat label="Investigation" value={incident === 'healthy' ? '–' : `${done}/3`} color={done === 3 ? 'var(--ok)' : 'var(--hi)'} sub="metrics → trace → logs" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'healthy' },
            { color: 'var(--hi)', label: `slow (p99 ≥ ${SLOW_P99_MS} ms)` },
            { color: 'var(--bad)', label: `erroring (≥ ${ERROR_PCT}%)` },
            ...SERVICES.map((s) => ({ color: SVC_COLOR[s], label: s, shape: 'dot' as const })),
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented
            label="Incident"
            value={incident}
            onChange={changeIncident}
            options={[
              { value: 'healthy', label: 'Healthy' },
              { value: 'slow', label: 'Checkout is slow' },
              { value: 'errors', label: 'Checkout is failing' },
            ]}
          />
        </Controls>
      }
    >
      <div className="ob">
        {/* ── Service map + checklist ───────────── */}
        <section className="ob-panel ob-map">
          <h4>Service map</h4>
          <ServiceMap rows={rows} />
          <ol className="ob-checks">
            <Check done={checks.metrics} n={1}>Metrics: <b>something</b> is wrong</Check>
            <Check done={checks.trace} n={2}>Trace: <b>where</b> it's wrong</Check>
            <Check done={checks.logs} n={3}>Logs: <b>why</b> it's wrong</Check>
          </ol>
          <div className={`ob-card ${userIdLabel ? 'boom' : ''}`}>
            <p>
              Metric series = label values multiplied:
              <br />
              <code>service(5) × route(4) × status(5)</code>
              {userIdLabel && <code className="bad"> × user_id(1,000,000)</code>}
            </p>
            <motion.p key={String(userIdLabel)} className="ob-series" initial={{ scale: 1.2 }} animate={{ scale: 1 }}>
              {(userIdLabel ? BASE_SERIES * USER_IDS : BASE_SERIES).toLocaleString()} series
            </motion.p>
            <button type="button" className="ob-link" onClick={() => setUserIdLabel((v) => !v)}>
              {userIdLabel ? 'Remove user_id label' : 'Add a user_id label'}
            </button>
            {userIdLabel && <p className="ob-warn">High cardinality: every series costs memory and money. Put IDs in logs and traces, not metric labels.</p>}
          </div>
        </section>

        {/* ── Metrics ──────────────────────────── */}
        <section className="ob-panel">
          <h4>
            Metrics <span>rolling 12 s · click a row</span>
          </h4>
          <table className="ob-table">
            <thead>
              <tr>
                <th>service</th>
                <th>req/s</th>
                <th>err %</th>
                <th>p50</th>
                <th>p99</th>
                <th>p99 trend</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.svc} className={`${health(m)} ${checks.logs && culprits.includes(m.svc) ? 'found' : ''}`} onClick={() => clickRow(m.svc)}>
                  <td>
                    <i style={{ background: SVC_COLOR[m.svc] }} />
                    {m.svc}
                  </td>
                  <td>{m.rps.toFixed(1)}</td>
                  <td className="err">{m.errPct.toFixed(1)}</td>
                  <td>{Math.round(m.p50)}</td>
                  <td className="p99">{Math.round(m.p99)}</td>
                  <td>
                    <Spark values={sim.history[m.svc]} color={SVC_COLOR[m.svc]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* ── Trace ─────────────────────────────── */}
        <section className="ob-panel">
          <h4>
            Trace <span>{trace ? `${trace.trace} · ${Math.round(trace.total)} ms${picked ? '' : ' · live'} · outlined = most time spent in itself` : 'waiting…'}</span>
          </h4>
          <div className="ob-trace-actions">
            <Button onClick={() => openTrace('slowest')}>Slowest recent</Button>
            <Button onClick={() => openTrace('error')}>Latest error</Button>
            {picked && <Button onClick={() => { setPicked(null); setFilterLogs(false); }}>Back to live</Button>}
          </div>
          {trace && <Waterfall req={trace} />}
        </section>

        {/* ── Logs ──────────────────────────────── */}
        <section className="ob-panel ob-logs-panel">
          <h4>
            Logs <span>{filterLogs && trace ? `trace_id=${trace.trace}` : 'all services, newest first'}</span>
          </h4>
          <div className="ob-trace-actions">
            <Button onClick={toggleLogs} disabled={!trace}>
              {filterLogs ? 'Show all logs' : 'Only logs for this trace'}
            </Button>
          </div>
          <ul className="ob-logs">
            {logLines.map((l) => (
              <li key={l.id} className={l.level.toLowerCase()}>
                <span className="lvl">{l.level}</span>
                <span className="svc" style={{ color: SVC_COLOR[l.svc] }}>
                  {l.svc}
                </span>
                <span className="tid">{l.trace}</span>
                <span className="msg">{l.msg}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </StageFrame>
  );
}

function Check({ done, n, children }: { done: boolean; n: number; children: ReactNode }) {
  return (
    <li className={done ? 'done' : ''}>
      <span className="ob-check-n">{done ? '✓' : n}</span>
      <span>{children}</span>
    </li>
  );
}

const NODES: Record<Svc, { x: number; y: number }> = {
  gateway: { x: 50, y: 70 },
  orders: { x: 160, y: 70 },
  inventory: { x: 280, y: 28 },
  payments: { x: 280, y: 112 },
  fraud: { x: 400, y: 112 },
};
const LINKS: [Svc, Svc][] = [['gateway', 'orders'], ['orders', 'inventory'], ['orders', 'payments'], ['payments', 'fraud']];

function ServiceMap({ rows }: { rows: ReturnType<typeof metrics> }) {
  const h = Object.fromEntries(rows.map((m) => [m.svc, health(m)])) as Record<Svc, string>;
  return (
    <svg className="ob-svg" viewBox="0 0 450 160">
      {LINKS.map(([a, b]) => (
        <line key={a + b} x1={NODES[a].x} y1={NODES[a].y} x2={NODES[b].x} y2={NODES[b].y} className={`ob-link-line ${h[b]}`} />
      ))}
      {SERVICES.map((s) => (
        <g key={s} className={`ob-node ${h[s] ?? 'ok'}`}>
          <circle cx={NODES[s].x} cy={NODES[s].y} r={16} />
          <text x={NODES[s].x} y={NODES[s].y + 32} textAnchor="middle">
            {s}
          </text>
        </g>
      ))}
    </svg>
  );
}

function Spark({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <svg className="ob-spark" viewBox="0 0 80 22" />;
  const max = Math.max(SPARK_FLOOR_MS, ...values);
  const pts = values.map((v, i) => `${(i / (HISTORY - 1)) * 80},${21 - (v / max) * 19}`).join(' ');
  return (
    <svg className="ob-spark" viewBox="0 0 80 22">
      <line x1="0" x2="80" y1={21 - (SLOW_P99_MS / max) * 19} y2={21 - (SLOW_P99_MS / max) * 19} className="ob-spark-slo" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" />
    </svg>
  );
}

/** A span's own time, excluding time spent waiting on its child spans. */
function selfTime(req: Req, i: number) {
  const s = req.spans[i];
  const kids = req.spans.filter((c) => c.depth === s.depth + 1 && c.start >= s.start && c.start < s.start + s.dur);
  return s.dur - kids.reduce((sum, c) => sum + c.dur, 0);
}

function Waterfall({ req }: { req: Req }) {
  return (
    <div className="ob-wf">
      {req.spans.map((s, i) => (
        <div key={`${req.trace}-${i}`} className="ob-wf-row">
          <span className="ob-wf-name" style={{ paddingLeft: s.depth * 12 }}>
            {s.svc}
          </span>
          <div className="ob-wf-track">
            <motion.div
              className={`ob-wf-bar ${s.error ? 'error' : ''} ${selfTime(req, i) >= LONG_SELF_MS ? 'long' : ''}`}
              style={{ left: `${(s.start / req.total) * 100}%`, background: s.error ? 'var(--bad)' : SVC_COLOR[s.svc] }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(0.8, (s.dur / req.total) * 100)}%` }}
              transition={{ duration: 0.5, delay: i * 0.08, ease: 'easeOut' }}
            />
          </div>
          <span className="ob-wf-ms">{Math.round(s.dur)} ms</span>
        </div>
      ))}
    </div>
  );
}
