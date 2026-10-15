import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Bar } from '../../components/Bar';
import { Bars, Plot2D } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { BELIEF_LABELS, BELIEF_PRESETS, TRUE_DIST, crossEntropy, entropy, excessBits, setBelief } from './model';
import { beliefCaption, bits2, bits3, bitsOrUnbounded } from './text';

const OUTCOMES = TRUE_DIST.length;
const PLOT_X = {
  domain: [0, OUTCOMES] as const,
  tickValues: TRUE_DIST.map((_, i) => i + 0.5),
  format: (v: number) => BELIEF_LABELS[Math.floor(v)] ?? '',
};
const PLOT_Y = { domain: [0, 1] as const, label: 'probability', ticks: 5 };
const GAP = 0.08;
/** The bits bar spans 0 to this many bits; the numbers beside it are exact. */
const BITS_BAR_MAX = 6;

export function BeliefScene({ picker }: { picker: ReactNode }) {
  const [q, setQ] = useState<number[]>([...TRUE_DIST]);
  const hp = entropy(TRUE_DIST);
  const hpq = crossEntropy(TRUE_DIST, q);
  const extra = excessBits(TRUE_DIST, q);
  const unbounded = !Number.isFinite(hpq);

  return (
    <StageFrame
      height={420}
      intro={beliefCaption(TRUE_DIST, q)}
      introKey={[q]}
      stats={
        <Stats>
          <Stat label="Entropy H(p)" value={`${bits3(hp)} bits`} color="var(--violet)" sub="best possible, code built for p" />
          <Stat label="Cross-entropy H(p, q)" value={unbounded ? 'unbounded' : `${bits3(hpq)} bits`} sub="code built for q, outcomes from p" />
          <Stat label="Extra bits" value={unbounded ? 'unbounded' : `${bits3(extra)} bits`} color="var(--bad)" sub="H(p, q) − H(p), the KL divergence" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'truth p' },
            { color: 'var(--sky)', label: 'belief q' },
            { color: 'var(--violet)', label: 'entropy floor' },
            { color: 'var(--bad)', label: 'extra bits from a wrong belief' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Belief" inline>
            {BELIEF_PRESETS.map((b) => (
              <ChipButton key={b.id} tone="sky" on={b.q.every((x, i) => Math.abs(x - q[i]) < 1e-9)} onClick={() => setQ([...b.q])}>
                {b.label}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          {q.map((v, i) => (
            <Slider key={BELIEF_LABELS[i]} label={`q(${BELIEF_LABELS[i]})`} value={v} min={0} max={1} step={0.001} format={bits3} onChange={(x) => setQ(setBelief(q, i, x))} />
          ))}
          <Hint>The three sliders are linked: moving one rescales the others so q still sums to 1.</Hint>
        </>,
      ]}
    >
      <div className="ent-stage stage-pad">
        <div className="ent-plot">
          <Plot2D x={PLOT_X} y={PLOT_Y} ariaLabel={`True distribution ${TRUE_DIST.map(bits2).join(', ')} against the belief ${q.map(bits3).join(', ')}`}>
            <Bars bars={TRUE_DIST.map((p, i) => ({ x0: i + GAP, x1: i + 0.5, y: p }))} tone="info" />
            <Bars bars={q.map((v, i) => ({ x0: i + 0.5, x1: i + 1 - GAP, y: v }))} tone="sky" />
          </Plot2D>
        </div>
        <div className="ent-panel">
          <h4 className="ent-panel-title">Bits per outcome</h4>
          <Bar
            segments={[
              { value: hp, tone: 'violet' },
              { value: unbounded ? BITS_BAR_MAX : extra, tone: 'bad' },
            ]}
            max={BITS_BAR_MAX}
            height={14}
            animate={false}
            ariaLabel={`Entropy ${bits3(hp)} bits plus ${bitsOrUnbounded(extra)} extra bits`}
          />
          <p className="ent-note">
            Violet is the entropy, red the extra bits; the bar stops at {BITS_BAR_MAX} bits. With a one-hot p (the true label has probability 1), H(p, q) is −log2 of the probability the model gave the true label: log loss, here in bits. Libraries often report it in natural logs (nats), which scales every number by 0.693. It sits beside the threshold metrics of <Link to="/lesson/classification-metrics">classification metrics</Link>.
          </p>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">a made-up three-outcome truth, 0.5, 0.25, 0.25; the cross-entropy is computed live</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
