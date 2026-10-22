import { useMemo, useState, type ReactNode } from 'react';
import { Curve, HLine, Plot2D, Points, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { ClaimLabel, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { sig } from '../../core/format';
import { BROOKS_RANGES, MAX_PEOPLE, readBrooks, type BrooksParams } from './brooks';
import { brooksCaption } from './captions';
import { OPENING } from './opening';

const PLOT_WIDTH = 520;

/** Scene 4: adding people to a late task, a toy with invented parameters. */
export function BrooksScene({ picker }: { picker: ReactNode }) {
  const [params, setParams] = useState<BrooksParams>(OPENING.brooks.params);
  const reading = useMemo(() => readBrooks(params), [params]);
  const set = (key: keyof BrooksParams) => (v: number) => setParams((p) => ({ ...p, [key]: v }));
  const top = Math.max(...reading.days) * 1.1;
  const points = reading.days.map((d, i) => [i + 1, d] as [number, number]);

  return (
    <StageFrame
      height={560}
      intro={brooksCaption(params, reading)}
      introKey={[params.work, params.serial, params.ramp, params.pairCost]}
      stats={
        <Stats>
          <Stat label="One person" value={`${sig(reading.days[0], 3)} days`} />
          <Stat label="Earliest finish" value={`${sig(reading.days[reading.best - 1], 3)} days`} color="var(--ok)" sub={`with ${reading.best} ${reading.best === 1 ? 'person' : 'people'}`} />
          <Stat label="Later than one person from" value={reading.laterAt === null ? 'never' : `${reading.laterAt} people`} color={reading.laterAt === null ? undefined : 'var(--bad)'} sub={`within ${MAX_PEOPLE} people`} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--info)', label: 'days to finish with n people', shape: 'line' }, { color: 'var(--ok)', label: 'the earliest finish', shape: 'line' }, { color: 'var(--dim)', label: 'one person (the date without help)', shape: 'line' }]} />}
      controls={[
        <>
          {picker}
          <Slider label="Work left (days)" value={params.work} {...BROOKS_RANGES.work} onChange={set('work')} />
          <Slider label="Cannot be split" value={params.serial} {...BROOKS_RANGES.serial} format={(v) => `${Math.round(v * 100)}%`} onChange={set('serial')} />
        </>,
        <>
          <Slider label="Ramp-up per newcomer (days)" value={params.ramp} {...BROOKS_RANGES.ramp} format={(v) => v.toFixed(1)} onChange={set('ramp')} />
          <Slider label="Cost per pair of people (days)" value={params.pairCost} {...BROOKS_RANGES.pairCost} format={(v) => v.toFixed(2)} onChange={set('pairCost')} />
        </>,
      ]}
    >
      <div className="pp-stage stage-pad">
        <WideRegion minWidth={PLOT_WIDTH} label="Days to finish by team size: scroll sideways to see all of it">
        <Plot2D
          x={{ domain: [1, MAX_PEOPLE], ticks: 9, label: 'people on the task' }}
          y={{ domain: [0, top], label: 'days to finish', ticks: 5 }}
          width={PLOT_WIDTH}
          height={280}
          ariaLabel={`Days to finish by team size: ${reading.days.map((d, i) => `${i + 1} people ${sig(d, 3)}`).join(', ')}`}
        >
          <HLine at={reading.days[0]} tone="dim" label="one person" />
          <VLine at={reading.best} tone="ok" label="earliest" />
          <Curve points={points} tone="info" />
          <Points data={points.map(([x, y]) => ({ x, y, tone: x === reading.best ? 'ok' : 'info' }))} r={4} />
        </Plot2D>
        </WideRegion>
        <ProvenanceRow>
          <ClaimLabel kind="view">Brooks (1975, The Mythical Man-Month) wrote that adding people to a late software project makes it later: a rule of thumb, from memory, not a law</ClaimLabel>
          <Provenance kind="invented">a toy with made-up parameters: ramp-up, pair cost and the unsplittable share are sliders, not measurements</Provenance>
          <ClaimLabel kind="standard">the unsplittable share limits the speed-up as in Amdahl&apos;s law</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
