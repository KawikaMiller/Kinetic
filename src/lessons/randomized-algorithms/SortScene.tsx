import { useMemo, useState, type ReactNode } from 'react';
import { Bars, Plot2D, VLine } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, TextField } from '../../components/ui';
import { barsFromHistogram } from '../../core/plot';
import { mulberry32 } from '../../core/random';
import { inputFor, OPENING, parseArray, SIZES, type InputKind } from './presets';
import { countsHistogram, expectedComparisons, fixedPivotWorst, quicksort, RUNS, tailShare } from './sorting';

const KINDS: { value: InputKind; label: string }[] = [
  { value: 'sorted', label: 'Sorted' },
  { value: 'reverse', label: 'Reverse' },
  { value: 'organ', label: 'Organ pipe' },
  { value: 'random', label: 'Random' },
  { value: 'vs-first', label: 'Adversary vs first pivot' },
  { value: 'vs-median3', label: 'Adversary vs median of three' },
  { value: 'custom', label: 'Your own' },
];
const TIES_NOTE = 'Ties are broken by position, so every key counts as distinct.';
const ADVERSARY_NOTE = 'The adversary builds the input after seeing the rule. Against the random pivot it has nothing to build.';
const INPUT_NOTE = 'Pick an input, a size and a seed; every count is recomputed.';
const PAST_LIMIT_N = 1_000_000;
const PLOT_HEADROOM = 1.05;

const fmt = (x: number) => Math.round(x).toLocaleString('en-US');

/** The learner's own array: the typed draft, the last array that parsed, and the refusal while the draft is unusable. */
function useCustom() {
  const [draft, setDraft] = useState('5, 3, 8, 1, 9, 2, 7, 4, 6');
  const [array, setArray] = useState<number[]>([5, 3, 8, 1, 9, 2, 7, 4, 6]);
  const [error, setError] = useState<string | null>(null);
  const edit = (text: string) => {
    setDraft(text);
    const parsed = parseArray(text);
    if (parsed.ok) {
      setArray(parsed.value);
      setError(null);
    } else {
      setError(parsed.error);
    }
  };
  return { draft, array, error, edit };
}

/** Scene 1, Las Vegas: always correct, running time random. Three pivot rules on one input, counted not timed. */
export function SortScene({ picker }: { picker: ReactNode }) {
  const [kind, setKind] = useState<InputKind>(OPENING.sort.kind);
  const [n, setN] = useState<number>(OPENING.sort.n);
  const [seed, setSeed] = useState<number>(OPENING.sort.seed);
  const custom = useCustom();

  const values = useMemo(() => inputFor(kind, n, seed, custom.array), [kind, n, seed, custom.array]);
  const size = values.length;
  const first = useMemo(() => quicksort(values, 'first'), [values]);
  const median = useMemo(() => quicksort(values, 'median3'), [values]);
  const counts = useMemo(() => {
    const rnd = mulberry32(seed);
    return Array.from({ length: RUNS }, () => quicksort(values, 'random', rnd).comparisons);
  }, [values, seed]);
  const mean = counts.reduce((s, c) => s + c, 0) / counts.length;
  const expected = expectedComparisons(size);
  const worstRun = Math.max(...counts);
  const hist = useMemo(() => countsHistogram(counts), [counts]);
  const top = Math.max(first.comparisons, median.comparisons, worstRun) * PLOT_HEADROOM;
  const sortedOk = [first.sorted, median.sorted].every((s) => s.every((x, i) => i === 0 || s[i - 1] <= x));
  const heavy = tailShare(counts, expected, 1.5);
  const hint = kind === 'custom' ? custom.error ?? TIES_NOTE : kind === 'vs-first' || kind === 'vs-median3' ? ADVERSARY_NOTE : INPUT_NOTE;

  return (
    <StageFrame
      height={460}
      intro={
        <>
          Same input, three pivot rules, and every count is comparisons, never time. The first-element pivot made {fmt(first.comparisons)} on this input, median of three {fmt(median.comparisons)}, and 1,000 seeded random-pivot runs averaged {fmt(mean)} against the formula's {fmt(expected)}. {sortedOk ? 'All three sorted correctly' : 'A sort failed'}: only the work is random.
        </>
      }
      introKey={`${kind}-${size}-${seed}-${first.comparisons}-${median.comparisons}-${Math.round(mean)}`}
      stats={
        <Stats>
          <Stat label="First-element pivot" value={fmt(first.comparisons)} color="var(--bad)" sub={`worst case n(n-1)/2 = ${fmt(fixedPivotWorst(size))}`} />
          <Stat label="Median of three" value={fmt(median.comparisons)} color="var(--bad)" sub="first, middle, last" />
          <Stat label="Random pivot, mean of 1,000" value={fmt(mean)} color="var(--ok)" sub={[`2(n+1)H_n - 4n = ${fmt(expected)}`, `worst of the 1,000: ${fmt(worstRun)}`]} />
          <Stat label="Runs above 1.5x expected" value={`${(heavy * 100).toFixed(1)}%`} color="var(--ok)" sub="the bad tail of the random pivot" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'random pivot: comparisons per run (histogram)', shape: 'square' },
            { color: 'var(--hi)', label: 'expected value 2(n+1)H_n - 4n', shape: 'line' },
            { color: 'var(--bad)', label: 'a fixed rule on this input', shape: 'line' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Segmented label="Input" value={kind} onChange={setKind} options={KINDS} />
          {kind !== 'custom' && <Segmented label="n" value={n} onChange={setN} options={SIZES.map((s) => ({ value: s, label: String(s) }))} />}
        </>,
        <>
          {kind === 'custom' && <TextField label="Array (2 to 2,000 whole numbers)" value={custom.draft} onChange={custom.edit} width={280} spellCheck={false} />}
          <SeedField seed={seed} onSeed={setSeed} />
          <Hint><span role="status">{hint}</span></Hint>
        </>,
      ]}
    >
      <div className="ra-stage stage-pad">
        <Plot2D
          x={{ domain: [0, top], label: 'comparisons' }}
          y={{ domain: [0, Math.max(...hist.counts) * PLOT_HEADROOM], label: 'runs' }}
          ariaLabel="Histogram of comparison counts over 1,000 random-pivot runs with the expected value and the fixed-pivot counts marked"
        >
          <Bars bars={barsFromHistogram(hist)} tone="ok" />
          <VLine at={expected} label="expected" tone="hi" />
          <VLine at={first.comparisons} label="first" tone="bad" />
          {median.comparisons !== first.comparisons && <VLine at={median.comparisons} label="median of 3" tone="bad" />}
        </Plot2D>
        <p className="ra-note">
          With a random pivot there is no bad input, only an unlucky run: the distribution of this histogram is the same whichever input you pick above (only the seeded draw changes). The worst of the 1,000 runs took {fmt(worstRun)} comparisons. A random pivot still has a worst case, which is astronomically unlikely rather than impossible. Past n = 2,000 nothing is run: at n = {fmt(PAST_LIMIT_N)} a fixed pivot on sorted input costs n(n-1)/2 = {fmt(fixedPivotWorst(PAST_LIMIT_N))} comparisons, and a random pivot is expected to take {fmt(expectedComparisons(PAST_LIMIT_N))} (both from formulas).
        </p>
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated" seed={seed}>1,000 seeded random-pivot runs; no wall-clock time is used anywhere, only comparison counts</Provenance>
        <Provenance kind="real">the sorts are real code, checked against Array.prototype.sort; the formula is checked against the exact recurrence</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
