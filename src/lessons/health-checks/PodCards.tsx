import { PROBES, PODS, type Config, type Run } from './model';
import { inRotation, lightAt, podStatus, PROBE_LABEL, restartsSoFar, RESULT_TONE, type PodStatus } from './view';

const STATUS_TEXT: Record<PodStatus, string> = { ready: 'Ready, in rotation', 'not-ready': 'not in rotation', restarting: 'restarting' };

/** Four pods behind a Service, each with a light per probe: green passed, red failed, dim not run yet (hollow: no such probe). */
export function PodCards({ run, config, shown }: { run: Run; config: Config; shown: number }) {
  return (
    <div className="hc-pods">
      {Array.from({ length: PODS }, (_, pod) => {
        const status = podStatus(run, pod, shown);
        const restarts = restartsSoFar(run, pod, shown);
        const hung = shown > 0 && run.seconds[shown - 1].pods[pod].hung;
        return (
          <div key={pod} className={`hc-pod is-${status}`}>
            <b>pod {pod + 1}</b>
            <span className="hc-status">{STATUS_TEXT[status]}</span>
            <span className="hc-lights">
              {PROBES.map((kind) => {
                const enabled = config[kind].enabled;
                const result = enabled ? lightAt(run, pod, kind, shown) : 'idle';
                return (
                  <span key={kind} className={`hc-light-wrap ${enabled ? '' : 'is-off'}`}>
                    <i className={`hc-light tone-${RESULT_TONE[result]} ${enabled ? '' : 'is-hollow'}`} aria-hidden="true" />
                    <span>
                      {PROBE_LABEL[kind]} {enabled ? (result === 'idle' ? 'not run' : result === 'pass' ? 'passed' : 'failed') : 'off'}
                    </span>
                  </span>
                );
              })}
            </span>
            <span className="hc-restarts">
              {restarts > 0 ? <em>restarts: {restarts}</em> : <span>no restarts</span>}
              {hung && <em className="hc-hung"> · handler hung</em>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function ServiceLine({ run, shown }: { run: Run; shown: number }) {
  const n = inRotation(run, shown);
  return (
    <p className="hc-service">
      Service: <b>{n}</b> of {PODS} pods in rotation
    </p>
  );
}

/** The shared database: its state, and the connections tried this second (a pulse each time something connects). */
export function DbCard({ run, shown }: { run: Run; shown: number }) {
  const second = shown > 0 ? run.seconds[shown - 1] : null;
  const total = run.seconds.slice(0, shown).reduce((n, s) => n + s.dbAttempts, 0);
  return (
    <div className={`hc-db ${second && !second.dbUp ? 'is-down' : ''}`}>
      <b>Database</b>
      <span>{second === null ? 'up' : second.dbUp ? 'up' : 'unreachable'}</span>
      <span key={shown} className={`hc-attempts ${second && second.dbAttempts > 0 ? 'is-pulse' : ''}`}>
        {second ? second.dbAttempts : 0} connection attempts this second
      </span>
      <span>{total} in total</span>
    </div>
  );
}
