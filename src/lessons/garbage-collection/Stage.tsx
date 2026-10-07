import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { GanttLanes } from '../../components/GanttLanes';
import { barLabelPx } from '../../core/gantt';
import { HeapObject, RefArrow, heapFieldPort, heapHeight, heapRect, slotPort, VarSlot, type PortSide } from '../../components/memory';
import { SectionTitle } from '../../components/Panel';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Hint, Legend, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useIntroCaption } from '../../core/caption';
import { minWidthForText } from '../../core/scale';
import type { Pt } from '../../core/geometry';
import type { Tone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { genFrames, markSweepFrames, type GcFrame, type GenFrame } from './frames';
import { byId, freeSpace, refCounts, shortLivedRuns, SHORT_LIVED, type Heap, type Obj } from './model';
import { GEN_START, NURSERY_SLOTS, PRESETS, type PresetId } from './presets';
import './styles.css';

const STEP_MS = 1300;
/** Spec: 560px on phones, raised where the memory kit's 10px tags would drop under 8px. */
const SPEC_MIN_W = 560;
const SMALLEST_TEXT_PX = 10;

type SceneId = 'ms' | 'gen';

export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({
    label: 'Scene',
    options: [
      { value: 'ms', label: 'Mark & sweep' },
      { value: 'gen', label: 'Generations' },
    ],
    initial: 'ms',
  });
  return scene === 'ms' ? <MarkSweepScene picker={picker} /> : <GenScene picker={picker} />;
}

/* ---------- shared drawing ---------- */

const BOX_W = 118;
const COL_W = 136;
const ROW_H = 96;
const HEAP_X = 176;
const HEAP_TOP = 34;
const ROOT_X = 8;
const ROOT_GAP = 46;
/** Bows a same-row arrow up into the gap between rows (RefArrow bows left of travel; the apex is half the bend). */
const SKIP_BEND = 98;

interface Grid {
  cols: number;
  /** Slot → top-left of its box. */
  at: (slot: number) => Pt;
}

const plainGrid = (cols: number): Grid => ({ cols, at: (s) => ({ x: HEAP_X + (s % cols) * COL_W, y: HEAP_TOP + Math.floor(s / cols) * ROW_H }) });

/** Field port on the side facing the target, and a bow when source and target share a column. */
function fieldArrow(grid: Grid, from: Obj, i: number, toSlot: number) {
  const a = grid.at(from.slot);
  const b = grid.at(toSlot);
  const side: PortSide = b.x < a.x ? 'left' : 'right';
  // Same column: bow out sideways. Same row, more than one column apart: bow over the boxes in between.
  const skips = b.y === a.y && Math.abs(b.x - a.x) > COL_W;
  return { from: heapFieldPort(a, BOX_W, i, side), bend: b.x === a.x ? (b.y > a.y ? -34 : 34) : skips ? (b.x < a.x ? SKIP_BEND : -SKIP_BEND) : 0 };
}

interface ObjLook {
  tone: Tone;
  variant: 'live' | 'freed';
  tag?: string;
  highlight: boolean;
}

function HeapPicture({
  heap, grid, look, rootTone, onRootClick, extraArrows, bands,
}: {
  heap: Heap;
  grid: Grid;
  look: (o: Obj) => ObjLook;
  rootTone: Tone;
  onRootClick?: (id: string) => void;
  extraArrows?: ReactNode;
  bands?: ReactNode;
}) {
  const objs = byId(heap);
  const width = HEAP_X + grid.cols * COL_W;
  const height = Math.max(...Array.from({ length: heap.slots }, (_, i) => grid.at(i).y)) + ROW_H;
  const used = new Set(heap.objects.map((o) => o.slot));
  const rootAt = (i: number): Pt => ({ x: ROOT_X, y: HEAP_TOP + 8 + i * ROOT_GAP });
  const onKey = (e: KeyboardEvent, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onRootClick?.(id);
    }
  };
  return (
    <svg className="gc-svg" viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`Heap with ${heap.objects.length} objects and ${heap.roots.length} roots`}>
      {bands}
      <text className="scene-zone" x={ROOT_X} y={20}>roots</text>
      {!bands && <text className="scene-zone" x={HEAP_X} y={20}>heap · {heap.slots} slots</text>}
      {Array.from({ length: heap.slots }, (_, s) =>
        used.has(s) ? null : (
          <g key={`free-${s}`} className="gc-free">
            <rect x={grid.at(s).x} y={grid.at(s).y} width={BOX_W} height={heapHeight(1)} rx={9} />
            <text x={grid.at(s).x + BOX_W / 2} y={grid.at(s).y + heapHeight(1) / 2 + 4} textAnchor="middle">free</text>
          </g>
        ),
      )}
      {heap.objects.map((o) => {
        const l = look(o);
        return (
          <HeapObject
            key={o.id}
            at={grid.at(o.slot)}
            w={BOX_W}
            title={o.label}
            tone={l.tone}
            variant={l.variant}
            tag={l.tag}
            highlight={l.highlight}
            fields={o.fields.map((f) => ({ name: f.name, isRef: f.to !== null, value: f.to === null ? 'null' : undefined }))}
          />
        );
      })}
      {heap.roots.map((r, i) => (
        <g
          key={r.id}
          className={onRootClick ? 'gc-root is-clickable' : 'gc-root'}
          {...(onRootClick ? { role: 'button', tabIndex: 0, 'aria-label': `${r.kind} ${r.label}: ${r.to ? 'set it to null' : 'already null'}`, onClick: () => onRootClick(r.id), onKeyDown: (e: KeyboardEvent) => onKey(e, r.id) } : {})}
        >
          <VarSlot at={rootAt(i)} name={r.label} isRef={r.to !== null} value={r.to === null ? 'null' : undefined} tone={rootTone} />
          <text className="gc-root-kind" x={ROOT_X} y={rootAt(i).y - 4}>{r.kind}</text>
        </g>
      ))}
      {heap.roots.map((r, i) => {
        const t = r.to === null ? null : objs.get(r.to);
        if (!t) return null;
        return <RefArrow key={`r-${r.id}`} from={slotPort(rootAt(i))} to={heapRect(grid.at(t.slot), BOX_W, t.fields.length)} tone="violet" />;
      })}
      {heap.objects.flatMap((o) =>
        o.fields.map((f, i) => {
          const t = f.to === null ? null : objs.get(f.to);
          if (!t) return null;
          const a = fieldArrow(grid, o, i, t.slot);
          return <RefArrow key={`${o.id}-${f.name}`} from={a.from} to={heapRect(grid.at(t.slot), BOX_W, t.fields.length)} bend={a.bend} tone="violet" />;
        }),
      )}
      {extraArrows}
    </svg>
  );
}

/** Tri-colour look during a trace: white (not seen) dim, gray (work list) yellow, black (live) blue. */
function triColour(f: { gray: string[]; black: string[]; scanning: string | null; doomed: string[] }, o: Obj, idle: Tone, tracing: boolean): ObjLook {
  if (f.doomed.includes(o.id)) return { tone: 'bad', variant: 'freed', tag: 'garbage', highlight: false };
  if (!tracing) return { tone: idle, variant: 'live', highlight: false };
  if (f.black.includes(o.id)) return { tone: 'info', variant: 'live', highlight: o.id === f.scanning };
  if (f.gray.includes(o.id)) return { tone: 'hi', variant: 'live', highlight: false };
  return { tone: 'dim', variant: 'live', highlight: false };
}

/* ---------- mark & sweep ---------- */

const GRID_MS = plainGrid(4);
const heapMinWidth = (cols: number) => Math.max(SPEC_MIN_W, minWidthForText(HEAP_X + cols * COL_W, SMALLEST_TEXT_PX));
const MUTATOR_US = 600;

function MarkSweepScene({ picker }: { picker: ReactNode }) {
  const [presetId, setPresetId] = useState<PresetId>('basic');
  const [heap, setHeap] = useState<Heap>(PRESETS[0].heap);
  const [compactOn, setCompactOn] = useState(false);
  const [showRc, setShowRc] = useState(false);
  const [source, setSource] = useState<string>('rax');
  const [target, setTarget] = useState<string>('null');
  const run = useMemo(() => markSweepFrames(heap, compactOn), [heap, compactOn]);
  const player = usePlayer(run.frames, { interval: STEP_MS });
  const f: GcFrame = player.frame;
  const rc = useMemo(() => refCounts(f.heap), [f.heap]);
  const space = freeSpace(f.heap);
  const tracing = f.phase !== 'swept' && f.phase !== 'compacted';
  const p = run.pause.totalUs;

  const load = (id: PresetId) => {
    setPresetId(id);
    setHeap(PRESETS.find((x) => x.id === id)!.heap);
  };
  const sources = [...heap.roots.map((r) => ({ value: r.id, label: r.label })), ...heap.objects.flatMap((o) => o.fields.map((fl) => ({ value: `${o.id}.${fl.name}`, label: `${o.label}.${fl.name}` })))];
  const targets = [{ value: 'null', label: 'null' }, ...[...heap.objects].sort((a, b) => a.slot - b.slot).map((o) => ({ value: o.id, label: o.label }))];
  const validSource = sources.some((s) => s.value === source) ? source : sources[0].value;
  const validTarget = targets.some((t) => t.value === target) ? target : 'null';
  const point = (src: string, to: string | null) => setHeap(repoint(heap, src, to));
  const free = freeSpace(heap);

  return (
    <StageFrame
      player={player}
      height={600}
      stats={
        <Stats>
          <Stat label="Live (black)" value={f.black.length} />
          <Stat label="Garbage" value={run.freed.length} color={run.freed.length ? 'var(--bad)' : undefined} />
          <Stat label="Free slots" value={`${space.free} · run ${space.largestRun}`} sub="free · longest free run" />
          <Stat label="Pause" value={`${p.toLocaleString('en-US')} µs`} sub="illustrative" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'roots and references', shape: 'line' },
            { color: 'var(--dim)', label: 'white: not seen yet' },
            { color: 'var(--hi)', label: 'gray: on the work list' },
            { color: 'var(--info)', label: 'black: marked live' },
            { color: 'var(--bad)', label: 'garbage, swept (dashed)' },
            { color: 'var(--orange)', label: 'GC pause' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          {PRESETS.map((x) => (
            <ChipButton key={x.id} tone="info" size="md" on={presetId === x.id && heap === x.heap} onClick={() => load(x.id)}>
              {x.label}
            </ChipButton>
          ))}
          <ChipButton tone="info" size="md" disabled={player.index !== player.count - 1} onClick={() => setHeap(run.final)}>
            Continue from the swept heap
          </ChipButton>
        </>,
        <>
          <Toggle label="After sweep" value={compactOn} onChange={setCompactOn} off="Leave holes" on="Compact" />
          <Toggle label="Reference counts" value={showRc} onChange={setShowRc} off="Hide" on="Show" />
        </>,
      ]}
    >
      <div className="gc stage-pad">
        <WideRegion minWidth={heapMinWidth(4)} label="Heap diagram: scroll sideways to see all of it">
          <HeapPicture
            heap={f.heap}
            grid={GRID_MS}
            rootTone="violet"
            onRootClick={(id) => point(id, null)}
            look={(o) => {
              const l = triColour(f, o, 'muted', tracing);
              return showRc ? { ...l, tag: `rc ${rc.get(o.id) ?? 0}` } : l;
            }}
          />
        </WideRegion>
        <div>
          <SectionTitle>stop-the-world · the program waits while the collector runs</SectionTitle>
          <GanttLanes
            lanes={[{ id: 'mut', label: 'program' }, { id: 'gc', label: 'collector' }]}
            bars={[
              { id: 'w1', lane: 'mut', start: 0, end: MUTATOR_US, tone: 'muted', label: 'running' },
              { id: 'stop', lane: 'mut', start: MUTATOR_US, end: MUTATOR_US + p, tone: 'orange', kind: 'blocked', label: 'paused' },
              { id: 'w2', lane: 'mut', start: MUTATOR_US + p, end: 2 * MUTATOR_US + p, tone: 'muted', label: 'running' },
              { id: 'mark', lane: 'gc', start: MUTATOR_US, end: MUTATOR_US + run.pause.markUs, tone: 'orange', label: 'mark' },
              { id: 'sweep', lane: 'gc', start: MUTATOR_US + run.pause.markUs, end: MUTATOR_US + p, tone: 'orange', label: compactOn ? 'sweep + compact' : 'sweep' },
            ]}
            domain={[0, 2 * MUTATOR_US + p]}
            now={MUTATOR_US + f.progress * p}
            unit=" µs"
            axis
            size="md"
            ariaLabel="Timeline: the program pauses while the collector marks and sweeps"
          />
        </div>
        <div className="gc-editor">
          <SectionTitle>edit the references (the program running between collections)</SectionTitle>
          <Segmented label="Point" value={validSource} onChange={setSource} options={sources} />
          <Segmented label="at" value={validTarget} onChange={setTarget} options={targets} />
          <div className="gc-editor-actions">
            <ChipButton tone="info" size="md" onClick={() => point(validSource, validTarget === 'null' ? null : validTarget)}>
              Apply
            </ChipButton>
            <ChipButton tone="info" size="md" disabled={free.free === 0} onClick={() => setHeap(allocate(heap, validSource))}>
              {free.free === 0 ? 'Heap full: run GC and continue' : `${labelOf(heap, validSource)} = new Thing()`}
            </ChipButton>
          </div>
          <Hint>Or click a root in the picture to set it to null. Any edit reruns the collection on the new heap.</Hint>
        </div>
        <Hint block>
          A simplified, stop-the-world collector with illustrative pause times. V8, the JVM and .NET use these ideas with many refinements: generations, compaction, and
          marking incrementally or on other threads while the program keeps running (which needs write barriers too), so real pauses are far shorter than a full mark-sweep.
        </Hint>
      </div>
    </StageFrame>
  );
}

const labelOf = (h: Heap, src: string) => {
  const root = h.roots.find((r) => r.id === src);
  if (root) return root.label;
  const [oid, field] = src.split('.');
  return `${byId(h).get(oid)!.label}.${field}`;
};

function repoint(h: Heap, src: string, to: string | null): Heap {
  if (h.roots.some((r) => r.id === src)) return { ...h, roots: h.roots.map((r) => (r.id === src ? { ...r, to } : r)) };
  const [oid, field] = src.split('.');
  return { ...h, objects: h.objects.map((o) => (o.id === oid ? { ...o, fields: o.fields.map((f) => (f.name === field ? { ...f, to } : f)) } : o)) };
}

function allocate(h: Heap, src: string): Heap {
  const used = new Set(h.objects.map((o) => o.slot));
  const slot = Array.from({ length: h.slots }, (_, i) => i).find((s) => !used.has(s))!;
  const ids = new Set(h.objects.map((o) => o.id));
  let k = 1;
  while (ids.has(`new${k}`)) k++;
  const id = `new${k}`;
  return repoint({ ...h, objects: [...h.objects, { id, label: 'thing', slot, fields: [{ name: 'next', to: null }] }] }, src, id);
}

/* ---------- generations ---------- */

const GEN_COLS = 3;
const GEN_BAND_GAP = 30;
const GRID_GEN: Grid = {
  cols: GEN_COLS,
  at: (s) => {
    const old = s >= NURSERY_SLOTS;
    const k = old ? s - NURSERY_SLOTS : s;
    return { x: HEAP_X + (k % GEN_COLS) * COL_W, y: HEAP_TOP + Math.floor(k / GEN_COLS) * ROW_H + (old ? 2 * ROW_H + GEN_BAND_GAP : 0) };
  },
};

type GenView = 'scenario' | 'shortLived';

function GenScene({ picker }: { picker: ReactNode }) {
  const [view, setView] = useState<GenView>('scenario');
  const [barrier, setBarrier] = useState(true);
  return view === 'scenario' ? (
    <GenScenario picker={picker} view={<GenViewPicker view={view} setView={setView} />} barrier={barrier} setBarrier={setBarrier} />
  ) : (
    <ShortLived picker={picker} view={<GenViewPicker view={view} setView={setView} />} />
  );
}

function GenViewPicker({ view, setView }: { view: GenView; setView: (v: GenView) => void }) {
  return (
    <Segmented
      label="Show"
      value={view}
      onChange={setView}
      options={[
        { value: 'scenario', label: 'Old points to young' },
        { value: 'shortLived', label: 'Many short-lived objects' },
      ]}
    />
  );
}

function GenScenario({ picker, view, barrier, setBarrier }: { picker: ReactNode; view: ReactNode; barrier: boolean; setBarrier: (v: boolean) => void }) {
  const frames = useMemo(() => genFrames(GEN_START, barrier), [barrier]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f: GenFrame = player.frame;
  const tracing = f.gray.length > 0 || f.black.length > 0;
  const width = HEAP_X + GEN_COLS * COL_W;
  const bandH = 2 * ROW_H;
  // Where a freed object last sat, so a dangling reference can point at its empty slot.
  const lastSlot = (id: string) => frames.map((x) => x.heap.objects.find((o) => o.id === id)?.slot).filter((s) => s !== undefined).at(-1)!;
  const objs = byId(f.heap);
  const danglingArrows = f.heap.objects.flatMap((o) =>
    o.fields.map((fl, i) => {
      if (fl.to === null || objs.has(fl.to)) return null;
      const slot = lastSlot(fl.to);
      return <RefArrow key={`d-${o.id}-${fl.name}`} from={fieldArrow(GRID_GEN, o, i, slot).from} to={heapRect(GRID_GEN.at(slot), BOX_W, 1)} dangling />;
    }),
  );

  return (
    <StageFrame
      player={player}
      height={600}
      stats={
        <Stats>
          <Stat label="Minor GC" value={f.gc || '–'} />
          <Stat label="Young" value={f.heap.objects.filter((o) => o.gen === 'young').length} />
          <Stat label="Old" value={f.heap.objects.filter((o) => o.gen === 'old').length} />
          <Stat label="Remembered set" value={f.remembered.length ? f.remembered.map((id) => byId(f.heap).get(id)?.label ?? id).join(', ') : 'empty'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--sky)', label: 'young generation (nursery)' },
            { color: 'var(--amber)', label: 'old generation' },
            { color: 'var(--violet)', label: 'roots and references', shape: 'line' },
            { color: 'var(--hi)', label: 'gray' },
            { color: 'var(--info)', label: 'black: live' },
            { color: 'var(--ok)', label: 'promoted' },
            { color: 'var(--bad)', label: 'garbage, or a reference to freed memory' },
          ]}
        />
      }
      controls={[picker, <>{view}<Toggle label="Write barrier" value={!barrier} onChange={(v) => setBarrier(!v)} off="On" on="Off (broken)" /></>]}
    >
      <div className="gc stage-pad">
        <WideRegion minWidth={heapMinWidth(GEN_COLS)} label="Generational heap: scroll sideways to see all of it">
          <HeapPicture
            heap={f.heap}
            grid={GRID_GEN}
            rootTone="violet"
            extraArrows={danglingArrows}
            bands={
              <>
                <rect className="gc-band tone-sky" x={HEAP_X - 12} y={HEAP_TOP - 12} width={width - HEAP_X + 4} height={bandH} rx={12} />
                <text className="scene-zone gc-band-label" x={HEAP_X - 4} y={HEAP_TOP - 18}>young · nursery</text>
                <rect className="gc-band tone-amber" x={HEAP_X - 12} y={HEAP_TOP + bandH + GEN_BAND_GAP - 12} width={width - HEAP_X + 4} height={bandH} rx={12} />
                <text className="scene-zone gc-band-label" x={HEAP_X - 4} y={HEAP_TOP + bandH + GEN_BAND_GAP - 18}>old</text>
              </>
            }
            look={(o) => {
              if (f.promoted.includes(o.id)) return { tone: 'ok', variant: 'live', tag: 'promoted', highlight: true };
              if (o.gen === 'old' && !f.doomed.includes(o.id)) return { tone: 'muted', variant: 'live', tag: f.remembered.includes(o.id) ? 'remembered' : undefined, highlight: f.stored?.obj === o.id };
              const l = triColour(f, o, 'muted', tracing);
              return l.variant === 'freed' ? l : { ...l, tag: `age ${o.age ?? 0}` };
            }}
          />
        </WideRegion>
        <Hint block>
          A simplified generational collector. Real ones (V8&apos;s scavenger, the JVM&apos;s young collections) usually copy the survivors out of the nursery rather than
          sweeping it, and promote after a tunable number of survivals; this demo promotes after 2.
        </Hint>
      </div>
    </StageFrame>
  );
}

function ShortLived({ picker, view }: { picker: ReactNode; view: ReactNode }) {
  const runs = useMemo(() => shortLivedRuns(), []);
  const max = (r: typeof runs.full) => Math.max(...r.pauses.map((p) => p.us));
  const sum = (r: typeof runs.full) => r.pauses.reduce((a, p) => a + p.us, 0);
  const domain: [number, number] = [0, Math.max(runs.full.total, runs.generational.total)];
  useIntroCaption(
    <>
      The same program, {SHORT_LIVED.rounds} rounds each allocating {SHORT_LIVED.temps} temporary objects and one that lives on. Generational: {runs.generational.pauses.length} minor
      pauses of at most {max(runs.generational)} µs. Full GC only: {runs.full.pauses.length} pauses of up to {max(runs.full).toLocaleString('en-US')} µs, each tracing every survivor so far.
    </>,
  );
  const bars = (lane: string, r: typeof runs.full) =>
    r.pauses.flatMap((p, i) => [
      { id: `${lane}-w${i}`, lane, start: i ? r.pauses[i - 1].end : 0, end: p.start, tone: 'muted' as const, label: 'running' },
      { id: `${lane}-${i}`, lane, start: p.start, end: p.end, tone: 'orange' as const, label: `${p.us} µs` },
    ]).concat({ id: `${lane}-end`, lane, start: r.pauses.at(-1)!.end, end: r.total, tone: 'muted' as const, label: 'running' });
  return (
    <StageFrame
      height={360}
      stats={
        <Stats>
          <Stat label="Generational" value={`${runs.generational.pauses.length} pauses`} sub={`longest ${max(runs.generational)} µs · total ${sum(runs.generational).toLocaleString('en-US')} µs`} />
          <Stat label="Full GC only" value={`${runs.full.pauses.length} pauses`} sub={`longest ${max(runs.full).toLocaleString('en-US')} µs · total ${sum(runs.full).toLocaleString('en-US')} µs`} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--muted)', label: 'program running' }, { color: 'var(--orange)', label: 'GC pause (to scale)' }]} />}
      controls={[picker, view]}
    >
      <div className="gc stage-pad">
        <WideRegion minWidth={480} label="Pause timeline: scroll sideways to see all of it">
          <GanttLanes
            lanes={[{ id: 'gen', label: 'generational' }, { id: 'full', label: 'full GC only' }]}
            bars={[...bars('gen', runs.generational), ...bars('full', runs.full)]}
            domain={domain}
            unit=" ms"
            axis
            size="md"
            labelWidth={110}
            labelMinPx={barLabelPx('1,000 µs')}
            ariaLabel="GC pauses over time under the two collectors"
          />
        </WideRegion>
        <Hint block>
          Pause costs come from the same illustrative per-object model as the other scenes. The old generation&apos;s own
          occasional full collection isn&apos;t shown.
        </Hint>
      </div>
    </StageFrame>
  );
}
