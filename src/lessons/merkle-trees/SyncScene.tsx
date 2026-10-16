import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, Plot2D, VLine } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { SequenceDiagram } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { toSequence } from '../../core/distSim';
import { usePlayer } from '../../core/usePlayer';
import { plural, syncCaption, syncVerdict } from './captions';
import { HashTree } from './HashTree';
import { buildTree } from './merkle';
import { MAX_EDITS, REPLICA_LEAVES, baseLeaves, comparisonBound, runSync, type SyncMsg } from './sync';
import { SIZES, SYNC_OPEN, bytesSent, comparisonSeries, pickPositions, replicaB, sizeText, syncFrames, syncMark, toggleEdit } from './view';

const STEP_MS = 900;
const LEAF_CELL = { cell: 34 };
/** The narrowest width at which the 16 cells keep their 34 px size, so their labels stay at 8 px or more. */
const LEAF_STRIP_MIN_WIDTH = REPLICA_LEAVES * LEAF_CELL.cell + 60;
const SIZE_OPTIONS = SIZES.map((n) => ({ value: n, label: n.toLocaleString('en-US') }));
const LABEL = (p: SyncMsg) => (p.type === 'hashes' ? `hashes of ${p.ids.length} node${p.ids.length === 1 ? '' : 's'}` : p.type === 'reply' ? `${Object.keys(p.hashes).length} hash${Object.keys(p.hashes).length === 1 ? '' : 'es'}` : p.type === 'fetch' ? `fetch ${p.leaves.length} range${p.leaves.length === 1 ? '' : 's'}` : `${Object.keys(p.blocks).length} range${Object.keys(p.blocks).length === 1 ? '' : 's'}`);

export function SyncScene({ picker }: { picker: ReactNode }) {
  const [seed, setSeed] = useState<number>(SYNC_OPEN.seed);
  const [edits, setEdits] = useState<Set<number>>(() => pickPositions(SYNC_OPEN.seed, SYNC_OPEN.edits));
  const [size, setSize] = useState<number>(256);

  const a = useMemo(() => baseLeaves(REPLICA_LEAVES), []);
  const b = useMemo(() => replicaB(edits), [edits]);
  const frames = useMemo(() => syncFrames('sha256', a, b, syncCaption), [a, b]);
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });
  const f = player.frame;
  const result = useMemo(() => runSync('sha256', a, b), [a, b]);
  const treeA = useMemo(() => buildTree('sha256', a)!, [a]);
  const atEnd = f.index === frames.length - 1;
  const sizes = useMemo(() => bytesSent(REPLICA_LEAVES, result.comparisons, result.found.length), [result]);
  const sequence = useMemo(() => toSequence(result.cluster.trace.filter((r) => r.payload && (r.kind === 'send' || r.kind === 'drop')), { label: LABEL, actors: [{ id: 'a', label: 'replica A' }, { id: 'b', label: 'replica B' }] }), [result]);
  const series = useMemo(() => comparisonSeries(edits, seed, SIZES), [edits, seed]);
  const here = series.find((p) => p.n === size)!;
  const yMax = Math.max(...SIZES);
  const change = (k: number) => setEdits(pickPositions(seed, k));
  const newSeed = (s: number) => {
    setSeed(s);
    setEdits(pickPositions(s, edits.size));
  };

  return (
    <StageFrame
      player={player}
      height={640}
      stats={
        <Stats>
          <Stat label="Hash comparisons" value={f.comparisons} sub={`naive: ${REPLICA_LEAVES} range by range`} />
          <Stat label="Ranges to transfer" value={f.phase === 'start' ? '?' : f.found.length} sub={`of ${REPLICA_LEAVES}`} />
          <Stat label="Naive transfer" value={sizeText(sizes.naive)} sub="every range crosses the wire" />
          <Stat label="Anti-entropy transfer" value={sizeText(sizes.smart)} color={sizes.saved > 0 ? 'var(--ok)' : 'var(--hi)'} sub={`B's hash replies and the fetched ranges, A's requests not counted; ${sizes.saved >= 0 ? 'saves' : 'costs'} ${sizeText(Math.abs(sizes.saved))} once finished`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'a hash that matches its twin on B', shape: 'square' },
            { color: 'var(--bad)', label: 'a hash that differs', shape: 'square' },
            { color: 'var(--dim)', label: 'a subtree skipped without descent', shape: 'square' },
            { color: 'var(--hi)', label: 'a key range edited on B (click to toggle)', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Ranges that differ" value={edits.size} min={0} max={MAX_EDITS} onChange={change} />
          <SeedField seed={seed} onSeed={newSeed} label="Seed (which ranges)" />
          <Button onClick={() => setEdits(new Set())}>No differences</Button>
        </>,
      ]}
    >
      <div className="mkl-stage stage-pad">
        <Box>
          <SectionTitle hint="replica B's 16 key ranges: click to edit or restore one">B differs from A at</SectionTitle>
          <WideRegion minWidth={LEAF_STRIP_MIN_WIDTH} label="Key ranges of replica B: scroll sideways to see all 16">
          <CellGrid
            rows={1}
            cols={REPLICA_LEAVES}
            size={LEAF_CELL}
            cell={(_, c) => ({ text: String(c), tone: edits.has(c) ? (atEnd ? 'ok' : 'hi') : 'muted', fill: edits.has(c) ? 'solid' : 'outline' })}
            onCellClick={(_, c) => setEdits(toggleEdit(edits, c))}
            cellAriaLabel={(_, c) => `Key range ${c}, ${edits.has(c) ? 'edited on B' : 'same on both'}: press to toggle`}
            ariaLabel="Key ranges of replica B"
          />
          </WideRegion>
        </Box>
        <Box>
          <SectionTitle hint="A's tree, marked with what each comparison with B found">The descent</SectionTitle>
          <HashTree tree={treeA} mark={(n) => syncMark(n.id, f)} edge={(p, c) => f.compared[p.id] === 'differ' && f.compared[c.id] !== undefined} ariaLabel="Replica A's Merkle tree with the comparison results" />
          <p className={`mkl-verdict ${result.missed.length > 0 ? 'is-bad' : 'is-ok'}`} role="status">{atEnd ? syncVerdict(result, REPLICA_LEAVES, edits.size) : 'Press play, or step with the arrow keys: each round asks B for more hashes.'}</p>
        </Box>
        <Box>
          <SectionTitle hint="the messages the two replicas exchange">Rounds</SectionTitle>
          <SequenceDiagram actors={sequence.actors} messages={sequence.messages} />
        </Box>
        <Box>
          <SectionTitle hint="computed from the tree shape, no hashing: n leaves, the same number of differences; at n = 16 the ranges you marked, otherwise seeded positions">Comparisons against tree size</SectionTitle>
          <Plot2D x={{ domain: [16, yMax], log: true, label: 'leaves n', tickValues: SIZES.filter((_, i) => i % 2 === 0) }} y={{ domain: [1, yMax], log: true, label: 'comparisons' }} ariaLabel="Hash comparisons against the number of leaves">
            <Curve points={SIZES.map((n) => [n, n])} tone="bad" dashed />
            <Curve points={series.map((p) => [p.n, p.comparisons])} tone="ok" />
            <Curve points={SIZES.map((n) => [n, comparisonBound(n, Math.max(1, edits.size))])} tone="violet" dashed />
            <VLine at={size} label={`n = ${size}`} tone="info" />
          </Plot2D>
          <div className="mkl-seed"><Segmented label="Leaves n" value={size} onChange={setSize} options={SIZE_OPTIONS} /></div>
          <Hint tone="muted" block>At n = {size.toLocaleString('en-US')} with {plural(edits.size, 'difference')}: {here.comparisons} comparisons ({plural(edits.size, 'difference')} times about log2 n is the shape, the dashed violet line is the bound 1 + 2 k log2 n), against {size.toLocaleString('en-US')} range by range.</Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="real">SHA-256 over 16 key ranges, shown as 4 of 64 hex characters</Provenance>
          <Provenance kind="simulated">the two replicas and their messages run on the lesson's message simulator; a range is 1 KiB, an illustrative size</Provenance>
          <Provenance kind="from-memory">Dynamo-style stores use Merkle trees to find the ranges replicas disagree on: check the Dynamo paper</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
