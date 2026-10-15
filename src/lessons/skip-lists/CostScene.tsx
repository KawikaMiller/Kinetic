import { useMemo, useState, type ReactNode } from 'react';
import { Curve, Plot2D } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { SAMPLE_SEARCHES, expectedPointers, monteCarlo, pughCost } from './model';
import { DEFAULT_P, MC_FOCUS_N, MC_SEEDS, MC_SIZES, P_OPTIONS } from './presets';
import { P_LABEL, costCaption } from './text';

const PLOT_WIDTH = 330;
const PLOT_HEIGHT = 250;
const Y_STEP = 5;

export function CostScene({ picker }: { picker: ReactNode }) {
  const [p, setP] = useState<number>(DEFAULT_P);
  const [n, setN] = useState(MC_FOCUS_N);
  const runs = useMemo(() => MC_SIZES.map((size) => monteCarlo(size, p, MC_SEEDS)), [p]);
  const at = runs.find((r) => r.n === n) ?? runs[0];
  const formula = pughCost(at.n, p);
  const yMax = Math.ceil(Math.max(...runs.map((r) => r.worst), pughCost(MC_SIZES[MC_SIZES.length - 1], p)) / Y_STEP) * Y_STEP;
  const caption = costCaption({ n: at.n, p, mean: at.mean, worst: at.worst, formula });
  useIntroCaption(<>{caption}</>, [caption]);
  const pts = (pick: (r: (typeof runs)[number]) => number): [number, number][] => runs.map((r) => [r.n, pick(r)]);

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="Measured mean" value={at.mean.toFixed(1)} color="var(--ok)" sub={`steps per search, ${MC_SEEDS} lists of ${at.n.toLocaleString('en-US')} keys`} />
          <Stat label="Pugh's formula" value={formula.toFixed(1)} sub={`log base ${1 / p} of n, over p, plus 1/(1−p)`} />
          <Stat label="Worst luck" value={at.worst.toFixed(1)} color="var(--bad)" sub="the unluckiest of the lists" />
          <Stat label="Pointers per key" value={at.pointers.toFixed(2)} sub={`measured; 1/(1−p) = ${expectedPointers(p).toFixed(2)}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'measured mean', shape: 'line' },
            { color: 'var(--bad)', label: 'worst of the 20 lists', shape: 'line' },
            { color: 'var(--muted)', label: "Pugh's formula", shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="p" value={p} onChange={setP} options={P_OPTIONS.map((v) => ({ value: v, label: P_LABEL[v] }))} />
          <Segmented label="Read the numbers at n" value={n} onChange={setN} options={MC_SIZES.map((size) => ({ value: size, label: size.toLocaleString('en-US') }))} />
        </>,
      ]}
    >
      <div className="sl-stage stage-pad sl-cost">
        <Plot2D
          x={{ domain: [MC_SIZES[0], MC_SIZES[MC_SIZES.length - 1]], log: true, label: 'keys in the list (n)' }}
          y={{ domain: [0, yMax], label: 'steps per search' }}
          width={PLOT_WIDTH}
          height={PLOT_HEIGHT}
          ariaLabel={`Search cost against list size at p = ${P_LABEL[p]}: measured mean, worst list and Pugh's formula`}
        >
          <Curve fn={(x) => pughCost(x, p)} tone="muted" dashed />
          <Curve points={pts((r) => r.worst)} tone="bad" />
          <Curve points={pts((r) => r.mean)} tone="info" />
        </Plot2D>
        <div className="sl-claims">
          <p className="sl-line">
            <ClaimLabel kind="research">Pugh's analysis (1990): expected search cost about log base 1/p of n over p, plus 1/(1−p); quoted from memory, check the paper</ClaimLabel>
          </p>
          <p className="sl-line">A skip list is fast with high probability, not with certainty: the red line is a real list that got unlucky.</p>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">each point is a search cost counted on lists built here, not drawn from the formula</Provenance>
        <Provenance kind="simulated">{`${MC_SEEDS} lists per size, seeds 1 to ${MC_SEEDS}, fair coins at p = ${P_LABEL[p]}; ${SAMPLE_SEARCHES} sampled searches per list`}</Provenance>
        <Provenance kind="from-memory">the formula is Pugh's, quoted not derived: check it against the paper</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
