import { useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Curve, HLine, Plot2D, Points, VLine } from '../../components/Plot2D';
import { ChipButton, ClaimLabel, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { pctText } from '../../core/format';
import { crossoverCaption } from './captions';
import { DEFAULT_COSTS, FAST_STORAGE_RANDOM_PAGE_COST, crossoverRows, indexScanCost, moneyGrouped, seqScanCost, type Costs } from './model';
import { ORDERS } from './table';

/** Slider positions per decade of the log row-count axis. */
const STEPS_PER_DECADE = 200;
const DECADES = Math.log10(ORDERS.rows);
const DEFAULT_ROWS_RETURNED = 500;
const RANDOM_PAGE_RANGE = { min: 1, max: 8, step: 0.1 };
const PLOT_HEADROOM = 1.08;
const STEP_FACTOR = 1.15;

const rowsAt = (position: number): number => Math.min(ORDERS.rows, Math.max(1, Math.round(10 ** (position / STEPS_PER_DECADE))));
const positionOf = (m: number): number => Math.round(Math.log10(m) * STEPS_PER_DECADE);
const rows = (x: number): string => x.toLocaleString('en-US');

export function CrossoverScene({ picker }: { picker: ReactNode }) {
  const [rpc, setRpc] = useState(DEFAULT_COSTS.randomPage);
  const [m, setM] = useState(DEFAULT_ROWS_RETURNED);
  const costs: Costs = { ...DEFAULT_COSTS, randomPage: rpc };
  const seq = seqScanCost(ORDERS, costs);
  const index = indexScanCost(ORDERS, m, costs);
  const cross = crossoverRows(ORDERS, costs);
  const top = Math.max(seq, indexScanCost(ORDERS, ORDERS.rows, costs)) * PLOT_HEADROOM;
  const indexWins = index <= seq;

  useIntroCaption(crossoverCaption(ORDERS, costs, m), [rpc, m]);

  const step = (dir: 1 | -1) => setM((cur) => Math.min(ORDERS.rows, Math.max(1, dir > 0 ? Math.max(cur + 1, Math.round(cur * STEP_FACTOR)) : Math.min(cur - 1, Math.round(cur / STEP_FACTOR)))));

  return (
    <StageFrame
      height={330}
      stats={
        <Stats>
          <Stat label="Crossover" value={cross === null ? 'none' : `${rows(cross)} rows`} color="var(--violet)" sub={cross === null ? 'the index never loses' : `${pctText(cross / ORDERS.rows, 2)} of the table`} />
          <Stat label="Seq scan" value={moneyGrouped(seq)} sub="the same at any row count" />
          <Stat label={`Index scan at ${rows(m)} rows`} value={moneyGrouped(index)} color={indexWins ? 'var(--ok)' : 'var(--bad)'} sub={indexWins ? 'cheaper than the seq scan' : 'dearer than the seq scan'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'index scan cost', shape: 'line' },
            { color: 'var(--muted)', label: 'seq scan cost', shape: 'line' },
            { color: 'var(--violet)', label: 'crossover', shape: 'line' },
            { color: 'var(--hi)', label: 'rows returned (drag)', shape: 'line' },
            { color: 'var(--ok)', label: 'cheaper here' },
            { color: 'var(--bad)', label: 'dearer here' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Rows returned" value={positionOf(m)} min={0} max={Math.round(DECADES * STEPS_PER_DECADE)} onChange={(p) => setM(rowsAt(p))} format={(p) => `${rows(rowsAt(p))} (${pctText(rowsAt(p) / ORDERS.rows, 2)})`} />
        </>,
        <>
          <Slider label="random_page_cost" value={rpc} min={RANDOM_PAGE_RANGE.min} max={RANDOM_PAGE_RANGE.max} step={RANDOM_PAGE_RANGE.step} onChange={setRpc} format={(v) => v.toFixed(1)} />
          <ChipButton tone="violet" on={rpc === DEFAULT_COSTS.randomPage} onClick={() => setRpc(DEFAULT_COSTS.randomPage)}>4.0 (default)</ChipButton>
          <ChipButton tone="violet" on={rpc === FAST_STORAGE_RANDOM_PAGE_COST} onClick={() => setRpc(FAST_STORAGE_RANDOM_PAGE_COST)}>1.1 (fast storage)</ChipButton>
        </>,
      ]}
    >
      <div className="qp-stage stage-pad">
        <Plot2D
          x={{ domain: [1, ORDERS.rows], log: true, label: 'rows returned (log scale)', tickValues: [1, 10, 100, 1000, 10_000, 100_000] }}
          y={{ domain: [0, Math.ceil(top / 100) * 100], label: 'cost' }}
          width={356}
          height={260}
          ariaLabel={`Cost against rows returned: the seq scan is flat at ${seq.toFixed(0)}, the index scan climbs and crosses it at ${cross === null ? 'no row count' : `${rows(cross)} rows`}`}
        >
          <HLine at={seq} tone="muted" dashed={false} />
          <Curve fn={(x) => indexScanCost(ORDERS, x, costs)} tone="info" />
          {cross !== null && <VLine at={cross} tone="violet" label={`${rows(cross)} rows`} />}
          <VLine at={m} tone="hi" onDrag={(x) => setM(Math.min(ORDERS.rows, Math.max(1, Math.round(x))))} onStep={step} ariaLabel="Rows returned" valueText={`${rows(m)} rows, ${pctText(m / ORDERS.rows, 2)} of the table`} />
          <Points data={[{ x: m, y: seq, tone: indexWins ? 'bad' : 'ok' }, { x: m, y: index, tone: indexWins ? 'ok' : 'bad' }]} r={4} />
        </Plot2D>
        <ProvenanceRow>
          <Provenance kind="toy">simplified cost model on a toy table (1,000 pages, 100,000 rows), not PostgreSQL&apos;s formulas</Provenance>
          <Provenance kind="from-memory">constants are the PostgreSQL defaults as remembered: check the docs, planner cost constants</Provenance>
          <ClaimLabel kind="practice">random_page_cost 1.1 for fast storage is a common setting: verify for your system</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
