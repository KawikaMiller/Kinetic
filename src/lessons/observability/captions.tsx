/**
 * The investigation's captions and the step each one completes. Every number and quoted line comes
 * from the metrics table or the trace's own logs, so what the caption says is what is on screen.
 */
import type { ReactNode } from 'react';
import { health, isProblemRequest, type Checks, type Incident, type Req, type Svc, type SvcMetrics } from './sim';

export interface Step {
  caption: ReactNode;
  /** The investigation step this action completes, if it does. */
  check?: keyof Checks;
}

export const INTRO: Record<Incident, ReactNode> = {
  healthy: (
    <>
      All green. Each request leaves three kinds of evidence: <span className="hl info">logs</span>, <span className="hl violet">metrics</span> and a{' '}
      <span className="hl">trace</span>.
    </>
  ),
  slow: (
    <>
      <span className="hl bad">Checkout is slow</span> and users are complaining. Step 1: which service's <b>p99</b> jumped in the metrics? Click its
      row.
    </>
  ),
  errors: (
    <>
      <span className="hl bad">Checkout is failing</span> for some users. Step 1: which service's <b>error rate</b> moved? Click its row.
    </>
  ),
};

const list = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

/** What clicking a service's metrics row says. */
export function rowClicked(incident: Incident, rows: readonly SvcMetrics[], svc: Svc): Step {
  if (incident === 'healthy') return { caption: <>Nothing is wrong yet. Inject an incident with the controls below, then investigate.</> };
  const row = rows.find((m) => m.svc === svc);
  if (!row || health(row) === 'ok') return { caption: <>{svc} looks normal. Compare the p99 and error columns (and the sparklines) across services.</> };
  const sick = rows.filter((m) => health(m) !== 'ok').map((m) => m.svc);
  return {
    check: 'metrics',
    caption: (
      <>
        <span className="hl ok">✓ Metrics</span> say <b>something is wrong</b>: {svc}'s {incident === 'slow' ? `p99 is ${Math.round(row.p99)} ms` : `error rate is ${row.errPct.toFixed(0)}%`}.
        But {sick.length} services look sick ({list(sick)}), because a service's time includes the services it calls, so metrics can't say <i>where</i>. Step 2: open a{' '}
        {incident === 'slow' ? 'slow' : 'failing'} <span className="hl">trace</span>.
      </>
    ),
  };
}

/** What opening a trace says. `req` is null when there is none to open. */
export function traceOpened(incident: Incident, kind: 'slowest' | 'error', req: Req | null): Step {
  if (!req) return { caption: <>No {kind === 'error' ? 'failing ' : ''}requests in the last few seconds.</> };
  if (incident === 'healthy' || !isProblemRequest(incident, req)) {
    return { caption: <>Trace <code>{req.trace}</code>: {Math.round(req.total)} ms end to end. Each bar is one service's span.</> };
  }
  const culprit = incident === 'slow' ? req.spans.find((s) => s.svc === 'fraud') : req.spans.find((s) => s.error && s.depth === 2);
  return {
    check: 'trace',
    caption: (
      <>
        <span className="hl ok">✓ Trace</span> shows <b>where</b>:{' '}
        {incident === 'slow' ? (
          <>the <span className="hl">fraud</span> call inside payments takes {Math.round(culprit?.dur ?? 0)} ms.</>
        ) : (
          <><span className="hl bad">{culprit?.svc}</span> failed and the error bubbled up.</>
        )}{' '}
        Step 3: read this trace's <b>logs</b> to learn why.
      </>
    ),
  };
}

/** The log line that explains the incident in a trace: its first WARN or ERROR from the service that caused it. */
export function causeLine(incident: Incident, req: Req) {
  const svc: Svc = incident === 'slow' ? 'payments' : 'inventory';
  return req.logs.find((l) => l.svc === svc && l.level !== 'INFO') ?? null;
}

/** What filtering the logs to the open trace says (nothing when switching the filter off or when it isn't an incident trace). */
export function logsFiltered(incident: Incident, trace: Req | null, on: boolean): Step | null {
  if (!on || !trace || incident === 'healthy' || !isProblemRequest(incident, trace)) return null;
  const line = causeLine(incident, trace);
  return {
    check: 'logs',
    caption: (
      <>
        <span className="hl ok">✓ Logs</span> say <b>why</b>: <code>{line?.msg}</code>.{' '}
        {incident === 'slow' ? 'The connection pool to fraud-api is used up, so requests queue for a connection.' : 'Inventory cannot reach its database replica.'} Metrics →
        trace → logs: found.
      </>
    ),
  };
}
