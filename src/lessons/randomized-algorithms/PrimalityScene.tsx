import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { Curve, Plot2D, Points } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, TextField } from '../../components/ui';
import { boundAfter, census, classify, exactErrorAfter, MAX_ROUNDS, rounds, trialErrors, TRIALS } from './primality';
import { N_PRESETS, OPENING, parseN } from './presets';

const ERROR_FLOOR = 1e-6;
/** Below 5 there are no bases 2..n-2 to draw: 2 and 3 are prime, 4 is even. */
const SMALLEST_TESTED = 5n;
const KS = Array.from({ length: MAX_ROUNDS }, (_, i) => i + 1);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** Scene 3, one-sided error: Miller-Rabin with random bases. A "no" is certain; a "yes" is probabilistic. */
export function PrimalityScene({ picker }: { picker: ReactNode }) {
  const [n, setN] = useState<bigint>(OPENING.primality.n);
  const [draft, setDraft] = useState(String(OPENING.primality.n));
  const [error, setError] = useState<string | null>(null);
  const [k, setK] = useState<number>(OPENING.primality.rounds);
  const [seed, setSeed] = useState<number>(OPENING.primality.seed);

  const edit = (text: string) => {
    setDraft(text);
    const parsed = parseN(text);
    if (parsed.ok) {
      setN(parsed.value);
      setError(null);
    } else {
      setError(parsed.error);
    }
  };
  const load = (value: bigint) => {
    setN(value);
    setDraft(String(value));
    setError(null);
  };

  const kind = useMemo(() => classify(n), [n]);
  const oddComposite = kind === 'odd-composite';
  const stats = useMemo(() => (oddComposite ? census(n, seed) : null), [n, oddComposite, seed]);
  const trials = useMemo(() => (oddComposite ? trialErrors(n, seed) : null), [n, oddComposite, seed]);
  const tiny = n < SMALLEST_TESTED;
  const run = useMemo(() => (kind === 'even' || tiny ? [] : rounds(n, k, seed)), [n, k, seed, kind, tiny]);
  const witness = run.find((r) => !r.passed);
  const verdict = kind === 'even' ? 'composite' : tiny ? 'prime' : witness ? 'composite' : 'probably prime';
  const certain = kind === 'even' || tiny || witness !== undefined;
  const wrong = verdict === 'probably prime' && oddComposite;
  const measuredAtK = trials ? trials[k - 1] : null;

  return (
    <StageFrame
      height={500}
      intro={
        kind === 'even' ? (
          <>{n.toString()} is even, so divisibility by 2 settles it: composite, with no random bases needed. The 1/4 bound is about odd composites.</>
        ) : tiny ? (
          <>{n.toString()} is prime and too small to have bases from 2 to n - 2: nothing to draw.</>
        ) : (
          <>
            {run.length} round{run.length === 1 ? '' : 's'} on {n.toString()} with random bases: {witness ? <>base {witness.base.toString()} proves it composite, and a "no" is certain.</> : <>every base passed, so the answer is "probably prime"{oddComposite ? ', and that is wrong here: this run met only liars' : ''}.</>}
          </>
        )
      }
      introKey={`${n}-${k}-${seed}`}
      stats={
        <Stats>
          <Stat label={`n = ${n.toString()}`} value={kind === 'prime' ? 'prime' : kind === 'even' ? 'even' : 'odd composite'} color="var(--info)" sub="by trial division, as a check" />
          <Stat label="Verdict" value={verdict} color={wrong ? 'var(--bad)' : certain ? 'var(--ok)' : 'var(--hi)'} sub={certain ? (kind === 'even' ? 'certain: 2 divides it' : tiny ? 'certain: too small to need random bases' : 'certain: a witness was found') : wrong ? 'wrong: only liars were drawn' : 'probabilistic: a prime never fails a round'} />
          {stats && (
            <Stat label={stats.exact ? 'Liars among all bases' : `Liars in ${stats.bases.toLocaleString('en-US')} sampled bases`} value={`${stats.liars} of ${stats.bases}`} color="var(--orange)" sub={[pct(stats.fraction), stats.exact ? 'the bound is at most 25.0%' : 'the 25.0% bound is for the exact count; a sample can read a little above it']} />
          )}
          {stats && <Stat label="Plain Fermat test fooled by" value={`${stats.fermat} of ${stats.bases}`} color="var(--orange)" sub={stats.fermat > stats.liars ? 'bases: more than Miller-Rabin lets through' : 'bases'} />}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'a witness: proves composite', shape: 'square' },
            { color: 'var(--orange)', label: 'a liar base: passes though n is composite', shape: 'square' },
            { color: 'var(--info)', label: 'error from the liar share, (liar share)^k', shape: 'line' },
            { color: 'var(--bad)', label: `measured over ${TRIALS.toLocaleString('en-US')} seeded trials`, shape: 'dot' },
            { color: 'var(--dim)', label: 'the bound (1/4)^k', shape: 'line' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <TextField label="n (2 to 1,000,000,000)" value={draft} onChange={edit} width={140} spellCheck={false} />
          {N_PRESETS.map((p) => (
            <ChipButton key={p.id} tone="info" on={n === p.n} onClick={() => load(p.n)}>{p.label}</ChipButton>
          ))}
        </>,
        <>
          <Slider label="Rounds k" value={k} min={1} max={MAX_ROUNDS} onChange={setK} />
          <SeedField seed={seed} onSeed={setSeed} />
          <Hint><span role="status">{error ?? 'Each round draws a random base from 2 to n - 2.'}</span></Hint>
        </>,
      ]}
    >
      <div className="ra-stage stage-pad">
        <ul className="ra-rounds" aria-label="Rounds">
          {run.map((r, i) => (
            <li key={i} className={r.passed ? 'is-liar' : 'is-witness'}>
              round {i + 1}: base {r.base.toString()} {r.passed ? (oddComposite ? 'passes: a liar' : 'passes') : 'is a witness: n is composite'}
            </li>
          ))}
          {kind === 'even' && <li className="is-witness">n is even: 2 divides it</li>}
        </ul>
        {stats && (
          <div className="ra-bars">
            <Bar value={stats.liars} max={stats.bases} tone="orange" label="Miller-Rabin liars" trailing={`${stats.liars}`} />
            <Bar value={stats.fermat} max={stats.bases} tone="orange" label="Fermat liars" trailing={`${stats.fermat}`} />
          </div>
        )}
        {stats && trials && (
          <>
            <Plot2D
              x={{ domain: [1, MAX_ROUNDS], label: 'rounds k' }}
              y={{ domain: [ERROR_FLOOR, 1], log: true, label: 'chance of a wrong "prime"' }}
              ariaLabel="Chance that k random-base rounds wrongly call the composite n probably prime: measured, exact and the one-quarter bound"
            >
              <Curve points={KS.map((x) => [x, boundAfter(x)] as const)} tone="dim" dashed />
              <Curve points={KS.map((x) => [x, Math.max(exactErrorAfter(stats.fraction, x), ERROR_FLOOR)] as const)} tone="info" />
              <Points data={KS.flatMap((x) => (trials[x - 1] > 0 ? [{ x, y: trials[x - 1], tone: 'bad' as const, hollow: x !== k }] : []))} r={3.5} />
            </Plot2D>
            <p className="ra-note">
              At k = {k}: the {stats.exact ? 'exact' : 'estimated'} chance of a wrong "prime" is {exactErrorAfter(stats.fraction, k).toExponential(2)}, measured {measuredAtK === 0 ? `0 in ${TRIALS.toLocaleString('en-US')} trials` : measuredAtK === null ? '' : measuredAtK!.toExponential(2)}, and the bound (1/4)^k is {boundAfter(k).toExponential(2)}. A bound of at most 1/4 per round is the standard result for odd composites (verify against a textbook such as Rabin 1980 or CLRS). Rounds with no measured errors are left off the log axis.
              {stats.exact ? '' : ` Above n = 20,000 the liar share is estimated from ${stats.bases.toLocaleString('en-US')} seeded bases, not counted over all of them.`}
            </p>
          </>
        )}
        {kind === 'prime' && <p className="ra-note">A prime passes every base, so Miller-Rabin never wrongly rejects a prime: its error is one-sided. The liar count above is only defined for composites.</p>}
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated" seed={seed}>seeded random bases and {TRIALS.toLocaleString('en-US')} seeded trials</Provenance>
        <Provenance kind="real">every round is a real Miller-Rabin test with core modPow; liars are counted by running it on the bases</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
