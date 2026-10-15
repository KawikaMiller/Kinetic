import { useMemo, useState, type ReactNode } from 'react';
import { Curve, Plot2D, VLine } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { pctText } from '../../core/format';
import type { Tone } from '../../core/tone';
import { KNEE_SHARE, POLICIES, SIZE_RANGE, SKEW, knee, sizeCurve, type Policy } from './pool';

/** Plain categories, so the categorical tones: the policies are not good or bad. */
const POLICY_TONE: Record<Policy, Tone> = { lru: 'sky', clock: 'amber', ring: 'pink' };

export function SizeScene({ picker, seed, setSeed, skew, setSkew }: { picker: ReactNode; seed: number; setSeed: (s: number) => void; skew: number; setSkew: (s: number) => void }) {
  const [size, setSize] = useState(8);
  const curves = useMemo(() => POLICIES.map((p) => ({ ...p, points: sizeCurve(p.value, seed, skew) })), [seed, skew]);
  const lru = curves[0].points;
  const kneeSize = knee(lru);
  const at = (points: typeof lru) => points.find((p) => p.size === size)!.ratio;

  useIntroCaption(
    <>
      At {size} frames the hit ratio is {POLICIES.map((p, i) => <span key={p.value}>{i ? ', ' : ''}{p.label} {pctText(at(curves[i].points), 1)}</span>)} on this workload. LRU reaches {pctText(KNEE_SHARE, 0)} of its {SIZE_RANGE.max}-frame ratio ({pctText(lru[lru.length - 1].ratio, 1)}) at <span className="hl violet">{kneeSize} frames</span>: past that the extra frames buy little.
    </>,
    [size, seed, skew],
  );

  return (
    <StageFrame
      height={330}
      stats={
        <Stats>
          <Stat label="Pool size" value={`${size} frames`} sub="the marker on the plot" />
          <Stat label="Knee (LRU)" value={`${kneeSize} frames`} color="var(--violet)" sub={`${pctText(KNEE_SHARE, 0)} of the ${SIZE_RANGE.max}-frame hit ratio`} />
        </Stats>
      }
      legend={<Legend items={curves.map((c) => ({ color: `var(--${POLICY_TONE[c.value]})`, label: c.label, shape: 'line' as const })).concat([{ color: 'var(--violet)', label: 'knee (LRU)', shape: 'line' as const }])} />}
      controls={[
        <>
          {picker}
          <Slider label="Pool size" value={size} min={SIZE_RANGE.min} max={SIZE_RANGE.max} onChange={setSize} format={(v) => `${v} frames`} />
        </>,
        <>
          <SeedField seed={seed} onSeed={setSeed} />
          <Slider label="Skew" value={skew} min={SKEW.min} max={SKEW.max} step={0.1} onChange={setSkew} format={(v) => v.toFixed(1)} />
        </>,
      ]}
    >
      <div className="bp-stage stage-pad">
        <Plot2D x={{ domain: [SIZE_RANGE.min, SIZE_RANGE.max], label: 'pool size (frames)', ticks: 7 }} y={{ domain: [0, 1], label: 'hit ratio' }} width={356} height={250} ariaLabel="Hit ratio against pool size for each policy">
          {curves.map((c) => <Curve key={c.value} points={c.points.map((p) => [p.size, p.ratio] as [number, number])} tone={POLICY_TONE[c.value]} />)}
          <VLine at={kneeSize} tone="violet" dashed />
          <VLine at={size} tone="hi" />
        </Plot2D>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>each point runs 2,000 seeded requests at that pool size</Provenance>
          <Provenance kind="toy">a teaching model of the buffer pool, 24 pages of disk</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
