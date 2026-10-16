import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { ArrayStrip, type ArrayCellState } from '../../components/ArrayStrip';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { mapFrames, type MapFrame } from './frames';
import { InputBar } from './InputBar';
import { mapOpening } from './openings';
import { MAX_PROCESSORS, doubled, mapCost, mapSteps, showValue } from './patterns';
import { useListInput } from './useListInput';

const CELL_MAX = 56;

export function MapScene({ picker }: { picker: ReactNode }) {
  const [open] = useState(mapOpening);
  const input = useListInput({ values: open.values, op: 'plus' });
  const [p, setP] = useState(open.p);
  const values = input.values;
  const n = values.length;
  const frames = useMemo(() => mapFrames(values, p), [values, p]);
  const player = usePlayer<MapFrame>(frames, { interval: 800, autoplayOnChange: false });
  const step = player.frame.step;
  const steps = mapSteps(n, p);
  const cost = mapCost(n);
  const doneTo = Math.min(n, step * p);
  const fromNow = Math.min(n, (step - 1) * p);
  const small = n > 10;

  const inputState = (i: number): ArrayCellState => (step > 0 && i >= fromNow && i < doneTo ? 'info' : 'idle');
  const outputState = (i: number): ArrayCellState => (i >= doneTo ? 'dim' : i >= fromNow && step > 0 ? 'active' : 'idle');

  return (
    <StageFrame
      player={player}
      height={320}
      stats={
        <Stats>
          <Stat label="Steps on p processors" value={steps} color="var(--info)" sub={[`ceil(${n} / ${p}) = ${steps}`, `one processor needs ${n}`]} />
          <Stat label="Work · span" value={`${cost.work} · ${cost.span}`} sub={['operations · steps with enough processors']} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'being read this step' },
            { color: 'var(--hi)', label: 'written this step' },
            { color: 'var(--dim)', label: 'not touched yet' },
          ]}
        />
      }
      controls={[
        <Fragment key="row0">
          {picker}
          <Slider label="Processors p" value={p} min={1} max={MAX_PROCESSORS} onChange={setP} />
        </Fragment>,
        <InputBar
          key="input"
          input={input}
          presets={[
            { id: 'eight', label: 'sum of 8 (1 to 8)', on: input.text === '1, 2, 3, 4, 5, 6, 7, 8', apply: () => input.load([1, 2, 3, 4, 5, 6, 7, 8]) },
            { id: 'sixteen', label: '16 values', on: input.text === Array.from({ length: 16 }, (_, i) => i + 1).join(', '), apply: () => input.load(Array.from({ length: 16 }, (_, i) => i + 1)) },
          ]}
        />,
      ]}
    >
      <div className="pp-stage stage-pad">
        <span className="section-title">Input</span>
        <ArrayStrip values={values.map((v) => showValue(v))} cellState={inputState} showIndex fontSize={small ? 10 : 13} cellMax={CELL_MAX} />
        <span className="section-title">Doubled, every element independently</span>
        <ArrayStrip values={values.map((v, i) => (i < doneTo ? showValue(doubled(v)) : '?'))} cellState={outputState} showIndex fontSize={small ? 10 : 13} cellMax={CELL_MAX} />
        <ProvenanceRow>
          <Provenance kind="toy">steps are model steps; real hardware has p fixed by the machine and memory costs the model ignores</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
