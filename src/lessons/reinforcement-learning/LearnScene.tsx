import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, Plot2D } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { f2, learnCaption } from './captions';
import { smooth, toPoints } from './curves';
import { greedyPolicy } from './mdp';
import { epsilonAt, greedyReturn, train } from './qlearn';
import { RlGrid } from './RlGrid';
import { ALPHA_MAX, ALPHA_MIN, EPISODES_CAP, EPSILON_MAX, GAMMA_MAX, GAMMA_MIN, LEARN_DEFAULT, PER_PRESS, SMOOTH_WINDOW } from './settings';
import { gammaRefusal, type World } from './world';

const PER_PRESS_OPTIONS = PER_PRESS.map((n) => ({ value: n, label: n.toLocaleString('en-US') }));

export function LearnScene({ picker, world }: { picker: ReactNode; world: World }) {
  const [alpha, setAlpha] = useState<number>(LEARN_DEFAULT.alpha);
  const [gamma, setGamma] = useState<number>(LEARN_DEFAULT.gamma);
  const [epsilon, setEpsilon] = useState<number>(LEARN_DEFAULT.epsilon);
  const [decay, setDecay] = useState<boolean>(LEARN_DEFAULT.decay);
  const [perPress, setPerPress] = useState<number>(LEARN_DEFAULT.perPress);
  const [episodes, setEpisodes] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const training = useMemo(() => train(world, { alpha, gamma, epsilon, decay, seed: LEARN_DEFAULT.seed }, episodes), [world, alpha, gamma, epsilon, decay, episodes]);
  const greedy = useMemo(() => greedyReturn(world, gamma, training.Q), [world, gamma, training]);
  const returns = useMemo(() => smooth(training.returns, SMOOTH_WINDOW), [training]);
  const steps = useMemo(() => smooth(training.steps, SMOOTH_WINDOW), [training]);
  const caption = learnCaption({ alpha, gamma, epsilon, decay, seed: LEARN_DEFAULT.seed }, episodes, training, greedy, SMOOTH_WINDOW);
  const setGammaChecked = (v: number) => {
    const refusal = gammaRefusal(v, world.stepCost);
    setNote(refusal);
    if (refusal === null) setGamma(v);
  };
  const xMax = Math.max(10, episodes);

  return (
    <StageFrame
      height={470}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Episodes" value={episodes.toLocaleString('en-US')} />
          <Stat label="Epsilon now" value={f2(epsilonAt({ alpha, gamma, epsilon, decay, seed: LEARN_DEFAULT.seed }, episodes))} color="var(--orange)" sub={decay ? 'decaying' : 'fixed'} />
          <Stat label="Greedy policy's return" value={f2(greedy)} color="var(--violet)" sub="expected, from the start, on the true model" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'greener: higher best Q-value', shape: 'square' },
            { color: 'var(--violet)', label: 'greedy policy arrows', shape: 'square' },
            { color: 'var(--info)', label: 'latest episode', shape: 'line' },
            { color: 'var(--orange)', label: 'a random (exploratory) move', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Episodes per press" value={perPress} onChange={setPerPress} options={PER_PRESS_OPTIONS} />
          <Button variant="primary" onClick={() => setEpisodes(Math.min(EPISODES_CAP, episodes + perPress))} softDisabled={episodes >= EPISODES_CAP}>Run</Button>
          <Button softDisabled={episodes === 0} onClick={() => setEpisodes(0)}>Reset</Button>
        </>,
        <>
          <Slider label="Learning rate (alpha)" value={alpha} min={ALPHA_MIN} max={ALPHA_MAX} step={0.05} onChange={setAlpha} format={f2} />
          <Slider label="Discount (gamma)" value={gamma} min={GAMMA_MIN} max={GAMMA_MAX} step={0.01} onChange={setGammaChecked} format={f2} />
          <Slider label="Exploration (epsilon)" value={epsilon} min={0} max={EPSILON_MAX} step={0.05} onChange={setEpsilon} format={f2} />
          <Toggle label="Epsilon decay" value={decay} onChange={setDecay} off="Fixed" on="Decays each episode" />
        </>,
      ]}
    >
      <div className="rl-stage stage-pad">
        <Box>
          <SectionTitle hint="Q(s,a) += alpha (r + gamma max Q(s',a') - Q(s,a))">Q-learning, one table entry at a time</SectionTitle>
          <RlGrid view={{ world, values: training.Q.map((row) => Math.max(...row)), policy: episodes > 0 ? greedyPolicy(training.Q) : undefined, path: training.lastEpisode }} ariaLabel="Best Q-value, greedy policy and the latest episode" />
          {note && <p role="alert" className="rl-note">{note}</p>}
          <Hint tone="muted" block>The agent does not know where the walls, rewards or slips are: it learns only from the moves it plays.</Hint>
        </Box>
        <Box>
          <SectionTitle hint={`smoothed over ${SMOOTH_WINDOW} episodes`}>Return and steps per episode</SectionTitle>
          <div className="rl-plot">
            <Plot2D x={{ domain: [1, xMax], label: 'episode' }} y={{ domain: [-1.5, 1.2], label: 'return' }} width={356} height={170} ariaLabel="Smoothed return per episode">
              <Curve points={toPoints(returns)} tone="violet" />
            </Plot2D>
            <Plot2D x={{ domain: [1, xMax], label: 'episode' }} y={{ domain: [0, 100], label: 'steps' }} width={356} height={170} ariaLabel="Smoothed steps per episode">
              <Curve points={toPoints(steps)} tone="info" />
            </Plot2D>
          </div>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={LEARN_DEFAULT.seed}>seeded simulation: the whole run is recomputed from the settings, nothing is hidden</Provenance>
          <Provenance kind="toy">a table, not a neural network</Provenance>
          <Provenance kind="from-memory">algorithm definitions are from memory: verify against Sutton and Barto</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
