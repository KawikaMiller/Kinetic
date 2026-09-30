import { useMemo, useState, type ReactNode } from 'react';
import { ArrayStrip, type ArrayCellState, type ArrayRange } from '../../components/ArrayStrip';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { Button, ControlGroup, Hint, Legend, Segmented, Stat, Stats, TextField } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import {
  everyWindow, everyWindowOfK, fixedKFrames, shortestFrames, uniqueFrames, type BruteCost, type SwFrame,
} from './frames';
import { parseNumbers, spanLength } from './model';
import { FIXED_PRESET, K_CHOICES, MAX_LENGTH, SHORTEST_PRESET, UNIQUE_PRESETS } from './presets';
import './styles.css';

const STEP_MS = 1000;
const MAX_VALUE = 99;

const SCENES = [
  { value: 'unique' as const, label: 'No repeats' },
  { value: 'fixed' as const, label: 'Max sum of k' },
  { value: 'shortest' as const, label: 'Shortest ≥ target' },
];

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Problem', options: SCENES, initial: 'unique' });
  if (scene === 'fixed') return <FixedScene picker={picker} />;
  if (scene === 'shortest') return <ShortestScene picker={picker} />;
  return <UniqueScene picker={picker} />;
}

/** Numbers typed by the learner: 2…MAX_LENGTH integers in range, or an error message. */
function readNumbers(text: string, min: number): number[] | string {
  const nums = parseNumbers(text);
  if (!nums || nums.length < 2 || nums.length > MAX_LENGTH) return `Use 2 to ${MAX_LENGTH} whole numbers.`;
  if (nums.some((v) => v < min || v > MAX_VALUE)) return `Keep numbers between ${min} and ${MAX_VALUE}.`;
  return nums;
}

function UniqueScene({ picker }: { picker: ReactNode }) {
  const [text, setText] = useState(UNIQUE_PRESETS[0]);
  const [draft, setDraft] = useState(UNIQUE_PRESETS[0]);
  const frames = useMemo(() => uniqueFrames(text), [text]);
  const load = (s: string) => {
    setText(s);
    setDraft(s);
  };
  return (
    <WindowScene
      values={[...text]}
      frames={frames}
      valueLabel="Window length"
      brute={everyWindow(text.length)}
      bestValue={(f) => spanLength(f.best)}
      side={(f) => <CountMap counts={f.counts ?? {}} />}
      controls={[
        <>
          {picker}
          <ControlGroup label="Strings">
            {UNIQUE_PRESETS.map((s) => (
              <Button key={s} onClick={() => load(s)}>
                {s}
              </Button>
            ))}
          </ControlGroup>
        </>,
        <>
          <TextField
            label="Text"
            value={draft}
            onChange={setDraft}
            onEnter={() => draft && load(draft)}
            sanitize={(s) => s.toLowerCase().replace(/[^a-z]/g, '').slice(0, MAX_LENGTH)}
            width={220}
            spellCheck={false}
          />
          <Button onClick={() => draft && load(draft)}>Run</Button>
        </>,
      ]}
    />
  );
}

function FixedScene({ picker }: { picker: ReactNode }) {
  const [values, setValues] = useState(FIXED_PRESET);
  const [k, setK] = useState(3);
  const [draft, setDraft] = useState(FIXED_PRESET.join(', '));
  const [error, setError] = useState<string | null>(null);
  const frames = useMemo(() => fixedKFrames(values, Math.min(k, values.length)), [values, k]);
  const apply = () => {
    const nums = readNumbers(draft, -MAX_VALUE);
    if (typeof nums === 'string') return setError(nums);
    setValues(nums);
    setError(null);
  };
  return (
    <WindowScene
      values={values}
      frames={frames}
      valueLabel="Window sum"
      brute={everyWindowOfK(values.length, Math.min(k, values.length))}
      bestValue={(f) => (f.best ? values.slice(f.best[0], f.best[1] + 1).reduce((x, y) => x + y, 0) : 0)}
      controls={[
        <>
          {picker}
          <Segmented label="k" value={k} onChange={setK} options={K_CHOICES.map((v) => ({ value: v, label: String(v) }))} />
        </>,
        <>
          <TextField label="Numbers" value={draft} onChange={setDraft} onEnter={apply} width={260} spellCheck={false} />
          <Button onClick={apply}>Apply</Button>
          {error && <Hint>{error}</Hint>}
        </>,
      ]}
    />
  );
}

function ShortestScene({ picker }: { picker: ReactNode }) {
  const [data, setData] = useState(SHORTEST_PRESET);
  const [draft, setDraft] = useState(SHORTEST_PRESET.values.join(', '));
  const [targetText, setTargetText] = useState(String(SHORTEST_PRESET.target));
  const [error, setError] = useState<string | null>(null);
  const frames = useMemo(() => shortestFrames(data.values, data.target), [data]);
  const apply = () => {
    const nums = readNumbers(draft, 0);
    const target = Number(targetText);
    if (typeof nums === 'string') return setError(nums);
    if (!Number.isInteger(target) || target < 1) return setError('The target must be a whole number above 0.');
    setData({ values: nums, target });
    setError(null);
  };
  return (
    <WindowScene
      values={data.values}
      frames={frames}
      valueLabel="Window sum"
      brute={everyWindow(data.values.length)}
      target={data.target}
      bestValue={(f) => spanLength(f.best)}
      bestLabel="Shortest"
      controls={[
        picker,
        <>
          <TextField label="Numbers" value={draft} onChange={setDraft} onEnter={apply} width={240} spellCheck={false} />
          <TextField label="Target" value={targetText} onChange={setTargetText} onEnter={apply} width={70} />
          <Button onClick={apply}>Apply</Button>
          <Hint>{error ?? 'numbers ≥ 0 only: with negatives, shrinking could raise the sum and this trick breaks'}</Hint>
        </>,
      ]}
    />
  );
}

/** The shared view: the strip with the window and best brackets, stats, and an optional side panel. */
function WindowScene({
  values, frames, valueLabel, brute, bestValue, bestLabel = 'Best', target, side, controls,
}: {
  values: (number | string)[];
  frames: SwFrame[];
  valueLabel: string;
  brute: BruteCost;
  bestValue: (f: SwFrame) => number;
  bestLabel?: string;
  target?: number;
  side?: (f: SwFrame) => ReactNode;
  controls: ReactNode[];
}) {
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;
  const n = values.length;

  const cellState = (i: number): ArrayCellState => {
    if (i === f.index) return f.event === 'enter' ? 'done' : 'bad';
    return i < f.l ? 'dim' : 'idle';
  };
  const ranges: ArrayRange[] = [];
  if (f.r >= f.l) ranges.push({ from: f.l, to: f.r, tone: 'hi', labels: ['l', 'r'] });
  if (f.best) ranges.push({ from: f.best[0], to: f.best[1], tone: 'violet' });

  return (
    <StageFrame
      player={player}
      height={300}
      stats={
        <Stats>
          <Stat label={valueLabel} value={f.r >= f.l ? f.value : 0} color="var(--hi)" sub={target !== undefined ? `target ${target}` : undefined} />
          <Stat label={bestLabel} value={f.best ? bestValue(f) : '–'} color="var(--violet)" />
          <Stat label="Moves" value={f.moves} color="var(--ok)" sub={`never more than 2n = ${2 * n}`} />
          <Stat label="Brute force" value={brute.value} color="var(--bad)" sub={brute.unit} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'window' },
            { color: 'var(--ok)', label: 'entering' },
            { color: 'var(--bad)', label: 'leaving' },
            { color: 'var(--violet)', label: 'best so far' },
          ]}
        />
      }
      controls={controls}
    >
      <div className="sw stage-pad">
        <div className="sw-strip">
          <ArrayStrip values={values} cellState={cellState} ranges={ranges} showIndex cellMax={52} />
        </div>
        {side?.(f)}
      </div>
    </StageFrame>
  );
}

function CountMap({ counts }: { counts: Record<string, number> }) {
  const rows = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
  return (
    <div className="sw-counts box">
      <table className="data-table">
        <thead>
          <tr>
            <th>char</th>
            <th>count</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([c, v]) => (
            <tr key={c} className={v > 1 ? 'sw-repeat' : ''}>
              <td>{c}</td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="empty-note">window is empty</p>}
    </div>
  );
}
