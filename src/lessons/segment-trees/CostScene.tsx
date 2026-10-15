import { useMemo, useState, type ReactNode } from 'react';
import { ArrayStrip } from '../../components/ArrayStrip';
import { Bar } from '../../components/Bar';
import { Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, TextField } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { WORKLOAD_SIZE, makeWorkload, prefixUpdateCells, rankCosts, runWorkload, type CostRank } from './cost';
import { updateHops } from './fenwick';
import { parseField, parseValue } from './keys';
import { buildTree, setCell } from './model';
import { COST_EDIT_DEFAULT, COST_SIZES, DEFAULT_COST_SIZE, DEFAULT_UPDATE_PCT, WORKLOAD_SEED, costStartValues, valuesFor } from './presets';
import { costCaption } from './text';

const rankColor: Record<CostRank, string | undefined> = { bad: 'var(--bad)', ok: 'var(--ok)', muted: undefined };

export function CostScene({ picker }: { picker: ReactNode }) {
  const [n, setN] = useState<number>(DEFAULT_COST_SIZE);
  const [pct, setPct] = useState(DEFAULT_UPDATE_PCT);
  const [cells, setCells] = useState<number[]>(() => valuesFor(DEFAULT_COST_SIZE));
  const [edit, setEdit] = useState(COST_EDIT_DEFAULT);
  const [indexText, setIndexText] = useState(String(COST_EDIT_DEFAULT.index));
  const [valueText, setValueText] = useState(String(COST_EDIT_DEFAULT.value));
  const [note, setNote] = useState<string | null>(null);
  const drawn = n === DEFAULT_COST_SIZE;

  const requests = useMemo(() => makeWorkload(n, WORKLOAD_SIZE, pct, WORKLOAD_SEED), [n, pct]);
  const run = useMemo(() => runWorkload(costStartValues(n), requests), [n, requests]);
  const updates = requests.filter((q) => q.kind === 'update').length;
  const segmentWrites = setCell(buildTree(costStartValues(n), 'sum'), Math.min(edit.index, n - 1), edit.value).touched;
  const prefix = useMemo(() => cells.reduce<number[]>((acc, v) => [...acc, acc[acc.length - 1] + v], [0]).slice(1), [cells]);
  const rewritten = (i: number) => i > edit.index;
  const caption = costCaption({
    index: Math.min(edit.index, n - 1),
    n,
    prefixWrites: prefixUpdateCells(n, Math.min(edit.index, n - 1)),
    segmentWrites,
    fenwickWrites: updateHops(Math.min(edit.index, n - 1) + 1, n).length,
    updates,
    queries: requests.length - updates,
    totals: run.costs,
  });
  useIntroCaption(<>{caption}</>, [caption]);
  const ranks = rankCosts(run.costs);
  const max = Math.max(run.costs.prefix, run.costs.segment, run.costs.fenwick, 1);

  /** The edit controls only exist at the drawn size, so leaving it drops the edit instead of keeping it hidden. */
  const changeSize = (next: number) => {
    setN(next);
    setCells(valuesFor(DEFAULT_COST_SIZE));
    setEdit(COST_EDIT_DEFAULT);
    setIndexText(String(COST_EDIT_DEFAULT.index));
    setValueText(String(COST_EDIT_DEFAULT.value));
    setNote(null);
  };
  const change = () => {
    const i = parseField(indexText, 0, cells.length - 1, 'a cell number');
    const v = parseValue(valueText);
    if (!i.ok || !v.ok) {
      setNote(!i.ok ? i.error : !v.ok ? v.error : null);
      return;
    }
    setNote(null);
    setCells(cells.map((c, k) => (k === i.value ? v.value : c)));
    setEdit({ index: i.value, value: v.value });
  };

  return (
    <StageFrame
      height={470}
      stats={
        <Stats>
          <Stat label="Prefix sums" value={run.costs.prefix.toLocaleString('en-US')} color={rankColor[ranks.prefix]} sub="cells touched by the workload" />
          <Stat label="Segment tree" value={run.costs.segment.toLocaleString('en-US')} color={rankColor[ranks.segment]} sub="nodes touched" />
          <Stat label="Fenwick tree" value={run.costs.fenwick.toLocaleString('en-US')} color={rankColor[ranks.fenwick]} sub="cells touched" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'prefix cells rewritten by a change at the picked cell', shape: 'square' },
            { color: 'var(--bad)', label: 'bars and totals: the costliest design', shape: 'line' },
            { color: 'var(--ok)', label: 'bars and totals: the cheapest design', shape: 'line' },
            { color: 'var(--hi)', label: 'the cell you changed', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Cells n" value={n} onChange={changeSize} options={COST_SIZES.map((s) => ({ value: s, label: s.toLocaleString('en-US') }))} />
          <Slider label="Updates in the mix" value={pct} min={0} max={100} step={10} onChange={setPct} format={(v) => `${v}%`} />
        </>,
        <>
          {drawn ? (
            <>
              <TextField label="Cell" value={indexText} onChange={setIndexText} onEnter={change} width={64} spellCheck={false} />
              <TextField label="New value" value={valueText} onChange={setValueText} onEnter={change} width={84} spellCheck={false} />
              <Button variant="primary" onClick={change}>Change the cell</Button>
              <Hint><span role="status">{note ?? 'Press a cell below to pick it. The workload starts from the original array.'}</span></Hint>
            </>
          ) : (
            <Hint>At {n.toLocaleString('en-US')} cells only the counts are shown; pick 8 cells to change a value and watch the prefix array rewrite.</Hint>
          )}
        </>,
      ]}
    >
      <div className="st-stage stage-pad">
        {drawn && (
          <Tray label="The array, and the prefix sums under it" labelWeight="regular" stack ariaLabel="Array and prefix sums">
            <ArrayStrip
              values={cells}
              cellState={(i) => (i === edit.index ? 'active' : 'idle')}
              onCellClick={(i) => setIndexText(String(i))}
              cellTitle={(i) => `Pick cell ${i}`}
              showIndex
              cellMax={64}
              fontSize={13}
            />
            <ArrayStrip values={prefix} cellTone={(i) => (rewritten(i) ? { tone: 'bad', fill: 'tint' } : null)} cellMax={64} fontSize={13} />
          </Tray>
        )}
        <div className="st-bars">
          {([['Prefix sums', run.costs.prefix, ranks.prefix], ['Segment tree', run.costs.segment, ranks.segment], ['Fenwick tree', run.costs.fenwick, ranks.fenwick]] as const).map(([label, value, tone]) => (
            <div key={label} className="st-bar-row">
              <span>{label}</span>
              <Bar value={value} max={max} tone={tone} ariaLabel={`${label}: ${value} touched`} />
              <b>{value.toLocaleString('en-US')}</b>
            </div>
          ))}
        </div>
        <Hint tone="muted" block>
          One unit for every row: cells or nodes touched. A prefix array counts the cells a query reads or an update rewrites, a Fenwick tree the cells on its hop path, and a segment tree every node its walk enters, partial ones included, because the walk has to stand on them to find the covered nodes. Recomputing a node from its children is not counted again.
        </Hint>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">all three designs run the same requests, and each query answer is checked against a plain loop</Provenance>
        <Provenance kind="simulated" seed={WORKLOAD_SEED}>the {WORKLOAD_SIZE} operations are a seeded mix of updates and range sums</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
