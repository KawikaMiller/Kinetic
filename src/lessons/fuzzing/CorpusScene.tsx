import { useMemo, useState, type ReactNode } from 'react';
import { ByteGrid } from '../../components/ByteGrid';
import { SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { TreeSvg } from '../../components/TreeSvg';
import { corpusCaption } from './captions';
import { MAX_EXECUTIONS, MIN_EXECUTIONS, runFuzz, type CorpusEntry } from './fuzzer';
import { edgeName, fieldsOf } from './model';
import { initialCorpus } from './opening';
import { DEFAULT_TARGET } from './target';

const EXECUTIONS_STEP = 100;
const TREE_WIDTH = 520;
const TREE_RADIUS = 16;
const TREE_LEVEL_GAP = 44;
const TREE_TOP = 34;
const TREE_BOTTOM = 40;

/** The generations in a corpus: the seed is generation 0 and an entry is one past its parent (parents come first). */
const generations = (corpus: readonly CorpusEntry[]): number => {
  const depth: number[] = [];
  for (const e of corpus) depth[e.id] = e.parent === null ? 0 : depth[e.parent] + 1;
  return Math.max(...depth);
};

const n = (v: number) => v.toLocaleString('en-US');

/** Scene 2: the corpus as a family tree of inputs, each kept because it found something new. */
export function CorpusScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialCorpus);
  const { seed, executions } = state;
  const run = useMemo(() => runFuzz({ kind: 'guided', seed, executions, target: DEFAULT_TARGET }), [seed, executions]);
  const corpus = run.corpus;
  const selected: CorpusEntry = corpus[Math.min(state.selected, corpus.length - 1)];
  const children = useMemo(() => {
    const byParent = new Map<number, number[]>();
    for (const e of corpus) if (e.parent !== null) byParent.set(e.parent, [...(byParent.get(e.parent) ?? []), e.id]);
    return byParent;
  }, [corpus]);
  const set = (patch: Partial<typeof state>) => setState((s) => ({ ...s, ...patch }));
  const onPath = useMemo(() => {
    const path = new Set<number>();
    for (let e: CorpusEntry | undefined = selected; e; e = e.parent === null ? undefined : corpus[e.parent]) path.add(e.id);
    return path;
  }, [selected, corpus]);

  return (
    <StageFrame
      height={470}
      intro={corpusCaption(selected, corpus.length)}
      introKey={[seed, executions, selected.id]}
      stats={
        <Stats>
          <Stat label="Corpus" value={corpus.length} color="var(--violet)" sub="inputs kept: each reached something new" />
          <Stat label="Edges covered" value={run.edges.size} color="var(--ok)" sub={`after ${n(executions)} executions`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the entry you picked', shape: 'square' },
            { color: 'var(--violet)', label: 'its ancestors and the edges to them', shape: 'square' },
            { color: 'var(--dim)', label: 'other entries', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Executions" value={executions} min={MIN_EXECUTIONS} max={MAX_EXECUTIONS} step={EXECUTIONS_STEP} onChange={(v) => set({ executions: v, selected: 0 })} format={n} />
          <SeedField seed={seed} onSeed={(v) => set({ seed: v, selected: 0 })} />
        </>,
      ]}
    >
      <div className="fz-stage stage-pad">
        <div className="fz-block">
          <SectionTitle>Corpus lineage: click an entry (or use the arrow keys)</SectionTitle>
          <TreeSvg
            shape={{ root: 0, children: (id: number) => children.get(id) ?? [] }}
            width={TREE_WIDTH}
            height={TREE_TOP + generations(corpus) * TREE_LEVEL_GAP + TREE_BOTTOM}
            levelGap={TREE_LEVEL_GAP}
            radius={TREE_RADIUS}
            top={TREE_TOP}
            natural
            label={(id) => `#${id}`}
            nodeMark={(id) => (id === selected.id ? { tone: 'hi', fill: 'tint' } : onPath.has(id) ? { tone: 'violet', fill: 'tint' } : { tone: 'dim', fill: 'tint', tint: 6 })}
            edgeMark={(parent, child) => (onPath.has(parent) && onPath.has(child) ? { tone: 'violet' } : null)}
            onNodeClick={(id) => set({ selected: id })}
            nodeAriaLabel={(id) => `Corpus entry ${id}, ${corpus[id].bytes.length} bytes, added ${corpus[id].newEdges.length} edges`}
            ariaLabel={`Corpus lineage of ${corpus.length} entries`}
          />
        </div>
        <div className="fz-two">
          <div className="fz-block">
            <SectionTitle>Entry #{selected.id}: {selected.bytes.length} bytes</SectionTitle>
            <ByteGrid bytes={selected.bytes} perRow={8} fields={fieldsOf(selected.bytes.length)} ariaLabel={`Bytes of corpus entry ${selected.id}`} />
          </div>
          <div className="fz-block">
            <SectionTitle>What it added</SectionTitle>
            {selected.newEdges.length === 0 ? (
              <p className="fz-note">Nothing: the seed is the starting point.</p>
            ) : (
              <ul className="fz-list">
                {selected.newEdges.map((e) => (
                  <li key={e}>{edgeName(e)}</li>
                ))}
              </ul>
            )}
            {selected.mutations.length > 0 && <p className="fz-note">Mutations applied: {selected.mutations.join(', ')}.</p>}
          </div>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated" seed={seed}>no real program runs: everything here is the lesson's own toy</Provenance>
        <Provenance kind="toy">toy mutators on an invented format; real fuzzers keep far larger corpora and trim them</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
