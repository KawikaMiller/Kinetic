import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid, type GridHighlight } from '../../components/CellGrid';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { depFrames, type DepFrame } from './frames';
import { D_RANGE, DEP_LENGTH, DEP_WIDTHS, depInput, depVerdict, runVector } from './model';
import { dependenceOpening, type DependenceOpening } from './openings';

const COLS = 8;
const ROWS = DEP_LENGTH / COLS;
const WIDTH_LABEL: Record<number, string> = { 1: 'scalar', 4: '128-bit', 8: '256-bit', 16: '512-bit' };
const WIDTH_OPTIONS = DEP_WIDTHS.map((lanes) => ({ value: lanes, label: `${WIDTH_LABEL[lanes]} (${lanes})` }));

const PRESETS: { id: string; label: string; set: DependenceOpening }[] = [
  { id: 'prefix', label: 'prefix sum written naively (d = 1)', set: { d: 1, lanes: 4 } },
  { id: 'far', label: 'reach back 8 (d = 8)', set: { d: 8, lanes: 8 } },
];

const at = (i: number) => ({ r: Math.floor(i / COLS), c: i % COLS });

export function DependenceScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<DependenceOpening>(dependenceOpening);
  const input = useMemo(() => depInput(), []);
  const run = useMemo(() => runVector(input, s.d, s.lanes), [input, s]);
  const verdict = useMemo(() => depVerdict(input, s.d, s.lanes), [input, s]);
  const frames = useMemo(() => depFrames(s.d, s.lanes, run, verdict), [s, run, verdict]);
  const player = usePlayer<DepFrame>(frames, { interval: 800, autoplayOnChange: false });
  const done = player.frame.done;
  const state = run.states[done];
  const current = done > 0 ? run.chunks[done - 1] : null;
  const lastWritten = run.chunks.slice(0, done).reduce((end, c) => Math.max(end, c.writeTo), -1);

  const highlight: GridHighlight[] = [];
  if (current) {
    for (let i = current.readFrom; i <= current.readTo; i++) highlight.push({ ...at(i), tone: 'info' });
    for (let i = current.writeFrom; i <= current.writeTo; i++) highlight.push({ ...at(i), tone: 'hi' });
  }
  if (verdict.firstWrong !== null && verdict.firstWrong <= lastWritten) highlight.push({ ...at(verdict.firstWrong), tone: 'bad' });

  const vectorCell = (r: number, c: number) => {
    const i = r * COLS + c;
    if (i > lastWritten || i < s.d) return { text: state[i], tone: 'muted' as const, fill: 'outline' as const };
    return state[i] === verdict.scalar[i] ? { text: state[i], tone: 'ok' as const, fill: 'tint' as const } : { text: state[i], tone: 'bad' as const, fill: 'solid' as const };
  };
  const scalarCell = (r: number, c: number) => {
    const i = r * COLS + c;
    return { text: verdict.scalar[i], tone: 'muted' as const, fill: i < s.d ? ('outline' as const) : ('tint' as const) };
  };

  return (
    <StageFrame
      player={player}
      height={400}
      stats={
        <Stats>
          <Stat
            label="Vectorisable at this width"
            value={verdict.vectorisable ? 'yes' : 'no'}
            color={verdict.vectorisable ? 'var(--ok)' : 'var(--bad)'}
            sub={['found by running both loops and comparing every element']}
          />
          <Stat label="Wrong elements" value={verdict.wrong.length} color={verdict.wrong.length ? 'var(--bad)' : undefined} sub={[`of ${DEP_LENGTH - s.d} the loop writes`]} />
          <Stat label="First wrong index" value={verdict.firstWrong ?? '–'} sub={verdict.firstWrong === null ? ['none'] : [`a[${verdict.firstWrong}]`]} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'chunk reads (ring)' },
            { color: 'var(--hi)', label: 'chunk writes (ring)' },
            { color: 'var(--ok)', label: 'matches the scalar loop' },
            { color: 'var(--bad)', label: 'differs from it' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Lanes" value={s.lanes} onChange={(lanes) => setS((c) => ({ ...c, lanes }))} options={WIDTH_OPTIONS} />
        </>,
        <>
          <Slider label="Distance d" value={s.d} {...D_RANGE} onChange={(d) => setS((c) => ({ ...c, d }))} />
          {PRESETS.map((p) => (
            <ChipButton key={p.id} tone="info" on={p.set.d === s.d && p.set.lanes === s.lanes} onClick={() => setS(p.set)}>
              {p.label}
            </ChipButton>
          ))}
        </>,
      ]}
    >
      <div className="sg-stage stage-pad">
        <div className="sg-pair">
          <div className="sg-grid">
            <span className="section-title">Vector run, one chunk per step</span>
            <CellGrid rows={ROWS} cols={COLS} size="md" cell={vectorCell} highlight={highlight} ariaLabel={`The array after ${done} vector chunks`} />
          </div>
          <div className="sg-grid">
            <span className="section-title">Scalar loop, the reference</span>
            <CellGrid rows={ROWS} cols={COLS} size="md" cell={scalarCell} ariaLabel="The array after the scalar loop" />
          </div>
        </div>
        <ProvenanceRow>
          <Provenance kind="toy">a {DEP_LENGTH}-element array of made-up values; the vector run reads a whole chunk, adds one, then writes the chunk, as hardware would</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
