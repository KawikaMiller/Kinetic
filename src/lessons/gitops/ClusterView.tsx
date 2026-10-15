import { sameSpec, specText, type State } from './reconcile';

type CardTone = 'ok' | 'bad' | 'dim' | 'orange' | 'info';

/** Where a resource stands: in sync, drifted, not created yet, or an orphan git no longer has. */
function resourceTone(key: string, desired: State, live: State): CardTone {
  if (!(key in desired)) return 'orange';
  if (!(key in live)) return 'dim';
  return sameSpec(desired[key], live[key]) ? 'ok' : 'bad';
}

const STATE_WORD: Record<CardTone, string> = { ok: 'in sync', bad: 'drifted', dim: 'not created yet', orange: 'orphan', info: 'desired' };

/** Git's desired state on the left, the cluster's live state on the right, one row per resource. `acting` is the one the controller just touched. */
export function ClusterView({ desired, live, acting, paused }: { desired: State; live: State; acting: string | null; paused: boolean }) {
  const keys = [...new Set([...Object.keys(desired), ...Object.keys(live)])].sort();
  return (
    <div className="go-cluster" role="table" aria-label="Git on the left, the cluster on the right">
      <div className="go-cluster-head" role="row">
        <span role="columnheader" className="go-side tone-info">git: desired</span>
        <span role="columnheader" className="go-side">cluster: live{paused ? ' (sync paused)' : ''}</span>
      </div>
      {keys.map((key) => {
        const tone = resourceTone(key, desired, live);
        return (
          <div key={key} className="go-row" role="row">
            <span role="cell" className={`go-card tone-info ${key in desired ? '' : 'is-absent'}`}>
              <b>{key}</b>
              <span>{key in desired ? specText(desired[key]) : 'not in git'}</span>
            </span>
            <span role="cell" className={`go-card tone-${tone} ${key === acting ? 'is-acting' : ''} ${paused && tone !== 'ok' ? 'is-paused' : ''}`}>
              <b>{key}</b>
              <span>{key in live ? specText(live[key]) : 'does not exist'}</span>
              <span className="go-state">{STATE_WORD[tone]}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
