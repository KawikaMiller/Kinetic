/**
 * A 64-unit arena managed by four placement policies. This models allocation policy and fragmentation only: it keeps no
 * heap metadata, corrupts nothing, and shows free lists as a picture of holes. Counts are units of 16 bytes.
 */
import { mulberry32 } from '../../core/random';

export const ARENA_UNITS = 64;
export const UNIT_BYTES = 16;
export const ALLOC_RANGE = { min: 1, max: 32 } as const;
export const ALLOC_CHIPS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32] as const;

export type Policy = 'first' | 'next' | 'best' | 'worst';
export const POLICIES: readonly Policy[] = ['first', 'next', 'best', 'worst'];
export const POLICY_LABELS: Record<Policy, string> = { first: 'First fit', next: 'Next fit', best: 'Best fit', worst: 'Worst fit' };

export interface Seg {
  start: number;
  size: number;
  /** The live block's id, or null for a hole. */
  id: number | null;
}

export interface Arena {
  /** Segments tiling the arena in address order. */
  segs: readonly Seg[];
  /** Next fit resumes here: the end of the last allocation. */
  rover: number;
  nextId: number;
}

export const emptyArena = (): Arena => ({ segs: [{ start: 0, size: ARENA_UNITS, id: null }], rover: 0, nextId: 1 });

export const holesOf = (a: Arena): Seg[] => a.segs.filter((s) => s.id === null);
export const liveOf = (a: Arena): Seg[] => a.segs.filter((s) => s.id !== null);

export interface Metrics {
  freeTotal: number;
  liveTotal: number;
  largestFree: number;
  /** 1 - largest free / total free; 0 when nothing is free. */
  fragmentation: number;
  blocks: number;
  holes: number;
}

export function metrics(a: Arena): Metrics {
  const holes = holesOf(a);
  const freeTotal = holes.reduce((s, h) => s + h.size, 0);
  const largestFree = holes.reduce((m, h) => Math.max(m, h.size), 0);
  return {
    freeTotal,
    liveTotal: ARENA_UNITS - freeTotal,
    largestFree,
    fragmentation: freeTotal === 0 ? 0 : 1 - largestFree / freeTotal,
    blocks: liveOf(a).length,
    holes: holes.length,
  };
}

export type AllocOutcome = 'placed' | 'fragmented' | 'full';

export interface AllocResult {
  arena: Arena;
  outcome: AllocOutcome;
  size: number;
  /** The block placed, if any. */
  placed: Seg | null;
  /** The hole chosen (before it was split), if any. */
  hole: Seg | null;
}

/** The hole a policy picks for a request, or null when none is big enough. */
export function chooseHole(a: Arena, n: number, policy: Policy): Seg | null {
  const fits = holesOf(a).filter((h) => h.size >= n);
  if (fits.length === 0) return null;
  switch (policy) {
    case 'first': return fits[0];
    case 'best': return fits.reduce((best, h) => (h.size < best.size ? h : best));
    case 'worst': return fits.reduce((best, h) => (h.size > best.size ? h : best));
    case 'next': return fits.find((h) => h.start >= a.rover) ?? fits[0];
  }
}

export function alloc(a: Arena, n: number, policy: Policy): AllocResult {
  if (!Number.isInteger(n) || n < ALLOC_RANGE.min || n > ALLOC_RANGE.max) throw new RangeError(`alloc size ${n} is outside ${ALLOC_RANGE.min}-${ALLOC_RANGE.max}`);
  const hole = chooseHole(a, n, policy);
  if (!hole) {
    const { freeTotal } = metrics(a);
    return { arena: a, outcome: freeTotal >= n ? 'fragmented' : 'full', size: n, placed: null, hole: null };
  }
  const placed: Seg = { start: hole.start, size: n, id: a.nextId };
  const rest: Seg[] = hole.size > n ? [{ start: hole.start + n, size: hole.size - n, id: null }] : [];
  const segs = a.segs.flatMap((s) => (s === hole ? [placed, ...rest] : [s]));
  return { arena: { segs, rover: placed.start + n, nextId: a.nextId + 1 }, outcome: 'placed', size: n, placed, hole };
}

/** Free a live block; with coalescing on, adjacent holes merge. Freeing a block that is not live is refused. */
export function free(a: Arena, id: number, coalesce: boolean): Arena {
  const target = a.segs.find((s) => s.id === id);
  if (!target) throw new RangeError(`block ${id} is not live: it was never allocated or is already freed`);
  const opened = a.segs.map((s) => (s === target ? { ...s, id: null } : s));
  if (!coalesce) return { ...a, segs: opened };
  const merged: Seg[] = [];
  for (const s of opened) {
    const last = merged[merged.length - 1];
    if (last && last.id === null && s.id === null) merged[merged.length - 1] = { ...last, size: last.size + s.size };
    else merged.push({ ...s });
  }
  return { ...a, segs: merged };
}

/** An arena built from a list of [size, live] segments (for tests and worked examples). */
export function arenaFrom(layout: readonly (readonly [number, boolean])[]): Arena {
  let start = 0;
  let nextId = 1;
  const segs = layout.map(([size, live]): Seg => {
    const seg = { start, size, id: live ? nextId++ : null };
    start += size;
    return seg;
  });
  if (start !== ARENA_UNITS) throw new RangeError(`layout covers ${start} units, not ${ARENA_UNITS}`);
  return { segs, rover: 0, nextId };
}

// ---- The seeded workload ----------------------------------------------------------------------------------

export const SCRIPT_LENGTH = 200;
export const SCRIPT_SEED = 17;
const SIZE_MIX = [1, 2, 2, 3, 4, 4, 6, 8, 12, 16, 20, 24] as const;
/** The script frees when this many units are nominally live, so a policy that never fails stays near this level. */
const NOMINAL_CEILING = 48;
const FREE_CHANCE = 0.4;

export type ScriptOp = { kind: 'alloc'; size: number; object: number } | { kind: 'free'; object: number };

/** Allocations and frees of named objects, not addresses, so the script is valid under every policy. */
export function makeScript(seed = SCRIPT_SEED, length = SCRIPT_LENGTH): ScriptOp[] {
  const rnd = mulberry32(seed);
  const live: { object: number; size: number }[] = [];
  const ops: ScriptOp[] = [];
  let object = 0;
  let liveUnits = 0;
  for (let i = 0; i < length; i++) {
    if (live.length > 0 && (liveUnits >= NOMINAL_CEILING || rnd() < FREE_CHANCE)) {
      const [gone] = live.splice(Math.floor(rnd() * live.length), 1);
      liveUnits -= gone.size;
      ops.push({ kind: 'free', object: gone.object });
    } else {
      const size = SIZE_MIX[Math.floor(rnd() * SIZE_MIX.length)];
      live.push({ object, size });
      liveUnits += size;
      ops.push({ kind: 'alloc', size, object: object++ });
    }
  }
  return ops;
}

export const SCRIPT: readonly ScriptOp[] = makeScript();

export interface ScriptRun {
  arena: Arena;
  failedFragmented: number;
  failedFull: number;
  peakHoles: number;
  /** The arena after each operation, for stepping. */
  history: Arena[];
}

/** Replay a script prefix under a policy. A free of an object whose allocation failed is skipped. */
export function runScript(policy: Policy, coalesce: boolean, steps = SCRIPT.length, script: readonly ScriptOp[] = SCRIPT): ScriptRun {
  let arena = emptyArena();
  const ids = new Map<number, number>();
  let failedFragmented = 0;
  let failedFull = 0;
  let peakHoles = 1;
  const history: Arena[] = [arena];
  for (const op of script.slice(0, steps)) {
    if (op.kind === 'alloc') {
      const r = alloc(arena, op.size, policy);
      arena = r.arena;
      if (r.placed) ids.set(op.object, r.placed.id!);
      else if (r.outcome === 'fragmented') failedFragmented++;
      else failedFull++;
    } else {
      const id = ids.get(op.object);
      if (id !== undefined) {
        arena = free(arena, id, coalesce);
        ids.delete(op.object);
      }
    }
    peakHoles = Math.max(peakHoles, holesOf(arena).length);
    history.push(arena);
  }
  return { arena, failedFragmented, failedFull, peakHoles, history };
}

export const arenaOpening = (): { policy: Policy; coalesce: boolean; arena: Arena } => ({ policy: 'first', coalesce: true, arena: emptyArena() });
