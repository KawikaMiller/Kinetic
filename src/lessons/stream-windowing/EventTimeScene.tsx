import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { minWidthForText } from '../../core/scale';
import { crossingCount, disorderCaption } from './captions';
import { DEFAULT_DELAY, TIME_SEED, MAX_DELAY, MIN_DELAY, generate } from './events';
import { clockLabel, horizonOf, PLOT_W } from './layout';
import { PLOT_FONT } from './plotModel';
import { DisorderPlot } from './Plots';
import { disagreeing, perMinute } from './processing';

export function EventTimeScene({ picker }: { picker: ReactNode }) {
  const [maxDelay, setMaxDelay] = useState(DEFAULT_DELAY);
  const [seed, setSeed] = useState(TIME_SEED);
  const fixture = useMemo(() => generate(seed, maxDelay), [seed, maxDelay]);
  const rows = useMemo(() => perMinute(fixture.events), [fixture]);
  const wrong = disagreeing(rows);
  const horizon = horizonOf(fixture.events);
  const crossing = crossingCount(fixture.events);

  useIntroCaption(disorderCaption(fixture.events, rows, maxDelay), [fixture]);

  return (
    <StageFrame
      height={430}
      stats={
        <Stats>
          <Stat label="Cross a minute" value={crossing} color={crossing > 0 ? 'var(--bad)' : undefined} sub={`of ${fixture.events.length} clicks, on the way in`} />
          <Stat label="Minutes that disagree" value={wrong.length} color={wrong.length > 0 ? 'var(--bad)' : 'var(--ok)'} sub={`of ${rows.length}, arrival against event time`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--amber)', label: 'a click, one hue per user (A, B, C)', shape: 'dot' },
            { color: 'var(--bad)', label: 'arrives in a different minute than it happened in', shape: 'line' },
            { color: 'var(--line-2)', label: 'arrives in the same minute', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Delay bound D" value={maxDelay} min={MIN_DELAY} max={MAX_DELAY} format={(v) => `${v} s`} onChange={setMaxDelay} />
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="sw-stage stage-pad">
        <Box>
          <SectionTitle hint="a line crossing another is disorder">When it happened, and when it arrived</SectionTitle>
          <WideRegion minWidth={minWidthForText(PLOT_W, PLOT_FONT)} label="Event time and arrival timelines: scroll sideways to see all of it">
            <DisorderPlot events={fixture.events} horizon={horizon} />
          </WideRegion>
        </Box>
        <Box>
          <SectionTitle hint="count per minute, two ways">What each clock says</SectionTitle>
          <table className="data-table sw-table">
            <thead>
              <tr><th scope="col">Minute</th><th scope="col">By arrival (processing time)</th><th scope="col">By when it happened (event time)</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const differs = r.processing !== r.event;
                return (
                  <tr key={r.start}>
                    <td>{clockLabel(r.start)} to {clockLabel(r.end)}</td>
                    <td className={differs ? 'sw-wrong' : ''}>{r.processing}</td>
                    <td>{r.event}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>forty seeded clicks; each delay is drawn from an exponential-shaped tail and cut at D</Provenance>
          <Provenance kind="toy">real streams have many more events, and real delays come from networks, retries and offline phones</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
