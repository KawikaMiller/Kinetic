import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid, type GridCellSpec } from '../../components/CellGrid';
import { CodePanel } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { pct } from '../../core/format';
import { n, sortedCaption } from './captions';
import { PREDICTOR_KINDS, PREDICTOR_LABELS } from './predictor';
import {
  BRANCHLESS_INSTRUCTIONS, DATA_COUNT, DATA_SEED, ITER_INSTRUCTIONS, PENALTY_RANGE, THRESHOLD, branchOutcomes, dataValues, loopConfig, loopCost, missedIterations, sortedOpening,
} from './scenarios';

const PER_ROW = 32;
const GRID_CELL = { cell: 9, gap: 1, font: 0 } as const;
const CODE = ['for (int i = 0; i < 256; i++) {', `  if (data[i] >= ${THRESHOLD}) {`, '    sum += data[i];', '  }', '}'];
const ORDERS = [
  { value: 'unsorted' as const, label: 'Unsorted' },
  { value: 'sorted' as const, label: 'Sorted' },
];
const KIND_OPTIONS = PREDICTOR_KINDS.map((k) => ({ value: k, label: PREDICTOR_LABELS[k] }));

export function SortedScene({ picker }: { picker: ReactNode }) {
  const [open] = useState(sortedOpening);
  const [order, setOrder] = useState(open.order);
  const [kind, setKind] = useState(open.kind);
  const [branchless, setBranchless] = useState(open.branchless);
  const [penalty, setPenalty] = useState(open.penalty);

  const cfg = useMemo(() => loopConfig(kind), [kind]);
  const cost = useMemo(() => loopCost(order, cfg, penalty, branchless), [order, cfg, penalty, branchless]);
  const outcomes = useMemo(() => branchOutcomes(dataValues(order)), [order]);
  const missed = useMemo(() => missedIterations(order, cfg), [order, cfg]);
  const alternative = useMemo(() => loopCost(order, cfg, penalty, !branchless), [order, cfg, penalty, branchless]);
  const caption = sortedCaption(order, cost, penalty);

  const cell = (r: number, c: number): GridCellSpec => {
    const k = r * PER_ROW + c;
    if (!branchless && missed[k]) return { tone: 'bad', fill: 'solid' };
    if (branchless) return { tone: 'dim', fill: 'tint', intensity: 0.2 };
    return { tone: outcomes[k] ? 'hi' : 'muted', fill: 'tint', intensity: outcomes[k] ? 0.4 : 0.2 };
  };

  return (
    <StageFrame
      height={420}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Misses" value={n(cost.misses)} color={cost.misses > 0 ? 'var(--bad)' : 'var(--ok)'} sub={`of ${n(cost.iterations)} branches (${pct(cost.misses / cost.iterations)})`} />
          <Stat label="Outcome changes" value={branchless ? '-' : n(cost.transitions)} sub={branchless ? 'no branch in the stream' : `${n(cost.taken)} of ${n(cost.iterations)} taken`} />
          <Stat label="Total cycles" value={n(cost.cycles)} color={cost.cycles <= alternative.cycles ? 'var(--ok)' : 'var(--bad)'} sub={`${n(cost.instructions)} instructions + ${n(cost.misses)} x ${n(penalty)}`} />
          <Stat label={branchless ? 'Branchy loop would cost' : 'Branchless loop would cost'} value={n(alternative.cycles)} color={alternative.cycles < cost.cycles ? 'var(--ok)' : 'var(--bad)'} sub={`same ${order} data, same predictor`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'value >= 128: taken', shape: 'square' },
            { color: 'var(--muted)', label: 'value < 128: not taken', shape: 'square' },
            { color: 'var(--bad)', label: 'the predictor missed', shape: 'square' },
            { color: 'var(--dim)', label: 'no branch (branchless)', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Data order" value={order} onChange={setOrder} options={ORDERS} />
          <Toggle label="Loop" value={branchless} onChange={setBranchless} off="Branch" on="Branchless" />
        </>,
        <>
          <Segmented label="Predictor" value={kind} onChange={setKind} options={KIND_OPTIONS} />
          <Slider label="Miss penalty (illustrative)" value={penalty} min={PENALTY_RANGE.min} max={PENALTY_RANGE.max} onChange={setPenalty} format={(v) => `${v} cycles`} />
        </>,
      ]}
    >
      <div className="bp-stage stage-pad">
        <div className="bp-loop">
          <CodePanel className="bp-code" title="the loop" lines={CODE} active={branchless ? null : 1} />
          <Box>
            <SectionTitle hint={`${DATA_COUNT} values, 32 per row, in loop order`}>The branch outcome of every iteration</SectionTitle>
            <CellGrid
              className="bp-data"
              rows={DATA_COUNT / PER_ROW}
              cols={PER_ROW}
              size={GRID_CELL}
              cell={cell}
              ariaLabel={`${order} data: ${cost.taken} of ${cost.iterations} branches taken, ${cost.misses} mispredicted`}
            />
          </Box>
        </div>
        <Hint tone="muted" block>
          Branchy: {ITER_INSTRUCTIONS} instructions per iteration. Branchless: {BRANCHLESS_INSTRUCTIONS}, because the select is done with arithmetic (a mask and an AND, or a conditional move). The loop&apos;s own back-edge is assumed predicted, and both paths of the branch are counted as the same length.
        </Hint>
        <ProvenanceRow>
          <Provenance kind="toy">the same textbook predictors as the lab, starting in the weakly taken state</Provenance>
          <Provenance kind="illustrative">instructions per iteration and the miss penalty are chosen, not measured</Provenance>
          <Provenance kind="simulated" seed={DATA_SEED}>256 seeded values, sorted or not</Provenance>
          <Provenance kind="from-memory">compilers sometimes turn this select into a conditional move; verify with Compiler Explorer</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
