import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { pct } from '../../core/format';
import { Crowd } from './Crowd';
import { FLAG_KEY, USER_COUNT, flickerCount, inRollout, makeUsers, randomEach, type User } from './model';

type Bucketing = 'stable' | 'random';
const DIAL_STEP = 5;

export function RolloutScene({ picker }: { picker: ReactNode }) {
  const users = useMemo(() => makeUsers(), []);
  const [deployed, setDeployed] = useState(true);
  const [dial, setDial] = useState(0);
  const [mode, setMode] = useState<Bucketing>('stable');
  const [round, setRound] = useState(1);

  const isOn = (u: User) => deployed && (mode === 'stable' ? inRollout(FLAG_KEY, u.id, dial) : randomEach(u.id, round, dial));
  const on = users.filter(isOn).length;
  const changed = mode === 'random' && deployed ? flickerCount(users, dial, round) : 0;

  useIntroCaption(
    !deployed ? (
      <>The new build is not deployed, so the flag code is not even in production: <span className="hl info">everyone sees the old checkout</span> whatever the dial says.</>
    ) : dial === 0 ? (
      <>The new build is <b>deployed</b> with the flag at 0%: the code is live in production and <span className="hl info">nobody sees it</span>. Deploying is not releasing.</>
    ) : mode === 'stable' ? (
      <>
        {on} of {USER_COUNT} users ({pct(on / USER_COUNT, 1)}) see the new checkout: the ones whose bucket, <code>hash(flag + user) mod 100</code>, is below {dial}. Move the dial and the same users stay in.
      </>
    ) : (
      <>
        Random each request, round {round}: {on} users see the new checkout this time, and <span className="hl bad">{changed} users see something different from the last round</span>. One user can get the old and the new checkout on consecutive page loads.
      </>
    ),
    [deployed, dial, mode, round, on, changed],
  );

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="New checkout" value={`${on} / ${USER_COUNT}`} color="var(--violet)" sub={pct(on / USER_COUNT, 1)}>
            <Bar value={on} max={USER_COUNT} tone="violet" marker={(dial / 100) * USER_COUNT} markLabel={`dial ${dial}%`} />
          </Stat>
          <Stat label="Changed since last request" value={changed} color={changed ? 'var(--bad)' : undefined} sub={mode === 'stable' ? 'stable hashing: always 0' : 'fresh coin flip each time'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'new checkout' },
            { color: 'var(--info)', label: 'old checkout' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Toggle label="Code deployed" value={deployed} onChange={setDeployed} off="Old build" on="New build, flag-gated" />
          <Slider label="Rollout dial" value={dial} min={0} max={100} step={DIAL_STEP} onChange={setDial} format={(v) => `${v}%`} />
          <Segmented label="Bucketing" value={mode} onChange={setMode} options={[{ value: 'stable', label: 'Stable hash of user' }, { value: 'random', label: 'Random each request' }]} />
          <Button onClick={() => setRound((r) => r + 1)}>Everyone loads another page</Button>
        </>,
      ]}
    >
      <div className="ff stage-pad">
        <Crowd users={users} isOn={isOn} />
        <Hint block>
          400 seeded users and a simulated flag service. The hashing is real: the same user and flag always hash to the same bucket, so moving the dial from 10% to 20% keeps everyone who was in.
        </Hint>
      </div>
    </StageFrame>
  );
}
