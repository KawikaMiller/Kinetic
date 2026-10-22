import { useMemo, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { SectionTitle } from '../../components/Panel';
import { Curve, Plot2D } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { raceCaption } from './captions';
import { CfgGraph } from './CfgGraph';
import { MAX_EXECUTIONS, MIN_EXECUTIONS, runFuzz } from './fuzzer';
import { listing } from './listing';
import { coverageCurve, newestNodes, reachedNodes, totalEdges } from './model';
import { initialRace } from './opening';
import type { BranchId } from './target';

const EXECUTIONS_STEP = 100;
const PLOT_WIDTH = 356;
const PLOT_HEIGHT = 210;

const n = (v: number) => v.toLocaleString('en-US');

/** Scene 1: a blind fuzzer and a coverage-guided one, same seed and budget, on the same target. */
export function RaceScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialRace);
  const { seed, executions, magic, shown } = state;
  const target = useMemo(() => ({ magic, boundsCheck: true }), [magic]);
  const blind = useMemo(() => runFuzz({ kind: 'blind', seed, executions, target }), [seed, executions, target]);
  const guided = useMemo(() => runFuzz({ kind: 'guided', seed, executions, target }), [seed, executions, target]);
  const run = shown === 'guided' ? guided : blind;
  const total = totalEdges(magic);
  const lines = useMemo(() => listing(magic), [magic]);
  const crashSites = useMemo(() => new Set(run.crashes.map((c) => c.site)), [run]);
  const newest = useMemo(() => newestNodes(run), [run]);
  const reached = useMemo(() => reachedNodes(run.edges), [run]);
  const set = (patch: Partial<typeof state>) => setState((s) => ({ ...s, ...patch }));

  const stateOf = (i: number) => {
    const branch = lines[i].branch;
    if (branch === undefined) return 'idle' as const;
    if (crashSites.has(branch as BranchId)) return 'bad' as const;
    if (newest.has(branch)) return 'now' as const;
    return reached.has(branch) ? ('done' as const) : ('idle' as const);
  };

  return (
    <StageFrame
      height={470}
      intro={raceCaption(blind, guided, total, magic)}
      introKey={[seed, executions, magic]}
      stats={
        <Stats>
          <Stat label="Guided" value={`${guided.edges.size} of ${total} edges`} color="var(--ok)" sub={[guided.firstCrashAt === null ? 'no crash found' : `first crash at execution ${n(guided.firstCrashAt)}`, `corpus of ${guided.corpus.length}`]} />
          <Stat label="Blind" value={`${blind.edges.size} of ${total} edges`} color="var(--bad)" sub={[blind.firstCrashAt === null ? 'no crash found' : `first crash at execution ${n(blind.firstCrashAt)}`, blind.magicAt === null ? 'magic never accepted' : `magic accepted at ${n(blind.magicAt)}`]} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'covered branch or edge', shape: 'square' },
            { color: 'var(--hi)', label: 'reached by the newest discovery', shape: 'square' },
            { color: 'var(--bad)', label: 'crash site (and the blind curve)', shape: 'square' },
            { color: 'var(--dim)', label: 'not reached', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Magic check" value={magic === 'single'} onChange={(v) => set({ magic: v ? 'single' : 'bytewise' })} off="Byte by byte" on="One 4-byte comparison" />
          <Segmented label="Graph shows" value={shown} onChange={(v) => set({ shown: v })} options={[{ value: 'guided', label: 'Guided' }, { value: 'blind', label: 'Blind' }]} />
        </>,
        <>
          <Slider label="Executions" value={executions} min={MIN_EXECUTIONS} max={MAX_EXECUTIONS} step={EXECUTIONS_STEP} onChange={(v) => set({ executions: v })} format={n} />
          <SeedField seed={seed} onSeed={(v) => set({ seed: v })} />
        </>,
      ]}
    >
      <div className="fz-stage stage-pad">
        <div className="fz-block">
          <SectionTitle>Control-flow graph of the toy target, as the {shown} fuzzer has covered it</SectionTitle>
          <CfgGraph magic={magic} covered={run.edges} newest={newest} crashSites={crashSites} ariaLabel={`Control-flow graph: ${run.edges.size} of ${total} edges covered by the ${shown} fuzzer`} />
        </div>
        <div className="fz-two">
          <div className="fz-block">
            <CodePanel title="The toy target" lines={lines.map((l) => l.text)} stateOf={stateOf} />
          </div>
          <div className="fz-block">
            <SectionTitle>Edges covered against executions</SectionTitle>
            <Plot2D
              x={{ domain: [0, executions], label: 'executions' }}
              y={{ domain: [0, total], label: 'edges covered', ticks: 4 }}
              width={PLOT_WIDTH}
              height={PLOT_HEIGHT}
              ariaLabel={`Edges covered against executions: guided ends at ${guided.edges.size}, blind at ${blind.edges.size}, of ${total}`}
            >
              <Curve points={coverageCurve(blind)} tone="bad" />
              <Curve points={coverageCurve(guided)} tone="ok" />
            </Plot2D>
          </div>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated" seed={seed}>no real program runs: everything here is the lesson's own toy</Provenance>
        <Provenance kind="toy">an invented record format and toy mutators; a thrown error stands for a crash</Provenance>
        <Provenance kind="from-memory">real fuzzers run many thousands of executions per second per core and get the byte-by-byte feedback from comparison instrumentation or dictionaries: check the AFL++ and libFuzzer documentation</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
