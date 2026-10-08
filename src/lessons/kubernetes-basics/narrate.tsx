import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { maxSurge, maxUnavailable, type Cluster, type TickReport } from './model';
import { liveSets } from './view';

/** The caption for one tick: the ReplicaSet loop's observe, diff and act, then the most notable side effect. */
export function tickCaption(r: TickReport, lead?: string | null): ReactNode {
  const idle = r.act === 'nothing to do';
  return (
    <>
      {lead ? <>{lead} </> : null}
      <b>Observe</b>: {r.observe}. <b>Diff</b>: {r.diff}. <b>Act</b>: {idle ? r.act : <span className="hl">{r.act}</span>}.{r.notes[0] ? <> {r.notes[0]}</> : null}
    </>
  );
}

export function rolloutNote(c: Cluster): ReactNode {
  const r = c.deployment.replicas;
  const sets = liveSets(c);
  if (sets.length < 2) return null;
  return (
    <>
      Rolling update: at most {plural(maxSurge(r), 'extra pod')} above {r} and at most {maxUnavailable(r)} below {r} Ready at any moment.
    </>
  );
}
