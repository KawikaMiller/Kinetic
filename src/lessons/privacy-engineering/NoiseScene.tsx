import { useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { SectionTitle } from '../../components/Panel';
import { Bars, Plot2D, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { noiseCaption } from './captions';
import { BUDGET, EPSILON_STEP, MAX_EPSILON, MIN_EPSILON, NOISE_SEED, TRUE_COUNT, answersFor, ask, histogram, mean, noiseScale } from './noise';
import { initialNoise } from './opening';

const HALF_WIDTH = 40;
const LO = TRUE_COUNT - HALF_WIDTH;
const HI = TRUE_COUNT + HALF_WIDTH;
const PLOT_WIDTH = 356;
const PLOT_HEIGHT = 230;
const BATCHES = [1, 10, 100] as const;

/** Scene 3: a counting query answered with Laplace noise, and a budget that each answer spends. */
export function NoiseScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialNoise);
  const answers = answersFor(NOISE_SEED, state.asked.map((epsilon) => ({ epsilon })));
  const bins = histogram(answers.values, LO, HI);
  const tallest = Math.max(4, ...bins.map((b) => b.y));
  const m = mean(answers.values);
  const left = BUDGET - answers.spent;
  const canAsk = left + 1e-9 >= state.epsilon;

  return (
    <StageFrame
      height={460}
      intro={noiseCaption(state.epsilon, answers)}
      introKey={[state.epsilon, state.asked.length]}
      stats={
        <Stats>
          <Stat label="Answers" value={answers.values.length} color="var(--info)" sub={`noise scale ${noiseScale(state.epsilon).toFixed(1)} at epsilon ${state.epsilon.toFixed(1)}`} />
          <Stat label="Mean of the answers" value={answers.values.length ? m.toFixed(1) : '-'} color="var(--ok)" sub={`true count ${TRUE_COUNT}`} />
          <Stat label="Budget left" value={`${left.toFixed(1)} of ${BUDGET}`} color={left <= 0.05 ? 'var(--bad)' : 'var(--hi)'} sub="each answer spends its epsilon" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'noisy answers', shape: 'square' },
            { color: 'var(--ok)', label: 'the true count and the mean', shape: 'line' },
            { color: 'var(--hi)', label: 'privacy budget left', shape: 'square' },
            { color: 'var(--bad)', label: 'budget spent', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Epsilon" value={state.epsilon} min={MIN_EPSILON} max={MAX_EPSILON} step={EPSILON_STEP} onChange={(v) => setState((s) => ({ ...s, epsilon: Math.round(v * 10) / 10 }))} format={(v) => v.toFixed(1)} />
        </>,
        <>
          {BATCHES.map((n) => (
            <Button key={n} softDisabled={!canAsk} onClick={() => setState((s) => ({ ...s, asked: ask(s.asked, s.epsilon, n) }))}>
              {n === 1 ? 'Ask once' : `Ask ${n} times`}
            </Button>
          ))}
          <Button onClick={() => setState((s) => ({ ...s, asked: [] }))}>Reset</Button>
        </>,
      ]}
    >
      <div className="pe-stage stage-pad">
        <SectionTitle>The query: how many of the 48 invented people have condition C? (the true answer is {TRUE_COUNT})</SectionTitle>
        <Plot2D
          x={{ domain: [LO - 0.5, HI + 0.5], label: 'answer' }}
          y={{ domain: [0, tallest + 1], label: 'times given', ticks: 4 }}
          width={PLOT_WIDTH}
          height={PLOT_HEIGHT}
          ariaLabel={`Noisy answers: ${answers.values.length} so far, mean ${answers.values.length ? m.toFixed(1) : 'none'}, true count ${TRUE_COUNT}`}
        >
          <Bars bars={bins.filter((b) => b.y > 0)} tone="info" />
          <VLine at={TRUE_COUNT} label="true" tone="ok" />
          {answers.values.length > 0 && <VLine at={m} label="mean" tone="hi" dashed />}
        </Plot2D>
        <Bar value={left} max={BUDGET} color={left <= 0.05 ? 'var(--bad)' : 'var(--hi)'} label={`privacy budget left: ${left.toFixed(1)} of ${BUDGET}`} />
        <p className="pe-note">Answers outside the plotted range are counted in its end bars. The smallest epsilon is {MIN_EPSILON}, so the noise scale never goes infinite.</p>
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated" seed={NOISE_SEED}>seeded Laplace noise on an invented count</Provenance>
        <Provenance kind="illustrative">a budget of {BUDGET} epsilon is a made-up round number, and the table is synthetic</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
