import { useMemo, useState, type ReactNode } from 'react';
import { ArrayStrip } from '../../components/ArrayStrip';
import { ChipButton, Hint, Segmented, Stat, TextField } from '../../components/ui';
import { isSubsequence, lisEndingAt, lisTails } from './dp';
import { DpTab, type TabLines } from './DpTab';
import { LIS_DEFAULT, LIS_MAX, LIS_MIN, lisCounterexample, OPENING, parseSequence } from './presets';
import { lisRun, type DpFrame, type LisState } from './runs';

const COUNTEREXAMPLE = lisCounterexample();
const STATES: { value: LisState; label: string }[] = [
  { value: 'prefix', label: 'best in the first i' },
  { value: 'end', label: 'ending at i' },
  { value: 'start', label: 'starting at i' },
];
const PRESETS: { id: string; label: string; array: number[] }[] = [
  { id: 'default', label: 'Default', array: LIS_DEFAULT },
  { id: 'trap', label: 'Counterexample', array: COUNTEREXAMPLE.array },
  { id: 'rising', label: 'Sorted', array: [1, 2, 3, 4, 5, 6, 7, 8] },
];

const linesFor = (state: LisState): TabLines => ({
  state:
    state === 'prefix' ? 'dp[i]: the longest increasing subsequence within the first i elements.'
    : state === 'end' ? 'dp[i]: the longest increasing subsequence that ends exactly at element i.'
    : 'dp[i]: the longest increasing subsequence that starts exactly at element i.',
  transition:
    state === 'prefix' ? 'Extend the one stored subsequence if the next element is above its last value.'
    : state === 'end' ? 'dp[i] = 1 + max dp[j] over earlier j with a[j] < a[i].'
    : 'dp[i] = 1 + max dp[j] over later j with a[j] > a[i].',
  base: 'Every element alone is a subsequence of length 1.',
  answer: state === 'prefix' ? 'dp[n]' : 'The largest dp[i] anywhere, then rebuild by following the best neighbours.',
});

export function LisScene({ picker }: { picker: ReactNode }) {
  const [array, setArray] = useState<number[]>(OPENING.lis.array.slice());
  const [draft, setDraft] = useState(OPENING.lis.array.join(', '));
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<LisState>(OPENING.lis.state);

  const edit = (text: string) => {
    setDraft(text);
    const parsed = parseSequence(text);
    if (parsed.ok) {
      setArray(parsed.value);
      setError(null);
    } else {
      setError(parsed.error);
    }
  };
  const load = (a: number[]) => {
    setArray(a);
    setDraft(a.join(', '));
    setError(null);
  };

  const run = useMemo(() => lisRun(array, state), [array, state]);
  const quadratic = useMemo(() => lisEndingAt(array), [array]);
  const tails = useMemo(() => lisTails(array), [array]);
  const finalTails = tails.steps[tails.steps.length - 1].tails;
  const tailsAreSubsequence = isSubsequence(finalTails, array);
  const ce = COUNTEREXAMPLE;

  const below = (f: DpFrame) => {
    const step = f.done > 0 && state === 'end' ? tails.steps[f.done - 1] : null;
    return (
      <>
        <p className="dp-verdict">
          {state === 'prefix' ? (
            <>On this array it says <b className={run.answer === String(quadratic.length) ? 'ok' : 'bad'}>{run.answer}</b> and the real length is <b className="ok">{quadratic.length}</b>. A small counterexample the lesson found: {ce.array.join(', ')} gives <b className="bad">{ce.wrong}</b>, the real length is <b className="ok">{ce.right}</b>.</>
          ) : state === 'end' ? (
            <>Ending at i and starting at i are mirror images, and both are right. The quadratic table does {quadratic.comparisons} pair checks; the tails array below needs {tails.probes} binary-search probes for the same answer.</>
          ) : (
            <>Starting at i is the mirror image: filled from the right, it also gives <b className="ok">{quadratic.length}</b>.</>
          )}
        </p>
        {state === 'end' && (
          <div className="dp-tails">
            <span className="dp-note">tails after {step ? `index ${step.i} (value ${array[step.i]})` : 'no element'} (tails[k] is the smallest last value of any increasing subsequence of length k + 1)</span>
            <ArrayStrip values={step ? step.tails : []} cellMax={44} cellState={(k) => (step && k === step.at ? (step.replaced ? 'active' : 'done') : 'idle')} pointers={[]} />
            <p className="dp-note">
              {step ? <>{array[step.i]} {step.replaced ? 'replaced the value at' : 'was appended at'} position {step.at} after {step.probes} probe{step.probes === 1 ? '' : 's'}. Length so far: {step.tails.length}.</> : <>Nothing processed yet.</>}
              {f.done === array.length && <> The final tails array {finalTails.join(', ')} {tailsAreSubsequence ? 'happens to be' : 'is not'} a subsequence of the input: it records the best ends, not a real sequence.</>}
            </p>
          </div>
        )}
      </>
    );
  };

  return (
    <DpTab
      picker={picker}
      run={run}
      truth={String(quadratic.length)}
      lines={linesFor(state)}
      choice={<Segmented label="State" value={state} onChange={setState} options={STATES} />}
      controls={
        <>
          <TextField label={`Array (${LIS_MIN} to ${LIS_MAX} values)`} value={draft} onChange={edit} width={260} spellCheck={false} />
          {PRESETS.map((p) => (
            <ChipButton key={p.id} tone="info" on={p.array.join(',') === array.join(',')} onClick={() => load(p.array)}>{p.label}</ChipButton>
          ))}
          <Hint><span role="status">{error ?? 'Type your own array or load a preset.'}</span></Hint>
        </>
      }
      extraStats={<Stat label="Tails array length" value={tails.length} color="var(--info)" sub={tails.length === quadratic.length ? 'agrees with the table' : 'differs from the table'} />}
      below={below}
      intro={<p className="dp-note">Pick the state first: one of these cannot extend a subsequence correctly. The O(n log n) tails array runs alongside the table.</p>}
    />
  );
}
