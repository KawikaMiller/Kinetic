import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrayStrip, type ArrayCellState } from '../../components/ArrayStrip';
import { Bar } from '../../components/Bar';
import { Box, SectionTitle } from '../../components/Panel';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { randInt } from '../../core/random';
import { usePlayer } from '../../core/usePlayer';
import { diffFrames } from './frames';
import { naiveRangeSum, naiveWrites, offByOneRangeSum, prefixSums, queryCosts, rangeSum, signedText } from './model';
import { DIFF_BASE, DIFF_UPDATES, DIFF_UPDATES_SHORT, MAX_VALUE, QUERIES, RANDOM_LENGTH, RANGE_PRESET } from './presets';
import { Staircase } from './Staircase';
import './styles.css';

/** The staircase's value labels stay readable (8px+) down to this stage width. */
const CHART_MIN_WIDTH = 600;
const STEP_MS = 1100;

const SCENES = [
  { value: 'range' as const, label: 'Range sums' },
  { value: 'diff' as const, label: 'Difference array' },
];

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Mode', options: SCENES, initial: 'range' });
  return scene === 'diff' ? <DiffScene picker={picker} /> : <RangeScene picker={picker} />;
}

function RangeScene({ picker }: { picker: ReactNode }) {
  const [values, setValues] = useState(RANGE_PRESET);
  const [l, setL] = useState(2);
  const [r, setR] = useState(5);
  const setCaption = useSetCaption();
  const prefix = useMemo(() => prefixSums(values), [values]);
  const n = values.length;
  const sum = rangeSum(prefix, l, r);
  const cost = queryCosts(n, QUERIES);

  useEffect(() => {
    setCaption(
      <>
        sum(a[{l}..{r}]) = prefix[{r + 1}] − prefix[{l}] = {prefix[r + 1]} − {prefix[l]} ={' '}
        <span className="hl">{sum}</span>, the same as adding the {r - l + 1} values one by one ({naiveRangeSum(values, l, r)}).{' '}
        prefix[{r}] − prefix[{l}] would give {offByOneRangeSum(prefix, l, r)}: off by one, it drops a[{r}].
      </>,
      { quiet: true },
    );
  }, [l, r, prefix, sum, values, setCaption]);

  const randomise = () => {
    setValues(Array.from({ length: RANDOM_LENGTH }, () => randInt(0, MAX_VALUE)));
  };

  return (
    <StageFrame
      minWidth={CHART_MIN_WIDTH}
      height={560}
      stats={
        <Stats>
          <Stat label="Range sum" value={sum} color="var(--hi)" sub={`a[${l}..${r}]`} />
          <Stat label="prefix[l]" value={prefix[l]} color="var(--info)" sub={`index ${l}`} />
          <Stat label="prefix[r+1]" value={prefix[r + 1]} color="var(--violet)" sub={`index ${r + 1}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'selected range' },
            { color: 'var(--info)', label: 'prefix[l]', shape: 'dot' },
            { color: 'var(--violet)', label: 'prefix[r + 1]', shape: 'dot' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Slider label="From l" value={l} min={0} max={n - 1} onChange={(v) => {
            setL(v);
            if (r < v) setR(v);
          }} />
          <Slider label="To r" value={r} min={l} max={n - 1} onChange={setR} />
          <Button onClick={randomise}>Random array</Button>
        </>,
      ]}
    >
      <div className="ps stage-pad">
        <Staircase values={values} prefix={prefix} l={l} r={r} />
        <div className="ps-rows">
          <SectionTitle weight="regular">a: {n} values</SectionTitle>
          <ArrayStrip
            values={values}
            cellState={(i): ArrayCellState => (i >= l && i <= r ? 'idle' : 'dim')}
            ranges={[{ from: l, to: r, tone: 'hi', labels: ['l', 'r'] }]}
            showIndex
            cellMax={48}
          />
          <SectionTitle weight="regular">prefix: {n + 1} entries, starting at 0</SectionTitle>
          <ArrayStrip
            values={prefix}
            pointers={[
              { i: l, label: 'prefix[l]', tone: 'info', id: 'from' },
              { i: r + 1, label: 'prefix[r+1]', tone: 'violet', id: 'to' },
            ]}
            showIndex
            cellMax={48}
          />
        </div>
        <Box className="ps-cost">
          <SectionTitle hint={`${QUERIES.toLocaleString()} range queries on ${n} values`}>Query cost</SectionTitle>
          <Bar value={cost.naiveWorst} max={cost.naiveWorst} tone="bad" label="Add up each range" trailing={`up to ${cost.naiveWorst.toLocaleString()} adds`} />
          <Bar value={cost.prefix} max={cost.naiveWorst} tone="ok" label="Build prefix once, then O(1)" trailing={`${cost.prefix.toLocaleString()} steps`} />
        </Box>
      </div>
    </StageFrame>
  );
}

const UPDATE_SETS = [
  { value: 'long' as const, label: 'Long updates', updates: DIFF_UPDATES },
  { value: 'short' as const, label: 'Short updates', updates: DIFF_UPDATES_SHORT },
];

function DiffScene({ picker }: { picker: ReactNode }) {
  const [set, setSet] = useState<'long' | 'short'>('long');
  const updates = UPDATE_SETS.find((s) => s.value === set)!.updates;
  const frames = useMemo(() => diffFrames(DIFF_BASE, updates), [updates]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;

  return (
    <StageFrame
      minWidth={420}
      player={player}
      height={420}
      stats={
        <Stats>
          <Stat label="Diff writes" value={2 * updates.length} color="var(--ok)" sub={`+ a pass of ${DIFF_BASE.length}`} />
          <Stat label="Naive writes" value={naiveWrites(updates)} color="var(--bad)" sub="every cell of every range" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: '+ where a range starts' },
            { color: 'var(--bad)', label: '− just past its end' },
            { color: 'var(--hi)', label: 'rebuilding now' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Updates" value={set} onChange={setSet} options={UPDATE_SETS.map(({ value, label }) => ({ value, label }))} />
        </>,
      ]}
    >
      <div className="ps stage-pad">
        <ol className="ps-updates">
          {updates.map((u, k) => (
            <li key={k} className={`chip ${k === f.update ? 'tone-hi' : ''}`}>
              {signedText(u.add)} to [{u.from}, {u.to}]
            </li>
          ))}
        </ol>
        <div className="ps-rows">
          <SectionTitle weight="regular">base</SectionTitle>
          <ArrayStrip values={DIFF_BASE} showIndex cellMax={48} />
          <SectionTitle weight="regular">difference array (n + 1 slots)</SectionTitle>
          <ArrayStrip
            values={f.diff}
            renderValue={(v) => (typeof v === 'number' ? signedText(v) : String(v))}
            // Colour by role, not by sign: a negative update still starts green and ends red.
            cellState={(i): ArrayCellState => (i === f.marked[0] ? 'done' : i === f.marked[1] ? 'bad' : 'idle')}
            pointers={f.sweep !== null ? [{ i: f.sweep, label: 'Σ', tone: 'hi', id: 'sweep' }] : []}
            showIndex
            cellMax={48}
          />
          <SectionTitle weight="regular">result = base + running sum</SectionTitle>
          <ArrayStrip
            values={f.result.map((v) => (v === null ? '·' : v))}
            cellState={(i): ArrayCellState => (i === f.sweep ? 'active' : f.result[i] === null ? 'dim' : 'idle')}
            showIndex
            cellMax={48}
          />
        </div>
      </div>
    </StageFrame>
  );
}
