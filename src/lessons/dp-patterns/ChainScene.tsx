import { useMemo, useState, type ReactNode } from 'react';
import { ChipButton, Hint, Segmented, Stat, TextField, Toggle } from '../../components/ui';
import { chainParenthesis, chainStateCounts, chainTable, type ChainOrder } from './dp';
import { DpTab, type TabLines } from './DpTab';
import { chainCounterexample, CHAIN_DEFAULT, DIM_MAX, MATRICES_MAX, MATRICES_MIN, OPENING, parseDims } from './presets';
import { chainRun, type ChainState } from './runs';

const COUNTEREXAMPLE = chainCounterexample();
const STATES: { value: ChainState; label: string }[] = [
  { value: 'i', label: 'dp[i] over prefixes' },
  { value: 'ij', label: 'dp[i][j]' },
  { value: 'ijk', label: 'dp[i][j][k]' },
];
const PRESETS: { id: string; label: string; dims: number[] }[] = [
  { id: 'default', label: 'Textbook six', dims: CHAIN_DEFAULT },
  { id: 'small', label: 'Three matrices', dims: [10, 25, 5, 30] },
];

/** The Catalan number C(m): the number of ways to parenthesise m + 1 matrices. */
function catalanOf(m: number): number {
  let c = 1;
  for (let k = 0; k < m; k++) c = (c * 2 * (2 * k + 1)) / (k + 2);
  return Math.round(c);
}

const linesFor = (state: ChainState, order: ChainOrder): TabLines => ({
  state:
    state === 'i' ? 'dp[i]: the cheapest cost of multiplying the first i matrices.'
    : state === 'ij' ? 'dp[i][j]: the cheapest cost of multiplying matrices i to j.'
    : 'dp[i][j][k]: the cheapest cost of multiplying i to j with the last product split at k.',
  transition: state === 'i' ? 'dp[i] = dp[i-1] + p0 x p(i-1) x pi: only one grouping.' : 'dp[i][j] = min over k of dp[i][k] + dp[k+1][j] + p(i-1) x pk x pj',
  base: 'dp[i][i] = 0: one matrix costs nothing to multiply.',
  answer: state === 'i' ? 'dp[n]' : `dp[1][n]. Cells are filled ${order === 'length' ? 'by increasing interval length' : 'row by row'}.`,
});

export function ChainScene({ picker }: { picker: ReactNode }) {
  const [dims, setDims] = useState<number[]>(OPENING.chain.dims.slice());
  const [draft, setDraft] = useState(OPENING.chain.dims.join(', '));
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<ChainState>(OPENING.chain.state);
  const [order, setOrder] = useState<ChainOrder>(OPENING.chain.order);
  const n = dims.length - 1;
  // The fill-order control is not rendered for the prefix state, so it must not reach any number there.
  const effectiveOrder: ChainOrder = state === 'i' ? 'length' : order;

  const edit = (text: string) => {
    setDraft(text);
    const parsed = parseDims(text);
    if (parsed.ok) {
      setDims(parsed.value);
      setError(null);
    } else {
      setError(parsed.error);
    }
  };
  const load = (d: number[]) => {
    setDims(d);
    setDraft(d.join(', '));
    setError(null);
  };

  const run = useMemo(() => chainRun(dims, state, effectiveOrder), [dims, state, effectiveOrder]);
  const exact = useMemo(() => chainTable(dims), [dims]);
  const counts = chainStateCounts(n);
  const ce = COUNTEREXAMPLE;

  const verdict =
    state === 'i' ? (
      <p className="dp-verdict">
        With only a prefix as the state the last product can join just one more matrix, so one grouping is tried: <b className={run.answer === String(exact.answer) ? 'ok' : 'bad'}>{run.answer}</b> here against the real <b className="ok">{exact.answer}</b>. A small counterexample: dimensions {ce.dims.join(', ')} give <b className="bad">{ce.wrong}</b>, the best is <b className="ok">{ce.right}</b>.
      </p>
    ) : state === 'ij' ? (
      <p className="dp-verdict">
        An interval has two ends, so the state has two indices. The best grouping is <b className="ok">{chainParenthesis(exact.split, 1, n)}</b> at cost {exact.answer}.{' '}
        {order === 'row'
          ? <>Filled row by row, the table read {run.stepCount > 0 ? exactUnfilled(dims) : 0} cells it had not filled yet: the answer is <b className={run.answer === String(exact.answer) ? 'ok' : 'bad'}>{run.answer}</b>.</>
          : 'Filled by interval length, every cell finds what it needs already done.'}
      </p>
    ) : (
      <p className="dp-verdict">
        Adding k to the state also works, since k is only the choice the minimum ranges over, but the table grows from {counts.interval} to {counts.withSplit} cells for n = {n} with nothing gained over dp[i][j].{' '}
        {order === 'row'
          ? <>Filled row by row it still reads cells it had not filled: <b className={run.answer === String(exact.answer) ? 'ok' : 'bad'}>{run.answer}</b> against the real <b className="ok">{exact.answer}</b>.</>
          : <>Filled by interval length it gives <b className="ok">{exact.answer}</b>, the same as dp[i][j].</>}
      </p>
    );

  return (
    <DpTab
      picker={picker}
      run={run}
      truth={String(exact.answer)}
      lines={linesFor(state, effectiveOrder)}
      choice={
        <>
          <Segmented label="State" value={state} onChange={setState} options={STATES} />
          {state !== 'i' && <Toggle label="Fill order" value={order === 'row'} onChange={(v) => setOrder(v ? 'row' : 'length')} off="By interval length" on="Row by row" />}
        </>
      }
      controls={
        <>
          <TextField label={`Dimensions p0 to p${n} (${MATRICES_MIN} to ${MATRICES_MAX} matrices, 1 to ${DIM_MAX})`} value={draft} onChange={edit} width={220} spellCheck={false} />
          {PRESETS.map((p) => (
            <ChipButton key={p.id} tone="info" on={p.dims.join(',') === dims.join(',')} onClick={() => load(p.dims)}>{p.label}</ChipButton>
          ))}
          <Hint><span role="status">{error ?? 'Matrix k is p(k-1) by pk. Type your own dimensions or load a preset.'}</span></Hint>
        </>
      }
      extraStats={<Stat label="Groupings a brute force checks" value={catalanOf(n - 1)} color="var(--bad)" sub={`Catalan number C(${n - 1}); the table has ${counts.interval} cells`} />}
      below={verdict}
      intro={<p className="dp-note">Pick the state, then try filling the table in an order that ignores the dependencies.</p>}
    />
  );
}

const exactUnfilled = (dims: readonly number[]): number => chainTable(dims, 'row').unfilledReads;
