import { useMemo, useState, type ReactNode } from 'react';
import { ChipButton, Hint, Segmented, Slider, Stat, TextField } from '../../components/ui';
import { bitLength } from '../../core/bits';
import { greedyByRatio, knapsackRolling, knapsackTable, type LoopDirection } from './dp';
import { DpTab, type TabLines } from './DpTab';
import { CAP_MAX, itemsText, KNAPSACK_DEFAULT, KNAPSACK_TRAP, knapsackCounterexample, OPENING, parseItems, VALUE_MAX, WEIGHT_MAX, type KnapsackInput } from './presets';
import { knapsackRun, type KnapsackState } from './runs';

const COUNTEREXAMPLE = knapsackCounterexample();
const STATES: { value: KnapsackState; label: string }[] = [
  { value: 'w', label: 'dp[w] only' },
  { value: 'i', label: 'dp[i] only' },
  { value: 'iw', label: 'dp[i][w]' },
];
const DIRECTIONS: { value: LoopDirection; label: string }[] = [
  { value: 'down', label: 'capacity downward' },
  { value: 'up', label: 'capacity upward' },
];
const PRESETS: { id: string; label: string; input: KnapsackInput }[] = [
  { id: 'default', label: 'Default', input: KNAPSACK_DEFAULT },
  { id: 'trap', label: 'Greedy trap', input: KNAPSACK_TRAP },
];

const linesFor = (state: KnapsackState, dir: LoopDirection): TabLines => ({
  state:
    state === 'i' ? 'dp[i]: the best value using the first i items.'
    : state === 'iw' ? 'dp[i][w]: the best value using the first i items with capacity w.'
    : `dp[w]: the best value with capacity w, one array reused for every item, filled ${dir === 'down' ? 'from high capacity to low' : 'from low capacity to high'}.`,
  transition: state === 'i' ? 'Add item i on top of the one stored set if it fits.' : state === 'iw' ? 'dp[i][w] = max(dp[i-1][w], dp[i-1][w-wi] + vi)' : 'dp[w] = max(dp[w], dp[w-wi] + vi)',
  base: state === 'i' ? 'dp[0] = 0' : state === 'iw' ? 'dp[0][w] = 0: no items, no value.' : 'dp[w] = 0 before any item.',
  answer: state === 'i' ? 'dp[n]' : state === 'iw' ? 'dp[n][W], then walk back to see which items.' : 'dp[W] after the last item.',
});

/** The tab's controls draw from drafts, the last items that parsed and the refusal while a draft is unusable. */
export function KnapsackScene({ picker }: { picker: ReactNode }) {
  const [input, setInput] = useState<KnapsackInput>({ items: OPENING.knapsack.items, cap: OPENING.knapsack.cap });
  const [weights, setWeights] = useState(itemsText(OPENING.knapsack.items, 'w'));
  const [values, setValues] = useState(itemsText(OPENING.knapsack.items, 'v'));
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<KnapsackState>(OPENING.knapsack.state);
  const [dir, setDir] = useState<LoopDirection>(OPENING.knapsack.direction);
  const { items, cap } = input;
  const n = items.length;

  const apply = (w: string, v: string) => {
    const parsed = parseItems(w, v);
    if (parsed.ok) {
      setInput((cur) => ({ ...cur, items: parsed.value }));
      setError(null);
    } else {
      setError(parsed.error);
    }
  };
  const load = (p: KnapsackInput) => {
    setInput(p);
    setWeights(itemsText(p.items, 'w'));
    setValues(itemsText(p.items, 'v'));
    setError(null);
  };

  const run = useMemo(() => knapsackRun(items, cap, state, dir), [items, cap, state, dir]);
  const exact = useMemo(() => knapsackTable(items, cap)[n][cap], [items, cap, n]);
  const unbounded = useMemo(() => knapsackRolling(items, cap, 'up')[n][cap], [items, cap, n]);
  const greedy = useMemo(() => greedyByRatio(items, cap).value, [items, cap]);
  const bits = bitLength(cap);
  const ce = COUNTEREXAMPLE;

  const verdict =
    state === 'i' ? (
      <p className="dp-verdict">
        On this instance dp[i] says <b className={run.answer === String(exact) ? 'ok' : 'bad'}>{run.answer}</b> and the real best is <b className="ok">{exact}</b>. A small counterexample the lesson found against the brute force: items {ce.items.map((x) => `${x.w}/${x.v}`).join(', ')} (weight/value), capacity {ce.cap}: dp[i] says <b className="bad">{ce.wrong}</b>, the best is <b className="ok">{ce.right}</b>.
      </p>
    ) : state === 'w' ? (
      <p className="dp-verdict">
        dp[w] works when each item is applied once, and the loop direction decides that. Downward gives <b className="ok">{exact}</b>, the 0/1 answer. Upward gives <b className={unbounded === exact ? 'ok' : 'bad'}>{unbounded}</b>, the answer when items can be reused (unbounded knapsack){unbounded === exact ? ', which happens to match on this instance' : ''}.
      </p>
    ) : (
      <p className="dp-verdict">
        dp[i][w] keeps the item index in the state, so row i can only read row i - 1 and no item is reused: <b className="ok">{exact}</b>. The cost is a table with {n + 1} rows instead of one array.
      </p>
    );

  return (
    <DpTab
      picker={picker}
      run={run}
      truth={String(exact)}
      lines={linesFor(state, dir)}
      choice={
        <>
          <Segmented label="State" value={state} onChange={setState} options={STATES} />
          {state === 'w' && <Segmented label="Loop" value={dir} onChange={setDir} options={DIRECTIONS} />}
        </>
      }
      controls={
        <>
          <TextField label={`Weights (${n} items, 1 to ${WEIGHT_MAX})`} value={weights} onChange={(v) => { setWeights(v); apply(v, values); }} width={150} spellCheck={false} />
          <TextField label={`Values (0 to ${VALUE_MAX})`} value={values} onChange={(v) => { setValues(v); apply(weights, v); }} width={150} spellCheck={false} />
          <Slider label="Capacity W" value={cap} min={0} max={CAP_MAX} onChange={(c) => setInput((cur) => ({ ...cur, cap: c }))} />
          {PRESETS.map((p) => (
            <ChipButton key={p.id} tone="info" on={p.input.cap === cap && itemsText(p.input.items, 'w') === itemsText(items, 'w') && itemsText(p.input.items, 'v') === itemsText(items, 'v')} onClick={() => load(p.input)}>{p.label}</ChipButton>
          ))}
          <Hint><span role="status">{error ?? 'Edit the weights and values, move the capacity, or load a preset.'}</span></Hint>
        </>
      }
      extraStats={
        <>
          <Stat label="Greedy by value per weight" value={greedy} color={greedy < exact ? 'var(--bad)' : 'var(--ok)'} sub={greedy < exact ? `${exact - greedy} short of the best` : 'matches the best here'} />
          <Stat label="Table cells" value={n * (cap + 1)} color="var(--info)" sub={`W = ${cap} takes ${bits} bit${bits === 1 ? '' : 's'}; one more bit doubles the range of W and the width`} />
        </>
      }
      below={verdict}
      intro={<p className="dp-note">Pick the state first. Each choice runs on the instance below and its answer is set against the brute-force best. The cost is O(nW): polynomial in the number W, exponential in its bit length.</p>}
    />
  );
}
