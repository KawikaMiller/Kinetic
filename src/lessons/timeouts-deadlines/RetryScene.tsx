import { useMemo, useState, type ReactNode } from 'react';
import { GanttLanes } from '../../components/GanttLanes';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Slider } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useIntroCaption } from '../../core/caption';
import { decimal } from '../../core/format';
import { barLabelPx } from '../../core/gantt';
import { attemptBars } from './bars';
import { amplification, MAX_ATTEMPTS, runRetries, SLOW_ATTEMPT, TYPICAL_ATTEMPT, type RetryRun } from './model';

/** The caller's deadline in this scene (the user waits this long). */
const DEADLINE = 2;
const GANTT_MIN_W = 480;
/** Hops that each retry, for the amplification line: A, B and C. */
const RETRYING_HOPS = 3;
/** Every attempt in this scene lands on a slow replica. */
const SLOW_ATTEMPTS = [SLOW_ATTEMPT];
const sec = (x: number) => `${decimal(x, 1)} s`;

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--info)', label: 'attempt before the deadline' },
      { color: 'var(--bad)', label: 'attempt after the deadline' },
      { color: 'var(--orange)', label: 'retry refused: would not fit' },
    ]}
  />
);

function verdict(run: RetryRun): ReactNode {
  if (run.refused) {
    return <>A stops at {sec(run.finish)}: another attempt could not fit in the {sec(run.refused.remaining)} left, so it returns its error while the user is still there. <span className="hl orange">fails fast</span></>;
  }
  if (run.finish > DEADLINE) {
    return <>A stops at {sec(run.finish)}, {sec(run.finish - DEADLINE)} after the user left. <span className="hl bad">too late</span></>;
  }
  return <>A stops at {sec(run.finish)}, inside the deadline.</>;
}

export function RetryScene({ picker }: { picker: ReactNode }) {
  const [attemptTimeout, setAttemptTimeout] = useState(0.9);
  const naive = useMemo(() => runRetries('naive', { deadline: DEADLINE, attemptTimeout, latencies: SLOW_ATTEMPTS }), [attemptTimeout]);
  const budgeted = useMemo(() => runRetries('budgeted', { deadline: DEADLINE, attemptTimeout, latencies: SLOW_ATTEMPTS }), [attemptTimeout]);
  const horizon = Math.max(naive.finish, budgeted.finish, DEADLINE) + 0.3;

  useIntroCaption(
    <>Every attempt hits a slow replica ({sec(SLOW_ATTEMPT)}), so each one runs into its {sec(attemptTimeout)} timeout. <b>Naive</b> A retries up to {MAX_ATTEMPTS} times
      regardless and stops at {sec(naive.finish)}. <b>Budgeted</b> A asks "does another attempt fit?" first and stops at {sec(budgeted.finish)}.</>,
    [attemptTimeout],
  );

  return (
    <StageFrame
      height={380}
      legend={LEGEND}
      controls={[
        <>
          {picker}
          <Slider label="Attempt timeout" value={attemptTimeout} min={0.2} max={1.5} step={0.1} onChange={setAttemptTimeout} format={sec} />
        </>,
      ]}
    >
      <div className="stage-pad td">
        <SectionTitle weight="regular" hint={`the user waits ${sec(DEADLINE)}; a healthy attempt typically takes ${sec(TYPICAL_ATTEMPT)}`}>A calls B, up to {MAX_ATTEMPTS} attempts</SectionTitle>
        <WideRegion minWidth={GANTT_MIN_W} label="Retry timeline: scroll sideways to see all of it">
          <GanttLanes
            lanes={[{ id: 'naive', label: 'naive' }, { id: 'budgeted', label: 'budgeted' }]}
            bars={[...attemptBars(naive, DEADLINE), ...attemptBars(budgeted, DEADLINE)]}
            domain={[0, horizon]}
            markers={[{ at: DEADLINE, label: 'user gives up', tone: 'bad' }]}
            unit=" s"
            axis
            size="md"
            labelWidth={72}
            labelMinPx={barLabelPx('try 3')}
            ariaLabel="Naive and budgeted retries against a 2 second deadline"
          />
        </WideRegion>
        <table className="data-table td-retry-table">
          <thead>
            <tr><th scope="col">Strategy</th><th scope="col">Attempts</th><th scope="col">Result</th></tr>
          </thead>
          <tbody>
            {[naive, budgeted].map((r) => (
              <tr key={r.strategy}>
                <th scope="row">{r.strategy}</th>
                <td>{r.attempts.length} of {MAX_ATTEMPTS}</td>
                <td>{verdict(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="td-note">
          The budgeted rule is: retry only if the attempt's typical cost ({sec(TYPICAL_ATTEMPT)}) is at most the time left, and never let an attempt's timeout run past
          the deadline. Retries also multiply down the chain: {MAX_ATTEMPTS} attempts at each of A, B and C can mean up to <b>{amplification(MAX_ATTEMPTS, RETRYING_HOPS)}</b> calls
          on the database for one user request. Backoff and jitter live in the retry lessons; the point here is only the budget.
        </p>
        <Hint block>Simulated services; the slow replica and every latency are scripted and illustrative.</Hint>
      </div>
    </StageFrame>
  );
}
