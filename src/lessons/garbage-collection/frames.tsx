import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';
import {
  afterSweep, byId, compact, dangling, freeSpace, mark, minorCollect, minorMark, pauseOf, refCounts, sweep, writeField, PAUSE, PROMOTE_AGE, type Heap,
} from './model';
import { NURSERY_SLOTS } from './presets';

export type Phase = 'mark' | 'marked' | 'sweep' | 'swept' | 'compacted';

export interface GcFrame extends Frame {
  phase: Phase;
  heap: Heap;
  gray: string[];
  black: string[];
  scanning: string | null;
  /** Objects shown dashed red, about to be (or just) freed. */
  doomed: string[];
  /** Objects whose slot changed in this step (compaction, promotion). */
  moved: string[];
  /** How far through the pause this frame is, 0..1. */
  progress: number;
}

const names = (h: Heap, ids: readonly string[]) => {
  const m = byId(h);
  return ids.map((id) => m.get(id)?.label ?? id);
};
const join = (xs: readonly string[]) => (xs.length === 0 ? 'nothing' : xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const us = (n: number) => `${n.toLocaleString('en-US')} µs`;

export interface GcRun {
  frames: GcFrame[];
  live: string[];
  freed: string[];
  pause: ReturnType<typeof pauseOf>;
  final: Heap;
}

/** A full stop-the-world mark-sweep, optionally compacting, over the heap as the learner left it. */
export function markSweepFrames(heap: Heap, compactOn: boolean): GcRun {
  const m = mark(heap);
  const freed = sweep(heap, m.marked);
  const pause = pauseOf(m.marked.length, heap.slots, compactOn);
  const frames: GcFrame[] = [];
  const base = { heap, doomed: [], moved: [] };
  const markShare = (k: number) => (pause.markUs / pause.totalUs) * (k / Math.max(1, m.steps.length - 1));

  m.steps.forEach((s, k) => {
    let say: ReactNode;
    if (s.scanning === null) {
      const rooted = heap.roots.filter((r) => r.to !== null);
      const empty = heap.roots.filter((r) => r.to === null);
      say = rooted.length ? (
        <>The program stops (stop-the-world). Mark starts from the roots: {join(rooted.map((r) => r.label))} {rooted.length > 1 ? 'point' : 'points'} at the {s.shaded.length > 1 ? 'objects' : 'object'} {join(names(heap, s.shaded))}, which {s.shaded.length > 1 ? 'turn' : 'turns'} gray: on the work list.{empty.length > 0 && ` ${join(empty.map((r) => r.label))} ${empty.length > 1 ? 'hold' : 'holds'} no reference.`}</>
      ) : (
        <>The program stops (stop-the-world). No root points into the heap, so nothing is reachable.</>
      );
    } else {
      const label = byId(heap).get(s.scanning)!.label;
      say = s.shaded.length ? (
        <>Scan {label}: it points at {join(names(heap, s.shaded))}, still white, so {s.shaded.length > 1 ? 'they turn' : 'it turns'} gray. {label} is done: black, live.{s.gray.length ? ` Work list: ${join(names(heap, s.gray))}.` : ''}</>
      ) : (
        <>Scan {label}: nothing new to shade{byId(heap).get(s.scanning)!.fields.some((f) => f.to !== null) ? ' (what it points at is already gray or black)' : ''}. {label} is black, live.{s.gray.length ? ` Work list: ${join(names(heap, s.gray))}.` : ' The work list is empty.'}</>
      );
    }
    frames.push({ ...base, phase: 'mark', gray: s.gray, black: s.black, scanning: s.scanning, progress: markShare(k), say, hold: 1 });
  });

  const counts = refCounts(heap);
  const stuck = freed.filter((id) => counts.get(id)! > 0);
  frames.push({
    ...base,
    phase: 'marked',
    gray: [],
    black: m.marked,
    scanning: null,
    doomed: freed,
    progress: pause.markUs / pause.totalUs,
    say: (
      <>
        Mark is done: {m.marked.length} live, black. Still white, so unreachable: {join(names(heap, freed))}.
        {stuck.length > 0 && <> {join(names(heap, stuck))} still {stuck.length > 1 ? 'have' : 'has'} a reference count above zero (they point at {stuck.length > 1 ? 'each other' : 'it'}), so naive reference counting would never free {stuck.length > 1 ? 'them' : 'it'}. Tracing only asks what the roots can reach.</>}
      </>
    ),
    hold: 1.6,
  });

  const swept = afterSweep(heap, freed);
  const space = freeSpace(swept);
  frames.push({
    ...base,
    phase: 'sweep',
    gray: [],
    black: m.marked,
    scanning: null,
    doomed: freed,
    progress: compactOn ? (pause.markUs + PAUSE.sweepPerSlot * heap.slots) / pause.totalUs : 1,
    say: <>Sweep walks every slot and puts each white object back on the free list: {join(names(heap, freed))}.</>,
    hold: 1.2,
  });
  frames.push({
    ...base,
    heap: swept,
    phase: 'swept',
    gray: [],
    black: m.marked,
    scanning: null,
    progress: compactOn ? (pause.markUs + PAUSE.sweepPerSlot * heap.slots) / pause.totalUs : 1,
    say: (
      <>
        Swept. {space.free} free slots, but the longest run of neighbouring free slots is {space.largestRun}
        {space.largestRun < space.free ? `: an object needing ${space.largestRun + 1} slots wouldn't fit without moving things (fragmentation)` : ', so the free space is in one piece'}.
      </>
    ),
    hold: 1.4,
  });

  let final = swept;
  if (compactOn) {
    const c = compact(swept);
    final = c.heap;
    frames.push({
      ...base,
      heap: c.heap,
      phase: 'compacted',
      gray: [],
      black: m.marked,
      scanning: null,
      moved: c.moved.map((x) => x.id),
      progress: 1,
      say: (
        <>Compact: {c.moved.length ? `${join(names(heap, c.moved.map((x) => x.id)))} slide down` : 'nothing needs to move'}, and every reference to a moved object is updated. Now the {freeSpace(c.heap).free} free slots are one run.</>
      ),
      hold: 1.4,
    });
  }
  const last = frames.at(-1)!;
  frames.push({
    ...last,
    say: (
      <>
        The program resumes. Its pause, in this model: mark {m.marked.length} live × {PAUSE.markPerLive} µs + sweep {heap.slots} slots × {PAUSE.sweepPerSlot} µs
        {compactOn && ` + move ${m.marked.length} × ${PAUSE.movePerLive} µs`} = {us(pause.totalUs)}. More live objects, longer pause.
      </>
    ),
    hold: 2,
  });
  return { frames, live: m.marked, freed, pause, final };
}

/* ---------- generations ---------- */

export interface GenFrame extends Frame {
  heap: Heap;
  remembered: string[];
  gray: string[];
  black: string[];
  scanning: string | null;
  doomed: string[];
  promoted: string[];
  /** A store the write barrier just saw. */
  stored: { obj: string; field: string } | null;
  /** Which minor GC this frame belongs to (0 = the mutator running). */
  gc: number;
}

/**
 * The scripted scenario: a request allocates young objects, the old cache gets a young entry
 * (the write barrier's moment), two minor GCs run, and the entry is promoted after its second.
 */
export function genFrames(start: Heap, barrier: boolean): GenFrame[] {
  const frames: GenFrame[] = [];
  let heap = start;
  let remembered: string[] = [];
  const idle = { gray: [], black: [], scanning: null, doomed: [], promoted: [], stored: null, gc: 0 };
  const push = (f: Partial<GenFrame> & { say: ReactNode }) => frames.push({ ...idle, heap, remembered, hold: 1.3, ...f });

  push({ say: <>New objects are allocated in the young generation, the nursery (blue band). The old generation (amber band) holds objects that have already survived a while.</> });

  // cache.last = new Entry(): a young object, stored into an old one.
  heap = { ...heap, objects: [...heap.objects, { id: 'en', label: 'entry', slot: 4, gen: 'young', age: 0, fields: [] }] };
  const w = writeField(heap, remembered, 'c', 'last', 'en', barrier);
  heap = w.heap;
  remembered = w.remembered;
  push({
    stored: { obj: 'c', field: 'last' },
    say: barrier
      ? <><code>cache.last = new Entry()</code>: an old object now points at a young one. The write barrier, a few instructions the runtime adds to every pointer store, sees that and records cache in the remembered set.</>
      : <><code>cache.last = new Entry()</code>: an old object now points at a young one. With the write barrier off in this demo, nothing records it.</>,
  });

  const minor = (n: number, before: ReactNode) => {
    const m = minorMark(heap, remembered);
    const from = [...heap.roots.filter((r) => r.to !== null).map((r) => r.label), ...remembered.map((id) => `${byId(heap).get(id)!.label} (remembered)`)];
    push({ gc: n, say: <>{before} Minor GC {n}: trace young objects only, starting from the roots and the remembered set ({join(from)}). Old objects aren&apos;t traced at all.</> });
    m.steps.slice(1).forEach((s) => {
      const label = byId(heap).get(s.scanning!)!.label;
      push({ gc: n, gray: s.gray, black: s.black, scanning: s.scanning, say: <>Scan {label}{s.shaded.length ? `: shade ${join(names(heap, s.shaded))} gray` : ''}. {label} is live.</>, hold: 0.9 });
    });
    const c = minorCollect(heap, m.marked, NURSERY_SLOTS);
    const young = heap.objects.filter((o) => o.gen === 'young').length;
    push({ gc: n, black: m.marked, doomed: c.freed, say: <>Mark done. {m.marked.length} of {young} young objects are live; {join(names(heap, c.freed))} {c.freed.length === 1 ? 'is' : 'are'} garbage. The work grew with the {m.marked.length} live young objects, not with the size of the whole heap.</> });
    const freedNames = names(heap, c.freed);
    const promotedNames = names(heap, c.promoted);
    heap = c.heap;
    const broken = dangling(heap);
    push({
      gc: n,
      promoted: c.promoted,
      say: (
        <>
          Freed {join(freedNames)}. The survivors are one GC older.
          {promotedNames.length > 0 && <> {join(promotedNames)} survived {PROMOTE_AGE} minor GCs, so {promotedNames.length > 1 ? 'they are' : 'it is'} promoted: copied into the old generation, which minor GCs skip.</>}
          {broken.length > 0 && <> But cache.last now points at freed memory: the entry was reachable, only through an old object nobody traced. Without a remembered set a minor GC frees live objects, which is why runtimes pay for the write barrier.</>}
        </>
      ),
      hold: 2,
    });
  };

  minor(1, <>The nursery is full.</>);
  heap = { ...heap, roots: heap.roots.map((r) => (r.id === 'req' ? { ...r, to: null } : r)), objects: [...heap.objects, { id: 't3', label: 'temp string', slot: firstFreeYoung(heap), gen: 'young', age: 0, fields: [] }] };
  push({ say: <>The request finishes: <code>req = null</code>, and the next one allocates another temp string. request and body are now unreachable.</> });
  minor(2, <>The nursery fills again.</>);
  const last = frames.at(-1)!;
  frames.push({ ...last, say: <>Two minor GCs, each tracing only a handful of young objects. The old generation still needs an occasional full GC of its own (not shown), but far less often.</>, hold: 2 });
  return frames;
}

function firstFreeYoung(h: Heap): number {
  const used = new Set(h.objects.map((o) => o.slot));
  for (let s = 0; s < NURSERY_SLOTS; s++) if (!used.has(s)) return s;
  throw new RangeError('nursery full');
}
