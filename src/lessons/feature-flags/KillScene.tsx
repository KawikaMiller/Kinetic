import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Curve, Plot2D, VLine } from '../../components/Plot2D';
import { Hint, Legend, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { pct } from '../../core/format';
import { Crowd } from './Crowd';
import { FLAG_REFRESH_SECONDS, PIPELINE_SECONDS, REPLACE_SECONDS, makeUsers, shareStillOn, stillOn, type Remedy, type User } from './model';

const MAX_SECONDS = 12 * 60;
const STEP_SECONDS = 5;
const CURVE_STEP = 10;
const PLOT_W = 356;
const PLOT_H = 200;

/** The share of users still on the new UI every CURVE_STEP seconds, as plot points (minutes, percent). */
const curve = (users: readonly User[], r: Remedy) => Array.from({ length: MAX_SECONDS / CURVE_STEP + 1 }, (_, i) => [(i * CURVE_STEP) / 60, shareStillOn(users, r, i * CURVE_STEP) * 100] as [number, number]);

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function KillScene({ picker }: { picker: ReactNode }) {
  const users = useMemo(() => makeUsers(), []);
  const [t, setT] = useState(0);
  const [remedy, setRemedy] = useState<Remedy>('kill');
  const kill = useMemo(() => curve(users, 'kill'), [users]);
  const rollback = useMemo(() => curve(users, 'rollback'), [users]);
  const killNow = shareStillOn(users, 'kill', t);
  const rollNow = shareStillOn(users, 'rollback', t);

  useIntroCaption(
    t === 0 ? (
      <>
        The new checkout is broken for everyone at minute 0:00. <span className="hl violet">Kill switch</span>: flip the flag and in this model every client picks it up within {FLAG_REFRESH_SECONDS} seconds.{' '}
        <span className="hl orange">Roll back the deploy</span>: wait for the pipeline, then replace the servers. Drag the clock.
      </>
    ) : (
      <>
        At {clock(t)}: <span className="hl violet">{pct(killNow, 0)}</span> of users still see the broken checkout after a kill switch, and <span className="hl orange">{pct(rollNow, 0)}</span> after a rollback.
      </>
    ),
    [t, killNow, rollNow],
  );

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label={`After ${clock(t)}: kill switch`} value={pct(killNow, 0)} color="var(--violet)" sub="still on the broken UI" />
          <Stat label={`After ${clock(t)}: rollback`} value={pct(rollNow, 0)} color="var(--orange)" sub="still on the broken UI" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'still on the new checkout' },
            { color: 'var(--info)', label: 'back on the old checkout' },
            { color: 'var(--violet)', label: 'kill switch curve', shape: 'line' },
            { color: 'var(--orange)', label: 'rollback curve', shape: 'line' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Slider label="Time since the incident" value={t} min={0} max={MAX_SECONDS} step={STEP_SECONDS} onChange={setT} format={clock} />
          <Segmented label="Crowd shows" value={remedy} onChange={setRemedy} options={[{ value: 'kill', label: 'Kill switch' }, { value: 'rollback', label: 'Rollback' }]} />
        </>,
      ]}
    >
      <div className="ff stage-pad">
        <div className="ff-row">
          <Plot2D x={{ domain: [0, MAX_SECONDS / 60], label: 'minutes since the incident' }} y={{ domain: [0, 100], label: '% still on new UI' }} width={PLOT_W} height={PLOT_H} ariaLabel="Share of users still on the broken checkout over time, for the kill switch and for a rollback">
            <Curve points={kill} tone="violet" />
            <Curve points={rollback} tone="orange" />
            <VLine at={t / 60} />
          </Plot2D>
          <Crowd users={users} isOn={(u) => stillOn(remedy, u.id, t)} />
        </div>
        <Hint block>
          Simulated: a flag client refreshes within {FLAG_REFRESH_SECONDS} s; the rollback spends {PIPELINE_SECONDS / 60} min in a pipeline, then replaces servers over {REPLACE_SECONDS / 60} min. Every timing is illustrative: your
          flag service and pipeline will differ, and a kill switch only works if the risky code sits behind a flag.
        </Hint>
      </div>
    </StageFrame>
  );
}
