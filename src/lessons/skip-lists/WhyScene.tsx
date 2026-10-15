import { useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, TextField } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { touchedNodes } from './model';
import { DEFAULT_COIN_SEED, DEFAULT_INSERT_KEY, DEFAULT_P } from './presets';
import { SkipDrawing, type Edge } from './SkipDrawing';
import { drawingMinWidth } from './skipLayout';
import { writesCaption } from './text';
import { useListSession } from './useListSession';

const COINS = { p: DEFAULT_P, rig: 'fair', seed: DEFAULT_COIN_SEED } as const;

export function WhyScene({ picker }: { picker: ReactNode }) {
  const session = useListSession();
  const [text, setText] = useState('53');
  const first = session.frames[0];
  const last = session.frames[session.frames.length - 1];
  const before = first.snap;
  const after = last.snap;
  const changed: Edge[] = session.frames.flatMap((f) => f.changed);
  const touched = touchedNodes(before, after);
  const taller = after.towers.filter((t) => before.towers.some((b) => b.key === t.key && b.height !== t.height)).length;
  const inserted = after.towers.find((t) => !before.towers.some((b) => b.key === t.key)) ?? null;
  const removed = before.towers.find((t) => !after.towers.some((a) => a.key === t.key)) ?? null;
  const subject = inserted ?? removed;
  const caption = subject
    ? inserted
      ? writesCaption({ key: inserted.key, height: inserted.height, writes: last.writes, nodes: after.towers.length })
      : `Deleting ${subject.key} took ${last.writes} pointer ${last.writes === 1 ? 'write' : 'writes'}, one per level of its tower, and no other tower changed.`
    : 'Insert or delete a key and see which pointers change.';
  useIntroCaption(<>{caption}</>, [caption]);
  const insert = () => session.insert(text, COINS);

  return (
    <StageFrame
      height={400}
      stats={
        <Stats>
          <Stat label="Pointer writes" value={last.writes} color="var(--ok)" sub="this operation" />
          <Stat label="Existing nodes touched" value={touched.length} sub={`of ${before.towers.length + 1} nodes, head included`} />
          <Stat label="Towers resized" value={taller} sub="nothing is rotated or moved" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'pointer written, new tower', shape: 'dot' },
            { color: 'var(--info)', label: 'pointer followed by the search', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <TextField label="Key" value={text} onChange={setText} onEnter={insert} width={96} spellCheck={false} />
          <Button variant="primary" onClick={insert}>
            Insert
          </Button>
          <Button onClick={() => session.remove(text)}>Delete</Button>
          <Button
            onClick={() => {
              session.reset();
              setText('53');
            }}
          >
            Reset list
          </Button>
          <Hint>
            <span role="status">{session.note ?? `Fair coins at p = 1/2, seed ${DEFAULT_COIN_SEED}. The list opens after inserting ${DEFAULT_INSERT_KEY}.`}</span>
          </Hint>
        </>,
      ]}
    >
      <div className="sl-stage stage-pad">
        <SectionTitle>Before</SectionTitle>
        <WideRegion minWidth={drawingMinWidth(before)} label="List before: scroll sideways to see all of it">
          <SkipDrawing snap={before} ariaLabel={`List before the operation: ${before.towers.length} keys`} />
        </WideRegion>
        <SectionTitle>After: the pointers written are bright</SectionTitle>
        <WideRegion minWidth={drawingMinWidth(after)} label="List after: scroll sideways to see all of it">
          <SkipDrawing snap={after} fresh={inserted?.key ?? null} changed={changed} ariaLabel={`List after the operation: ${after.towers.length} keys`} />
        </WideRegion>
        <Box className="sl-claims">
          <SectionTitle>Why people pick them</SectionTitle>
          <p className="sl-line">
            <ClaimLabel kind="view" /> An insert rewrites a handful of pointers along its own search path and leaves every other tower alone, where a balanced tree may rotate whole subtrees (see the AVL lesson). That locality is the usual argument for skip lists when many threads write at once.
          </p>
          <p className="sl-line">
            <ClaimLabel kind="practice" /> Redis sorted sets are built on a skip list, and the memtable of LevelDB and RocksDB is a skip list by default. Details such as Redis's p and level cap I recall as 1/4 and 32 levels; all from memory, so check the source and docs.
          </p>
        </Box>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">the pointer writes are counted from the list drawn</Provenance>
        <Provenance kind="from-memory">Redis and LevelDB facts are quoted from memory, not checked here</Provenance>
        <Provenance kind="simulated" seed={DEFAULT_COIN_SEED}>coin flips from a seeded generator</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
