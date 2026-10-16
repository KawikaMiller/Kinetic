import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Bars, Curve, Plot2D, Points } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, Toggle } from '../../components/ui';
import { loopCaption } from './captions';
import { FILM_TITLES, ITEMS, USERS } from './data';
import { DATA } from './facts';
import { EXPLORATION, LIKE_AT, ROUNDS, SLATE, mostShown, ratingRank, simulateLoop } from './loop';
import { LOOP_DEFAULT } from './settings';

export function LoopScene({ picker }: { picker: ReactNode }) {
  const [exploration, setExploration] = useState<boolean>(LOOP_DEFAULT.exploration);
  const [seed, setSeed] = useState<number>(LOOP_DEFAULT.seed);
  const shown = useMemo(() => simulateLoop(DATA.truth, seed, exploration ? EXPLORATION : 0), [seed, exploration]);
  const noFeedback = useMemo(() => simulateLoop(DATA.truth, seed, exploration ? EXPLORATION : 0, 'everyone'), [seed, exploration]);
  const top = mostShown(shown.exposure);
  const topFree = mostShown(noFeedback.exposure);
  const caption = loopCaption({ exploration, gini: shown.giniByRound.at(-1)!, giniFree: noFeedback.giniByRound.at(-1)!, top, rank: ratingRank(DATA.truth, top), topFree, rankFree: ratingRank(DATA.truth, topFree), rounds: ROUNDS });
  const line = (run: typeof shown) => run.giniByRound.map((g, r) => [r + 1, g] as [number, number]);

  return (
    <StageFrame
      height={430}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Exposure Gini" value={shown.giniByRound.at(-1)!.toFixed(2)} color="var(--bad)" sub={[`no feedback, same rule: ${noFeedback.giniByRound.at(-1)!.toFixed(2)}`, '0 is equal, higher is more concentrated']} />
          <Stat label="Most shown film" value={FILM_TITLES[top]} sub={[`rank ${ratingRank(DATA.truth, top)} of ${ITEMS} by true mean rating`, `no feedback: ${FILM_TITLES[topFree]}, rank ${ratingRank(DATA.truth, topFree)}`]} />
          <Stat label="Impressions" value={ROUNDS * USERS * SLATE} sub={`${ROUNDS} rounds x ${USERS} users x ${SLATE}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'the loop: learns only from films it showed', shape: 'line' },
            { color: 'var(--violet)', label: 'no feedback: same rule, sees the true likes of every user', shape: 'line' },
            { color: 'var(--info)', label: 'impressions per film in the loop; violet dots: with no feedback', shape: 'square' },
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
          <SectionTitle hint="films are drawn in proportion to 1 + likes so far">Feedback changes who wins, not only how much</SectionTitle>
          <div className="rec-plot">
            <Plot2D x={{ domain: [1, ROUNDS], label: 'round' }} y={{ domain: [0, 1], label: 'exposure Gini' }} width={356} height={180} ariaLabel="Exposure Gini by round, with feedback and without">
              <Curve points={line(shown)} tone="bad" />
              <Curve points={line(noFeedback)} tone="violet" dashed />
            </Plot2D>
          </div>
          <div className="rec-plot">
            <Plot2D x={{ domain: [0.5, ITEMS + 0.5], label: 'film' }} y={{ domain: [0, ROUNDS * USERS], label: 'impressions' }} width={356} height={180} ariaLabel="Impressions per film">
              <Bars bars={shown.exposure.map((count, i) => ({ x0: i + 0.6, x1: i + 1.4, y: count }))} tone="info" />
              <Points data={noFeedback.exposure.map((count, i) => ({ x: i + 1, y: count, tone: 'violet' as const, r: 3 }))} />
            </Plot2D>
          </div>
          <Hint tone="muted" block>Both runs draw films by the same rule. The loop learns only from the films it showed, so a film nobody was shown cannot collect likes; the dashed run is told every user's true like each round. Films are numbered in catalogue order, F1 to F{ITEMS}.</Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>seeded 50-round simulation: users like a shown film when their hidden true rating is {LIKE_AT} or more</Provenance>
          <Provenance kind="toy">one popularity rule, no personalisation; a real recommender also learns from clicks and watch time</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
