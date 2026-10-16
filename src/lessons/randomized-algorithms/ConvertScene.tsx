import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { census, meanWitnessTries, witnessHunt } from './primality';
import { N_PRESETS, OPENING } from './presets';
import { expectedComparisons, fixedPivotWorst, quicksort, randomPivotCounts, shapeArray } from './sorting';

const HUNTS = 1000;
const BUDGETS = [1, 1.5, 2, 3];
const SORT_N = 100;
const COMPOSITES = N_PRESETS.filter((p) => p.id !== 'prime');
const fmt = (x: number) => Math.round(x).toLocaleString('en-US');

/** Scene 4, converting between the two families: a certificate turns Monte Carlo into Las Vegas; a budget turns it back. */
export function ConvertScene({ picker }: { picker: ReactNode }) {
  const [n, setN] = useState<bigint>(OPENING.convert.n);
  const [budget, setBudget] = useState<number>(OPENING.convert.budget);
  const [seed, setSeed] = useState<number>(OPENING.convert.seed);

  const stats = useMemo(() => census(n, seed), [n, seed]);
  const firstHunt = useMemo(() => witnessHunt(n, seed), [n, seed]);
  const meanTries = useMemo(() => meanWitnessTries(n, HUNTS, seed), [n, seed]);
  const exactTries = 1 / (1 - stats.fraction);

  const input = useMemo(() => shapeArray('random', SORT_N, seed), [seed]);
  const counts = useMemo(() => randomPivotCounts(input, 1000, seed), [input, seed]);
  const expected = expectedComparisons(SORT_N);
  const limit = budget * expected;
  const over = counts.filter((c) => c > limit).length / counts.length;
  const fixedOnSorted = quicksort(shapeArray('sorted', SORT_N, seed), 'first').comparisons;

  return (
    <StageFrame
      height={470}
      intro={
        <>
          Retrying until a verifier agrees turned a Monte Carlo test into a Las Vegas one: a witness for {n.toString()} took {firstHunt} draw{firstHunt === 1 ? '' : 's'} here and {meanTries.toFixed(2)} on average over {HUNTS.toLocaleString('en-US')} hunts. A time budget turns Las Vegas back into Monte Carlo: stopping at {budget}x the expected work means guessing in {(over * 100).toFixed(1)}% of runs.
        </>
      }
      introKey={`${n}-${budget}-${seed}-${firstHunt}-${over}`}
      stats={
        <Stats>
          <Stat label="Tries until a witness" value={firstHunt} color="var(--ok)" sub="one seeded hunt" />
          <Stat label={`Mean over ${HUNTS.toLocaleString('en-US')} hunts`} value={meanTries.toFixed(2)} color="var(--ok)" sub={[`exact: 1 / (1 - liar share) = ${exactTries.toFixed(2)}`, 'at most 4/3 whenever the share is at most 1/4']} />
          <Stat label="Runs over the budget" value={`${(over * 100).toFixed(1)}%`} color="var(--bad)" sub={`budget ${fmt(limit)} comparisons`} />
          <Stat label="Fixed pivot, sorted input" value={fmt(fixedOnSorted)} color="var(--bad)" sub={fixedOnSorted > limit ? 'over every budget here: it always gives up' : 'within the budget'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'certified answer (a witness)', shape: 'square' },
            { color: 'var(--orange)', label: 'liar bases: why a hunt can take more than one try', shape: 'square' },
            { color: 'var(--bad)', label: 'runs that overrun the budget and would have to guess', shape: 'square' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          {COMPOSITES.map((p) => (
            <ChipButton key={p.id} tone="info" on={n === p.n} onClick={() => setN(p.n)}>{p.label}</ChipButton>
          ))}
          <Segmented label="Budget (x expected)" value={budget} onChange={setBudget} options={BUDGETS.map((b) => ({ value: b, label: `${b}x` }))} />
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="ra-stage stage-pad">
        <h4 className="ra-h">Monte Carlo to Las Vegas: retry until the verifier agrees</h4>
        <p className="ra-note">
          One Miller-Rabin round on the composite {n.toString()} can be fooled by a liar base ({stats.liars} of {stats.bases}), but a base that does expose it is a certificate anyone can check in a moment. Draw bases until one does: the answer is then always right, and only the number of tries is random. This works for a composite; for a prime the hunt would never end, which is why a "prime" verdict stays probabilistic.
        </p>
        <Bar value={meanTries} max={4 / 3 + 0.5} tone="ok" label="mean tries" trailing={meanTries.toFixed(2)} />
        <p className="ra-note">
          Karger's min-cut has no such shortcut: nothing cheap certifies that a cut is minimum, so it stays Monte Carlo and the lesson's last scene says how many repeats buy a given confidence.
        </p>
        <h4 className="ra-h">Las Vegas to Monte Carlo: stop at a budget and guess</h4>
        <p className="ra-note">
          Random-pivot quicksort on {SORT_N} keys is expected to take {fmt(expected)} comparisons. Stop after {fmt(limit)} ({budget}x) and guess the order: that happened in {(over * 100).toFixed(1)}% of {counts.length.toLocaleString('en-US')} seeded runs, so the answer is now wrong with that probability but the time is bounded. A fixed pivot on sorted input needs {fmt(fixedOnSorted)} (n(n-1)/2 = {fmt(fixedPivotWorst(SORT_N))}), {fixedOnSorted > limit ? 'so the same budget makes it give up every time.' : 'which fits inside this budget.'}
        </p>
        <Bar value={over} max={1} tone="bad" label="runs that overrun" trailing={`${(over * 100).toFixed(1)}%`} />
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated" seed={seed}>{HUNTS.toLocaleString('en-US')} seeded witness hunts and 1,000 seeded sorts</Provenance>
        <Provenance kind="real">the witness test is a real Miller-Rabin round; the counts are comparisons, not time</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
