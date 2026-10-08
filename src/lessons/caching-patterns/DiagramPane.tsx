import { useMemo, type ReactNode } from 'react';
import { SequenceDiagram } from '../../components/SequenceDiagram';
import { actorsFor, messagesOf } from './diagram';
import type { Beat, Lane, View } from './model';

/** The ladder diagram, stepping through the beats, with what each store holds underneath. */
export function DiagramPane({ lanes, labels, beats, index, start, ariaLabel, children }: {
  lanes: readonly Lane[];
  labels?: Partial<Record<Lane, string>>;
  beats: readonly Beat[];
  /** The current arrow, or -1 before the first. */
  index: number;
  start: View;
  ariaLabel: string;
  children?: ReactNode;
}) {
  const actors = useMemo(() => actorsFor(lanes, labels), [lanes, labels]);
  const messages = useMemo(() => messagesOf(beats), [beats]);
  const beat = index >= 0 ? beats[index] : null;
  return (
    <div className="cp-pane">
      <SequenceDiagram actors={actors} messages={messages} step={index} currentStyle="tone" ariaLabel={ariaLabel} />
      <StateStrip view={beat?.view ?? start} stale={beat?.stale ?? false} replica={lanes.includes('replica')} queue={lanes.includes('cache') && beats.some((b) => b.kind === 'queue')} />
      {children}
    </div>
  );
}

/** What the stores hold right now. A cache entry older than the database's is orange. */
export function StateStrip({ view, stale, replica, queue }: { view: View; stale: boolean; replica: boolean; queue: boolean }) {
  return (
    <dl className="cp-state" aria-label="What the stores hold now">
      <div className="cp-store tone-info">
        <dt>Database</dt>
        <dd>{view.db}</dd>
      </div>
      {replica && (
        <div className="cp-store tone-info is-dim">
          <dt>Replica</dt>
          <dd>{view.replica}</dd>
        </div>
      )}
      <div className={`cp-store ${stale ? 'tone-orange' : 'tone-muted'} ${view.cache === null ? 'is-empty' : ''}`}>
        <dt>Cache</dt>
        <dd>{view.cache ?? 'empty'}{stale && <span className="cp-flag">stale</span>}</dd>
      </div>
      {queue && (
        <div className={`cp-store tone-sky ${view.queued === 0 ? 'is-empty' : ''}`}>
          <dt>Queue to the database</dt>
          <dd>{view.queued === 0 ? 'empty' : `${view.queued} write${view.queued === 1 ? '' : 's'}`}</dd>
        </div>
      )}
    </dl>
  );
}
