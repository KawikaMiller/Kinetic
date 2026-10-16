import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, Plot2D } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { exploreCaption, f2, pctOf } from './captions';
import { smooth, toPoints } from './curves';
import { greedyPolicy } from './mdp';
import { PRESETS, PRESET_IDS, runPreset, type PresetId } from './presets';
import { RlGrid } from './RlGrid';
import { WORLD_LEGEND } from './worldLegend';
import { WorldStrip } from './WorldStrip';
import { EXPLORE_DEFAULT, SMOOTH_WINDOW } from './settings';
import type { World } from './world';

export function ExploreScene({ picker, world, setWorld }: { picker: ReactNode; world: World; setWorld: (w: World) => void }) {
  const [id, setId] = useState<PresetId>(EXPLORE_DEFAULT.preset);
  const run = useMemo(() => runPreset(world, id), [world, id]);
  const returns = useMemo(() => smooth(run.training.returns, SMOOTH_WINDOW), [run]);
  const caption = exploreCaption(run);
  const goodRoute = run.greedy >= run.optimal - 0.02;

  return (
    <StageFrame
      height={470}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Greedy policy's return" value={f2(run.greedy)} color={goodRoute ? 'var(--ok)' : 'var(--bad)'} sub={`best possible here: ${f2(run.optimal)}`} />
          <Stat label="Last 100 episodes at the goal" value={pctOf(run.goalShare)} />
          <Stat label="Mean return, last 100" value={f2(run.training.returns.slice(-100).reduce((a, b) => a + b, 0) / Math.min(100, run.training.returns.length))} color="var(--violet)" sub="what the agent really earned while learning" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'greener: higher value', shape: 'square' },
            { color: 'var(--violet)', label: 'greedy policy arrows', shape: 'square' },
            { color: 'var(--amber)', label: 'the bonus tile of the reward edit', shape: 'square' },
            ...WORLD_LEGEND,
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Preset" inline>
            {PRESET_IDS.map((p) => <ChipButton key={p} tone="violet" on={id === p} onClick={() => setId(p)}>{PRESETS[p].label}</ChipButton>)}
          </ControlGroup>
        </>,
      ]}
    >
      <div className="rl-stage stage-pad">
        <WorldStrip world={world} setWorld={setWorld} />
        <Box>
          <SectionTitle hint={run.preset.note}>{run.preset.label}</SectionTitle>
          <RlGrid view={{ world: run.world, values: run.training.Q.map((row) => Math.max(...row)), policy: greedyPolicy(run.training.Q), decided: run.training.Q.map((row) => row.some((v) => v !== 0)) }} ariaLabel="Learned values and greedy policy for this preset" />
          <div className="rl-plot">
            <Plot2D x={{ domain: [1, Math.max(10, returns.length)], label: 'episode' }} y={{ domain: [-1.5, Math.max(1.2, ...returns)], label: 'return' }} width={356} height={170} ariaLabel="Smoothed return per episode for this preset">
              <Curve points={toPoints(returns)} tone="violet" />
            </Plot2D>
          </div>
          <Hint tone="muted" block>The reward-edit loop is constructed to show specification gaming in the small: the agent maximises exactly the reward it is given.</Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={run.preset.settings.seed}>seeded run of {run.preset.episodes.toLocaleString('en-US')} episodes, judged against exact value iteration on the same reward</Provenance>
          <Provenance kind="illustrative">the specification-gaming example is constructed, not found in a real system</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
