import { useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, Toggle } from '../../components/ui';
import {
  PRISONERS_DILEMMA, claimCell, dominanceText, falseEquilibria, noEquilibriumVerdict, pureEquilibria, strictlyDominated, type Cell, type Finder,
} from './model';
import { PayoffControls, PayoffFields } from './PayoffEditor';
import { PayoffMatrix } from './PayoffMatrix';
import { useGame } from './useGame';

interface Verdict {
  key: string;
  cell: Cell | null;
  ok: boolean;
  message: string;
}

/** Scene 1: the payoff matrix. The learner claims cells are equilibria, or that there is none; each claim is checked against every unilateral deviation. */
export function MatrixScene({ picker }: { picker: ReactNode }) {
  const state = useGame(PRISONERS_DILEMMA);
  const { game } = state;
  const [finder, setFinder] = useState<Finder>('correct');
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const key = `${JSON.stringify([game.A, game.B])}|${finder}`;
  const shown = verdict?.key === key ? verdict : null;
  const equilibria = pureEquilibria(game, finder);
  const dominated = strictlyDominated(game);
  const wrong = finder === 'rowOnly' ? falseEquilibria(game) : [];

  const claim = (r: number, c: number) => {
    const result = claimCell(game, r, c, finder);
    setVerdict({ key, cell: [r, c], ...result });
  };
  const noEquilibrium = () => setVerdict({ key, cell: null, ...noEquilibriumVerdict(game) });

  return (
    <StageFrame
      height={560}
      intro={<>{shown ? `${shown.message} ` : ''}Click a cell to claim it is an equilibrium: a cell where neither player gains by changing only their own strategy.</>}
      introKey={`matrix|${key}|${shown?.message ?? ''}`}
      stats={
        <Stats>
          <Stat label="Pure equilibria" value={equilibria.length} color="var(--ok)" sub={equilibria.length ? equilibria.map(([r, c]) => `(${game.rowNames[r]}, ${game.colNames[c]})`).join(', ') : 'none'} />
          <Stat label="Dominated strategies" value={dominated.length} color="var(--info)" sub="strictly worse against every reply" />
          {finder === 'rowOnly' && <Stat label="False equilibria" value={wrong.length} color="var(--bad)" sub="cells a player can profitably leave" />}
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
          <PayoffControls state={state} />
        </>,
        <>
          <Toggle label="Equilibrium finder" value={finder === 'rowOnly'} onChange={(broken) => setFinder(broken ? 'rowOnly' : 'correct')} off="Checks both players" on="Checks only Row (broken)" />
          <Button onClick={noEquilibrium}>Declare: no pure equilibrium</Button>
          <Hint tone={shown && !shown.ok ? 'bad' : state.error ? 'bad' : 'faint'}>
            <span role="status">{state.error ?? shown?.message ?? 'Payoffs are whole numbers from -9 to 9; edit any cell below the matrix.'}</span>
          </Hint>
        </>,
      ]}
    >
      <div className="gt-stage stage-pad">
        <PayoffMatrix game={game} finder={finder} onCellClick={claim} claimed={shown?.cell ?? null} />
        <PayoffFields state={state} />
        <p className="gt-note">
          Assumptions: two players choose at the same time without seeing each other&apos;s choice, and both know every payoff. A cell shows Row&apos;s payoff, then Column&apos;s.
          An equilibrium here means no player has a strictly better reply: a tie does not count as a reason to move.
        </p>
        {dominated.length > 0 && (
          <ul className="gt-list" aria-label="Dominated strategies">
            {dominated.map((d, i) => <li key={i}>{dominanceText(game, d)}</li>)}
          </ul>
        )}
        {wrong.length > 0 && (
          <div className="gt-witness" role="note">
            <b>Counterexample: the finder that checks only Row calls this an equilibrium.</b>{' '}
            {wrong.map((w) => w.message).join(' ')} Row cannot gain at such a cell, but Column can, and the finder never looked.
          </div>
        )}
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">payoffs are invented whole numbers; real strategic situations rarely fit a 2 x 2 table</Provenance>
        <Provenance kind="from-memory">the names prisoner&apos;s dilemma (1950 origin), battle of the sexes, stag hunt and matching pennies; verify against a game theory text</Provenance>
        <ClaimLabel kind="standard">equilibrium: no player gains by changing only their own strategy</ClaimLabel>
      </ProvenanceRow>
    </StageFrame>
  );
}
