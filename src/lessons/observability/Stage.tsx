import { motion } from 'motion/react';
import { useRef, useState, type ReactNode } from 'react';
import { Sparkline } from '../../components/Sparkline';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Provenance, Segmented, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { mulberry32 } from '../../core/random';
import { useInterval } from '../../core/useInterval';
import { INTRO, logsFiltered, rowClicked, traceOpened, type Step } from './captions';
import {
  ERROR_PCT, health, LONG_SELF_MS, makeRequest, METRICS_WINDOW_S, metrics, NO_CHECKS, pickTrace, selfTime, SERIES_LABELS, seriesBound, SERVICES, SLOW_P99_MS,
  SVC_COLOR, TRAFFIC_SEED, USER_ID_VALUES, type Checks, type Incident, type Req, type Svc,
} from './sim';
import './styles.css';

const TICK_MS = 400;
/** Requests kept in memory, and p99 samples kept per service for the sparklines. */
const KEEP = 160;
const HISTORY = 30;
/** The unfiltered log view: lines from this many recent requests, newest first, capped. */
const LOG_REQUESTS = 24;
const LOG_LINES = 40;
/** Sparkline y-axis never shrinks below this, so a healthy service reads as flat. */
const SPARK_FLOOR_MS = 250;
const BASE_LABELS = Object.values(SERIES_LABELS);

const CULPRITS: Record<Incident, Svc[]> = { healthy: [], slow: ['payments', 'fraud'], errors: ['inventory'] };

interface Sim {
  reqs: Req[];
  now: number;
  history: Record<Svc, number[]>;
}

const emptyHistory = () => Object.fromEntries(SERVICES.map((s) => [s, [] as number[]])) as unknown as Record<Svc, number[]>;

export function Stage() {
  const setCaption = useSetCaption();
  const [incident, setIncident] = useState<Incident>('healthy');
  const [sim, setSim] = useState<Sim>({ reqs: [], now: 0, history: emptyHistory() });
  const [picked, setPicked] = useState<Req | null>(null);
  const [filterLogs, setFilterLogs] = useState(false);
  const [checks, setChecks] = useState<Checks>(NO_CHECKS);
  const [userIdLabel, setUserIdLabel] = useState(false);
  const rnd = useRef(mulberry32(TRAFFIC_SEED));

  useInterval(() => {
    setSim((s) => {
      const now = s.now + TICK_MS / 1000;
      const reqs = [...s.reqs, makeRequest((s.reqs.at(-1)?.id ?? 0) + 1, now, incident, rnd.current)].slice(-KEEP);
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

  const apply = (step: Step | null) => {
    if (!step) return;
    setCaption(step.caption);
    const { check } = step;
    if (check) setChecks((c) => ({ ...c, [check]: true }));
  };

  const changeIncident = (i: Incident) => {
    setIncident(i);
    setPicked(null);
    setFilterLogs(false);
    setChecks(NO_CHECKS);
  };

  const openTrace = (kind: 'slowest' | 'error') => {
    const q = pickTrace(sim.reqs, kind);
    if (q) {
      setPicked(q);
      setFilterLogs(false);
    }
    apply(traceOpened(incident, kind, q));
  };

  const toggleLogs = () => {
    const on = !filterLogs;
    setFilterLogs(on);
    apply(logsFiltered(incident, trace, on));
  };

  const logLines = filterLogs && trace
    ? trace.logs
    : sim.reqs.slice(-LOG_REQUESTS).flatMap((q) => q.logs).reverse().slice(0, LOG_LINES);

  const done = Object.values(checks).filter(Boolean).length;
  const series = seriesBound(userIdLabel ? [...BASE_LABELS, USER_ID_VALUES] : BASE_LABELS);

  return (
    <StageFrame
      height={560}
      stats={
        <Stats>
          <Stat label="Checkout p99" value={`${Math.round(gateway?.p99 ?? 0)} ms`} color={(gateway?.p99 ?? 0) >= SLOW_P99_MS ? 'var(--bad)' : 'var(--ok)'} />
          <Stat label="Checkout mean" value={`${Math.round(gateway?.mean ?? 0)} ms`} sub={`p99 is ${((gateway?.p99 ?? 0) / Math.max(1, gateway?.mean ?? 0)).toFixed(1)}× the mean`} />
          <Stat label="Checkout errors" value={`${(gateway?.errPct ?? 0).toFixed(1)}%`} color={(gateway?.errPct ?? 0) >= ERROR_PCT ? 'var(--bad)' : 'var(--ok)'} />
          <Stat label="Investigation" value={incident === 'healthy' ? '–' : `${done}/3`} color={done === 3 ? 'var(--ok)' : 'var(--hi)'} sub="metrics → trace → logs" />
        </Stats>
      }
      legend={
        <>
          <Legend
            items={[
              { color: 'var(--ok)', label: 'healthy' },
              { color: 'var(--hi)', label: `slow (p99 ≥ ${SLOW_P99_MS} ms)` },
              { color: 'var(--bad)', label: `erroring (≥ ${ERROR_PCT}%)` },
              ...SERVICES.map((s) => ({ color: SVC_COLOR[s], label: s, shape: 'dot' as const })),
            ]}
          />
          <div className="ob-prov">
            <Provenance kind="simulated" seed={TRAFFIC_SEED}>seeded requests through a made-up checkout system; metrics, trace and logs all come from the same requests</Provenance>
            <Provenance kind="illustrative">service names, log messages, label counts and the failure and slowdown shares are invented</Provenance>
          </div>
        </>
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
              Metric series, at most the label values multiplied:
              <br />
              <code>{Object.entries(SERIES_LABELS).map(([name, n]) => `${name}(${n})`).join(' × ')}</code>
              {userIdLabel && <code className="bad"> × user_id({USER_ID_VALUES.toLocaleString()})</code>}
            </p>
            <motion.p key={String(userIdLabel)} className="ob-series" initial={{ scale: 1.2 }} animate={{ scale: 1 }}>
              {series.toLocaleString()} series
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
            Metrics <span>rolling {METRICS_WINDOW_S} s · click a row</span>
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
                <tr
                  key={m.svc}
                  className={`${health(m)} ${checks.logs && culprits.includes(m.svc) ? 'found' : ''}`}
                  onClick={() => apply(rowClicked(incident, rows, m.svc))}
                >
                  <td>
                    <button type="button" className="ob-row-btn">
                      <i style={{ background: SVC_COLOR[m.svc] }} />
                      {m.svc}
                    </button>
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
            Trace <span>{trace ? `${trace.trace} · ${Math.round(trace.total)} ms${picked ? '' : ' · live'} · outlined = at least ${LONG_SELF_MS} ms of its own time` : 'waiting…'}</span>
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

const SPARK_PAD = { top: 2, bottom: 1 };

function Spark({ values, color }: { values: number[]; color: string }) {
  return (
    <Sparkline
      className="ob-spark"
      values={values}
      width={80}
      height={22}
      cap={HISTORY}
      align="left"
      minMax={SPARK_FLOOR_MS}
      pad={SPARK_PAD}
      refLine={SLOW_P99_MS}
      color={color}
      strokeWidth={1.6}
    />
  );
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
