import { useState, type ReactNode } from 'react';
import { Curve, HLine, Plot2D, Points, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { decimal, pct } from '../../core/format';
import { ttlCaption } from './captions';
import { TTL_GRID, ttlCurve, WORKLOAD } from './ttl';

const START_INDEX = TTL_GRID.findIndex((t) => t >= 30);
const HONEST = `Simulated workload, replayed from a seed: ${WORKLOAD.keys} keys read with a Zipf popularity, each written about every two minutes, with nothing invalidating the cache. The rates are illustrative.`;

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--ok)', label: 'reads that hit the cache' },
      { color: 'var(--orange)', label: 'reads that were stale' },
      { color: 'var(--hi)', label: 'your TTL' },
    ]}
  />
);

export function TtlScene({ picker }: { picker: ReactNode }) {
  const [index, setIndex] = useState(START_INDEX);
  const { curve } = ttlCurve();
  const at = curve[index];

  useIntroCaption(ttlCaption(at), [index]);

  return (
    <StageFrame
      height={420}
      legend={LEGEND}
      stats={
        <Stats>
          <Stat label="Hit rate" value={pct(at.hitRate, 1)} color="var(--ok)" sub="reads served by the cache" />
          <Stat label="Stale reads" value={pct(at.staleRate, 1)} color="var(--orange)" sub="older than the latest write" />
          <Stat label="Longest stale" value={`${decimal(at.maxStaleness, 1)} s`} sub={`bounded by the ${at.ttl} s TTL`} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Slider label="TTL" value={index} min={0} max={TTL_GRID.length - 1} onChange={setIndex} format={(i) => `${TTL_GRID[i]} s`} />
        </>,
      ]}
    >
      <div className="stage-pad cp">
        <Plot2D
          x={{ domain: [TTL_GRID[0], TTL_GRID.at(-1)!], log: true, label: 'TTL (seconds, log scale)' }}
          y={{ domain: [0, 1], label: 'share of reads', format: (v) => `${Math.round(v * 100)}%` }}
          ariaLabel={`Hit rate and stale reads against TTL; at ${at.ttl} seconds ${pct(at.hitRate, 1)} hit and ${pct(at.staleRate, 1)} were stale`}
        >
          <HLine at={0.5} tone="dim" />
          <Curve points={curve.map((r): [number, number] => [r.ttl, r.hitRate])} tone="ok" />
          <Curve points={curve.map((r): [number, number] => [r.ttl, r.staleRate])} tone="orange" />
          <VLine at={at.ttl} label={`${at.ttl} s`} tone="hi" dashed={false} />
          <Points data={[{ x: at.ttl, y: at.hitRate, tone: 'ok' }, { x: at.ttl, y: at.staleRate, tone: 'orange' }]} />
        </Plot2D>
        <p className="cp-note">
          A longer TTL buys hits and costs freshness: both curves rise together. TTL is the knob when nothing invalidates the key, and the backstop when something does.
          A hot key expiring under load has its own failure mode, shown in the next scene.
        </p>
        <Hint block>{HONEST}</Hint>
      </div>
    </StageFrame>
  );
}
