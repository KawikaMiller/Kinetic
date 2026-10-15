import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Curve, Plot2D, Points } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Button, ClaimLabel, Hint, Legend, Provenance, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { pct } from '../../core/format';
import { billCaption } from './captions';
import { CURVE_SIZES, GRAPH_SEEDS, PACKAGE_CI_MINUTES, SIZE_MAX, SIZE_MIN, SIZE_STEP, bill, minutesFor, nextSeed } from './bill';

const OPENING_SIZE = 100;
const PLOT_HEIGHT = 240;

export function BillScene({ picker }: { picker: ReactNode }) {
  const [size, setSize] = useState(OPENING_SIZE);
  const [detection, setDetection] = useState(true);
  const [seed, setSeed] = useState<number>(GRAPH_SEEDS[0]);
  const setCaption = useSetCaption();
  const b = useMemo(() => bill(size, seed), [size, seed]);
  const curves = useMemo(() => CURVE_SIZES.map((n) => bill(n, seed)), [seed]);
  const yMax = Math.ceil((SIZE_MAX * PACKAGE_CI_MINUTES) / 200) * 200;

  useEffect(() => {
    setCaption(billCaption(b, detection, seed), { quiet: true });
  }, [setCaption, b, detection, seed]);

  const minutes = minutesFor(b, detection);
  return (
    <StageFrame
      height={480}
      stats={
        <Stats>
          <Stat label="Affected by a change" value={b.meanAffected.toFixed(1)} sub={[`of ${b.size} packages`, `${pct(b.affectedFraction)} on average`]} color="var(--orange)" />
          <Stat label="CI minutes a change" value={minutes.toFixed(1)} sub={detection ? 'affected set only' : 'every package'} color={detection ? 'var(--ok)' : 'var(--bad)'} />
          <Stat label="Without detection" value={b.withoutDetection} sub={`${b.size} × ${PACKAGE_CI_MINUTES} minutes`} color="var(--bad)" />
          <Stat label="With detection" value={b.withDetection.toFixed(1)} sub={`${b.meanAffected.toFixed(1)} × ${PACKAGE_CI_MINUTES} minutes`} color="var(--ok)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'with affected-set detection (the cheaper side)', shape: 'line' },
            { color: 'var(--bad)', label: 'without it (the costly side)', shape: 'line' },
            { color: 'var(--hi)', label: 'your size and setting', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Packages in the repository" value={size} min={SIZE_MIN} max={SIZE_MAX} step={SIZE_STEP} onChange={setSize} />
          <Toggle label="Affected-set detection" value={detection} onChange={setDetection} off="Off" on="On" />
          <Button onClick={() => setSeed(nextSeed(seed))}>Next graph ({seed})</Button>
        </>,
      ]}
    >
      <div className="mp stage-pad">
        <div className="mp-plot">
          <Plot2D
            x={{ domain: [0, SIZE_MAX], label: 'packages in the repository', ticks: 5 }}
            y={{ domain: [0, yMax], label: 'CI minutes per change' }}
            height={PLOT_HEIGHT}
            ariaLabel="CI minutes per change against repository size, with and without affected-set detection"
          >
            <Curve points={curves.map((c): [number, number] => [c.size, c.withoutDetection])} tone="bad" width={3} />
            <Curve points={curves.map((c): [number, number] => [c.size, c.withDetection])} tone="ok" width={3} />
            <Points data={[{ x: b.size, y: minutes, tone: 'hi' }]} r={6} />
          </Plot2D>
        </div>
        <p className="mp-note">
          A monorepo without good tooling is the expensive option: every change builds everything. The tooling that finds the affected set is what makes the atomic change affordable, and building and keeping it is a cost of its own.
        </p>
        <div className="mp-notes">
          <Provenance kind="simulated" seed={seed}>a seeded random dependency graph, about 2 dependencies per package</Provenance>
          <Provenance kind="illustrative">{PACKAGE_CI_MINUTES} minutes of CI per package is made up</Provenance>
          <ClaimLabel kind="practice">tools that build only the packages a change can reach are widely used in monorepos</ClaimLabel>
          <Hint block>Each point averages every package in turn being the one that changed. A real repository&apos;s graph is not this shape, so the affected fraction here says nothing about yours.</Hint>
        </div>
      </div>
    </StageFrame>
  );
}
