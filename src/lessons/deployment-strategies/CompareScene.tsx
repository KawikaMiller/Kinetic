import { useMemo, type ReactNode } from 'react';
import { GanttLanes } from '../../components/GanttLanes';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useIntroCaption } from '../../core/caption';
import { times } from '../../core/format';
import { HORIZON, costRatio, detectAfter, rollbackAfter, type Config, type Strategy } from './model';
import { STRATEGY_LABEL, compareAll, compareBars, compareSummary, share } from './view';

const GANTT_MIN_W = 480;
const TABLE_MIN_W = 560;

const names = (xs: Strategy[]) => xs.map((s) => STRATEGY_LABEL[s]).join(' and ');
const minutes = (n: number | null, none = '–') => (n === null ? none : `${n} min`);

export function CompareScene({ cfg, controls }: { cfg: Config; controls: ReactNode[] }) {
  const rows = useMemo(() => compareAll(cfg), [cfg]);
  const summary = useMemo(() => compareSummary(rows), [rows]);
  useIntroCaption(
    <>
      The same bug, schema, traffic sample and settings, run through all four strategies: <span className="hl ok">{names(summary.fewest)}</span> hit the fewest users (about {summary.fewestHit}),{' '}
      <span className="hl bad">{names(summary.most)}</span> the most (about {summary.mostHit}) over {HORIZON} minutes.
    </>,
    [summary],
  );
  return (
    <StageFrame
      height={420}
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'servers starting, nobody on v2 yet' },
            { color: 'var(--violet)', label: 'users on v2' },
            { color: 'var(--orange)', label: 'rolling back' },
          ]}
        />
      }
      controls={controls}
    >
      <div className="ds stage-pad">
        <WideRegion minWidth={GANTT_MIN_W} label="Timeline of the four strategies: scroll sideways to see all of it">
          <GanttLanes
            lanes={rows.map((r) => ({ id: r.strategy, label: STRATEGY_LABEL[r.strategy] }))}
            bars={rows.flatMap(compareBars)}
            domain={[0, HORIZON]}
            axis
            unit=" min"
            size="md"
            labelWidth={92}
            ariaLabel="When each strategy had servers starting, users on v2 and a rollback"
          />
        </WideRegion>
        <WideRegion minWidth={TABLE_MIN_W} label="Comparison table: scroll sideways to see all of it" hint="swipe to see the whole table">
          <table className="data-table ds-table">
            <thead>
              <tr>
                <th>Strategy</th>
                <th>Most users on v2</th>
                <th>Users hit (expected · this sample)</th>
                <th>Detected after</th>
                <th>Rolled back after</th>
                <th>Most servers</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ strategy, run }) => (
                <tr key={strategy}>
                  <td>{STRATEGY_LABEL[strategy]}</td>
                  <td>{share(run.peakExposure)}</td>
                  <td>
                    {Math.round(run.expectedHit)} · {run.sampledHit}
                  </td>
                  <td>{run.trigger ? minutes(detectAfter(run), 'at once') : 'never'}</td>
                  <td>{run.trigger?.blocked ? 'blocked' : minutes(rollbackAfter(run))}</td>
                  <td>
                    {run.peakPods} ({times(costRatio(run))})
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </WideRegion>
        <Hint block>
          Simulated fleet and traffic over {HORIZON} minutes. Rolling uses its own maxSurge and maxUnavailable and the canary its bake time and analysis setting; every number comes from the run, and error rates and
          timings are illustrative. &quot;Never&quot; means neither the alert nor the canary analysis fired, not that nobody was hurt.
        </Hint>
      </div>
    </StageFrame>
  );
}
