import { useMemo, useState } from 'react';
import { ArrayStrip, type ArrayCellState, type ArrayPointer } from '../../components/ArrayStrip';
import { Bar } from '../../components/Bar';
import { Box, SectionTitle, Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, Stat, Stats, TextField } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { RULE_NAMES, selectFrames } from './frames';
import {
  DEFAULT_SEED, K_CHOICES, kFor, MAX_VALUE, MAX_VALUES, parseValues, PRESETS, quickselect, quicksortComparisons, sameMultiset,
  sortedLastComparisons, type KChoice, type PivotRule,
} from './model';
import './styles.css';

const STEP_MS = 800;
const CELL_MAX = 52;
const RULES: { value: PivotRule; label: string }[] = [
  { value: 'last', label: 'Last' },
  { value: 'random', label: 'Random' },
  { value: 'median3', label: 'Median of 3' },
];

const strictlyAscending = (xs: readonly number[]) => xs.every((v, i) => i === 0 || xs[i - 1] < v);

export function Stage() {
  const [values, setValues] = useState<number[]>([...PRESETS[0].values]);
  const [draft, setDraft] = useState(PRESETS[0].values.join(', '));
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<KChoice>('median');
  const [rule, setRule] = useState<PivotRule>('last');
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const n = values.length;
  const k = kFor(choice, n);
  const kName = K_CHOICES.find((c) => c.value === choice)!.label.toLowerCase();

  const frames = useMemo(() => selectFrames(values, k, rule, seed, kName), [values, k, rule, seed, kName]);
  const totals = useMemo(
    () => ({ select: quickselect(values, k, rule, seed).comparisons, sort: quicksortComparisons(values, rule, seed).comparisons }),
    [values, k, rule, seed],
  );
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;

  const load = (vs: readonly number[]) => {
    setValues([...vs]);
    setDraft(vs.join(', '));
    setError(null);
  };
  const apply = () => {
    const r = parseValues(draft);
    if (!r.ok) return setError(r.error);
    load(r.values);
  };

  const cellState = (i: number): ArrayCellState => {
    if (f.found === i) return 'done';
    if (i < f.lo || i > f.hi) return 'dim';
    if (i === f.pivotAt) return 'active';
    if (i === f.j && f.pivotAt !== null && f.j !== f.pivotAt) return 'violet';
    return 'idle';
  };
  const pointers = markers(f.i, f.j !== f.pivotAt ? f.j : null, k);

  const raceMax = Math.max(1, totals.select, totals.sort);
  const smallest = f.arr.slice(0, k);
  const sortedCopy = [...values].sort((a, b) => a - b);
  const formula = rule === 'last' && n > 1 && strictlyAscending(values) ? sortedLastComparisons(n, k) : null;

  return (
    <StageFrame
      player={player}
      height={380}
      stats={
        <Stats>
          <Stat label="Comparisons" value={f.cmps} color="var(--hi)" sub={`of ${totals.select} for this search`} />
          <Stat label="Rounds" value={f.rounds} color="var(--muted)" sub="partitions so far" />
          <Stat label="Looking for" value={`k = ${k}`} color="var(--ok)" sub={`${kName} of ${n}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'pivot / live range' },
            { color: 'var(--info)', label: 'i: next small slot', shape: 'dot' },
            { color: 'var(--violet)', label: 'j: compared now' },
            { color: 'var(--dim)', label: 'thrown away' },
            { color: 'var(--ok)', label: 'answer' },
          ]}
        />
      }
      controls={[
        <>
          <Segmented label="Find" value={choice} onChange={setChoice} options={K_CHOICES} />
          <Segmented label="Pivot" value={rule} onChange={setRule} options={RULES} />
          {rule === 'random' && (
            <>
              <Button onClick={() => setSeed(seed + 1)}>New seed</Button>
              <Hint>Seed {seed}: random pivots are seeded so the replay is repeatable.</Hint>
            </>
          )}
        </>,
        <>
          <TextField label="Values" value={draft} onChange={setDraft} onEnter={apply} width={260} spellCheck={false} />
          <Button onClick={apply}>Apply</Button>
          <ControlGroup label="Presets" inline>
            {PRESETS.map((p) => (
              <ChipButton key={p.id} tone="info" on={values.join() === p.values.join()} onClick={() => load(p.values)}>
                {p.label}
              </ChipButton>
            ))}
          </ControlGroup>
          <Hint tone={error ? 'muted' : 'faint'} className="qs-note">
            <span role="status">{error ?? `Up to ${MAX_VALUES} whole numbers from 0 to ${MAX_VALUE}.`}</span>
          </Hint>
        </>,
      ]}
    >
      <div className="qs stage-pad">
        <div className="qs-strip">
          <ArrayStrip
            values={f.arr}
            showIndex
            cellMax={CELL_MAX}
            cellState={cellState}
            ranges={f.found === null ? [{ from: f.lo, to: f.hi, tone: 'hi', labels: ['lo', 'hi'] }] : []}
            pointers={pointers}
          />
        </div>
        <div className="qs-panels">
          <Box className="qs-race">
            <SectionTitle>Comparisons race</SectionTitle>
            <Bar value={f.cmps} max={raceMax} tone="hi" label={<>Quickselect</>} trailing={<>{f.cmps}</>} />
            <Bar value={totals.sort} max={raceMax} tone="violet" label={<>Full quick sort, {RULE_NAMES[rule]} pivots</>} trailing={<>{totals.sort}</>} />
            {formula !== null && (
              <Hint block>
                Sorted input with last-element pivots: each round peels off one value, so this search makes (n − 1 + k)(n − k) / 2 ={' '}
                {formula} comparisons. That is n(n − 1) / 2 when k is the smallest.
              </Hint>
            )}
          </Box>
          <Tray stack label={`The ${k} smallest, unordered`} className="qs-topk" empty={f.done ? 'k = 0: nothing is smaller' : 'shown when the search ends'}>
            {f.done && k > 0
              ? [
                  <span key="vals" className="qs-topk-values">{smallest.join(', ')}</span>,
                  <Hint key="check" block>
                    {sameMultiset(smallest, sortedCopy.slice(0, k))
                      ? `Same values as the first ${k} of a sorted copy: the partitions already left them on the left.`
                      : 'These do not match a sorted copy.'}
                  </Hint>,
                ]
              : null}
          </Tray>
        </div>
      </div>
    </StageFrame>
  );
}

/** i, j and k markers; ones on the same cell share one label ("i·k") so they never overprint. */
function markers(i: number | null, j: number | null, k: number): ArrayPointer[] {
  const list: { at: number; name: string; tone: ArrayPointer['tone'] }[] = [];
  if (i !== null) list.push({ at: i, name: 'i', tone: 'info' });
  if (j !== null) list.push({ at: j, name: 'j', tone: 'violet' });
  list.push({ at: k, name: 'k', tone: 'muted' });
  const out: ArrayPointer[] = [];
  for (const m of list) {
    const same = out.find((p) => p.i === m.at);
    if (same) same.label = `${String(same.label)}·${m.name}`;
    else out.push({ i: m.at, label: m.name, tone: m.tone, id: m.name });
  }
  return out;
}
