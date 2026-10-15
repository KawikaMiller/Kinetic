import { useMemo, useState, type ReactNode } from 'react';
import { Band, Bars, Plot2D, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import type { Option } from '../../components/options';
import { Hint, Legend, Provenance, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { barsFromHistogram } from '../../core/plot';
import { histogram } from '../../core/stats';
import { SeedField } from './SeedField';
import { ratioText, sig } from './fmt';
import { cltCaption } from './frames';
import {
  BINS, BOUNDS, FAMILIES, FAMILY_NAME, MEAN_DEFAULT, REPLICATES, SAMPLE_SIZES, cltDist, cltReport, meansDomain, replicateMeans, type Family,
} from './model';

const FAMILY_OPTIONS: Option<Family>[] = FAMILIES.map((f) => ({ value: f, label: FAMILY_NAME[f] }));
const SIZE_OPTIONS: Option<number>[] = SAMPLE_SIZES.map((n) => ({ value: n, label: n.toLocaleString('en-US') }));
const HEADROOM = 1.12;

export function MeanScene({ picker }: { picker: ReactNode }) {
  const [family, setFamily] = useState<Family>(MEAN_DEFAULT.family);
  const [n, setN] = useState<number>(MEAN_DEFAULT.n);
  const [alpha, setAlpha] = useState(MEAN_DEFAULT.alpha);
  const [seed, setSeed] = useState(MEAN_DEFAULT.seed);

  const dist = useMemo(() => cltDist(family, alpha), [family, alpha]);
  const means = useMemo(() => replicateMeans(dist, n, seed), [dist, n, seed]);
  const report = useMemo(() => cltReport(dist, n, means), [dist, n, means]);
  const domain = meansDomain(means);
  const hist = histogram(means, { bins: BINS, min: domain[0], max: domain[1] });
  const top = Math.max(...hist.counts) * HEADROOM;

  useIntroCaption(cltCaption(report, family, n), [report, family, n]);

  const ratioNote = report.ratio === null
    ? report.moments === 'infinite-mean' ? 'no finite mean' : 'σ is infinite here'
    : 'spread ÷ (σ/√n)';

  return (
    <StageFrame
      height={400}
      stats={
        <Stats>
          <Stat label="Spread of the means" value={sig(report.spread)} sub={[`${REPLICATES.toLocaleString('en-US')} means of ${n.toLocaleString('en-US')} draws`]} />
          <Stat
            label={<><span className="keep-case">σ/√n</span> predicts</>}
            value={report.predicted === null ? '–' : sig(report.predicted)}
            sub={[report.predicted === null ? (report.moments === 'infinite-mean' ? 'σ is infinite here' : 'σ is infinite here: the formula does not apply') : `from the exact σ and n = ${n.toLocaleString('en-US')}`]}
          />
          <Stat
            label="Ratio"
            value={report.ratio === null ? '–' : ratioText(report.ratio)}
            color={report.ratio === null ? 'var(--bad)' : undefined}
            sub={[ratioNote]}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'means of n draws' },
            { color: 'var(--hi)', label: 'exact mean', shape: 'line' },
            { color: 'var(--violet)', label: 'mean ± σ/√n' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Shape" value={family} onChange={setFamily} options={FAMILY_OPTIONS} />
          <Segmented label="Sample size n" value={n} onChange={setN} options={SIZE_OPTIONS} />
        </>,
        <>
          {family === 'pareto' && (
            <Slider label="Shape α" value={alpha} {...BOUNDS.paretoAlpha} step={0.1} format={(v) => v.toFixed(1)} onChange={setAlpha} />
          )}
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="stage-pad dist-stage">
        <Plot2D
          x={{ domain, label: `mean of ${n.toLocaleString('en-US')} draws`, ticks: 5 }}
          y={{ domain: [0, top], label: 'means per bin', ticks: 4 }}
          ariaLabel={`Histogram of ${REPLICATES} means of ${n} ${FAMILY_NAME[family]} draws`}
        >
          {report.exactMean !== null && report.predicted !== null && (
            <Band lo={0} hi={top} from={report.exactMean - report.predicted} to={report.exactMean + report.predicted} tone="violet" />
          )}
          <Bars bars={barsFromHistogram(hist)} tone="info" />
          {report.exactMean !== null && report.exactMean >= domain[0] && report.exactMean <= domain[1] && <VLine at={report.exactMean} tone="hi" />}
        </Plot2D>
        {hist.outside > 0 && <Hint className="dist-note">The axis shows the middle 99% of the means; {hist.outside} wilder ones sit off the edge and still count in the spread.</Hint>}
        {family === 'pareto' && (
          <Hint tone="muted" className="dist-note">
            α = {alpha.toFixed(1)}: {report.moments === 'infinite-mean' ? 'no finite mean, so the means have nothing to settle on.' : report.moments === 'infinite-variance' ? 'finite mean but infinite variance, so the σ/√n formula has no σ to use.' : 'the mean and the variance both exist.'}
          </Hint>
        )}
        <div className="dist-chips">
          <Provenance kind="simulated" seed={seed}>{REPLICATES.toLocaleString('en-US')} seeded replicates</Provenance>
          <Provenance kind="illustrative">shapes and sizes are made up</Provenance>
        </div>
      </div>
    </StageFrame>
  );
}
