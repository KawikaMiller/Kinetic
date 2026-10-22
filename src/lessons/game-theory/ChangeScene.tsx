import { useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { CLASSIC_DILEMMA, PAYOFF_MAX, PAYOFF_MIN, cooperationCondition, dilemmaGame, flips, pureEquilibria, type Dilemma } from './model';
import { PayoffMatrix } from './PayoffMatrix';

/** Scene 4: change the game. Edit the dilemma's payoffs until cooperation is stable, and see which cell flips and the condition behind it. */
export function ChangeScene({ picker }: { picker: ReactNode }) {
  const [d, setD] = useState<Dilemma>(CLASSIC_DILEMMA);
  const game = dilemmaGame(d);
  const equilibria = pureEquilibria(game);
  const changed = flips(d);
  const condition = cooperationCondition(d);
  const set = (key: keyof Dilemma) => (value: number) => setD({ ...d, [key]: value });
  const name = (r: number, c: number) => `(${game.rowNames[r]}, ${game.colNames[c]})`;
  const flipText = changed.length
    ? changed.map((f) => `${name(f.cell[0], f.cell[1])} ${f.becameEquilibrium ? 'became' : 'stopped being'} an equilibrium`).join('; ')
    : 'no cell has flipped from the classic dilemma';

  return (
    <StageFrame
      height={560}
      intro={<>{condition.holds ? `Cooperation is stable: ${condition.row}.` : `Cooperation is not stable: ${condition.row}.`} Compared with the classic dilemma, {flipText}.</>}
      introKey={`change|${d.R}|${d.T}|${d.S}|${d.P}`}
      stats={
        <Stats>
          <Stat label="Equilibria" value={equilibria.length} color="var(--ok)" sub={equilibria.map(([r, c]) => name(r, c)).join(', ') || 'none'} />
          <Stat label="Mutual cooperation pays" value={`${d.R} each`} color="var(--info)" sub={`defecting alone pays ${d.T}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: "a blue dot: Row's best reply in that column", shape: 'dot' },
            { color: 'var(--violet)', label: "a violet dot: Column's best reply in that row", shape: 'dot' },
            { color: 'var(--ok)', label: 'both dots: an equilibrium', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Both cooperate (R)" value={d.R} min={PAYOFF_MIN} max={PAYOFF_MAX} onChange={set('R')} />
          <Slider label="Defect alone (T)" value={d.T} min={PAYOFF_MIN} max={PAYOFF_MAX} onChange={set('T')} />
          <Slider label="Cooperate alone (S)" value={d.S} min={PAYOFF_MIN} max={PAYOFF_MAX} onChange={set('S')} />
          <Slider label="Both defect (P)" value={d.P} min={PAYOFF_MIN} max={PAYOFF_MAX} onChange={set('P')} />
          <Button onClick={() => setD(CLASSIC_DILEMMA)}>Back to the classic dilemma</Button>
        </>,
      ]}
    >
      <div className="gt-stage stage-pad">
        <PayoffMatrix game={game} />
        <ul className="gt-list" aria-label="The condition for cooperation to be stable">
          <li>{condition.row}.</li>
          <li>{condition.column}.</li>
          <li>The cell (Cooperate, Cooperate) is an equilibrium exactly when both hold: R = {d.R} against T = {d.T}.</li>
        </ul>
        <p className="gt-note">
          The payoffs are symmetric: the same R, T, S and P for both players. {d.R >= d.T
            ? `R = ${d.R} is already at or above T = ${d.T}, so a cooperating partner has no reason to defect and (Cooperate, Cooperate) is an equilibrium; (Defect, Defect) stays one while P is at least S, so the game then has a second equilibrium.`
            : `Raising R to ${d.T} or more would remove the reason to defect from a cooperating partner and make (Cooperate, Cooperate) an equilibrium too.`}
        </p>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">payoffs are invented whole numbers; real strategic situations rarely fit a 2 x 2 table</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
