import { useState } from 'react';
import { Button } from '../../components/ui';
import { integer } from '../../core/format';
import { checkSeeds, describeAction, describeCheck, SCHEDULE_DUPLICATE, SCHEDULE_LOSS, SCHEDULE_SEEDS, type CheckSummary } from './check';
import { COMMIT_RULE, SAFETY_RULES } from './safety';
import type { RaftVariant } from './sim';
import type { ClusterView } from './view';

const VARIANT_NOTE: Record<RaftVariant, string> = {
  raft: 'The real rules.',
  'commit-without-majority': 'Planted bug: a leader commits an entry once 2 servers store it, not 3 of 5.',
  'vote-without-log-check': "Planted bug: a server grants its vote without checking that the candidate's log is up to date.",
};

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** The monitor's verdict for the live run, the five properties, and the 200-schedule check on demand. */
export function SafetyPanel({ safety, variant }: { safety: ClusterView['safety']; variant: RaftVariant }) {
  const [result, setResult] = useState<CheckSummary | null>(null);
  const shown = result?.variant === variant ? result : null;
  const { violation } = safety;
  const lowest = shown?.lowest;
  const path = lowest?.violation ? lowest.actions.filter((a) => a.at <= lowest.violation!.at) : [];

  return (
    <div className="rf-safety">
      <h4>
        Safety monitor <span>{VARIANT_NOTE[variant]}</span>
      </h4>
      <p className={`rf-verdict ${violation ? 'bad' : 'ok'}`} role="status">
        {violation ? (
          <>
            <b>{violation.rule}</b> broken at {seconds(violation.at)} (event {integer(violation.event)}): {violation.message}.
          </>
        ) : (
          <>All five properties hold after each of the {integer(safety.events)} events of this run so far.</>
        )}
      </p>
      <div className="rf-check">
        <Button onClick={() => setResult(checkSeeds(variant))}>Check {SCHEDULE_SEEDS} schedules</Button>
        <span className="rf-check-faults">
          loss {SCHEDULE_LOSS * 100}%, duplication {SCHEDULE_DUPLICATE * 100}%, random crashes and partitions
        </span>
      </div>
      {shown && <p className="rf-check-result">{describeCheck(shown)}</p>}
      {lowest?.violation && (
        <details className="rf-path">
          <summary>
            Seed {lowest.seed}: the schedule up to the failure ({path.length} actions)
          </summary>
          <p>{lowest.violation.message}.</p>
          <ol>
            {path.map((a) => (
              <li key={`${a.at}-${a.kind}`}>{describeAction(a)}</li>
            ))}
          </ol>
        </details>
      )}
      <details className="rf-rules">
        <summary>This lesson's five checks (not the paper's full list), and the commit rule</summary>
        <ul>
          {SAFETY_RULES.map((r) => (
            <li key={r.rule}>
              <b>{r.rule}</b>: {r.says}
            </li>
          ))}
        </ul>
        <p>
          <b>Commit rule.</b> {COMMIT_RULE}
        </p>
      </details>
    </div>
  );
}
