import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { ArrayStrip, type ArrayCellState } from '../../components/ArrayStrip';
import { CellGrid } from '../../components/CellGrid';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, ClaimLabel } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { usePlayer } from '../../core/usePlayer';
import { plural } from '../../core/format';
import { costOf, estimateText, kindName, scanFrames, type ScanFrame } from './frames';
import { InputBar } from './InputBar';
import { scanOpening, type UseCase } from './openings';
import { MAX_PROCESSORS, OPS, OP_IDS, compact, foldCost, isEven, lift, sameValue, scan, sequentialScan, showValue, type OpId, type ScanKind, type ScanMode } from './patterns';
import { useListInput } from './useListInput';

const OP_OPTIONS = OP_IDS.map((id) => ({ value: id, label: OPS[id].label }));
const KIND_OPTIONS: { value: ScanKind; label: string }[] = [
  { value: 'hillis-steele', label: 'Hillis-Steele' },
  { value: 'blelloch', label: 'Blelloch' },
];
const MODE_OPTIONS: { value: ScanMode; label: string }[] = [
  { value: 'inclusive', label: 'inclusive' },
  { value: 'exclusive', label: 'exclusive' },
];
const COMPACT_VALUES = [5, 2, 8, 3, 6, 7, 4, 1];
const OFFSET_COUNTS = [3, 0, 2, 4, 1, 2, 0, 5];
const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((v, i) => v === b[i]);

export function ScanScene({ picker }: { picker: ReactNode }) {
  const [open] = useState(scanOpening);
  const input = useListInput({ values: open.values, op: open.op });
  const [kind, setKind] = useState<ScanKind>(open.kind);
  const [mode, setMode] = useState<ScanMode>(open.mode);
  const [p, setP] = useState(open.p);
  const [useCase, setUseCase] = useState<UseCase>(open.useCase);
  const { op, values } = input;

  const compaction = useMemo(() => (useCase === 'compaction' ? compact(values, isEven) : null), [useCase, values]);
  const scanned = compaction ? compaction.flags : values;
  const lifted = useMemo(() => lift(scanned, op), [scanned, op]);
  const trace = useMemo(() => scan(kind, lifted, OPS[op], mode), [kind, lifted, op, mode]);
  const loop = useMemo(() => sequentialScan(lifted, OPS[op], mode), [lifted, op, mode]);
  const frames = useMemo(() => scanFrames(lifted, trace, op, mode), [lifted, trace, op, mode]);
  const player = usePlayer<ScanFrame>(frames, { interval: 800, autoplayOnChange: false });
  const shown = player.frame.row;
  const n = lifted.length;
  const cost = costOf(kind, n);
  const loopCost = foldCost(n);
  const matches = trace.result.every((v, i) => sameValue(v, loop[i]));
  const done = player.atEnd;
  const current = shown - 1;

  const clearUseCase = () => setUseCase('none');
  const load = (vals: readonly number[], nextOp: OpId, nextMode: ScanMode, nextCase: UseCase) => {
    input.load(vals, nextOp);
    setMode(nextMode);
    setUseCase(nextCase);
  };

  const cell = (r: number, c: number) => {
    if (r >= shown) return { fill: 'none' as const };
    const row = trace.rows[r];
    const text = showValue(row.cells[c], 4);
    const pad = c >= n && trace.kind === 'blelloch';
    if (r === current && r > 0) {
      if (row.writes.includes(c)) return { text, tone: 'hi' as const, fill: 'solid' as const };
      return { text, tone: pad ? ('violet' as const) : ('dim' as const), fill: 'outline' as const };
    }
    if (r === current - 1 && trace.rows[current]?.reads.includes(c)) return { text, tone: 'info' as const, fill: 'solid' as const };
    return { text, tone: pad ? ('violet' as const) : ('muted' as const), fill: 'tint' as const };
  };

  const resultState = (i: number): ArrayCellState => (!done ? 'dim' : sameValue(trace.result[i], loop[i]) ? 'done' : 'bad');

  return (
    <StageFrame
      player={player}
      height={480}
      stats={
        <Stats>
          <Stat label={`Work (${kindName(kind)})`} value={cost.work} color="var(--info)" sub={[`the loop does ${loopCost.work}`, kind === 'hillis-steele' ? (cost.work > loopCost.work ? 'more additions than the loop' : 'as many additions as the loop') : `2 × (${trace.width} − 1)`]} />
          <Stat label="Span" value={plural(cost.span, 'step')} sub={[`the loop takes ${loopCost.span}`, estimateText(cost, p)]} />
          <Stat label="Result" value={matches ? 'matches the loop' : 'differs'} color={matches ? 'var(--ok)' : 'var(--bad)'} sub={[matches ? 'checked element by element' : `${OPS[op].label} is not associative: the scan regroups`]} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'operands read' },
            { color: 'var(--hi)', label: 'written this step' },
            { color: 'var(--dim)', label: 'not touched this step' },
            { color: 'var(--violet)', label: 'padding (the identity)' },
            { color: 'var(--ok)', label: 'matches the loop' },
            { color: 'var(--bad)', label: 'differs from it' },
          ]}
        />
      }
      controls={[
        <Fragment key="row0">
          {picker}
          <Segmented label="Algorithm" value={kind} onChange={setKind} options={KIND_OPTIONS} />
          <Segmented label="Scan" value={mode} onChange={(m) => { setMode(m); clearUseCase(); }} options={MODE_OPTIONS} />
        </Fragment>,
        <Fragment key="row1">
          <Segmented label="Operator" value={op} onChange={(o) => { input.setOp(o); clearUseCase(); }} options={OP_OPTIONS} />
          <Slider label="Processors p" value={p} min={1} max={MAX_PROCESSORS} onChange={setP} />
        </Fragment>,
        <InputBar
          key="input"
          input={{ ...input, type: (t) => { input.type(t); clearUseCase(); } }}
          presets={[
            { id: 'sum8', label: 'sum of 8', on: useCase === 'none' && op === 'plus' && same(values, [3, 1, 4, 1, 5, 9, 2, 6]), apply: () => load([3, 1, 4, 1, 5, 9, 2, 6], 'plus', 'inclusive', 'none') },
            { id: 'runmax', label: 'running max', on: useCase === 'none' && op === 'max' && same(values, [3, 1, 4, 1, 5, 9, 2, 6]), apply: () => load([3, 1, 4, 1, 5, 9, 2, 6], 'max', 'inclusive', 'none') },
            { id: 'compact', label: 'stream compaction (keep the evens)', on: useCase === 'compaction', apply: () => load(COMPACT_VALUES, 'plus', 'exclusive', 'compaction') },
            { id: 'offsets', label: 'histogram bucket offsets', on: useCase === 'offsets', apply: () => load(OFFSET_COUNTS, 'plus', 'exclusive', 'offsets') },
          ]}
        />,
      ]}
    >
      <div className="pp-stage stage-pad">
        {compaction && <Hint tone="muted" block>Stream compaction: the scan runs over the 0/1 flags of {values.map((v) => showValue(v)).join(' ')}, where 1 means keep the evens.</Hint>}
        {useCase === 'offsets' && <Hint tone="muted" block>Histogram offsets: the values are bucket counts, and the exclusive scan gives where each bucket starts in the sorted output.</Hint>}
        <div className="pp-grid">
          <WideRegion minWidth={460} label="The scan, one row for each step: scroll sideways to see all of it">
            <CellGrid
              rows={trace.rows.length}
              cols={trace.width}
              size="sm"
              cell={cell}
              rowDecor={(r) => (r < shown ? { label: trace.rows[r].label, tone: 'muted', style: 'band' } : null)}
              ariaLabel={`The ${kindName(kind)} scan, ${shown} of ${trace.rows.length} rows shown`}
            />
          </WideRegion>
        </div>
        <span className="section-title">Result ({mode}), compared with the loop</span>
        <ArrayStrip values={trace.result.map((v) => showValue(v))} cellState={resultState} showIndex fontSize={n > 10 ? 10 : 13} cellMax={56} />
        {compaction && (
          <>
            <span className="section-title">Output slots from the scan, and the compacted array</span>
            <ArrayStrip values={compaction.slots} cellState={(i) => (compaction.flags[i] === 1 && done ? 'done' : 'idle')} showIndex cellMax={56} />
            <ArrayStrip values={compaction.out} cellState={() => (done ? 'done' : 'dim')} cellMax={56} />
          </>
        )}
        {useCase === 'offsets' && (
          <>
            <span className="section-title">Bucket start offsets</span>
            <ArrayStrip values={trace.result.map((v) => showValue(v))} cellState={() => (done ? 'done' : 'dim')} showIndex cellMax={56} />
          </>
        )}
        <ProvenanceRow>
          <Provenance kind="toy">steps are model steps; real hardware has p fixed by the machine and memory costs the model ignores</Provenance>
          <ClaimLabel kind="research">the operation counts follow Blelloch&apos;s 1990 report on prefix sums and GPU Gems 3 chapter 39 as remembered; verify against them before quoting the 2 (n − 1) figure</ClaimLabel>
          <Provenance kind="real">every value is computed by running the scan on your list</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
