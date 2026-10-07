import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { ConfusionMatrix } from '../../components/ConfusionMatrix';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, HLine, Plot2D, Points, VLine } from '../../components/Plot2D';
import { usePlot } from '../../components/plotContext';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Slider, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { pct } from '../../core/format';
import { parseBoundedInt } from '../../core/parse';
import { classificationMetrics } from '../../core/stats';
import { costCaption, imbalanceCaption, metric, thresholdCaption, thresholdText } from './frames';
import {
  COST_FIELD, COST_PRESETS, NEGATIVE_WEIGHTS, NONE, aucTrapezoid, cheapest, curve, dataset, positiveRate, prSteps, stepThreshold, totalCost,
  weighted, drawnAt, type CostPreset, type Costs,
} from './model';
import './styles.css';

const SEPARATION_MAX = 3;
const SEPARATION_STEP = 0.25;
const START_T = 0.5;
/** Rows on the score strip: actual positives at 1, negatives at 0, nudged apart so dots don't stack. */
const JITTER = 0.06;
const JITTER_SPAN = 7;

export function Stage() {
  const [seed, setSeed] = useState(1);
  const [separation, setSeparation] = useState(1.5);
  const [imbalance, setImbalance] = useState(0);
  const [t, setT] = useState(START_T);
  const [showPr, setShowPr] = useState(false);
  const [costText, setCostText] = useState({ fp: '1', fn: '5' });
  const [costs, setCosts] = useState<Costs>({ fp: 1, fn: 5 });
  const [preset, setPreset] = useState<string | null>(null);
  const setCaption = useSetCaption();

  const examples = useMemo(() => dataset(seed, separation), [seed, separation]);
  const k = NEGATIVE_WEIGHTS[imbalance];
  const counts = weighted(examples, t, k);
  const m = classificationMetrics(counts);
  const points = useMemo(() => curve(examples, k), [examples, k]);
  const auc = aucTrapezoid(points);
  const best = cheapest(examples, k, costs);
  const always = classificationMetrics(weighted(examples, NONE, k));
  const fpErr = parseBoundedInt(costText.fp, COST_FIELD);
  const fnErr = parseBoundedInt(costText.fn, COST_FIELD);

  useIntroCaption(thresholdCaption(dataset(1, 1.5), START_T, 1));

  const moveThreshold = (next: number, quiet = false) => {
    setT(next);
    setCaption(thresholdCaption(examples, next, k), { quiet });
  };
  const changeData = (nextSeed: number, nextSep: number) => {
    setSeed(nextSeed);
    setSeparation(nextSep);
    const ex = dataset(nextSeed, nextSep);
    setCaption(<>{nextSeed !== seed ? `New seed ${nextSeed}: a fresh draw of scores. ` : `Separation ${nextSep}: `}
      AUC is now {aucTrapezoid(curve(ex, k)).toFixed(3)}. {thresholdCaption(ex, t, k)}</>);
  };
  const changeImbalance = (i: number) => {
    setImbalance(i);
    setPreset(null);
    setCaption(imbalanceCaption(examples, t, NEGATIVE_WEIGHTS[i]));
  };
  const editCost = (key: keyof Costs, text: string) => {
    const nextText = { ...costText, [key]: text };
    setCostText(nextText);
    setPreset(null);
    const parsed = parseBoundedInt(text, COST_FIELD);
    if (!parsed.ok) return;
    const next = { ...costs, [key]: parsed.value };
    setCosts(next);
    setCaption(costCaption(examples, k, next, t), { quiet: true });
  };
  const loadPreset = (p: CostPreset) => {
    setPreset(p.id);
    setCosts(p.costs);
    setCostText({ fp: String(p.costs.fp), fn: String(p.costs.fn) });
    setImbalance(p.imbalance);
    const kk = NEGATIVE_WEIGHTS[p.imbalance];
    setCaption(<>{p.label} (illustrative): a false alarm is {p.fpMeans}, a miss is {p.fnMeans}, and {pct(positiveRate(kk))} of cases are positive.
      {' '}{costCaption(examples, kk, p.costs, t)}</>);
  };

  const current = { x: m.fpr, y: m.recall };
  const prNow = Number.isNaN(m.precision) ? null : { x: m.recall, y: m.precision };
  const stripData = examples.map((e, i) => {
    const predicted = e.score >= t;
    return {
      x: e.score,
      y: e.label + ((i % JITTER_SPAN) - (JITTER_SPAN - 1) / 2) * JITTER,
      tone: e.label ? ('violet' as const) : ('sky' as const),
      hollow: predicted !== (e.label === 1),
    };
  });

  return (
    <StageFrame
      height={460}
      stats={
        <Stats>
          <Stat label="Threshold" value={thresholdText(t)} color="var(--hi)" sub="score ≥ threshold → positive" />
          <Stat label="FPR" value={metric(m.fpr)} sub="false alarms / real negatives" />
          <Stat label="AUC" value={auc.toFixed(3)} color="var(--info)" sub="P(random + outscores random −)" />
          <Stat label='"Always negative"' value={metric(always.accuracy)} sub="accuracy, with recall 0" />
          <Stat label="Total cost" value={totalCost(counts, costs).toLocaleString('en-US')} sub={`cheapest ${best.cost.toLocaleString('en-US')}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'actual positive', shape: 'dot' },
            { color: 'var(--sky)', label: 'actual negative', shape: 'dot' },
            { color: 'var(--muted)', label: 'filled = right · hollow = wrong', shape: 'dot' },
            { color: 'var(--hi)', label: 'threshold / current point', shape: 'line' },
            { color: 'var(--ok)', label: 'cheapest threshold', shape: 'line' },
            { color: 'var(--info)', label: showPr ? 'PR curve' : 'ROC curve', shape: 'line' },
            { color: 'var(--dim)', label: showPr ? 'random classifier (positive rate)' : 'random classifier', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          <Slider label="Positive rate" value={imbalance} min={0} max={NEGATIVE_WEIGHTS.length - 1} format={(i) => pct(positiveRate(NEGATIVE_WEIGHTS[i]))} onChange={changeImbalance} />
          <Slider label="Separation" value={separation} min={0} max={SEPARATION_MAX} step={SEPARATION_STEP} onChange={(v) => changeData(seed, v)} />
          <Toggle label="Curve" value={showPr} onChange={setShowPr} off="ROC" on="Precision-recall" />
          <Button onClick={() => changeData(seed + 1, separation)}>New seed</Button>
        </>,
        <>
          <ControlGroup label="Cost presets (illustrative)">
            {COST_PRESETS.map((p) => (
              <ChipButton key={p.id} tone="info" on={preset === p.id} onClick={() => loadPreset(p)}>{p.label}</ChipButton>
            ))}
          </ControlGroup>
          <TextField label="Cost of a false alarm" value={costText.fp} onChange={(v) => editCost('fp', v)} width={110} spellCheck={false} />
          <TextField label="Cost of a miss" value={costText.fn} onChange={(v) => editCost('fn', v)} width={110} spellCheck={false} />
          <Button onClick={() => moveThreshold(best.threshold)}>Jump to the cheapest</Button>
        </>,
        ...(!fpErr.ok || !fnErr.ok
          ? [<Hint key="err" tone="muted" className="cm-error">{!fpErr.ok ? `False alarm: ${fpErr.error} ` : ''}{!fnErr.ok ? `Miss: ${fnErr.error} ` : ''}Using the last valid costs.</Hint>]
          : []),
      ]}
    >
      <div className="stage-pad cm-stage">
        <div className="cm-plots">
          <div className="cm-strip">
            <SectionTitle hint="drag, or focus the line and use ← →">Scores</SectionTitle>
            <Plot2D
              x={{ domain: [0, 1], label: 'model score' }}
              y={{ domain: [-0.6, 1.6], tickValues: [0, 1], format: (v) => (v === 1 ? 'pos' : 'neg') }}
              height={190}
              ariaLabel={`${examples.length} scored examples; threshold ${thresholdText(t)}`}
            >
              <VLine at={drawnAt(best.threshold)} tone="ok" label="cheapest" />
              <Points data={stripData} r={4} />
              <ThresholdLine at={t} onMove={moveThreshold} onStep={(dir) => moveThreshold(stepThreshold(examples, t, dir))} />
            </Plot2D>
          </div>
          {showPr ? (
            <Plot2D
              x={{ domain: [0, 1], label: 'recall (TPR)', format: (v) => pct(v) }}
              y={{ domain: [0, 1], label: 'precision', format: (v) => pct(v) }}
              height={300}
              ariaLabel={`Precision-recall curve; now recall ${metric(m.recall)}, precision ${metric(m.precision)}`}
            >
              <HLine at={positiveRate(k)} tone="dim" label={`random: ${pct(positiveRate(k))}`} />
              <Curve points={prSteps(points)} tone="info" />
              {prNow && <Points data={[{ x: prNow.x, y: prNow.y, tone: 'hi' }]} r={5.5} />}
            </Plot2D>
          ) : (
            <Plot2D
              x={{ domain: [0, 1], label: 'false-positive rate', format: (v) => pct(v) }}
              y={{ domain: [0, 1], label: 'true-positive rate (recall)', format: (v) => pct(v) }}
              height={300}
              ariaLabel={`ROC curve, AUC ${auc.toFixed(3)}; now FPR ${metric(m.fpr)}, TPR ${metric(m.recall)}`}
            >
              <Curve points={[[0, 0], [1, 1]]} tone="dim" dashed />
              <Curve points={points.map((p) => [p.fpr, p.tpr] as const)} tone="info" />
              <Points data={[{ x: current.x, y: current.y, tone: 'hi' }]} r={5.5} />
            </Plot2D>
          )}
        </div>
        <div className="cm-panels">
          <ConfusionMatrix tp={counts.tp} fp={counts.fp} fn={counts.fn} tn={counts.tn} />
          <Box className="cm-notes">
            <SectionTitle>Reading it</SectionTitle>
            <p>
              AUC {auc.toFixed(3)} is the chance a random positive scores above a random negative (0.5 is a coin flip).
              {showPr ? ' Drawn as steps: straight lines between precision-recall points would overstate precision.' : ''}
            </p>
            {k > 1 && <p>Each sky dot stands for {k} real negatives, so the positive rate is {pct(positiveRate(k))}.</p>}
          </Box>
        </div>
        <Hint className="cm-note">Scores come from a seeded synthetic dataset (seed {seed}), not a trained model. Costs are illustrative.</Hint>
      </div>
    </StageFrame>
  );
}

/** The draggable, keyboard-steppable threshold rule: a custom Plot2D layer. */
function ThresholdLine({ at, onMove, onStep }: { at: number; onMove: (t: number, quiet?: boolean) => void; onStep: (dir: 1 | -1) => void }) {
  const { xs, box, toData } = usePlot();
  const dragging = useRef(false);
  const x = xs.map(drawnAt(at));
  const move = (e: PointerEvent<SVGGElement>) => {
    const p = toData(e.clientX, e.clientY);
    if (p) onMove(p[0], true);
  };
  const onKey = (e: KeyboardEvent<SVGGElement>) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    onStep(dir);
  };
  return (
    <g
      className="cm-threshold"
      role="slider"
      tabIndex={0}
      aria-label="Threshold"
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={Number(drawnAt(at).toFixed(3))}
      aria-valuetext={`threshold ${thresholdText(at)}; arrow keys step one example`}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={(e) => dragging.current && move(e)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
      onKeyDown={onKey}
    >
      <rect className="cm-threshold-hit" x={box.x} y={box.y} width={box.width} height={box.height} />
      <line x1={x} x2={x} y1={box.y} y2={box.y + box.height} />
      <rect className="cm-threshold-grip" x={x - 4} y={box.y + box.height / 2 - 14} width={8} height={28} rx={4} />
    </g>
  );
}
