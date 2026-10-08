import { useEffect, useState, type ReactNode } from 'react';
import { GanttLanes } from '../../components/GanttLanes';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, PauseButton, Slider, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useSetCaption } from '../../core/caption';
import { humanDuration } from '../../core/format';
import { useInterval } from '../../core/useInterval';
import { credCaption } from './captions';
import { DEFAULT_ROTATION_MIN, DOMAIN_MINUTES, ROLE_MINUTES, exposures, laneBars } from './credentials';

const TICK_MS = 500;
const DEFAULT_LEAK = 5;
const ROTATIONS = { min: 5, max: 30, step: 5 };
const LANES = [
  { id: 'key', label: 'access key' },
  { id: 'role', label: 'role' },
  { id: 'vault', label: 'vault' },
];
const TONE = { info: 'info', bad: 'bad', dim: 'muted' } as const;
const MIN_WIDTH = 540;

const minutes = (m: number) => humanDuration(m * 60);

export function CredScene({ picker }: { picker: ReactNode }) {
  const [leakAt, setLeakAt] = useState(DEFAULT_LEAK);
  const [rotation, setRotation] = useState(DEFAULT_ROTATION_MIN);
  const [now, setNow] = useState(0);
  const [paused, setPaused] = useState(false);
  const setCaption = useSetCaption();
  useInterval(() => setNow((n) => Math.min(n + 1, DOMAIN_MINUTES)), TICK_MS, !paused && now < DOMAIN_MINUTES);
  useEffect(() => {
    setCaption(credCaption(leakAt, rotation, now), { quiet: true });
  }, [leakAt, rotation, now, setCaption]);

  const e = exposures(leakAt, rotation);
  const leaked = now >= leakAt;
  const bars = laneBars(leakAt, rotation, now);

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="Leaked access key works for" value={leaked ? minutes(e.key) : '…'} color={leaked ? 'var(--bad)' : undefined} sub="until someone rotates it (illustrative: a year)" />
          <Stat label={`Leaked ${ROLE_MINUTES}-minute role`} value={leaked ? minutes(e.role) : '…'} color={leaked ? 'var(--ok)' : undefined} sub="time left in the session it was copied from" />
          <Stat label="Leaked vault credential" value={leaked ? minutes(e.vault) : '…'} color={leaked ? 'var(--ok)' : undefined} sub={`rotates every ${rotation} min`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'credential in normal use' },
            { color: 'var(--orange)', label: 'the copy to the laptop' },
            { color: 'var(--bad)', label: 'leaked copy still works' },
            { color: 'var(--muted)', label: 'leaked copy expired' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Slider label="Copied to a laptop at minute" value={leakAt} min={1} max={DOMAIN_MINUTES - 5} onChange={setLeakAt} />
          <Slider label="Vault rotates every" value={rotation} min={ROTATIONS.min} max={ROTATIONS.max} step={ROTATIONS.step} onChange={setRotation} format={(v) => `${v} min`} />
          <PauseButton paused={paused} onToggle={() => setPaused(!paused)} />
          <Button onClick={() => { setNow(0); setPaused(false); }}>Restart the clock</Button>
        </>,
      ]}
    >
      <div className="stage-pad iam">
        <WideRegion minWidth={MIN_WIDTH} label="Credential timeline: scroll sideways to see all of it">
          <GanttLanes
            lanes={LANES}
            bars={bars.map((b) => ({ id: b.id, lane: b.lane, start: b.start, end: b.end, tone: TONE[b.tone], label: b.label, kind: b.tone === 'dim' ? ('blocked' as const) : undefined }))}
            domain={[0, DOMAIN_MINUTES]}
            now={now}
            markers={[{ at: leakAt, label: 'copied to laptop', tone: 'orange' }]}
            unit=" min"
            axis
            size="md"
            labelWidth={84}
            ariaLabel={`Three credentials over ${DOMAIN_MINUTES} minutes; a copy is made at minute ${leakAt}`}
          />
        </WideRegion>
        <p className="iam-risk">
          A copied access key works for as long as the key does. A role or vault credential is useless to whoever copied it once it expires, so the same leak costs minutes, not months.
        </p>
        <Hint block>
          Simulated cloud account. Two simulated minutes pass each second. Lifetimes are illustrative, and the access key&apos;s bar is not to scale: it keeps going far past this clock.
        </Hint>
      </div>
    </StageFrame>
  );
}
