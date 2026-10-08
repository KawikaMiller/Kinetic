import { useMemo, useState, type ReactNode } from 'react';
import { ArrayStrip } from '../../components/ArrayStrip';
import { Bar } from '../../components/Bar';
import { CodePanel, type LineState } from '../../components/CodePanel';
import { GanttLanes, type GanttBar, type GanttMarker } from '../../components/GanttLanes';
import { SectionTitle } from '../../components/Panel';
import { Curve, Plot2D, Segments, VLine } from '../../components/Plot2D';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { TreeSvg } from '../../components/TreeSvg';
import { Hint, Legend, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { barLabelPx } from '../../core/gantt';
import { minWidthForText } from '../../core/scale';
import type { Tone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import {
  HOT_THRESHOLD, WORKLOADS, crossover, race, fmtCount, fmtTime, itersAt, liveCounterAt, type Lane, type SegKind, type Workload,
} from './costModel';
import {
  BYTECODE, BYTECODE_LINES, LINE_OF_NODE, NODES, SOURCE, laneOpsAt, raceFrames, show, stepFrames, type Strategy,
} from './frames';
import { SUM_SQUARES, childrenOf, nodeLabel, type Value } from './lang';
import { NATIVE_LINES, REG_OF } from './native';
import './styles.css';

const STEP_MS = 900;
const RACE_MS = 1700;

type SceneId = 'step' | 'race';

export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({
    label: 'Scene',
    options: [
      { value: 'step', label: 'Step through' },
      { value: 'race', label: 'The race' },
    ],
    initial: 'race',
  });
  return scene === 'step' ? <StepScene picker={picker} /> : <RaceScene picker={picker} />;
}

/* ---------- step through ---------- */

const STRATEGIES: { value: Strategy; label: string }[] = [
  { value: 'tree', label: 'Tree-walker' },
  { value: 'vm', label: 'Bytecode VM' },
  { value: 'native', label: 'Machine code (JIT)' },
];
const ARGS: { value: 'num' | 'str'; label: string }[] = [
  { value: 'num', label: 'sumSquares(3)' },
  { value: 'str', label: 'sumSquares("3")' },
];
const ARG_OF: Record<'num' | 'str', Value> = { num: 3, str: '3' };
const UNIT: Record<Strategy, string> = { tree: 'Nodes visited', vm: 'Instructions', native: 'Machine instructions' };

/** The AST drawing's natural size (viewBox units). Its 12px labels need 373px to stay at 8px+, a little over the spec's 360. */
const AST_W = 560;
const AST_H = 330;
const AST_LABEL_PX = 12;
const AST_MIN_W = Math.max(360, minWidthForText(AST_W, AST_LABEL_PX));
const NODE_H = 24;
/** JetBrains Mono at 12px is about 7.2px a character. */
const nodeW = (label: string) => Math.max(26, label.length * 7.2 + 10);

function StepScene({ picker }: { picker: ReactNode }) {
  const [strategy, setStrategy] = useState<Strategy>('tree');
  const [argKey, setArgKey] = useState<'num' | 'str'>('num');
  const arg = ARG_OF[argKey];
  const frames = useMemo(() => stepFrames(strategy, arg), [strategy, arg]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;
  const sourceLine = strategy === 'tree' && f.node !== null ? (LINE_OF_NODE.get(f.node) ?? null) : null;

  return (
    <StageFrame
      player={player}
      height={520}
      stats={
        <Stats>
          <Stat label={UNIT[strategy]} value={fmtCount(f.count)} />
          <Stat label="Loop checks" value={f.checks} sub="each is one tick of a JIT's counter" />
          <Stat label="Result" value={f.deopt ? 'deopt' : f.done ? show(strategy === 'native' ? f.regs?.xmm0 : f.env.s) : '–'} color={f.deopt ? 'var(--bad)' : undefined} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: strategy === 'tree' ? 'node being visited' : 'instruction just run' },
            ...(strategy === 'vm' ? [{ color: 'var(--info)', label: 'values on the VM stack' }] : []),
            ...(strategy === 'native' ? [{ color: 'var(--bad)', label: 'guard failed: deoptimise' }] : []),
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Segmented label="Run it with" value={strategy} onChange={setStrategy} options={STRATEGIES} />
          <Segmented label="Call" value={argKey} onChange={setArgKey} options={ARGS} />
        </>,
      ]}
    >
      <div className="icj stage-pad">
        {strategy === 'tree' && (
          <div className="icj-row">
            <CodePanel className="icj-code" title="source" lines={SOURCE.lines} active={sourceLine} />
            <div className="icj-ast">
              <SectionTitle>the AST · the walker visits a node for every operation</SectionTitle>
              <WideRegion minWidth={AST_MIN_W} label="Syntax tree: scroll sideways to see all of it">
                <TreeSvg
                  natural
                  shape={{ root: SUM_SQUARES.id, children: (id) => childrenOf(NODES.get(id)!).map((c) => c.id) }}
                  layout="tidy"
                  width={AST_W}
                  height={AST_H}
                  levelGap={58}
                  top={22}
                  pad={30}
                  className="icj-tree"
                  ariaLabel="Syntax tree of sumSquares; the node being visited is highlighted"
                  nodeClass={(id) => (id === f.node ? 'is-now' : NODES.get(id)!.kind === 'num' || NODES.get(id)!.kind === 'var' ? 'is-leaf' : '')}
                  renderNode={(id) => {
                    const label = nodeLabel(NODES.get(id)!);
                    const w = nodeW(label);
                    return (
                      <>
                        <rect x={-w / 2} y={-NODE_H / 2} width={w} height={NODE_H} rx={7} />
                        <text y={4} textAnchor="middle">{label}</text>
                      </>
                    );
                  }}
                />
              </WideRegion>
            </div>
            <Locals env={f.env} />
          </div>
        )}
        {strategy === 'vm' && (
          <div className="icj-row">
            <CodePanel className="icj-code" title="bytecode · compiled once from the tree" lines={BYTECODE_LINES} active={f.pc} />
            <div className="icj-side">
              <SectionTitle>value stack · top on the right</SectionTitle>
              <ArrayStrip values={f.stack.length ? f.stack.map(show) : ['']} cellState={() => (f.stack.length ? 'info' : 'dim')} cellMax={64} />
              <Locals env={f.env} />
              <Hint block>
                The loop is instructions {String(BYTECODE.loopHead).padStart(2, '0')}-18: no tree in sight, just a program counter stepping through an array.
              </Hint>
            </div>
          </div>
        )}
        {strategy === 'native' && (
          <div className="icj-row">
            <CodePanel
              className="icj-code"
              title="machine code · illustrative x86-64 style"
              lines={NATIVE_LINES}
              stateOf={(i): LineState => (i === f.pc ? (f.deopt ? 'bad' : 'now') : 'idle')}
            />
            <div className="icj-side">
              <SectionTitle>registers</SectionTitle>
              <table className="data-table icj-regs">
                <tbody>
                  {(Object.keys(REG_OF) as (keyof typeof REG_OF)[]).map((name) => (
                    <tr key={name}>
                      <td><code>{REG_OF[name]}</code></td>
                      <td>{name}</td>
                      <td className="icj-num">{show(f.regs?.[REG_OF[name]])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Hint block>
                The JIT compiled this after the function got hot, betting that n is always a number. Pick <code>sumSquares(&quot;3&quot;)</code> to break the bet.
              </Hint>
            </div>
          </div>
        )}
        <Hint block>
          The tree-walker and the bytecode VM really run here, on the lesson&apos;s own tiny language with JavaScript&apos;s rules for <code>+</code>, <code>*</code> and{' '}
          <code>&lt;=</code>. The machine code is an illustrative listing run by a small model, not real JIT output.
        </Hint>
      </div>
    </StageFrame>
  );
}

function Locals({ env }: { env: Record<string, Value> }) {
  return (
    <div className="icj-locals">
      <SectionTitle>locals</SectionTitle>
      <div className="icj-local-row">
        {['n', 's', 'i'].map((k) => (
          <span key={k} className="chip tone-muted icj-local">
            {k} = {show(env[k])}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------- the race ---------- */

const SEG_TONE: Record<SegKind, Tone> = { compile: 'orange', interp: 'muted', native: 'ok', deopt: 'bad' };
const SEG_LABEL: Record<SegKind, string> = { compile: 'compile', interp: 'interpret', native: 'machine code', deopt: 'deopt' };
const MS = 1e6;
/** A deopt lasts microseconds on a millisecond axis; draw it at least this wide so the failed guard is visible. */
const DEOPT_MIN_PX = 4;

function laneBars(lanes: readonly Lane[]): GanttBar[] {
  return lanes.flatMap((l) =>
    l.segments.map((s, i) => ({
      id: `${l.id}-${i}`,
      lane: l.id,
      start: s.start / MS,
      end: s.end / MS,
      tone: SEG_TONE[s.kind],
      label: s.kind === 'compile' ? s.what : SEG_LABEL[s.kind],
      ...(s.kind === 'deopt' ? { minPx: DEOPT_MIN_PX } : {}),
    })),
  );
}

function RaceScene({ picker }: { picker: ReactNode }) {
  const [workload, setWorkload] = useState<Workload['id']>('long');
  const [builtAhead, setBuiltAhead] = useState(false);
  const w = WORKLOADS.find((x) => x.id === workload)!;
  const r = useMemo(() => raceOf(w, builtAhead), [w, builtAhead]);
  const frames = useMemo(() => raceFrames(r), [r]);
  const player = usePlayer(frames, { interval: RACE_MS });
  const now = player.frame.now;
  const jit = r.lanes.find((l) => l.id === 'jit')!;
  const vm = r.lanes.find((l) => l.id === 'vm')!;
  const domain: [number, number] = [0, Math.max(...r.lanes.map((l) => l.total)) / MS];
  const counter = liveCounterAt(r, now);
  const markers: GanttMarker[] = r.jitEvents.map((e) => ({ at: e.at / MS, label: e.kind === 'hot' ? 'hot' : 'deopt', tone: e.kind === 'hot' ? 'violet' : 'bad' }));

  return (
    <StageFrame
      player={player}
      height={560}
      stats={
        <Stats>
          <Stat label="Time" value={fmtTime(now)} sub="illustrative" />
          <Stat label="JIT hotness" value={`${fmtCount(counter)} / ${fmtCount(HOT_THRESHOLD)}`} sub="calls + loop iterations">
            <Bar value={counter} max={HOT_THRESHOLD} tone="violet" height={8} />
          </Stat>
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--orange)', label: 'parsing or compiling' },
            { color: 'var(--muted)', label: 'interpreting' },
            { color: 'var(--ok)', label: 'machine code' },
            { color: 'var(--bad)', label: 'deopt or type error', shape: 'line' },
            { color: 'var(--violet)', label: 'hotness counter, hot', shape: 'line' },
            { color: 'var(--hi)', label: 'now', shape: 'line' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Segmented label="Workload" value={workload} onChange={setWorkload} options={WORKLOADS.map((x) => ({ value: x.id, label: x.label }))} />
          {w.calls.some((c) => typeof c === 'string') ? (
            <span className="icj-aot-note">AOT build: always counted here, because the string call fails the build</span>
          ) : (
            <Toggle label="AOT build" value={builtAhead} onChange={setBuiltAhead} off="Counted" on="Built ahead" />
          )}
        </>,
      ]}
    >
      <div className="icj stage-pad">
        <div className="icj-table-wrap">
          <table className="data-table icj-lanes">
            <thead>
              <tr>
                <th>Lane</th>
                <th>Ops so far</th>
                <th>Total time</th>
              </tr>
            </thead>
            <tbody>
              {r.lanes.map((l) => (
                <tr key={l.id}>
                  <td>{l.name}</td>
                  <td className="icj-num">
                    {fmtCount(laneOpsAt(l, now))} <span className="icj-unit">{l.unit}</span>
                  </td>
                  <td className={`icj-num ${l.failed ? 'icj-failed' : ''}`}>{l.failed ? (now >= l.total ? 'build fails' : '–') : now >= l.total ? fmtTime(l.total) : '…'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <SectionTitle>timeline · to scale, in ms</SectionTitle>
          <GanttLanes
            lanes={r.lanes.map((l) => ({ id: l.id, label: l.name }))}
            bars={laneBars(r.lanes)}
            domain={domain}
            now={now / MS}
            markers={[...markers, ...r.lanes.filter((l) => l.failed).map((l) => ({ at: l.total / MS, label: 'type error', tone: 'bad' as const }))]}
            unit=" ms"
            axis
            size="md"
            labelWidth={96}
            labelMinPx={barLabelPx('machine code')}
            ariaLabel="Timeline of the four lanes"
          />
        </div>
        <div className="icj-row">
          <div className="icj-plot">
            <SectionTitle>JIT close-up · loop iterations done</SectionTitle>
            <JitPlot jit={jit} vm={vm} now={now} deopts={r.jitEvents.filter((e) => e.kind === 'deopt').map((e) => e.at)} />
          </div>
          <div className="icj-side">
            <Hint block>
              The slope is speed. The JIT starts as steep as the VM (grey), goes flat while it compiles (orange), then climbs much faster in machine code (green). After a
              deoptimisation it is back on the VM&apos;s slope until it gets hot again. It switches mid-loop, which real JITs call on-stack replacement.
            </Hint>
            <Hint block>
              Here the compile is a pause. Engines such as V8 and the JVM compile hot code on background threads, so the program keeps running in the interpreter
              meanwhile; the cost is CPU time and a later switch rather than a stop.
            </Hint>
            <Hint block>{crossoverNote(builtAhead)}</Hint>
            <Hint block>
              A cost model, not a benchmark: each lane&apos;s operations are counted by really running it (the tree-walker and VM run, the machine code is a model), then priced
              at illustrative costs. Start-up of the runtime or process isn&apos;t included. Counts for n = 1,000,000 come from the measured per-iteration count, because every
              iteration runs the same operations; the tests check that against a full run.
            </Hint>
          </div>
        </div>
      </div>
    </StageFrame>
  );
}

const raceOf = (w: Workload, builtAhead: boolean) => race(w, { countBuild: !builtAhead });

/** The JIT lane as iterations-over-time segments, coloured by what the lane is doing. */
function jitSegments(jit: Lane) {
  let done = 0;
  return jit.segments.map((s) => {
    const from: [number, number] = [s.start / MS, done];
    done += s.iters;
    return { from, to: [s.end / MS, done] as [number, number], tone: SEG_TONE[s.kind] };
  });
}

/** Where, in this model, one call of sumSquares(n) starts favouring each strategy. */
function crossoverNote(builtAhead: boolean): string {
  const jitVm = crossover('jit', 'vm');
  const vmTree = crossover('vm', 'tree');
  const aotJit = crossover('aot', 'jit', !builtAhead);
  const aot = aotJit === null
    ? 'With its build counted, AOT never catches the JIT on one call in this model'
    : `AOT, ${builtAhead ? 'built ahead' : 'build counted'}, beats the JIT from n = ${fmtCount(aotJit)}`;
  return `In this model, one call of sumSquares(n): the VM beats the tree-walker from n = ${fmtCount(vmTree!)}, and the JIT beats the VM from n = ${fmtCount(jitVm!)}. ${aot}.`;
}

function JitPlot({ jit, vm, now, deopts }: { jit: Lane; vm: Lane; now: number; deopts: number[] }) {
  const xMax = jit.total / MS;
  const yMax = Math.max(1, jit.segments.reduce((a, s) => a + s.iters, 0));
  const segs = jitSegments(jit);
  const vmPts: [number, number][] = [[0, 0] as [number, number], ...vm.segments.map((s): [number, number] => [s.end / MS, itersAt(vm, s.end)])].filter(([x]) => x <= xMax);
  const vmEnd = Math.min(vm.total, jit.total);
  vmPts.push([vmEnd / MS, itersAt(vm, vmEnd)]);
  return (
    <Plot2D
      x={{ domain: [0, xMax], label: 'time (ms)', ticks: 4 }}
      y={{ domain: [0, yMax], label: 'iterations', ticks: 4 }}
      width={356}
      height={230}
      ariaLabel="Loop iterations completed over time by the JIT lane, with the bytecode VM for comparison"
    >
      <Curve points={vmPts} tone="muted" dashed />
      <Segments segments={segs} />
      {deopts.map((t) => (
        <VLine key={t} at={t / MS} tone="bad" label="deopt" />
      ))}
      <VLine at={Math.min(now, jit.total) / MS} tone="hi" dashed={false} />
    </Plot2D>
  );
}
