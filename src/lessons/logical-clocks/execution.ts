/**
 * logical-clocks, scenes 1 and 2: the execution the learner draws on the shared lane editor, its presets, and what is said about a pair.
 */
import { buildLaneModel, itemById, type LaneLimits, type LaneModel } from '../../core/laneEditor';
import type { Tone } from '../../core/tone';
import {
  happenedBefore, lamportBetween, misleadingPairs, stampExecution, truthBetween, vectorBetween, executionOf,
  type PairIndex, type Relation, type Stamped,
} from './clocks';

export const PROCESSES = ['P1', 'P2', 'P3'] as const;
export const SLOTS = 14;
export const MAX_EVENTS = 14;
export const LIMITS: LaneLimits = { lanes: PROCESSES.length, slots: SLOTS, maxItems: MAX_EVENTS };
/** Lanes are plain categories. */
export const LANE_TONES: readonly Tone[] = ['amber', 'pink', 'sky'];

export interface EvData {
  name: string;
}
export type ExecModel = LaneModel<EvData>;

const NAMES = 'abcdefghijklmnopqrstuvwxyz';
/** The first letter no event uses yet. */
export const nextName = (model: ExecModel): string => [...NAMES].find((n) => !model.items.some((i) => i.data.name === n)) ?? '?';

export interface ExecPreset {
  id: string;
  label: string;
  model: () => ExecModel;
}

const preset = (rows: readonly (readonly [lane: number, slot: number])[], links: readonly (readonly [number, number])[]): ExecModel =>
  buildLaneModel<EvData>(LIMITS, rows.map(([lane, slot], i) => ({ lane, slot, data: { name: NAMES[i] } })), links);

export const PRESETS: readonly ExecPreset[] = [
  {
    id: 'chain',
    label: 'a causes e through two messages',
    // a (P1) sends to c (P2); d (P2) sends to e (P3): so a happened before e through two messages. b (P3) and f (P1) sit off to the sides.
    model: () => preset([[0, 1], [2, 2], [1, 3], [1, 5], [2, 7], [0, 8]], [[0, 2], [3, 4]]),
  },
  {
    id: 'concurrent',
    label: 'two concurrent writes',
    model: () => preset([[0, 1], [1, 1], [2, 4], [2, 6]], [[0, 2], [1, 3]]),
  },
  {
    id: 'gossip',
    label: 'a gossip chain',
    model: () => preset([[0, 1], [1, 3], [1, 4], [2, 6], [2, 7], [0, 9]], [[0, 1], [2, 3], [4, 5]]),
  },
];
export const DEFAULT_PRESET = PRESETS[0];

/** Everything computed from a drawn execution. */
export interface ExecView {
  stamps: Stamped[];
  /** Index by item id. */
  byId: Map<string, number>;
  hb: boolean[][];
  misleading: PairIndex[];
  name: (i: number) => string;
}

export function viewOf(model: ExecModel): ExecView {
  const exec = executionOf(model);
  const stamps = stampExecution(exec);
  const hb = happenedBefore(exec);
  const byId = new Map(exec.events.map((e, i) => [e.id, i]));
  return { stamps, byId, hb, misleading: misleadingPairs(stamps, hb), name: (i) => itemById(model, exec.events[i].id)?.data.name ?? '?' };
}

export interface PairView {
  truth: Relation;
  /** What the Lamport order says: always an order, never "concurrent". */
  lamport: 'before' | 'after';
  vector: Relation;
  /** The Lamport order claims an order the events do not have. */
  lamportMisleads: boolean;
  /** The vector comparison disagrees with the ground truth (never, unless a clock is broken). */
  vectorWrong: boolean;
}

export function pairView(v: ExecView, a: number, b: number): PairView {
  const truth = truthBetween(v.hb, a, b);
  const lamport = lamportBetween(v.stamps[a], v.stamps[b]);
  const vector = vectorBetween(v.stamps[a].vector, v.stamps[b].vector);
  return { truth, lamport, vector, lamportMisleads: truth === 'concurrent', vectorWrong: vector !== truth };
}

export const RELATION_TEXT: Record<Relation, (a: string, b: string) => string> = {
  before: (a, b) => `${a} happened before ${b}`,
  after: (a, b) => `${b} happened before ${a}`,
  concurrent: (a, b) => `${a} and ${b} are concurrent`,
  same: (a) => `${a} is the same event`,
};
