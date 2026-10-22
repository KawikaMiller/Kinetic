import { useMemo, useState, type ReactNode } from 'react';
import { Curve, HLine, Plot2D } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { pctText } from '../../core/format';
import { floorCaption } from './captions';
import { DEFAULT_LORA_SEED, N, RANK_LIMITS, SPECTRUM, TRAIN_STEPS, makeTarget, optimumRelative, train } from './lora';

const CURVE_STRIDE = 10;
const BAR_PX = 90;

/** Scene 2: the best rank-r update (a floor) and the update gradient descent finds. */
export function FloorScene({ picker }: { picker: ReactNode }) {
  const [rank, setRank] = useState(2);
  const [seed, setSeed] = useState(DEFAULT_LORA_SEED);
  const run = useMemo(() => train(makeTarget(seed), rank, seed), [seed, rank]);
  const optimum = optimumRelative(rank);
  const points = useMemo(() => run.curve.map((v, k) => [k, v] as [number, number]).filter(([k]) => k % CURVE_STRIDE === 0), [run]);

  return (
    <StageFrame
      height={560}
      minWidth={380}
      intro={floorCaption(rank, run)}
      introKey={`floor|${rank}|${seed}`}
      stats={
        <Stats>
          <Stat label="Floor at this rank" value={pctText(optimum, 3)} color="var(--ok)" sub="energy left by the truncated SVD (Eckart-Young)" />
          <Stat label="Trained adapter" value={pctText(run.final, 3)} color="var(--info)" sub={`after ${TRAIN_STEPS.toLocaleString('en-US')} gradient steps`} />
          <Stat label="Gap to the floor" value={pctText(Math.max(0, run.gap), 3)} sub="never below it" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'the optimum floor (dashed)', shape: 'line' },
            { color: 'var(--info)', label: 'the trained adapter', shape: 'line' },
            { color: 'var(--hi)', label: 'singular values the rank keeps', shape: 'square' },
            { color: 'var(--dim)', label: 'singular values dropped', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Rank r" value={rank} min={RANK_LIMITS.min} max={RANK_LIMITS.max} onChange={setRank} />
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="ftq-stage stage-pad">
        <div className="ftq-row">
          <figure className="ftq-figure">
            <figcaption>The target&apos;s {N} singular values (designed): the rank keeps the first {rank}</figcaption>
            <div className="ftq-sv" role="img" aria-label={`Singular values ${SPECTRUM.join(', ')}; the first ${rank} are kept`}>
              {SPECTRUM.map((s, i) => (
                <div key={i} className="ftq-sv-col">
                  <div className={`ftq-sv-bar ${i < rank ? 'is-kept' : 'is-dropped'}`} style={{ height: Math.max(2, (s / SPECTRUM[0]) * BAR_PX) }} />
                  <span>{s}</span>
                </div>
              ))}
            </div>
          </figure>
          <figure className="ftq-figure">
            <figcaption>Squared error of B A against the target, as a share of the target&apos;s energy, against gradient steps</figcaption>
            <Plot2D x={{ domain: [0, TRAIN_STEPS], label: 'steps', ticks: 4 }} y={{ domain: [0, 1], label: 'error share', ticks: 4 }} width={330} height={200} ariaLabel={`Training error falls to ${pctText(run.final, 2)}; the floor is ${pctText(optimum, 2)}`}>
              <HLine at={optimum} tone="ok" label="optimum" />
              <Curve points={points} tone="info" />
            </Plot2D>
          </figure>
        </div>
        <Hint tone="muted" className="ftq-note">
          LoRA adapters are trained by gradient, not by SVD. The SVD only supplies the best possible answer at each rank, so the trained curve can approach the floor and cannot cross it.
          If the adapter is still above the floor after the steps shown, this page says so rather than choosing a kinder seed.
        </Hint>
        <ProvenanceRow>
          <Provenance kind="toy" seed={seed}>one 8 x 8 target built from a designed spectrum; this page trains no real model</Provenance>
          <ClaimLabel kind="research">fine-tuning updates are often found to be well approximated by low-rank ones (the LoRA paper, 2021, from memory; verify)</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
