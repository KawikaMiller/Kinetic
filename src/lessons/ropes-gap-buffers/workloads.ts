import { mulberry32 } from '../../core/random';
import {
  arrayCreate, arrayDelete, arrayInsert, arrayTouches, gapCreate, gapDelete, gapInsert, gapMoveTo, gapText, gapTouches, needsRebalance, ropeBuild, ropeCreate, ropeDelete, ropeInsert,
  ropeRebalance, ropeText, ropeTouches,
} from './structures';

export type WorkloadId = 'type' | 'jump' | 'paste' | 'delete' | 'undo' | 'append';
export type StructureId = 'array' | 'gap' | 'rope';

export const SIZES = [1000, 10_000, 100_000, 1_000_000] as const;
export const WORKLOAD_SEED = 21;
/** Free slots a gap buffer starts with when a text is opened. */
const GAP_SPARE = 256;
const TYPED = 200;
const JUMPS = 50;
const PASTES = 5;
const PASTE_LEN = 500;
const DELETES = 5;
const UNDO_EDITS = 10;
const LETTERS = 'abcdefghijklmnopqrstuvwxyz ';

export interface WorkloadInfo {
  id: WorkloadId;
  label: string;
  /** One sentence for the table: what each operation does. */
  what: string;
}

export const WORKLOADS: WorkloadInfo[] = [
  { id: 'type', label: 'Type at the cursor', what: `${TYPED} characters typed one by one at a cursor in the middle of the text` },
  { id: 'append', label: 'Type at the end', what: `${TYPED} characters typed one by one at the end of the text` },
  { id: 'jump', label: 'Jump around and insert', what: `${JUMPS} single characters inserted, alternately at the very start and the very end (the far jumps are the gap buffer's worst case)` },
  { id: 'paste', label: 'Paste a big block at the start', what: `${PASTES} pastes of ${PASTE_LEN} characters at the start, with the cursor beginning at the end` },
  { id: 'delete', label: 'Delete a big range', what: `${DELETES} deletions of a tenth of the text, from random places` },
  { id: 'undo', label: 'Undo the last 10 edits', what: `${UNDO_EDITS} single-character edits at random places, then all ${UNDO_EDITS} undone, newest first` },
];

export interface StructureResult {
  touches: number;
  perOp: number;
}

export interface WorkloadResult {
  id: WorkloadId;
  size: number;
  ops: number;
  array: StructureResult;
  gap: StructureResult;
  rope: StructureResult;
  /** Structures with the fewest touches (more than one on a tie), and the one with the most. */
  winners: StructureId[];
  loser: StructureId | null;
  /** The three final texts are identical: the structures did the same edits. */
  agree: boolean;
  /** Times the rope rebuilt itself from its leaves under the depth rule: the cost the simplified rule adds. */
  ropeRebuilds: number;
}

type Op = { kind: 'insert'; at: number; items: string[] } | { kind: 'delete'; from: number; to: number } | { kind: 'move'; to: number } | { kind: 'undo'; step: number };

const randomText = (rnd: () => number, n: number): string[] => Array.from({ length: n }, () => LETTERS[Math.floor(rnd() * LETTERS.length)]);

/** The operations a workload performs, from the seed and the starting size (lengths tracked so every position is valid). */
export function operationsFor(id: WorkloadId, size: number, seed = WORKLOAD_SEED): Op[] {
  const rnd = mulberry32(seed);
  const ops: Op[] = [];
  let len = size;
  const rand = (n: number) => Math.floor(rnd() * n);
  switch (id) {
    case 'type': {
      let at = Math.floor(size / 2);
      ops.push({ kind: 'move', to: at });
      for (let i = 0; i < TYPED; i++) {
        ops.push({ kind: 'insert', at, items: randomText(rnd, 1) });
        at++;
        len++;
      }
      break;
    }
    case 'append':
      for (let i = 0; i < TYPED; i++) ops.push({ kind: 'insert', at: len++, items: randomText(rnd, 1) });
      break;
    case 'jump':
      for (let i = 0; i < JUMPS; i++) {
        const at = i % 2 === 0 ? 0 : len;
        ops.push({ kind: 'move', to: at });
        ops.push({ kind: 'insert', at, items: randomText(rnd, 1) });
        len++;
      }
      break;
    case 'paste':
      ops.push({ kind: 'move', to: len });
      for (let i = 0; i < PASTES; i++) {
        ops.push({ kind: 'move', to: 0 });
        ops.push({ kind: 'insert', at: 0, items: randomText(rnd, PASTE_LEN) });
        len += PASTE_LEN;
      }
      break;
    case 'delete':
      for (let i = 0; i < DELETES; i++) {
        const span = Math.max(1, Math.floor(len / 10));
        const from = rand(len - span + 1);
        ops.push({ kind: 'move', to: from });
        ops.push({ kind: 'delete', from, to: from + span });
        len -= span;
      }
      break;
    case 'undo': {
      for (let i = 0; i < UNDO_EDITS; i++) {
        const at = rand(len + 1);
        ops.push({ kind: 'move', to: at });
        ops.push({ kind: 'insert', at, items: randomText(rnd, 1) });
        len++;
      }
      for (let i = UNDO_EDITS - 1; i >= 0; i--) ops.push({ kind: 'undo', step: i });
      break;
    }
  }
  return ops;
}

/** Number of operations that count as one "operation" for the per-op figure (moves are part of the next edit). */
const editsIn = (ops: Op[]) => ops.filter((o) => o.kind !== 'move').length;

const cache = new Map<string, WorkloadResult>();

/** Run one workload on all three structures, from the same text and the same operations, counting touches in one unit. */
export function runWorkload(id: WorkloadId, size: number, seed = WORKLOAD_SEED): WorkloadResult {
  const key = `${id}|${size}|${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const base = randomText(mulberry32(seed + 1), size);
  const ops = operationsFor(id, size, seed);
  const edits = ops.filter((o): o is Extract<Op, { kind: 'insert' | 'delete' }> => o.kind === 'insert' || o.kind === 'delete');

  const arr = arrayCreate(base);
  const gap = gapCreate(base, size + GAP_SPARE);
  const rope = ropeCreate();
  rope.root = ropeBuild(rope, base);
  const buildCost = ropeTouches(rope);
  const snapshots: (number | null)[] = [];

  let editNo = 0;
  for (const op of ops) {
    if (op.kind === 'insert') {
      arrayInsert(arr, op.at, op.items);
      gapInsert(gap, op.at, op.items);
      snapshots.push(rope.root);
      ropeInsert(rope, op.at, op.items);
      editNo++;
    } else if (op.kind === 'delete') {
      arrayDelete(arr, op.from, op.to);
      gapDelete(gap, op.from, op.to);
      snapshots.push(rope.root);
      ropeDelete(rope, op.from, op.to);
      editNo++;
    } else if (op.kind === 'move') {
      gapMoveTo(gap, op.to);
      continue;
    } else {
      // undo the edit `step`: arrays and gap buffers apply the inverse edit, a rope puts its saved root back
      const e = edits[op.step];
      if (e.kind === 'insert') {
        arrayDelete(arr, e.at, e.at + e.items.length);
        gapDelete(gap, e.at, e.at + e.items.length);
      }
      rope.reads++;
      rope.root = snapshots[op.step];
      continue;
    }
    if (needsRebalance(rope)) ropeRebalance(rope);
  }
  const arrayCost = arrayTouches(arr);
  const n = Math.max(1, editsIn(ops));
  const result = {
    array: { touches: arrayCost, perOp: arrayCost / n },
    gap: { touches: gapTouches(gap), perOp: gapTouches(gap) / n },
    rope: { touches: ropeTouches(rope) - buildCost, perOp: (ropeTouches(rope) - buildCost) / n },
  };
  const all: StructureId[] = ['array', 'gap', 'rope'];
  const best = Math.min(...all.map((s) => result[s].touches));
  const worst = Math.max(...all.map((s) => result[s].touches));
  const winners = all.filter((s) => result[s].touches === best);
  const losers = all.filter((s) => result[s].touches === worst);
  const agree = arr.chars.join('') === gapText(gap).join('') && arr.chars.join('') === ropeText(rope).join('');
  const out: WorkloadResult = {
    id,
    size,
    ops: n,
    ...result,
    winners,
    loser: winners.length === all.length ? null : losers.length === 1 ? losers[0] : null,
    agree,
    ropeRebuilds: rope.rebuilds,
  };
  cache.set(key, out);
  return out;
}
