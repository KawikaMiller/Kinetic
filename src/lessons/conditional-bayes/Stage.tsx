import { useState } from 'react';
import { CellGrid, type GridCellSpec } from '../../components/CellGrid';
import { ConfusionMatrix } from '../../components/ConfusionMatrix';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { TreeSvg } from '../../components/TreeSvg';
import { Button, ChipButton, ControlGroup, Hint, Legend, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import type { Tone } from '../../core/tone';
import { bayesCaption, filterCaption, gridRatio } from './frames';
import {
  MAX_TESTS, POPULATION, PRESETS, SCALE, bayesTerms, groupCounts, groupOf, probText, rateText, type Group, type Preset, type Rates,
} from './model';
import './styles.css';

const GRID_COLS = 40;
const GRID_ROWS = POPULATION / GRID_COLS;
const PREV_MAX = 500;
const RATE_MIN = 500;
/** How strongly a negative person's dot is washed toward their colour. */
const NEGATIVE_WASH = 0.3;

/** Truth is a category (violet / sky); the test result is the shape (filled / outline). */
const TRUTH_TONE: Record<Group, Tone> = { tp: 'violet', fn: 'violet', fp: 'sky', tn: 'sky' };
const POSITIVE: Record<Group, boolean> = { tp: true, fn: false, fp: true, tn: false };

type TreeId = 'all' | 'has' | 'not' | Group;
const TREE_CHILDREN: Record<TreeId, TreeId[]> = { all: ['has', 'not'], has: ['tp', 'fn'], not: ['fp', 'tn'], tp: [], fn: [], fp: [], tn: [] };
const TREE_W = 400;
const TREE_H = 190;
const NODE_W = 90;
const NODE_H = 36;

/** Small probabilities as decimals with four significant digits: 0.0099, 0.01098. */
const dec = (v: number) => (v === 0 ? '0' : String(Number(v.toPrecision(4))));

export function Stage() {
  const [preset, setPreset] = useState<Preset>(PRESETS[0]);
  const [rates, setRates] = useState<Rates>(PRESETS[0].rates);
  const [tests, setTests] = useState(1);
  const [onlyPositives, setOnlyPositives] = useState(false);
  const setCaption = useSetCaption();
  const labels = preset.labels;
  const counts = groupCounts(rates, tests);
  const t = bayesTerms(rates, tests);
  const grid = gridRatio(rates, tests);

  useIntroCaption(bayesCaption(PRESETS[0].rates, PRESETS[0].labels));

  const show = (r: Rates, p: Preset, k: number, only: boolean) => setCaption(only ? filterCaption(r, p.labels, k) : bayesCaption(r, p.labels, k));
  const loadPreset = (p: Preset) => {
    setPreset(p);
    setRates(p.rates);
    setTests(1);
    show(p.rates, p, 1, onlyPositives);
  };
  const setRate = (key: keyof Rates, v: number) => {
    const next = { ...rates, [key]: v };
    setRates(next);
    setTests(1);
    show(next, preset, 1, onlyPositives);
  };
  const filter = (only: boolean) => {
    setOnlyPositives(only);
    show(rates, preset, tests, only);
  };
  const updateAgain = () => {
    setTests(tests + 1);
    show(rates, preset, tests + 1, onlyPositives);
  };
  const resetTests = () => {
    setTests(1);
    show(rates, preset, 1, onlyPositives);
  };

  const cell = (r: number, c: number): GridCellSpec => {
    const g = groupOf(counts, r * GRID_COLS + c);
    if (onlyPositives && !POSITIVE[g]) return { tone: 'dim', fill: 'solid' };
    // A 1,000-cell grid paints on a canvas, which draws no cell edges, so a negative is a faint wash rather than an outline.
    return POSITIVE[g] ? { tone: TRUTH_TONE[g], fill: 'solid' } : { tone: TRUTH_TONE[g], fill: 'tint', intensity: NEGATIVE_WASH };
  };

  const treeText: Record<TreeId, [string, string]> = {
    all: [`${POPULATION.toLocaleString('en-US')} people`, tests === 1 ? 'no test yet' : `prior ${probText(t.prior)}`],
    has: [labels.positive, `${counts.tp + counts.fn} · ${probText(t.prior)}`],
    not: [labels.negative, `${counts.fp + counts.tn} · ${probText(1 - t.prior)}`],
    tp: ['positive', `${counts.tp} · ${rateText(rates.sensitivity)}`],
    fn: ['negative', `${counts.fn} · ${rateText(SCALE - rates.sensitivity)}`],
    fp: ['positive', `${counts.fp} · ${rateText(SCALE - rates.specificity)}`],
    tn: ['negative', `${counts.tn} · ${rateText(rates.specificity)}`],
  };
  const treeTone = (id: TreeId): string => (id === 'all' ? 'muted' : id === 'has' ? 'violet' : id === 'not' ? 'sky' : TRUTH_TONE[id]);
  const treeFilled = (id: TreeId) => id === 'tp' || id === 'fp';

  return (
    <StageFrame
      height={520}
      stats={
        <Stats>
          <Stat label={`P(${labels.positive} | positive)`} value={probText(t.posterior)} color="var(--hi)" sub="exact" />
          <Stat label="In the grid" value={grid.text} sub={`${grid.caught} of ${grid.positives} positives (rounded people)`} />
          <Stat label="Positive tests so far" value={tests} sub={tests > 1 ? `prior = last posterior, ${probText(t.prior)}` : `prior = base rate, ${rateText(rates.prevalence)}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: labels.positive, shape: 'dot' },
            { color: 'var(--sky)', label: labels.negative, shape: 'dot' },
            { color: 'var(--muted)', label: 'bright = tested positive · faint = negative', shape: 'dot' },
            { color: 'var(--dim)', label: 'filtered out', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <ControlGroup key="presets" label="Presets">
          {PRESETS.map((p) => (
            <ChipButton key={p.id} tone="info" on={p.id === preset.id && rates === p.rates} onClick={() => loadPreset(p)}>{p.label}</ChipButton>
          ))}
        </ControlGroup>,
        <>
          <Slider label="Prevalence" value={rates.prevalence} min={1} max={PREV_MAX} format={rateText} onChange={(v) => setRate('prevalence', v)} />
          <Slider label="Sensitivity" value={rates.sensitivity} min={RATE_MIN} max={SCALE} format={rateText} onChange={(v) => setRate('sensitivity', v)} />
          <Slider label="Specificity" value={rates.specificity} min={RATE_MIN} max={SCALE} format={rateText} onChange={(v) => setRate('specificity', v)} />
        </>,
        <>
          <Toggle label="Show" value={onlyPositives} onChange={filter} off="Everyone" on="Only positives" />
          <Button onClick={updateAgain} disabled={tests >= MAX_TESTS}>Update again: another positive test</Button>
          <Button onClick={resetTests} disabled={tests === 1}>Back to one test</Button>
        </>,
      ]}
    >
      <div className="stage-pad cbz-stage">
        <div className="cbz-crowd">
          <SectionTitle hint={`${GRID_COLS} × ${GRID_ROWS}, one dot per person`}>
            {POPULATION.toLocaleString('en-US')} people{tests > 1 ? `, each already positive ${tests - 1}×` : ''}
          </SectionTitle>
          <CellGrid
            rows={GRID_ROWS}
            cols={GRID_COLS}
            size={{ cell: 12, gap: 2 }}
            cell={cell}
            ariaLabel={`${POPULATION} people: ${counts.tp} ${labels.positive} and positive, ${counts.fn} ${labels.positive} and negative, ${counts.fp} ${labels.negative} and positive, ${counts.tn} ${labels.negative} and negative`}
            className="cbz-grid"
          />
          <Hint className="cbz-note">
            The grid shows expected counts rounded to whole people; the percentages are exact. Preset rates are illustrative.
          </Hint>
        </div>
        <div className="cbz-panels">
          <div className="cbz-matrix">
            <SectionTitle hint="whole people, rounded">Counts in the grid</SectionTitle>
            <ConfusionMatrix tp={counts.tp} fp={counts.fp} fn={counts.fn} tn={counts.tn} labels={labels} metrics={false} />
            <p className="cbz-exact">
              Exact, from the rates: recall (sensitivity) = <b>{rateText(rates.sensitivity)}</b>, precision = P({labels.positive} | positive) ={' '}
              <b className="cbz-post">{probText(t.posterior)}</b>. Ratios of the rounded counts can differ.
            </p>
          </div>
          <Box className="cbz-bayes">
            <SectionTitle>Bayes, with these numbers</SectionTitle>
            <p className="cbz-formula">P(A | +) = P(+ | A) · P(A) / P(+)</p>
            <p className="cbz-formula">
              = <span className="cbz-term is-has">{probText(t.sens)} × {probText(t.prior)}</span> / (
              <span className="cbz-term is-has">{dec(t.joint)}</span> + <span className="cbz-term is-not">{probText(t.fpr)} × {probText(1 - t.prior)}</span>)
            </p>
            <p className="cbz-formula">
              = {dec(t.joint)} / {dec(t.positive)} = <b className="cbz-post">{probText(t.posterior)}</b>
            </p>
            <Hint tone="muted" block>
              Violet terms are the {labels.positive} who test positive; the sky term is the false alarms. A = {labels.positive}.
              {tests > 1 && ' Assumes this test\'s errors are independent of the earlier ones, given whether the person really has it.'}
            </Hint>
          </Box>
          <TreeSvg<TreeId>
            shape={{ root: 'all', children: (id) => TREE_CHILDREN[id] }}
            layout="tidy"
            width={TREE_W}
            height={TREE_H}
            top={NODE_H / 2 + 2}
            bottomRoom={NODE_H / 2 + 4}
            className="cbz-tree"
            ariaLabel={`Probability tree: ${counts.tp + counts.fn} ${labels.positive}, of whom ${counts.tp} test positive; ${counts.fp + counts.tn} ${labels.negative}, of whom ${counts.fp} test positive`}
            renderNode={(id) => (
              <g className={`cbz-node tone-${treeTone(id)} ${treeFilled(id) ? 'is-filled' : ''}`}>
                <rect x={-NODE_W / 2} y={-NODE_H / 2} width={NODE_W} height={NODE_H} rx={7} />
                <text y={-3} textAnchor="middle">{treeText[id][0]}</text>
                <text y={11} textAnchor="middle" className="cbz-node-sub">{treeText[id][1]}</text>
              </g>
            )}
          />
        </div>
      </div>
    </StageFrame>
  );
}
