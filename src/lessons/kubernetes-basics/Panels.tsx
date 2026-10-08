import { SectionTitle } from '../../components/Panel';
import { Hint } from '../../components/ui';
import type { Cluster, TickReport } from './model';
import { rolloutNote } from './narrate';
import type { LogEntry } from './sim';
import { unscheduled } from './view';

const LOG_SHOWN = 7;

/** The loop's last round: observe, diff, act. The act is the thing being done, so it takes --hi unless there was nothing to do. */
export function ReconcileStrip({ report }: { report: TickReport | null }) {
  const idle = !report || report.act === 'nothing to do';
  return (
    <div className="k8s-loop" role="group" aria-label="Reconcile loop">
      <span className="k8s-loop-title">Reconcile loop{report ? ` · tick ${report.tick}` : ''}</span>
      <span className="k8s-step">
        <b>observe</b>
        {report?.observe ?? 'waiting for the first tick'}
      </span>
      <span className="k8s-arrow" aria-hidden="true">
        →
      </span>
      <span className="k8s-step">
        <b>diff</b>
        {report?.diff ?? '–'}
      </span>
      <span className="k8s-arrow" aria-hidden="true">
        →
      </span>
      <span className={`k8s-step ${idle ? '' : 'is-act'}`}>
        <b>act</b>
        {report?.act ?? '–'}
      </span>
    </div>
  );
}

/** The rolling-update allowance (maxSurge, maxUnavailable) in plain numbers, shown only while two ReplicaSets are live. */
export function RolloutNote({ cluster }: { cluster: Cluster }) {
  const note = rolloutNote(cluster);
  return note ? <Hint block>{note}</Hint> : null;
}

/** Pods no node has taken yet, and why. */
export function PendingList({ cluster }: { cluster: Cluster }) {
  const pending = unscheduled(cluster);
  if (pending.length === 0) return null;
  return (
    <ul className="k8s-pending" aria-label="Pending pods">
      {pending.map((p) => (
        <li key={p.id}>
          <b>{p.name}</b> Pending{p.pendingReason ? `: ${p.pendingReason}` : ': waiting for the scheduler'}
        </li>
      ))}
    </ul>
  );
}

export function EventLog({ log }: { log: readonly LogEntry[] }) {
  return (
    <div className="k8s-log" role="log" aria-label="Events">
      <SectionTitle hint="newest first">Events</SectionTitle>
      {log.length === 0 && <p className="empty-note">Nothing has happened yet.</p>}
      {[...log].reverse().slice(0, LOG_SHOWN).map((e) => (
        <div key={e.id} className={`log-row tone-${e.tone}`}>
          <b>{e.tick}</b> {e.text}
        </div>
      ))}
    </div>
  );
}
