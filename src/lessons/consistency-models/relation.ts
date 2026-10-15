/**
 * consistency-models, scene 2: the facts in the comparison table and the 2 x 2 of serializability against linearizability.
 * These are claims about real systems and papers, written from memory and labelled as such on screen; the histories in
 * scene 1 are what the lesson actually checks.
 */
import type { OrderModel } from './model';

export type ModelId = OrderModel | 'eventual';

export interface ModelFacts {
  id: ModelId;
  name: string;
  /** Can a read return a value older than one already acknowledged to another client? */
  stale: boolean;
  staleNote: string;
  /** Does the usual design make replicas agree on an order before answering? */
  coordination: boolean;
  coordinationNote: string;
  /** Can it keep answering on both sides of a network partition? */
  available: boolean;
  availableNote: string;
}

export const MODEL_FACTS: readonly ModelFacts[] = [
  {
    id: 'linearizable', name: 'Linearizable',
    stale: false, staleNote: 'no: a read that starts after a write finished sees it',
    coordination: true, coordinationNote: 'yes, usually through a leader or a majority',
    available: false, availableNote: 'no: one side has to wait',
  },
  {
    id: 'sequential', name: 'Sequentially consistent',
    stale: true, staleNote: 'yes, in real time; never out of a client\'s own order',
    coordination: true, coordinationNote: 'yes: one order everyone agrees on',
    available: false, availableNote: 'no, as far as the known results go',
  },
  {
    id: 'causal', name: 'Causally consistent',
    stale: true, staleNote: 'yes, but never before something it depends on',
    coordination: false, coordinationNote: 'no: replicas track what came before what',
    available: true, availableNote: 'yes, though a client may need to keep using one replica',
  },
  {
    id: 'eventual', name: 'Eventually consistent',
    stale: true, staleNote: 'yes, for as long as the copies differ',
    coordination: false, coordinationNote: 'no',
    available: true, availableNote: 'yes',
  },
];

/** The 2 x 2: what a guarantee covers, against whether it cares about real time. */
export interface AxisCell {
  name: string;
  note: string;
}
export const AXIS_ROWS = ['one object', 'many objects, in transactions'] as const;
export const AXIS_COLUMNS = ['no real-time rule', 'respects real time'] as const;
export const AXIS_CELLS: readonly (readonly AxisCell[])[] = [
  [
    { name: 'sequential consistency', note: 'one order that keeps each client\'s own order' },
    { name: 'linearizability', note: 'one order that also respects real time' },
  ],
  [
    { name: 'serializability', note: 'transactions behave as if run one at a time, in some order' },
    { name: 'strict serializability', note: 'serializable, and the order respects real time' },
  ],
];
