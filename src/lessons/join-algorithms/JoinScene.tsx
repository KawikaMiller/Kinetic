import { useMemo, useState, type ReactNode } from 'react';
import { ArrayStrip, type ArrayCellState } from '../../components/ArrayStrip';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { hashFrames, mergeFrames, nestedFrames, type JoinFrame } from './frames';
import { BUCKETS, INDEX_FANOUT, MIN_MEMORY, hashPlan, treeHeight } from './join';
import { JoinGrids } from './JoinGrids';
import { ResultPanel } from './ResultPanel';
import { TableControls } from './TableControls';
import type { TableState } from './useTableState';

export type JoinKind = 'nested' | 'hash' | 'merge';

const PLAYER_INTERVAL_MS = 650;
const DEFAULT_MEMORY = 16;

const LEGEND: Record<JoinKind, { color: string; label: string }[]> = {
  nested: [
    { color: 'var(--hi)', label: 'outer row' },
    { color: 'var(--info)', label: 'inner row compared' },
    { color: 'var(--ok)', label: 'match' },
    { color: 'var(--dim)', label: 'no match' },
  ],
  hash: [
    { color: 'var(--info)', label: 'row in the hash table' },
    { color: 'var(--hi)', label: 'probing row' },
    { color: 'var(--violet)', label: 'bucket probed' },
    { color: 'var(--ok)', label: 'match' },
    { color: 'var(--orange)', label: 'spilled row' },
  ],
  merge: [
    { color: 'var(--hi)', label: 'outer pointer' },
    { color: 'var(--info)', label: 'inner pointer' },
    { color: 'var(--ok)', label: 'emitted' },
    { color: 'var(--dim)', label: 'passed' },
    { color: 'var(--violet)', label: 'rewind' },
  ],
};

const cellStateFor = (pointer: number, tone: 'active' | 'info') => (k: number): ArrayCellState => (k < pointer ? 'dim' : k === pointer ? tone : 'idle');

function Buckets({ frame }: { frame: JoinFrame }) {
  return (
    <div className="ja-buckets" role="group" aria-label="Hash table buckets">
      {Array.from({ length: BUCKETS }, (_, b) => (
        <div key={b} className={`ja-bucket ${frame.hot === b ? 'is-hot' : ''}`}>
          <span className="ja-bucket-n">{b}</span>
          {(frame.buckets?.[b] ?? []).map((k, i) => <span key={i} className="ja-bucket-key">{k}</span>)}
        </div>
      ))}
    </div>
  );
}

function Strips({ frame }: { frame: JoinFrame }) {
  const strip = frame.strip;
  if (!strip) return null;
  const lane = (label: string, keys: readonly number[], pointer: number, tone: 'active' | 'info', name: string) => (
    <div className="ja-strip">
      <span className="ja-strip-label">{label}</span>
      {keys.length === 0 ? (
        <span className="ja-empty">no rows with a key</span>
      ) : (
        <ArrayStrip values={keys} cellState={cellStateFor(pointer, tone)} pointers={pointer < keys.length ? [{ i: pointer, label: name, tone: tone === 'active' ? 'hi' : 'info' }] : []} showIndex cellMax={44} fontSize={13} />
      )}
    </div>
  );
  return (
    <div className="ja-strips">
      {lane('customers, sorted', strip.a, strip.i, 'active', 'outer')}
      {lane('orders, sorted', strip.b, strip.j, 'info', 'inner')}
    </div>
  );
}

export function JoinScene({ kind, state, picker }: { kind: JoinKind; state: TableState; picker: ReactNode }) {
  const [indexed, setIndexed] = useState(false);
  const [memory, setMemory] = useState(DEFAULT_MEMORY);
  const [sorted, setSorted] = useState(false);
  const { tables } = state;
  const plan = hashPlan(tables, memory);
  const memoryMax = Math.max(MIN_MEMORY, plan.buildRows);
  const effectiveMemory = Math.min(memory, memoryMax);

  const frames = useMemo(
    () => (kind === 'nested' ? nestedFrames(tables, indexed) : kind === 'hash' ? hashFrames(tables, effectiveMemory) : mergeFrames(tables, sorted)),
    [kind, tables, indexed, effectiveMemory, sorted],
  );
  const player = usePlayer(frames, { interval: PLAYER_INTERVAL_MS, autoplayOnChange: false });
  const f = player.frame;
  const last = frames[frames.length - 1];

  return (
    <StageFrame
      player={player}
      height={400}
      stats={
        <Stats>
          <Stat label={f.unit} value={f.work} color="var(--info)" sub={`${last.work} in total`} />
          <Stat label="Pairs found" value={f.out} color="var(--ok)" sub={`${last.out} in total`} />
          {kind === 'hash' && <Stat label="Rows spilled" value={f.spilled ?? 0} color={(last.spilled ?? 0) > 0 ? 'var(--orange)' : undefined} sub={`${last.spilled ?? 0} in total at ${effectiveMemory} rows of memory`} />}
          {kind === 'nested' && indexed && <Stat label="Probe cost" value={treeHeight(tables.b.length)} sub="node visits a probe (tree height)" />}
        </Stats>
      }
      legend={<Legend items={LEGEND[kind]} />}
      controls={[
        <>
          {picker}
          {kind === 'nested' && <Toggle label="Inner key" value={indexed} onChange={setIndexed} off="no index" on="index" />}
          {kind === 'hash' && <Slider label="Memory (rows)" value={effectiveMemory} min={MIN_MEMORY} max={memoryMax} onChange={setMemory} format={(v) => (v >= plan.buildRows ? `${v} (fits)` : String(v))} />}
          {kind === 'merge' && <Toggle label="Inputs" value={sorted} onChange={setSorted} off="need sorting" on="already sorted (index)" />}
        </>,
        <><TableControls state={state} /></>,
      ]}
    >
      <div className="ja-stage stage-pad">
        <JoinGrids tables={tables} aMark={f.aMark} bMark={f.bMark} selected={state.selected} onSelect={state.select} />
        {kind === 'hash' && <Buckets frame={f} />}
        {kind === 'merge' && <Strips frame={f} />}
        <ResultPanel tables={tables} />
        <ProvenanceRow>
          <Provenance kind="toy">small teaching tables; counters are in one unit, not seconds</Provenance>
          {kind === 'hash' && <Provenance kind="toy">hash partitioning here is a teaching model of the idea; real engines differ in batching and skew handling (verify)</Provenance>}
          {kind === 'nested' && indexed && <Provenance kind="toy">the index is a toy B-tree with {INDEX_FANOUT} children a node; a probe visits one node a level</Provenance>}
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
