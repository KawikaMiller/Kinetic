import { useMemo, useState, type ReactNode } from 'react';
import { Plot2D, Points } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Button, ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { NA } from '../../core/format';
import { tradeoffCaption } from './captions';
import {
  CRITERIA, DEFAULT, GRID_STEP, MEANINGFUL_TPR, equaliseB, fitModel, gapsOf, generate, groupStats, isMeaningful, predict, smallestWorstGap, thresholdGrid, type Criterion,
} from './model';
import { OPENING } from './opening';

const PLOT_MAX = 0.5;
const POPULATIONS = [
  { value: 'different', label: 'Different base rates' },
  { value: 'equal', label: 'Equal base rates, no score shift' },
] as const;
const SCORERS = [
  { value: 'imperfect', label: 'Imperfect scorer' },
  { value: 'perfect', label: 'Perfect scorer' },
] as const;
type Population = (typeof POPULATIONS)[number]['value'];
type Scorer = (typeof SCORERS)[number]['value'];

const pts = (x: number) => (Number.isNaN(x) ? NA : `${(x * 100).toFixed(1)} pts`);

/** Scene 2: search group thresholds for one criterion and watch the others move; the plot shows no pair reaches all-equal. */
export function TradeoffScene({ picker }: { picker: ReactNode }) {
  const [population, setPopulation] = useState<Population>(OPENING.tradeoff.population);
  const [scorer, setScorer] = useState<Scorer>(OPENING.tradeoff.scorer);
  const [tA, setTA] = useState(OPENING.tradeoff.tA);
  const [tB, setTB] = useState(OPENING.tradeoff.tB);
  const [criterion, setCriterion] = useState<Criterion>(OPENING.tradeoff.criterion);
  const [undefinedAt, setUndefinedAt] = useState<{ tA: number; criterion: Criterion } | null>(null);

  const { rows, probs, grid } = useMemo(() => {
    const data = generate({ ...DEFAULT, gap: population === 'equal' ? 0 : DEFAULT.gap, shift: population === 'equal' ? 0 : DEFAULT.shift, separation: scorer === 'perfect' ? 20 : DEFAULT.separation });
    const p = predict(fitModel(data, 'aware'), data);
    return { rows: data, probs: p, grid: thresholdGrid(data, p) };
  }, [population, scorer]);
  const worst = useMemo(() => smallestWorstGap(grid), [grid]);
  const a = groupStats(rows, probs, tA, 0);
  const b = groupStats(rows, probs, tB, 1);
  const gaps = gapsOf(a, b);
  const cloud = useMemo(() => grid.filter(isMeaningful).map((p) => ({ x: Math.min(p.gaps.fpr, PLOT_MAX), y: Math.min(p.gaps.precision, PLOT_MAX), tone: 'dim' as const })).filter((p) => !Number.isNaN(p.x) && !Number.isNaN(p.y)), [grid]);

  return (
    <StageFrame
      height={760}
      intro={tradeoffCaption({ tA, tB, criterion, gaps, worstPossible: worst, perfect: scorer === 'perfect', equalBase: population === 'equal' })}
      introKey={[population, scorer, tA, tB, criterion]}
      stats={
        <Stats>
          <Stat label="Gap in your criterion" value={pts(gaps[criterion])} color={gaps[criterion] <= 0.03 ? 'var(--ok)' : 'var(--bad)'} sub={CRITERIA.find((c) => c.id === criterion)!.name} />
          <Stat label="Closest any pair gets to all three equal" value={pts(worst)} color={worst <= 0.03 ? 'var(--ok)' : 'var(--bad)'} sub="true-positive rate, false-positive rate and precision together" />
          <Stat label="Approval gap" value={pts(gaps.selection)} sub={`group A ${(a.selection * 100).toFixed(0)}%, group B ${(b.selection * 100).toFixed(0)}%`} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--dim)', label: 'a worthwhile pair of cut-offs' }, { color: 'var(--hi)', label: 'your pair of cut-offs' }, { color: 'var(--ok)', label: 'all equal: the origin' }]} />}
      controls={[
        <>
          {picker}
          <Segmented label="Population" options={POPULATIONS.map((p) => ({ value: p.value, label: p.label }))} value={population} onChange={setPopulation} />
          <Segmented label="Scorer" options={SCORERS.map((s) => ({ value: s.value, label: s.label }))} value={scorer} onChange={setScorer} />
        </>,
        <>
          <Slider label="Group A cut-off" value={tA} min={0} max={1} step={GRID_STEP} format={(v) => v.toFixed(3)} onChange={setTA} />
          <Slider label="Group B cut-off" value={tB} min={0} max={1} step={GRID_STEP} format={(v) => v.toFixed(3)} onChange={setTB} />
          <Segmented label="Equalise" options={CRITERIA.map((c) => ({ value: c.id, label: c.label }))} value={criterion} onChange={setCriterion} />
          <Button
            variant="primary"
            onClick={() => {
              const found = equaliseB(rows, probs, tA, criterion);
              if (found !== null) setTB(found);
              setUndefinedAt(found === null ? { tA, criterion } : null);
            }}
          >
            Find group B&apos;s cut-off
          </Button>
        </>,
      ]}
    >
      <div className="fb-stage stage-pad">
        {undefinedAt && undefinedAt.tA === tA && undefinedAt.criterion === criterion && (
          <Hint tone="muted" block>The {CRITERIA.find((c) => c.id === criterion)!.label.toLowerCase()} is undefined at group A&apos;s cut-off of {tA.toFixed(3)}, so there is nothing to match and group B&apos;s cut-off stays where it is.</Hint>
        )}
        <Plot2D
          x={{ domain: [0, PLOT_MAX], ticks: 5, label: 'false-positive-rate gap', format: (v) => `${Math.round(v * 100)}` }}
          y={{ domain: [0, PLOT_MAX], ticks: 5, label: 'precision gap (points)', format: (v) => `${Math.round(v * 100)}` }}
          aspect="equal"
          ariaLabel={`Every worthwhile pair of group cut-offs by its false-positive-rate gap and precision gap; the closest any pair gets to equal on all three criteria is ${pts(worst)}`}
        >
          <Points data={cloud} r={2.2} />
          <Points data={[{ x: Math.min(gaps.fpr, PLOT_MAX), y: Math.min(gaps.precision, PLOT_MAX), tone: 'hi', r: 5 }]} />
          <Points data={[{ x: 0, y: 0, tone: 'ok', r: 6, ring: 'ok' }]} />
        </Plot2D>
        <p className="fb-note">
          Only pairs where both groups approve at least {Math.round(MEANINGFUL_TPR * 100)}% of their creditworthy applicants are drawn: near the top of the range almost nobody is approved and every precision tends to 1, which would hide the conflict.
          Cut-offs step by {GRID_STEP}; gaps are capped at {PLOT_MAX * 100} points for drawing.
        </p>
        <ProvenanceRow>
          <ClaimLabel kind="research">a mathematical result: with different base rates and an imperfect scorer these criteria cannot all hold (Kleinberg, Mullainathan and Raghavan, 2016, and Chouldechova, 2017: from memory, verify the authors, years and exact conditions)</ClaimLabel>
          <Provenance kind="invented">synthetic applicants in two neutral groups</Provenance>
          <Provenance kind="toy">a grid search over cut-offs on one seeded data set, not a proof</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
