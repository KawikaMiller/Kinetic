import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Legend, Provenance, ProvenanceRow, Stat, Stats, Toggle } from '../../components/ui';
import { ENUM_MAX_PAYOFF, PRISONERS_DILEMMA, enumerateGames, falseEquilibria, type Finder } from './model';

const fmt = (n: number) => n.toLocaleString('en-US');
const percent = (part: number, whole: number) => `${((part / whole) * 100).toFixed(1)}%`;

/** Scene 3: every 2 x 2 game with payoffs 0 to 3, enumerated on opening: how many pure equilibria each has, and whether the no-pure ones all have a mixed one. */
export function EnumScene({ picker }: { picker: ReactNode }) {
  const result = useMemo(() => enumerateGames(), []);
  const [finder, setFinder] = useState<Finder>('correct');
  const histogram = finder === 'correct' ? result.histogram : result.brokenHistogram;
  const top = Math.max(...histogram);
  const witness = falseEquilibria(PRISONERS_DILEMMA)[0];

  return (
    <StageFrame
      height={500}
      intro={
        <>
          Over all {fmt(result.total)} games of 2 x 2 with payoffs from 0 to {ENUM_MAX_PAYOFF}: {fmt(result.noPure)} have no pure equilibrium, and {fmt(result.mixedValid)} of those have a mixed one, with both probabilities strictly between 0 and 1 and both players exactly indifferent.
        </>
      }
      introKey={`enum|${finder}`}
      stats={
        <Stats>
          <Stat label="Games checked" value={fmt(result.total)} color="var(--info)" sub={`4^8: payoffs 0 to ${ENUM_MAX_PAYOFF}, eight numbers`} />
          <Stat label="No pure equilibrium" value={fmt(result.noPure)} color="var(--violet)" sub={percent(result.noPure, result.total)} />
          <Stat label="With a mixed one" value={fmt(result.mixedValid)} color="var(--ok)" sub={`of those ${fmt(result.noPure)}`} />
          {finder === 'rowOnly' && <Stat label="Broken finder differs" value={fmt(result.brokenDiffers)} color="var(--bad)" sub={`of ${fmt(result.total)} (${percent(result.brokenDiffers, result.total)})`} />}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'games with this many pure equilibria (correct finder)', shape: 'square' },
            { color: 'var(--bad)', label: 'the same count by the finder that checks only Row', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Equilibrium finder" value={finder === 'rowOnly'} onChange={(broken) => setFinder(broken ? 'rowOnly' : 'correct')} off="Checks both players" on="Checks only Row (broken)" />
        </>,
      ]}
    >
      <div className="gt-stage stage-pad">
        <div className="gt-bars" role="list" aria-label="Number of games by number of pure equilibria">
          {histogram.map((count, k) => (
            <div key={k} role="listitem">
              <Bar value={count} max={top} tone={finder === 'correct' ? 'ok' : 'bad'} label={`${k} pure ${k === 1 ? 'equilibrium' : 'equilibria'}`} trailing={`${fmt(count)} (${percent(count, result.total)})`} />
            </div>
          ))}
        </div>
        <p className="gt-note">
          Checked on all {fmt(result.total)} games with payoffs 0 to {ENUM_MAX_PAYOFF}, by trying every cell against every unilateral deviation. That is a check of these games, not a proof for every game: the general statement is the theorem named below.
          Ties are not a reason to move, so an equilibrium needs no strictly profitable deviation; counting ties as moves would change the histogram.
        </p>
        {finder === 'rowOnly' && (
          <div className="gt-witness" role="note">
            <b>The finder that checks only Row fails on {fmt(result.brokenDiffers)} of {fmt(result.total)} games.</b> Smallest instance: {witness.message} Row has nothing to gain there, but Column does.
          </div>
        )}
      </div>
      <ProvenanceRow>
        <Provenance kind="real">computed on opening: the enumeration runs in this page over every game</Provenance>
        <ClaimLabel kind="theorem">every finite two-player game has a Nash equilibrium, possibly mixed (Nash, 1950, from memory; verify against his PNAS paper); checked here only on these games</ClaimLabel>
      </ProvenanceRow>
    </StageFrame>
  );
}
