import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, HLine, Plot2D } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { exactCaption, f2, pctOf } from './captions';
import { toPoints } from './curves';
import { learnSettings } from './facts';
import { greedyPolicy, liveStates, valueIteration } from './mdp';
import { gapTarget, greedyReturn, maxGap, train } from './qlearn';
import { RlGrid } from './RlGrid';
import { WORLD_LEGEND } from './worldLegend';
import { WorldStrip } from './WorldStrip';
import { PINNED_RL_SEEDS } from './pinned';
import { EXACT_DEFAULT, EXACT_MAX, LEARN_DEFAULT } from './settings';
import { START_STATE, type World } from './world';

const EPISODE_STEP = 250;

export function ExactScene({ picker, world, setWorld }: { picker: ReactNode; world: World; setWorld: (w: World) => void }) {
  const [computed, setComputed] = useState(false);
  const [episodes, setEpisodes] = useState<number>(EXACT_DEFAULT.episodes);
  const result = useRef<HTMLDivElement>(null);
  const solved = useMemo(() => valueIteration(world, LEARN_DEFAULT.gamma), [world]);
  const target = useMemo(() => gapTarget(world, solved), [world, solved]);
  const training = useMemo(() => train(world, learnSettings(), episodes, target), [world, target, episodes]);
  const early = useMemo(() => train(world, learnSettings(), 100, target), [world, target]);
  const gapAll = maxGap(training.Q, solved.V, liveStates(world));
  const gapNow = training.gap.at(-1) ?? 0;
  const gapEarly = early.gap.at(-1) ?? 0;
  const greedy = useMemo(() => greedyReturn(world, LEARN_DEFAULT.gamma, training.Q), [world, training]);
  const caption = exactCaption(computed, solved, episodes, gapNow, gapEarly, target.states.length);

  return (
    <StageFrame
      height={470}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Largest gap to Q*" value={computed ? f2(gapNow) : '–'} color="var(--info)" sub={computed ? [`on the ${target.states.length} cells the best policy visits`, `${f2(gapAll)} over all cells: cells off the best route are visited rarely and learn little`] : 'compute the optimal values first'} />
          <Stat label="Greedy return" value={f2(greedy)} color="var(--violet)" sub="Q-learning's policy, from the start" />
          <Stat label="Optimal return" value={computed ? f2(solved.V[START_STATE]) : '–'} color="var(--ok)" sub={computed ? `value iteration, ${solved.iterations} sweeps` : 'needs the model'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'greener: higher value', shape: 'square' },
            { color: 'var(--violet)', label: 'greedy policy arrows', shape: 'square' },
            { color: 'var(--info)', label: 'gap to the optimal values', shape: 'line' },
            ...WORLD_LEGEND,
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Button variant="primary" onClick={() => { setComputed(true); result.current?.focus(); }}>Compute the optimal values</Button>
          <Button softDisabled={!computed} onClick={() => { setComputed(false); result.current?.focus(); }}>Hide them</Button>
        </>,
        <Slider key="episodes" label="Q-learning episodes" value={episodes} min={0} max={EXACT_MAX} step={EPISODE_STEP} onChange={setEpisodes} format={(v) => v.toLocaleString('en-US')} />,
      ]}
    >
      <div className="rl-stage stage-pad">
        <WorldStrip world={world} setWorld={setWorld} />
        <div ref={result} tabIndex={-1} className="rl-pair" aria-label="Learned and exact values">
          <Box>
            <SectionTitle hint={`learned from ${episodes.toLocaleString('en-US')} episodes`}>Q-learning</SectionTitle>
            <RlGrid view={{ world, values: training.Q.map((row) => Math.max(...row)), policy: episodes > 0 ? greedyPolicy(training.Q) : undefined, decided: training.Q.map((row) => row.some((v) => v !== 0)) }} ariaLabel="Q-learning's values and policy" />
          </Box>
          {computed && (
            <Box>
              <SectionTitle hint="from the known transition probabilities">Value iteration</SectionTitle>
              <RlGrid view={{ world, values: solved.V, policy: greedyPolicy(solved.Q) }} ariaLabel="Value iteration's optimal values and policy" />
            </Box>
          )}
        </div>
        {computed && (
          <Box>
            <SectionTitle hint="largest difference between the two value tables">Q-learning closes in on the exact answer</SectionTitle>
            <div className="rl-plot">
              <Plot2D x={{ domain: [1, Math.max(10, episodes)], label: 'episode' }} y={{ domain: [0, Math.max(0.5, gapEarly, ...training.gap)], label: 'gap' }} width={356} height={180} ariaLabel="Largest gap to the optimal values per episode">
                <HLine at={0} tone="ok" label="optimal" />
                <Curve points={toPoints(training.gap)} tone="info" />
              </Plot2D>
            </div>
          </Box>
        )}
        <Hint tone="muted" block>Value iteration needs the model (every transition probability and reward) and sweeps the whole table; Q-learning learns from experience and never sees the model. Q-learning here uses epsilon from 1.0 decaying, alpha 0.3, gamma 0.97.</Hint>
        <Hint tone="muted" block>
          The two grids can show different arrows: off the best route, and between moves of almost equal value, Q-learning has little evidence and either choice costs about the same. What matches is the return. Measured on {PINNED_RL_SEEDS.seeds} seeds in the default world at {PINNED_RL_SEEDS.episodes.toLocaleString('en-US')} episodes: {pctOf(PINNED_RL_SEEDS.nearOptimal / PINNED_RL_SEEDS.seeds)} reached a policy worth within 0.02 of the best, and {pctOf(PINNED_RL_SEEDS.sameOnRoute / PINNED_RL_SEEDS.seeds)} chose the best move in all {PINNED_RL_SEEDS.routeCells} cells the best route can visit. The seed shown here is one of them, not a promise.
        </Hint>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={LEARN_DEFAULT.seed}>seeded Q-learning, checked against exact value iteration</Provenance>
          <Provenance kind="toy">a tabular toy: the exact answer exists only because the world is tiny and known</Provenance>
          <Provenance kind="from-memory">value iteration and the Bellman equation are defined from memory: verify against Sutton and Barto</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
