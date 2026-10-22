import { useMemo, useState, type ReactNode } from 'react';
import { Bars, Plot2D } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { PHONE_QUERY, useMediaQuery } from '../../components/useMediaQuery';
import { ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { CELLS, CONVERGE_SQUARINGS, GLOBAL_CELL, LANDSCAPE, acceptProbability, distributionAfter, formatProbability, occupancy } from './landscape';
import { temperatureCaption } from './text';

const PHONE_WIDTH = 356;
const DESKTOP_WIDTH = 560;
const TEMPERATURES: readonly number[] = [0.5, 1, 2, 5, 50];
const DELTAS: readonly number[] = [1, 2, 3];
const RUN_STEPS = 200_000;
const DEFAULT_RUN_SEED = 11;
const BAR_SPLIT = 0.5;

const totalVariation = (a: readonly number[], b: readonly number[]) => a.reduce((s, x, i) => s + Math.abs(x - b[i]), 0) / 2;

/** Scene 3: what temperature does to the acceptance of a worse move, and to where a long run spends its time. */
export function TemperatureScene({ picker }: { picker: ReactNode }) {
  const phone = useMediaQuery(PHONE_QUERY);
  const [t, setT] = useState(2);
  const [seed, setSeed] = useState(DEFAULT_RUN_SEED);
  const exact = useMemo(() => distributionAfter(t, CONVERGE_SQUARINGS), [t]);
  const seen = useMemo(() => occupancy(seed, t, RUN_STEPS), [seed, t]);
  const distance = totalVariation(exact, seen);
  const caption = temperatureCaption(t, exact[GLOBAL_CELL], distance);
  const top = Math.max(...exact, ...seen);

  return (
    <StageFrame
      height={420}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Temperature" value={t} sub="used by the table row and the chart" />
          <Stat label="Exact P(cell 11)" value={`${(exact[GLOBAL_CELL] * 100).toFixed(2)}%`} color="var(--ok)" sub="matrix iterated to its limit" />
          <Stat label="This run's share" value={`${(seen[GLOBAL_CELL] * 100).toFixed(2)}%`} sub={`${RUN_STEPS.toLocaleString('en-US')} steps`} />
          <Stat label="Distance" value={distance.toFixed(3)} sub="total variation, exact vs run" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'exact stationary distribution', shape: 'square' },
            { color: 'var(--violet)', label: 'share of this seeded run', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Temperature T">
            {TEMPERATURES.map((v) => (
              <ChipButton key={v} on={t === v} onClick={() => setT(v)}>{v}</ChipButton>
            ))}
          </ControlGroup>
          <SeedField label="Run seed" seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="stage-pad ls-stage">
        <table className="data-table ls-table">
          <thead>
            <tr>
              <th>Worse by</th>
              {TEMPERATURES.map((v) => (
                <th key={v} className={v === t ? 'is-selected' : undefined}>T = {v}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DELTAS.map((d) => (
              <tr key={d}>
                <td>{d}</td>
                {TEMPERATURES.map((v) => (
                  <td key={v} className={v === t ? 'is-selected' : undefined}>{formatProbability(acceptProbability(d, v))}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <Plot2D
          x={{ domain: [0, CELLS], label: 'cell', ticks: 10 }}
          y={{ domain: [0, top * 1.1], label: 'probability', format: (v) => `${(v * 100).toFixed(0)}%` }}
          width={phone ? PHONE_WIDTH : DESKTOP_WIDTH}
          height={220}
          ariaLabel={`Exact stationary distribution and a seeded run's occupancy at temperature ${t}`}
        >
          <Bars bars={exact.map((p, c) => ({ x0: c, x1: c + BAR_SPLIT, y: p }))} tone="info" />
          <Bars bars={seen.map((p, c) => ({ x0: c + BAR_SPLIT, x1: c + 1, y: p }))} tone="violet" />
        </Plot2D>
        <Hint block>Cell scores are {LANDSCAPE.join(', ')}. The chain proposes the left or right neighbour with equal probability, an out-of-range proposal stays put, and a worse move is accepted with probability e^(-delta/T). At low T the run mixes slowly, so the violet bars can lag the blue ones.</Hint>
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated" seed={seed}>one seeded run of {RUN_STEPS.toLocaleString('en-US')} steps per temperature</Provenance>
        <Provenance kind="toy">a 20-cell teaching landscape: real landscapes have millions of states</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
