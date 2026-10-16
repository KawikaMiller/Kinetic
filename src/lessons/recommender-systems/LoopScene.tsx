import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Bars, Curve, Plot2D } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Stat, Stats, Toggle } from '../../components/ui';
import { loopCaption } from './captions';
import { ITEMS, USERS } from './data';
import { DATA } from './facts';
import { EXPLORATION, ROUNDS, SLATE, simulateLoop, topShare } from './loop';
import { LOOP_DEFAULT } from './settings';

export function LoopScene({ picker }: { picker: ReactNode }) {
  const [exploration, setExploration] = useState<boolean>(LOOP_DEFAULT.exploration);
  const [seed, setSeed] = useState<number>(LOOP_DEFAULT.seed);
  const off = useMemo(() => simulateLoop(DATA.truth, seed, 0), [seed]);
  const on = useMemo(() => simulateLoop(DATA.truth, seed, EXPLORATION), [seed]);
  const shown = exploration ? on : off;
  const other = exploration ? off : on;
  const caption = loopCaption(exploration, shown.giniByRound.at(-1)!, other.giniByRound.at(-1)!, topShare(shown.exposure), ROUNDS);
  const line = (run: typeof off) => run.giniByRound.map((g, r) => [r + 1, g] as [number, number]);

  return (
    <StageFrame
      height={430}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Exposure Gini" value={shown.giniByRound.at(-1)!.toFixed(2)} color={exploration ? 'var(--ok)' : 'var(--bad)'} sub="0 is equal, higher is more concentrated" />
          <Stat label="Top three films" value={`${Math.round(topShare(shown.exposure) * 100)}%`} sub="of all impressions" />
          <Stat label="Impressions" value={ROUNDS * USERS * SLATE} sub={`${ROUNDS} rounds x ${USERS} users x ${SLATE}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'no exploration: Gini by round', shape: 'line' },
            { color: 'var(--ok)', label: '10% random exploration', shape: 'line' },
            { color: 'var(--info)', label: 'impressions per film', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Exploration" value={exploration} onChange={setExploration} off="0%" on="10% random slots" />
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="rec-stage stage-pad">
        <Box>
          <SectionTitle hint="the system shows the films with the most likes so far">Exposure concentrates</SectionTitle>
          <div className="rec-plot">
            <Plot2D x={{ domain: [1, ROUNDS], label: 'round' }} y={{ domain: [0, 1], label: 'exposure Gini' }} width={356} height={180} ariaLabel="Exposure Gini by round, with and without exploration">
              <Curve points={line(off)} tone="bad" />
              <Curve points={line(on)} tone="ok" />
            </Plot2D>
          </div>
          <div className="rec-plot">
            <Plot2D x={{ domain: [0.5, ITEMS + 0.5], label: 'film' }} y={{ domain: [0, ROUNDS * USERS], label: 'impressions' }} width={356} height={180} ariaLabel="Impressions per film">
              <Bars bars={shown.exposure.map((count, i) => ({ x0: i + 0.6, x1: i + 1.4, y: count }))} tone="info" />
            </Plot2D>
          </div>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>seeded 50-round simulation: users rate only what they are shown, using their hidden true ratings</Provenance>
          <Provenance kind="toy">one popularity rule, no personalisation; explicit and implicit feedback are only named here</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
