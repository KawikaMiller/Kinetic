/**
 * A simplified tracing collector over a fixed-slot heap. Objects hold references in fields;
 * roots (stack variables, globals, a register) hold references from outside the heap.
 *
 * - mark: breadth-first from the roots. White = not seen yet, gray = on the work list (seen,
 *   fields not scanned yet), black = scanned and live.
 * - sweep: every object still white is unreachable and its slot goes back on the free list.
 * - compact (optional): live objects slide down to the lowest slots, keeping their order, and
 *   every reference is updated to the new slot.
 * - generational: a minor GC traces only young objects, starting from the roots and from the
 *   remembered set (old objects the write barrier saw storing a young reference). Survivors age;
 *   after PROMOTE_AGE minor GCs they move to the old generation.
 *
 * Pause times are a model (named per-object costs), not a measurement of any real collector.
 */

export type Gen = 'young' | 'old';

export interface Obj {
  id: string;
  label: string;
  /** Field names and what each points at (an object id, or null). */
  fields: { name: string; to: string | null }[];
  slot: number;
  gen?: Gen;
  /** Minor GCs survived. */
  age?: number;
}

export type RootKind = 'stack' | 'global' | 'register';

export interface Root {
  id: string;
  label: string;
  kind: RootKind;
  to: string | null;
}

export interface Heap {
  slots: number;
  objects: Obj[];
  roots: Root[];
}

export const byId = (h: Heap) => new Map(h.objects.map((o) => [o.id, o]));

/* ---------- mark ---------- */

export interface MarkStep {
  /** The object whose fields are being scanned now (null for the step that seeds the roots). */
  scanning: string | null;
  /** Children newly shaded gray by this step. */
  shaded: string[];
  gray: string[];
  black: string[];
}

export interface MarkResult {
  steps: MarkStep[];
  /** Live objects, in the order they were blackened. */
  marked: string[];
}

/** Breadth-first mark from `starts` (root targets), following only edges `follow` accepts. */
function bfs(h: Heap, starts: readonly (string | null)[], follow: (o: Obj) => boolean = () => true): MarkResult {
  const objs = byId(h);
  const seen = new Set<string>();
  const gray: string[] = [];
  const black: string[] = [];
  const steps: MarkStep[] = [];
  const seed: string[] = [];
  for (const s of starts) {
    if (s === null || seen.has(s) || !objs.has(s) || !follow(objs.get(s)!)) continue;
    seen.add(s);
    gray.push(s);
    seed.push(s);
  }
  steps.push({ scanning: null, shaded: seed, gray: [...gray], black: [] });
  while (gray.length) {
    const id = gray.shift()!;
    const shaded: string[] = [];
    for (const f of objs.get(id)!.fields) {
      if (f.to === null || seen.has(f.to) || !objs.has(f.to) || !follow(objs.get(f.to)!)) continue;
      seen.add(f.to);
      gray.push(f.to);
      shaded.push(f.to);
    }
    black.push(id);
    steps.push({ scanning: id, shaded, gray: [...gray], black: [...black] });
  }
  return { steps, marked: black };
}

export function mark(h: Heap): MarkResult {
  return bfs(h, h.roots.map((r) => r.to));
}

/** What sweep frees: every object mark didn't reach, in slot order. */
export function sweep(h: Heap, marked: readonly string[]): string[] {
  const live = new Set(marked);
  return [...h.objects].sort((a, b) => a.slot - b.slot).filter((o) => !live.has(o.id)).map((o) => o.id);
}

/** Incoming references per object, counting roots too: what naive reference counting would hold. */
export function refCounts(h: Heap): Map<string, number> {
  const counts = new Map(h.objects.map((o) => [o.id, 0]));
  const bump = (to: string | null) => {
    if (to !== null && counts.has(to)) counts.set(to, counts.get(to)! + 1);
  };
  for (const r of h.roots) bump(r.to);
  for (const o of h.objects) for (const f of o.fields) bump(f.to);
  return counts;
}

/**
 * What naive reference counting would actually do: free every object whose count is zero, drop
 * the counts of what it pointed at, and repeat. `counts` are the counts after that cascade (what
 * an RC runtime would hold); `kept` is what it never frees. Anything kept but unreachable is held
 * up by a cycle: inside one, or hanging off one.
 */
export function refCountCascade(h: Heap): { counts: Map<string, number>; kept: string[] } {
  const counts = refCounts(h);
  const objs = byId(h);
  const freed = new Set<string>();
  const queue = h.objects.filter((o) => counts.get(o.id) === 0).map((o) => o.id);
  while (queue.length) {
    const id = queue.shift()!;
    if (freed.has(id)) continue;
    freed.add(id);
    for (const f of objs.get(id)!.fields) {
      if (f.to === null || !counts.has(f.to) || freed.has(f.to)) continue;
      counts.set(f.to, counts.get(f.to)! - 1);
      if (counts.get(f.to) === 0) queue.push(f.to);
    }
  }
  return { counts, kept: h.objects.map((o) => o.id).filter((id) => !freed.has(id)) };
}

/** The heap after a sweep: freed objects removed (their slots become free). */
export function afterSweep(h: Heap, freed: readonly string[]): Heap {
  const gone = new Set(freed);
  return { ...h, objects: h.objects.filter((o) => !gone.has(o.id)) };
}

/** Sliding compaction: live objects move to slots 0..k-1 in their current order; ids (and so references) follow. */
export function compact(h: Heap): { heap: Heap; moved: { id: string; from: number; to: number }[] } {
  const order = [...h.objects].sort((a, b) => a.slot - b.slot);
  const moved: { id: string; from: number; to: number }[] = [];
  const objects = order.map((o, i) => {
    if (o.slot !== i) moved.push({ id: o.id, from: o.slot, to: i });
    return { ...o, slot: i };
  });
  return { heap: { ...h, objects }, moved };
}

/** Free slots, and the longest run of neighbouring free slots: the biggest block that fits without moving anything. */
export function freeSpace(h: Heap): { free: number; largestRun: number } {
  const used = new Set(h.objects.map((o) => o.slot));
  let run = 0;
  let best = 0;
  for (let s = 0; s < h.slots; s++) {
    run = used.has(s) ? 0 : run + 1;
    best = Math.max(best, run);
  }
  return { free: h.slots - used.size, largestRun: best };
}

/* ---------- pause model ---------- */

/** Illustrative costs in microseconds. */
export const PAUSE = {
  /** Marking scans each live object once. */
  markPerLive: 40,
  /** Sweeping looks at every slot. */
  sweepPerSlot: 5,
  /** Compacting copies each live object and fixes its references. */
  movePerLive: 30,
  /** A minor GC's fixed cost: scanning the roots and the remembered set. */
  minorFixed: 60,
} as const;

export function pauseOf(live: number, slots: number, compacted: boolean) {
  const markUs = PAUSE.markPerLive * live;
  const sweepUs = PAUSE.sweepPerSlot * slots + (compacted ? PAUSE.movePerLive * live : 0);
  return { markUs, sweepUs, totalUs: markUs + sweepUs };
}

/* ---------- generations ---------- */

export const PROMOTE_AGE = 2;

/**
 * A store into a field, with the write barrier: storing a young reference into an old object
 * records that old object in the remembered set (when the barrier is on).
 */
export function writeField(h: Heap, remembered: readonly string[], objId: string, field: string, to: string | null, barrier: boolean): { heap: Heap; remembered: string[] } {
  const objs = byId(h);
  const objects = h.objects.map((o) => (o.id === objId ? { ...o, fields: o.fields.map((f) => (f.name === field ? { ...f, to } : f)) } : o));
  const src = objs.get(objId)!;
  const target = to === null ? null : objs.get(to);
  const rs = barrier && src.gen === 'old' && target?.gen === 'young' && !remembered.includes(objId) ? [...remembered, objId] : [...remembered];
  return { heap: { ...h, objects }, remembered: rs };
}

/**
 * Minor GC mark: trace young objects only, from the roots and from the remembered set's fields.
 * Old objects are never traced (they're assumed live), which is why the remembered set matters.
 */
export function minorMark(h: Heap, remembered: readonly string[]): MarkResult {
  const objs = byId(h);
  const fromRemembered = remembered.flatMap((id) => objs.get(id)?.fields.map((f) => f.to) ?? []);
  return bfs(h, [...h.roots.map((r) => r.to), ...fromRemembered], (o) => o.gen === 'young');
}

/**
 * After a minor GC: unmarked young objects freed, survivors one older, and those old enough
 * promoted: copied into the lowest free slot of the old generation (slots from `oldFrom` up).
 */
export function minorCollect(h: Heap, marked: readonly string[], oldFrom: number, remembered: readonly string[] = []): { heap: Heap; freed: string[]; promoted: string[]; remembered: string[] } {
  const live = new Set(marked);
  const freed = h.objects.filter((o) => o.gen === 'young' && !live.has(o.id)).map((o) => o.id);
  const promoted: string[] = [];
  const taken = new Set(h.objects.filter((o) => o.gen === 'old').map((o) => o.slot));
  const nextOldSlot = () => {
    for (let s = oldFrom; s < h.slots; s++) if (!taken.has(s)) {
      taken.add(s);
      return s;
    }
    throw new RangeError('old generation is full: a full GC would be needed');
  };
  const objects = h.objects
    .filter((o) => !freed.includes(o.id))
    .map((o) => {
      if (o.gen !== 'young') return o;
      const age = (o.age ?? 0) + 1;
      if (age >= PROMOTE_AGE) {
        promoted.push(o.id);
        return { ...o, age, gen: 'old' as const, slot: nextOldSlot() };
      }
      return { ...o, age };
    });
  const heap = { ...h, objects };
  return { heap, freed, promoted, remembered: rememberedAfter(heap, remembered, promoted) };
}

/**
 * The remembered set after a minor GC: keep only old objects that still point at a young one
 * (an entry whose target was promoted is now old to old), and add any promoted object that
 * still points into the nursery, as a runtime must when it promotes.
 */
export function rememberedAfter(h: Heap, remembered: readonly string[], promoted: readonly string[]): string[] {
  const objs = byId(h);
  const pointsYoung = (id: string) => objs.get(id)?.gen === 'old' && objs.get(id)!.fields.some((f) => f.to !== null && objs.get(f.to)?.gen === 'young');
  return [...new Set([...remembered, ...promoted])].filter(pointsYoung);
}

/** References that point at nothing: a field or root whose target was freed. A correct GC never makes one. */
export function dangling(h: Heap): { from: string; field: string; to: string }[] {
  const ids = new Set(h.objects.map((o) => o.id));
  const out: { from: string; field: string; to: string }[] = [];
  for (const r of h.roots) if (r.to !== null && !ids.has(r.to)) out.push({ from: r.id, field: '', to: r.to });
  for (const o of h.objects) for (const f of o.fields) if (f.to !== null && !ids.has(f.to)) out.push({ from: o.id, field: f.name, to: f.to });
  return out;
}

/* ---------- many short-lived objects ---------- */

export interface PauseRun {
  /** [start, end] of each pause, in ms of a timeline of mutator work. */
  pauses: { start: number; end: number; us: number; live: number }[];
  total: number;
}

/**
 * The same allocation stream under two collectors. Each round of work (ROUND_MS) allocates
 * TEMPS short-lived objects that are garbage by the end of the round, plus one that lives on.
 * - Generational: a minor GC after every round traces only the round's young survivors.
 * - Full GC only: the heap holds HEAP_ROUNDS rounds of allocation; when it fills, a full GC
 *   traces everything that's live (all the survivors so far) and sweeps the whole heap.
 */
export const SHORT_LIVED = { rounds: 12, roundMs: 1, temps: 30, heapRounds: 4 } as const;

export function shortLivedRuns(): { generational: PauseRun; full: PauseRun } {
  const { rounds, roundMs, temps, heapRounds } = SHORT_LIVED;
  const gen: PauseRun['pauses'] = [];
  const full: PauseRun['pauses'] = [];
  let tGen = 0;
  let tFull = 0;
  for (let r = 1; r <= rounds; r++) {
    tGen += roundMs;
    // The round's one survivor is young; the remembered set is empty, so only the fixed cost and it.
    const minor = PAUSE.minorFixed + PAUSE.markPerLive * 1;
    gen.push({ start: tGen, end: tGen + minor / 1000, us: minor, live: 1 });
    tGen += minor / 1000;

    tFull += roundMs;
    if (r % heapRounds === 0) {
      const live = r;
      const slots = heapRounds * (temps + 1);
      const p = pauseOf(live, slots, false).totalUs;
      full.push({ start: tFull, end: tFull + p / 1000, us: p, live });
      tFull += p / 1000;
    }
  }
  return { generational: { pauses: gen, total: tGen }, full: { pauses: full, total: tFull } };
}
