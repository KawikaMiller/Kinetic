import { useMemo, useState } from 'react';
import { Curve, Plot2D, Points, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { polyEval } from '../../core/fit';
import type { Point } from '../../core/plot';
import { fitCaption, lambdaText, mseText, peekCaption } from './frames';
import {
  LAMBDA_EXP_MAX, LAMBDA_EXP_MIN, LAMBDA_EXP_STEP, MAX_DEGREE, MAX_TRAIN, MIN_TRAIN, PRESET_IDS, PRESET_LABELS, TEST_SET, X_RANGE,
  bestBy, degreeCurve, fitPoly, lambdaCurve, makeSplit, mseOf, peekAtTest, presetSettings, trueCurve,
  type ErrorPoint, type Peek, type PresetId, type Settings,
} from './model';
import './styles.css';

type ErrorMode = 'degree' | 'lambda';
const ERROR_MODES: { value: ErrorMode; label: string }[] = [
  { value: 'degree', label: 'Error by degree' },
  { value: 'lambda', label: 'Error by λ' },
];

const PLOT_W = 356;
const DATA_H = 300;
const ERROR_H = 260;
const Y_RANGE: readonly [number, number] = [-2, 2];
/** The error plot's log axis is clipped here, so a wild fit doesn't squash everything else flat. */
const ERROR_CAP = 1e3;
const ERROR_FLOOR = 1e-3;
/** One notch below the λ grid: the slider's "off". */
const LAMBDA_OFF_EXP = LAMBDA_EXP_MIN - LAMBDA_EXP_STEP;
const N_STEP = 5;
const START: Settings = { degree: 3, nTrain: 30, lambda: 0 };
const FIRST_SPLIT = 1;

const toLambda = (e: number) => (e <= LAMBDA_OFF_EXP ? 0 : 10 ** e);
const toExp = (lambda: number) => (lambda === 0 ? LAMBDA_OFF_EXP : Math.log10(lambda));

export function Stage() {
  const [s, setS] = useState<Settings>(START);
  const [splitSeed, setSplitSeed] = useState(FIRST_SPLIT);
  const [mode, setMode] = useState<ErrorMode>('degree');
  const [peek, setPeek] = useState<Peek | null>(null);
  const [peekSeed, setPeekSeed] = useState<number | null>(null);
  const [loaded, setLoaded] = useState<PresetId | null>(null);
  const setCaption = useSetCaption();
  const split = useMemo(() => makeSplit(s.nTrain, splitSeed), [s.nTrain, splitSeed]);
  const fit = fitPoly(split.train, s.degree, s.lambda);
  const byDegree = useMemo(() => degreeCurve(split, s.lambda), [split, s.lambda]);
  const byLambda = useMemo(() => lambdaCurve(split, s.degree), [split, s.degree]);
  const bestDegree = bestBy(byDegree);
  const bestLambda = bestBy(byLambda);

  useIntroCaption(fitCaption(START, makeSplit(START.nTrain, FIRST_SPLIT)));

  const apply = (next: Settings, seed = splitSeed, quiet = false) => {
    setS(next);
    setSplitSeed(seed);
    setCaption(fitCaption(next, makeSplit(next.nTrain, seed)), { quiet });
  };
  const slide = (patch: Partial<Settings>) => {
    setLoaded(null);
    apply({ ...s, ...patch }, splitSeed, true);
  };
  const load = (id: PresetId) => {
    setLoaded(id);
    apply(presetSettings(id, splitSeed));
  };
  const look = () => {
    const p = peekAtTest(split, s.degree, s.lambda);
    if (!p) return;
    setPeek(p);
    setPeekSeed(splitSeed);
    setCaption(peekCaption(p));
  };

  const train = fit.ok ? mseOf(fit.coeffs, split.train) : null;
  const val = fit.ok ? mseOf(fit.coeffs, split.val) : null;
  const curve = mode === 'degree' ? byDegree : byLambda;
  const errs = curve.flatMap((p) => [p.train, p.val]);
  const yLo = Math.max(ERROR_FLOOR, Math.min(...errs) / 2);
  const yHi = Math.min(ERROR_CAP, Math.max(...errs) * 2);
  const peekHere = peek && peekSeed === splitSeed && peek.lambda === s.lambda && peek.nTrain === s.nTrain && mode === 'degree' && peek.test <= yHi;
  const line = (pts: readonly ErrorPoint[], key: 'train' | 'val'): Point[] => pts.map((p) => [p.at, Math.min(p[key], ERROR_CAP * 10)]);

  return (
    <StageFrame
      height={DATA_H + 40}
      stats={
        <Stats>
          <Stat label="Training MSE" value={train === null ? '–' : mseText(train)} color="var(--info)" />
          <Stat label="Validation MSE" value={val === null ? '–' : mseText(val)} color="var(--violet)" />
          <Stat label="Best degree (validation)" value={bestDegree?.at ?? '–'} color="var(--ok)" sub={lambdaText(s.lambda)} />
          <Stat
            label="Test MSE"
            value={peek ? mseText(peek.test) : 'not looked at'}
            color={peek ? 'var(--orange)' : undefined}
            sub={peek ? `degree ${peek.degree}, ${lambdaText(peek.lambda)}, ${peek.nTrain} points` : `${TEST_SET.length} held-out points`}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'training points; training error', shape: 'dot' },
            { color: 'var(--violet)', label: 'validation points (hollow); validation error', shape: 'dot' },
            { color: 'var(--hi)', label: 'fitted curve; current setting', shape: 'line' },
            { color: 'var(--dim)', label: 'hidden true curve (dashed)', shape: 'line' },
            { color: 'var(--ok)', label: mode === 'degree' ? 'best degree' : 'best λ', shape: 'line' },
            ...(peek ? [{ color: 'var(--orange)', label: 'test error (looked at once)', shape: 'dot' as const }] : []),
          ]}
        />
      }
      controls={[
        <>
          <Slider label="Degree" value={s.degree} min={0} max={MAX_DEGREE} onChange={(degree) => slide({ degree })} />
          <Slider
            label="Ridge λ"
            value={toExp(s.lambda)}
            min={LAMBDA_OFF_EXP}
            max={LAMBDA_EXP_MAX}
            step={LAMBDA_EXP_STEP}
            format={(e) => (toLambda(e) === 0 ? 'off' : String(Number(toLambda(e).toPrecision(2))))}
            onChange={(e) => slide({ lambda: toLambda(e) })}
          />
          <Slider label="Training points" value={s.nTrain} min={MIN_TRAIN} max={MAX_TRAIN} step={N_STEP} onChange={(nTrain) => slide({ nTrain })} />
        </>,
        <>
          <Button onClick={() => apply(s, splitSeed + 1)}>Reshuffle split (seed {splitSeed + 1})</Button>
          <Segmented ariaLabel="Error plot" options={ERROR_MODES} value={mode} onChange={setMode} />
          {/* Stays enabled once used, so pressing it never drops keyboard focus: it just shows the result again. */}
          <Button onClick={peek ? () => setCaption(peekCaption(peek)) : look} disabled={!peek && !fit.ok}>
            {peek ? 'Test set already used: show result' : 'Peek at the test set (once)'}
          </Button>
        </>,
        <ControlGroup key="presets" label="Presets">
          {PRESET_IDS.map((id) => (
            <ChipButton key={id} tone="info" on={loaded === id} onClick={() => load(id)}>{PRESET_LABELS[id]}</ChipButton>
          ))}
        </ControlGroup>,
      ]}
    >
      <div className="stage-pad sl-row">
        <Plot2D x={{ domain: X_RANGE, label: 'x' }} y={{ domain: Y_RANGE, label: 'y' }} width={PLOT_W} height={DATA_H} className="sl-plot" ariaLabel={`Degree ${s.degree} fit to ${split.train.length} training points`}>
          <Curve fn={trueCurve} tone="dim" dashed />
          {fit.ok && <Curve fn={(x) => polyEval(fit.coeffs, x)} tone="hi" />}
          <Points data={split.val.map((p) => ({ x: p.x, y: p.y, tone: 'violet', hollow: true }))} r={3.5} />
          <Points data={split.train.map((p) => ({ x: p.x, y: p.y, tone: 'info' }))} r={3.5} />
        </Plot2D>
        <Plot2D
          x={mode === 'degree' ? { domain: [0, MAX_DEGREE], label: 'polynomial degree', tickValues: [0, 2, 4, 6, 8, 10, 12] } : { domain: [10 ** LAMBDA_EXP_MIN, 10 ** LAMBDA_EXP_MAX], log: true, label: `ridge λ (degree ${s.degree})` }}
          y={{ domain: [yLo, yHi], log: true, label: 'MSE' }}
          width={PLOT_W}
          height={ERROR_H}
          className="sl-plot"
          ariaLabel={mode === 'degree' ? `Training and validation error by degree; best degree ${bestDegree?.at}` : `Error by λ at degree ${s.degree}; best λ ${bestLambda?.at}`}
        >
          {mode === 'degree' && bestDegree && <VLine at={bestDegree.at} tone="ok" label={`best ${bestDegree.at}`} />}
          {mode === 'lambda' && bestLambda && <VLine at={bestLambda.at} tone="ok" label={`best ${lambdaText(bestLambda.at)}`} />}
          {mode === 'degree' && <VLine at={s.degree} tone="hi" />}
          {mode === 'lambda' && s.lambda > 0 && <VLine at={s.lambda} tone="hi" />}
          <Curve points={line(curve, 'train')} tone="info" />
          <Curve points={line(curve, 'val')} tone="violet" />
          <Points data={curve.filter((p) => p.train <= yHi).map((p) => ({ x: p.at, y: p.train, tone: 'info' }))} r={3} />
          <Points data={curve.filter((p) => p.val <= yHi).map((p) => ({ x: p.at, y: p.val, tone: 'violet', hollow: true }))} r={3} />
          {peekHere && <Points data={[{ x: peek.degree, y: peek.test, tone: 'orange' }]} r={5} />}
        </Plot2D>
        <div className="sl-notes">
          {!fit.ok && <p className="sl-refusal" role="alert">{fit.reason}</p>}
          <Hint block>
            Synthetic data from a known curve plus seeded noise, so we can show the true curve. With real data you never see it. Errors above{' '}
            {ERROR_CAP.toLocaleString('en-US')} run off the top of the error plot. Ridge adds λ × each coefficient² to the error, except the intercept's. Fits are solved by QR. Real projects often average several splits (cross-validation).
          </Hint>
        </div>
      </div>
    </StageFrame>
  );
}
