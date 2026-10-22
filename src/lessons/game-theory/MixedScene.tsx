import { useMemo, useState, type ReactNode } from 'react';
import { Curve, Plot2D, Points, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { MIX_STEPS, PRISONERS_DILEMMA, colPayoff, frac, fracText, fracValue, mixed2x2, rowPayoff, type Frac, type Matrix } from './model';
import { PayoffControls, PayoffFields } from './PayoffEditor';
import { PayoffMatrix } from './PayoffMatrix';
import { useGame } from './useGame';

const PLOT_WIDTH = 356;
const PLOT_HEIGHT = 210;
const PLOT_PAD = 1;

const stepFrac = (steps: number): Frac => frac(steps, MIX_STEPS);
const onGrid = (f: Frac) => (f.n * MIX_STEPS) % f.d === 0;
const toSteps = (f: Frac) => (f.n * MIX_STEPS) / f.d;
const fix2 = (f: Frac) => (fracValue(f)).toFixed(2);
const span = (m: Matrix): [number, number] => {
  const all = m.flat();
  return [Math.min(...all) - PLOT_PAD, Math.max(...all) + PLOT_PAD];
};

/** Expected payoff of each pure reply as the opponent's mix moves from 0 to 1: the two lines cross where the player is indifferent. */
function ReplyPlot({
  label, names, payoff, matrix, at, cross,
}: {
  label: string;
  names: readonly string[];
  payoff: (i: number, x: Frac) => Frac;
  matrix: Matrix;
  at: number;
  cross: Frac | null;
}) {
  const [lo, hi] = span(matrix);
  const line = (i: number) => [0, 1].map((x) => [x, fracValue(payoff(i, frac(x, 1)))] as const);
  return (
    <Plot2D
      x={{ domain: [0, 1], label }}
      y={{ domain: [lo, hi], label: 'expected payoff' }}
      width={PLOT_WIDTH}
      height={PLOT_HEIGHT}
      ariaLabel={`Expected payoff of each of ${names.join(' and ')} against the opponent's mix`}
    >
      <Curve points={line(0)} tone="sky" />
      <Curve points={line(1)} tone="pink" />
      <VLine at={at} />
      {cross && <Points data={[{ x: fracValue(cross), y: fracValue(payoff(0, cross)), tone: 'ok' }]} />}
    </Plot2D>
  );
}

/** Scene 2: mixed strategies in a 2 x 2 game: the sliders set each player's mix, the plots show where the opponent is indifferent. */
export function MixedScene({ picker }: { picker: ReactNode }) {
  const state = useGame(PRISONERS_DILEMMA);
  const { game } = state;
  const [pSteps, setP] = useState(MIX_STEPS / 2);
  const [qSteps, setQ] = useState(MIX_STEPS / 2);
  const mixed = useMemo(() => mixed2x2(game), [game]);
  const p = stepFrac(pSteps);
  const q = stepFrac(qSteps);
  const rowNow = [rowPayoff(game.A, 0, q), rowPayoff(game.A, 1, q)];
  const colNow = [colPayoff(game.B, 0, p), colPayoff(game.B, 1, p)];
  const reachable = mixed.kind === 'mixed' && onGrid(mixed.p) && onGrid(mixed.q);
  const jump = () => {
    if (mixed.kind !== 'mixed') return;
    setP(toSteps(mixed.p));
    setQ(toSteps(mixed.q));
  };
  const verdict =
    mixed.kind === 'mixed'
      ? `Mixed equilibrium: Row plays ${game.rowNames[0]} with probability p = ${fracText(mixed.p)}, Column plays ${game.colNames[0]} with probability q = ${fracText(mixed.q)}. There Row earns ${fracText(mixed.rowValue)} from either row and Column earns ${fracText(mixed.colValue)} from either column.`
      : mixed.kind === 'degenerate'
        ? 'No unique mixed equilibrium: the indifference equation has a zero denominator, so a player\'s two replies run parallel or coincide and do not cross at one point.'
        : `The indifference point (p = ${fracText(mixed.p)}, q = ${fracText(mixed.q)}) lies outside 0 to 1, so no mix of both strategies is an equilibrium here.`;

  return (
    <StageFrame
      height={760}
      intro={verdict}
      introKey={`mixed|${JSON.stringify([game.A, game.B])}`}
      stats={
        <Stats>
          <Stat label="p (Row)" value={fracText(p)} color="var(--info)" sub={`chance of ${game.rowNames[0]}`} />
          <Stat label="q (Column)" value={fracText(q)} color="var(--violet)" sub={`chance of ${game.colNames[0]}`} />
          <Stat label="Row earns" value={`${fix2(rowNow[0])} | ${fix2(rowNow[1])}`} color="var(--info)" sub={`from ${game.rowNames[0]} | ${game.rowNames[1]}, against q`} />
          <Stat label="Column earns" value={`${fix2(colNow[0])} | ${fix2(colNow[1])}`} color="var(--violet)" sub={`from ${game.colNames[0]} | ${game.colNames[1]}, against p`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--sky)', label: 'expected payoff of the first strategy', shape: 'line' },
            { color: 'var(--pink)', label: 'expected payoff of the second strategy', shape: 'line' },
            { color: 'var(--ok)', label: 'where the two cross: the opponent is indifferent', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <PayoffControls state={state} resizable={false} />
        </>,
        <>
          <Slider label="p, Row's chance of the first row" value={pSteps} min={0} max={MIX_STEPS} onChange={setP} format={(v) => fracText(stepFrac(v))} />
          <Slider label="q, Column's chance of the first column" value={qSteps} min={0} max={MIX_STEPS} onChange={setQ} format={(v) => fracText(stepFrac(v))} />
          <ChipButton tone="ok" softDisabled={!reachable} onClick={jump}>Set p and q to the equilibrium</ChipButton>
          <Hint tone={state.error ? 'bad' : 'faint'}>
            <span role="status">{state.error ?? (mixed.kind === 'mixed' && !reachable ? `The equilibrium is not a multiple of 1/${MIX_STEPS}, so the sliders cannot land on it.` : `Sliders move in steps of 1/${MIX_STEPS}.`)}</span>
          </Hint>
        </>,
      ]}
    >
      <div className="gt-stage stage-pad">
        <PayoffMatrix game={game} />
        <PayoffFields state={state} />
        <div className="gt-plots">
          <ReplyPlot label="q: Column's chance of the first column" names={game.rowNames} payoff={(i, x) => rowPayoff(game.A, i, x)} matrix={game.A} at={fracValue(q)} cross={mixed.kind === 'mixed' ? mixed.q : null} />
          <ReplyPlot label="p: Row's chance of the first row" names={game.colNames} payoff={(j, x) => colPayoff(game.B, j, x)} matrix={game.B} at={fracValue(p)} cross={mixed.kind === 'mixed' ? mixed.p : null} />
        </div>
        <p className="gt-note">
          Left: what each of Row&apos;s strategies earns as Column&apos;s mix q changes; Row is indifferent where they cross. Right: the same for Column against Row&apos;s mix p. At the equilibrium each player&apos;s mix leaves the other with no reason to prefer a pure reply.
          Probabilities are exact fractions.
        </p>
        <Button onClick={() => { setP(MIX_STEPS / 2); setQ(MIX_STEPS / 2); }}>Reset sliders to 1/2</Button>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">payoffs are invented whole numbers; real strategic situations rarely fit a 2 x 2 table</Provenance>
        <ClaimLabel kind="theorem">every finite two-player game has a Nash equilibrium, possibly mixed (Nash, 1950, from memory); this scene computes the 2 x 2 formula exactly</ClaimLabel>
      </ProvenanceRow>
    </StageFrame>
  );
}
