import { useMemo, useState, type ReactNode } from 'react';
import { ArrayStrip, type ArrayCellState } from '../../components/ArrayStrip';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { Button, ControlGroup, Hint, Legend, Stat, Stats, TextField } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { dedupeFrames, pairFrames, palindromeFrames, type PairFrame } from './frames';
import { parseIntegers } from '../../core/parse';
import { allPairsCount, isSortedAscending, pairKey } from './model';
import { DEDUPE_PRESET, MAX_LENGTH, MAX_TEXT, PALINDROMES, PRESETS } from './presets';
import './styles.css';

const STEP_MS = 1100;
const MIN_LENGTH = 2;
const MAX_ABS = 99;

const SCENES = [
  { value: 'pair' as const, label: 'Pair sum' },
  { value: 'palindrome' as const, label: 'Palindrome' },
  { value: 'dedupe' as const, label: 'Remove duplicates' },
];

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Problem', options: SCENES, initial: 'pair' });
  if (scene === 'palindrome') return <PalindromeScene picker={picker} />;
  if (scene === 'dedupe') return <DedupeScene picker={picker} />;
  return <PairScene picker={picker} />;
}

/** Validate an edited array: 2…MAX_LENGTH integers of at most two digits. */
function readArray(text: string): number[] | string {
  const nums = parseIntegers(text);
  if (!nums) return 'Use whole numbers separated by commas.';
  if (nums.length < MIN_LENGTH || nums.length > MAX_LENGTH) return `Use ${MIN_LENGTH} to ${MAX_LENGTH} numbers.`;
  if (nums.some((v) => Math.abs(v) > MAX_ABS)) return `Keep numbers between −${MAX_ABS} and ${MAX_ABS}.`;
  return nums;
}

function PairScene({ picker }: { picker: ReactNode }) {
  const [data, setData] = useState({ values: PRESETS[0].values, target: PRESETS[0].target });
  const [arrText, setArrText] = useState(PRESETS[0].values.join(', '));
  const [targetText, setTargetText] = useState(String(PRESETS[0].target));
  const [error, setError] = useState<string | null>(null);
  const frames = useMemo(() => pairFrames(data.values, data.target), [data]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;
  const n = data.values.length;

  const load = (values: number[], target: number) => {
    setData({ values, target });
    setArrText(values.join(', '));
    setTargetText(String(target));
    setError(null);
  };
  const apply = () => {
    const values = readArray(arrText);
    const target = Number(targetText);
    if (typeof values === 'string') return setError(values);
    if (!Number.isInteger(target)) return setError('The target must be a whole number.');
    load(values, target);
  };

  const cellState = (i: number): ArrayCellState => {
    if (f.missed?.includes(i)) return 'bad';
    if ((f.status === 'check' || f.status === 'found') && (i === f.l || i === f.r)) return f.status === 'found' ? 'done' : 'active';
    return i < f.l || i > f.r || f.status === 'none' ? 'dim' : 'idle';
  };

  return (
    <StageFrame
      player={player}
      height={300}
      stats={
        <Stats>
          <Stat label="Target" value={data.target} color="var(--hi)" />
          <Stat label="Checks" value={f.checks} color="var(--ok)" sub={`never more than ${Math.max(0, n - 1)}`} />
          <Stat label="Brute force" value={allPairsCount(n)} color="var(--bad)" sub="pairs to try" />
          <Stat label="Ruled out" value={f.ruledOut.length} color="var(--muted)" sub="pairs" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'L', shape: 'dot' },
            { color: 'var(--violet)', label: 'R', shape: 'dot' },
            { color: 'var(--hi)', label: 'checking' },
            { color: 'var(--ok)', label: 'found' },
            { color: 'var(--dim)', label: 'ruled out' },
            ...(f.missed ? [{ color: 'var(--bad)', label: 'answer it missed' }] : []),
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Presets">
            {PRESETS.map((p) => (
              <Button key={p.id} onClick={() => load(p.values, p.target)}>
                {p.label}
              </Button>
            ))}
          </ControlGroup>
        </>,
        <>
          <TextField label="Array" value={arrText} onChange={setArrText} onEnter={apply} width={240} spellCheck={false} />
          <TextField label="Target" value={targetText} onChange={setTargetText} onEnter={apply} width={70} />
          <Button onClick={apply}>Apply</Button>
          <Hint>{error ?? (isSortedAscending(data.values) ? 'sorted ✓' : 'not sorted: expect a wrong answer')}</Hint>
        </>,
      ]}
    >
      <div className="tp-pair stage-pad">
        <div className="tp-strip">
          <ArrayStrip
            values={data.values}
            cellState={cellState}
            pointers={
              f.status === 'none'
                ? []
                : [
                    { i: f.l, label: 'L', tone: 'info' },
                    { i: f.r, label: 'R', tone: 'violet' },
                  ]
            }
            showIndex
            cellMax={56}
          />
          {f.sum !== null && (
            <p className="tp-sum">
              arr[{f.l}] + arr[{f.r}] = <b>{f.sum}</b> {f.sum === data.target ? '=' : f.sum > data.target ? '>' : '<'} {data.target}
            </p>
          )}
        </div>
        <PairMatrix n={n} frame={f} />
      </div>
    </StageFrame>
  );
}

/** Every pair (i, j) with i < j: the space brute force would search, greying out as it's eliminated. */
function PairMatrix({ n, frame }: { n: number; frame: PairFrame }) {
  const out = new Set(frame.ruledOut);
  const stateOf = (i: number, j: number) => {
    if (j <= i) return 'is-blank';
    if (frame.missed && frame.missed[0] === i && frame.missed[1] === j) return 'is-missed';
    if ((frame.status === 'check' || frame.status === 'found') && i === frame.l && j === frame.r) return frame.status === 'found' ? 'is-found' : 'is-now';
    return out.has(pairKey(i, j)) ? 'is-out' : '';
  };
  const idx = Array.from({ length: n }, (_, i) => i);
  return (
    <div className="tp-matrix" style={{ gridTemplateColumns: `auto repeat(${n}, var(--tp-cell))` }} aria-label="All pairs">
      <span className="tp-corner">L\R</span>
      {idx.map((j) => (
        <span key={`c${j}`} className="tp-head">
          {j}
        </span>
      ))}
      {idx.map((i) => (
        <Row key={i} i={i} idx={idx} stateOf={stateOf} />
      ))}
    </div>
  );
}

function Row({ i, idx, stateOf }: { i: number; idx: number[]; stateOf: (i: number, j: number) => string }) {
  return (
    <>
      <span className="tp-head">{i}</span>
      {idx.map((j) => (
        <span key={j} className={`tp-pair-cell ${stateOf(i, j)}`} title={j > i ? `pair (${i}, ${j})` : undefined} />
      ))}
    </>
  );
}

function PalindromeScene({ picker }: { picker: ReactNode }) {
  const [text, setText] = useState(PALINDROMES[0]);
  const [draft, setDraft] = useState(PALINDROMES[0]);
  const frames = useMemo(() => palindromeFrames(text), [text]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;
  const matched = new Set(f.matched);
  const apply = () => {
    if (draft.length >= MIN_LENGTH) setText(draft);
  };

  const cellState = (i: number): ArrayCellState => {
    if (f.mismatch && (i === f.l || i === f.r)) return 'bad';
    if (matched.has(i)) return 'done';
    return f.done ? 'dim' : 'idle';
  };

  return (
    <StageFrame
      player={player}
      height={240}
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'L', shape: 'dot' },
            { color: 'var(--violet)', label: 'R', shape: 'dot' },
            { color: 'var(--ok)', label: 'ends match' },
            { color: 'var(--bad)', label: 'mismatch' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Words">
            {PALINDROMES.map((w) => (
              <Button key={w} onClick={() => {
                setText(w);
                setDraft(w);
              }}>
                {w}
              </Button>
            ))}
          </ControlGroup>
        </>,
        <>
          <TextField
            label="Text"
            value={draft}
            onChange={setDraft}
            onEnter={apply}
            sanitize={(s) => s.toLowerCase().replace(/[^a-z]/g, '').slice(0, MAX_TEXT)}
            width={200}
            spellCheck={false}
          />
          <Button onClick={apply}>Check</Button>
          <Hint>letters only, up to {MAX_TEXT}</Hint>
        </>,
      ]}
    >
      <div className="stage-pad tp-center">
        <ArrayStrip
          values={[...text]}
          cellState={cellState}
          pointers={f.done && !f.mismatch ? [] : [
            { i: f.l, label: 'L', tone: 'info' },
            { i: f.r, label: 'R', tone: 'violet' },
          ]}
          showIndex
          cellMax={52}
        />
      </div>
    </StageFrame>
  );
}

function DedupeScene({ picker }: { picker: ReactNode }) {
  const [values, setValues] = useState(DEDUPE_PRESET);
  const [draft, setDraft] = useState(DEDUPE_PRESET.join(', '));
  const [error, setError] = useState<string | null>(null);
  const frames = useMemo(() => dedupeFrames(values), [values]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;
  const apply = () => {
    const nums = readArray(draft);
    if (typeof nums === 'string') return setError(nums);
    const sorted = [...nums].sort((a, b) => a - b);
    setValues(sorted);
    setDraft(sorted.join(', '));
    setError(null);
  };

  const unique = f.length ?? f.slow + 1;
  const cellState = (i: number): ArrayCellState => {
    if (f.wrote && i === f.slow) return 'done';
    if (i === f.fast) return 'active';
    return f.length !== null && i >= f.length ? 'dim' : 'idle';
  };

  return (
    <StageFrame
      player={player}
      height={260}
      stats={
        <Stats>
          <Stat label="Unique so far" value={unique} color="var(--ok)" />
          <Stat label="Length" value={values.length} color="var(--muted)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'slow', shape: 'dot' },
            { color: 'var(--violet)', label: 'fast', shape: 'dot' },
            { color: 'var(--hi)', label: 'comparing' },
            { color: 'var(--ok)', label: 'unique part / just written' },
            { color: 'var(--dim)', label: 'leftover' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <TextField label="Array" value={draft} onChange={setDraft} onEnter={apply} width={240} spellCheck={false} />
          <Button onClick={apply}>Apply</Button>
          <Hint>{error ?? 'sorted for you: the algorithm needs sorted input'}</Hint>
        </>,
      ]}
    >
      <div className="stage-pad tp-center">
        <ArrayStrip
          className="tp-dedupe"
          values={f.values}
          cellState={cellState}
          ranges={[{ from: 0, to: unique - 1, tone: 'ok', labels: ['unique', null] }]}
          pointers={[
            { i: f.slow, label: 'slow', tone: 'info' },
            ...(f.fast !== null ? [{ i: f.fast, label: 'fast', tone: 'violet' as const }] : []),
          ]}
          showIndex
          cellMax={52}
        />
      </div>
    </StageFrame>
  );
}
