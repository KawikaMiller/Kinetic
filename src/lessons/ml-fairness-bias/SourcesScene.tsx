import { useMemo, useState, type ReactNode } from 'react';
import { Curve, Plot2D, Points } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Legend, Provenance, ProvenanceRow, Slider } from '../../components/ui';
import { pctText, sourcesCaption } from './captions';
import { OPENING } from './opening';
import { LABEL_NOISE, LOOP, ROUNDS, SHARES, feedbackLoop, labelBias, representation } from './sources';

const SEED = 4;

/** Scene 4: three toys on where bias comes from: representation, label bias and a feedback loop. */
export function SourcesScene({ picker }: { picker: ReactNode }) {
  const [share, setShare] = useState(OPENING.sources.share);
  const [noise, setNoise] = useState(OPENING.sources.noise);
  const rep = useMemo(() => representation(share, SEED), [share]);
  const lab = useMemo(() => labelBias(noise, SEED), [noise]);
  const loop = useMemo(() => {
    const sim = feedbackLoop(LOOP.seed);
    sim.run(ROUNDS);
    return sim.history;
  }, []);
  const shares = loop.map((h, i) => [i, h.shareB] as [number, number]);

  return (
    <StageFrame
      height={820}
      intro={sourcesCaption(share, rep.b, rep.a, lab.apparent.b, lab.actual.b, loop[0].shareB, loop[ROUNDS].shareB)}
      introKey={[share, noise]}
      legend={<Legend items={[{ color: 'var(--amber)', label: 'group A' }, { color: 'var(--sky)', label: 'group B' }]} />}
      controls={[
        <>
          {picker}
          <Slider label="Group B's share of the training data" value={share} {...SHARES} format={(v) => `${Math.round(v * 100)}%`} onChange={setShare} />
          <Slider label="Label noise for group B" value={noise} {...LABEL_NOISE.b} format={(v) => `${Math.round(v * 100)}%`} onChange={setNoise} />
        </>,
      ]}
    >
      <div className="fb-stage stage-pad">
        <section className="fb-toy">
          <h3>Toy 1: representation</h3>
          <p className="fb-note">One line has to fit both groups, but their outcomes turn at different points of the feature. With group B at {Math.round(share * 100)}% of the training data, the line mostly fits group A.</p>
          <table className="data-table fb-table">
            <thead><tr><th>Error on a balanced test set</th><th>Group A</th><th>Group B</th></tr></thead>
            <tbody><tr><td>At this training share</td><td className="fb-amber">{pctText(rep.a)}</td><td className="fb-sky">{pctText(rep.b)}</td></tr></tbody>
          </table>
        </section>
        <section className="fb-toy">
          <h3>Toy 2: label bias</h3>
          <p className="fb-note">The labels are a noisy proxy for what really happened, and noisier for group B ({Math.round(LABEL_NOISE.a * 100)}% of group A&apos;s labels are wrong, {Math.round(noise * 100)}% of group B&apos;s). The flips are random, so group B&apos;s real accuracy barely moves; mostly the measured accuracy does. This toy shows noisy evaluation, not a biased model.</p>
          <table className="data-table fb-table">
            <thead><tr><th>Accuracy</th><th>Group A</th><th>Group B</th></tr></thead>
            <tbody>
              <tr><td>Against the biased labels</td><td className="fb-amber">{pctText(lab.apparent.a)}</td><td className="fb-sky">{pctText(lab.apparent.b)}</td></tr>
              <tr><td>Against what really happened</td><td className="fb-amber">{pctText(lab.actual.a)}</td><td className="fb-sky">{pctText(lab.actual.b)}</td></tr>
            </tbody>
          </table>
        </section>
        <section className="fb-toy">
          <h3>Toy 3: a feedback loop</h3>
          <p className="fb-note">Ten rounds: each round the model approves from a new batch, and only approved applicants&apos; outcomes are observed and added to the training data. Group B is approved less, so it is added less.</p>
          <Plot2D
            x={{ domain: [0, ROUNDS], ticks: 5, label: 'round' }}
            y={{ domain: [0.25, 0.45], ticks: 4, label: "group B's share of the training data", format: (v) => `${Math.round(v * 100)}%` }}
            ariaLabel={`Group B's share of the training data over ${ROUNDS} rounds, from ${pctText(loop[0].shareB)} to ${pctText(loop[ROUNDS].shareB)}`}
          >
            <Curve points={shares} tone="sky" />
            <Points data={shares.map(([x, y]) => ({ x, y, tone: 'sky' as const }))} r={3} />
          </Plot2D>
        </section>
        <ProvenanceRow>
          <Provenance kind="toy">three small toys, each labelled as one: they show a mechanism, not how any real system behaves</Provenance>
          <Provenance kind="simulated" seed={SEED}>seeded rows; the feedback loop is a seeded tick simulation (seed {LOOP.seed})</Provenance>
          <Provenance kind="invented">synthetic applicants in two neutral groups</Provenance>
          <ClaimLabel kind="practice">representation, label quality and feedback loops are standard sources of bias discussed in the fairness literature</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
