import { useMemo, type ReactNode } from 'react';
import { ConfusionMatrix } from '../../components/ConfusionMatrix';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, Plot2D, Points, Segments, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Stat, Stats } from '../../components/ui';
import { pct } from '../../core/format';
import { usePlayer } from '../../core/usePlayer';
import { DataControls, DataPlot, PLOT_H, SceneLegend, type Editor } from './DataPlot';
import { radiusFromWeight, regionOf } from './view';
import { boostFrames, num } from './frames';
import { DOMAIN, MAX_ROUNDS, accuracy, adaboost, boostScore, confusion, predictBoost, type Dataset } from './model';

/** Region tint at |score| ≥ this; weaker votes fade toward the boundary. */
const SCORE_FULL = 1.5;
const BOOST_TINT = 0.4;
const ERR_W = 356;
const ERR_H = 200;
const PLAY_MS = 1100;

export function BoostScene({ picker, data, editor }: { picker: ReactNode; data: Dataset; editor: Editor }) {
  const boost = useMemo(() => adaboost(data.train), [data.train]);
  const frames = useMemo(() => boostFrames(boost), [boost]);
  const player = usePlayer(frames, { interval: PLAY_MS, autoplayOnChange: false });
  const t = player.frame?.round ?? 0;
  const rounds = useMemo(() => boost.rounds.slice(0, t), [boost, t]);
  const current = boost.rounds[t - 1];
  const predict = (p: { x: number; y: number }) => predictBoost(rounds, p);
  const region = useMemo(
    () => (x: number, y: number) => {
      const s = boostScore(rounds, { x, y });
      return regionOf(s > 0 ? 1 : 0, BOOST_TINT * Math.min(1, Math.abs(s) / SCORE_FULL));
    },
    [rounds],
  );
  const n = data.train.length;
  const stumpLine = current && (current.stump.feature === 0
    ? { from: [current.stump.threshold, DOMAIN.y[0]] as const, to: [current.stump.threshold, DOMAIN.y[1]] as const }
    : { from: [DOMAIN.x[0], current.stump.threshold] as const, to: [DOMAIN.x[1], current.stump.threshold] as const });
  const errs = boost.rounds.map((r, i) => [i + 1, r.trainError] as const);
  const losses = boost.rounds.map((r, i) => [i + 1, r.expLoss] as const);
  const yTop = Math.max(1, ...boost.rounds.map((r) => r.expLoss));

  return (
    <StageFrame
      player={player}
      height={PLOT_H + 40}
      stats={
        <Stats>
          <Stat label="Round" value={`${t} of ${boost.rounds.length}`} color="var(--hi)" />
          <Stat label={<>Stump <span className="keep-case">α</span></>} value={current ? num(current.alpha, 3) : '–'} sub={current ? `ε = ${num(current.error, 3)}` : undefined} />
          <Stat label="Training accuracy" value={pct(accuracy(predict, data.train))} />
          <Stat label="Validation accuracy" value={pct(accuracy(predict, data.val))} />
        </Stats>
      }
      legend={<SceneLegend extra={[{ color: 'var(--hi)', label: "this round's stump", shape: 'line' }, { color: 'var(--muted)', label: 'dot size = weight', shape: 'dot' }]} />}
      controls={[<>{picker}</>, <DataControls key="data" editor={editor} />]}
    >
      <div className="stage-pad dte-row">
        <DataPlot
          data={data}
          region={region}
          predict={predict}
          radius={(i) => radiusFromWeight(current ? current.nextWeights[i] : 1 / n, n)}
          editor={editor}
          ariaLabel={`AdaBoost after ${t} rounds; dot size shows each training point's weight for the next stump`}
        >
          {stumpLine && <Segments segments={[{ ...stumpLine, tone: 'hi' }]} />}
        </DataPlot>
        <div className="dte-side">
          <Box className="dte-errors">
            <SectionTitle hint="training set">Error by round</SectionTitle>
            <Plot2D x={{ domain: [1, MAX_ROUNDS], label: 'round' }} y={{ domain: [0, yTop], label: 'error / loss' }} width={ERR_W} height={ERR_H} ariaLabel="Training error and exponential loss by round">
              <VLine at={Math.max(1, t)} tone="hi" />
              <Curve points={losses} tone="pink" />
              <Curve points={errs} tone="amber" />
              <Points data={errs.map(([x, y]) => ({ x, y, tone: 'amber' }))} r={2.6} />
            </Plot2D>
            <Legend items={[{ color: 'var(--amber)', label: 'training error (can rise)', shape: 'line' }, { color: 'var(--pink)', label: 'exponential loss (never rises)', shape: 'line' }]} />
          </Box>
          <Hint block>Stumps are one-question trees. Each round fits one to the current weights; the combined model votes with weight α. Real libraries (XGBoost, LightGBM) boost deeper trees with gradients; this is classic AdaBoost.</Hint>
        </div>
        <div className="dte-foot">
          <Box className="dte-confusion">
            <SectionTitle hint="positive = violet">Validation set, combined model</SectionTitle>
            <ConfusionMatrix {...confusion(predict, data.val)} labels={{ positive: 'violet', negative: 'blue' }} />
          </Box>
          <Hint block>Seeded synthetic data; trees, forest and boosting are computed live in your browser.</Hint>
        </div>
      </div>
    </StageFrame>
  );
}
