/** The arena scene's state as pure transitions, so each opening state and each press can be tested. */
import { ARENA_UNITS, alloc, arenaOpening, free, holesOf, runScript, SCRIPT, type AllocResult, type Arena, type Policy } from './arena';

export type LastEvent =
  | { kind: 'alloc'; result: AllocResult; policy: Policy; rover: number }
  | { kind: 'free'; id: number; size: number; holesBefore: number; holesAfter: number; coalesce: boolean }
  | { kind: 'script'; policy: Policy; coalesce: boolean; operations: number; failedFragmented: number; failedFull: number }
  | null;

export interface ArenaSession {
  policy: Policy;
  coalesce: boolean;
  arena: Arena;
  last: LastEvent;
}

export const sessionOpening = (): ArenaSession => ({ ...arenaOpening(), last: null });

export function allocate(s: ArenaSession, n: number): ArenaSession {
  const result = alloc(s.arena, n, s.policy);
  return { ...s, arena: result.arena, last: { kind: 'alloc', result, policy: s.policy, rover: s.arena.rover } };
}

export function freeBlock(s: ArenaSession, id: number): ArenaSession {
  const block = s.arena.segs.find((x) => x.id === id);
  if (!block) return s;
  const arena = free(s.arena, id, s.coalesce);
  return { ...s, arena, last: { kind: 'free', id, size: block.size, holesBefore: holesOf(s.arena).length, holesAfter: holesOf(arena).length, coalesce: s.coalesce } };
}

/** Replace the arena with the state after the whole seeded script under the current policy and coalescing setting. */
export function playScript(s: ArenaSession): ArenaSession {
  const run = runScript(s.policy, s.coalesce);
  return { ...s, arena: run.arena, last: { kind: 'script', policy: s.policy, coalesce: s.coalesce, operations: SCRIPT.length, failedFragmented: run.failedFragmented, failedFull: run.failedFull } };
}

export const reset = (s: ArenaSession): ArenaSession => ({ ...s, arena: sessionOpening().arena, last: null });

/** The unit a grid cell stands for (16 units to a row). */
export const UNITS_PER_ROW = 16;
export const unitOf = (r: number, c: number) => r * UNITS_PER_ROW + c;
export const ROWS = ARENA_UNITS / UNITS_PER_ROW;
