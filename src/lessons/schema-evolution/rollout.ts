/**
 * Scene 3 of schema-evolution: three producers and three consumers move from one schema to the next one
 * service at a time. In every state each producer sends one message to each consumer, really encoded
 * with the producer's schema and decoded with the consumer's (avro.ts), and the failures are counted.
 * A change that needs several deploys (a rename done safely) is a chain of schemas rolled out one hop
 * at a time, each hop in the learner's order.
 */

import { decodeWithWriter, encodeRecord, resolve, roundTrip, type ARecord, type ASchema } from './avro';

export const SERVICES = 3;
export type Role = 'producer' | 'consumer';
export const PRODUCERS = ['P1', 'P2', 'P3'] as const;
export const CONSUMERS = ['C1', 'C2', 'C3'] as const;
export type ServiceId = (typeof PRODUCERS)[number] | (typeof CONSUMERS)[number];

export type OrderId = 'consumers-first' | 'producers-first' | 'interleaved';
export const ORDERS: { id: OrderId; label: string; sequence: readonly ServiceId[] }[] = [
  { id: 'consumers-first', label: 'Consumers first', sequence: ['C1', 'C2', 'C3', 'P1', 'P2', 'P3'] },
  { id: 'producers-first', label: 'Producers first', sequence: ['P1', 'P2', 'P3', 'C1', 'C2', 'C3'] },
  { id: 'interleaved', label: 'One of each', sequence: ['P1', 'C1', 'P2', 'C2', 'P3', 'C3'] },
];

export type ChangeId = 'add-default' | 'add-required' | 'remove' | 'rename' | 'rename-safely';

const BASE: ASchema = [
  { name: 'id', type: 'long', hasDefault: false },
  { name: 'name', type: 'string', hasDefault: false },
];
const TAG = { name: 'tag', type: 'string', hasDefault: false } as const;

export const CHANGES: { id: ChangeId; label: string; chain: ASchema[] }[] = [
  { id: 'add-default', label: 'Add tag with a default', chain: [BASE, [...BASE, { ...TAG, hasDefault: true }]] },
  { id: 'add-required', label: 'Add tag, no default', chain: [BASE, [...BASE, TAG]] },
  { id: 'remove', label: 'Remove name', chain: [BASE, [BASE[0]]] },
  { id: 'rename', label: 'Rename name to title', chain: [BASE, [BASE[0], { name: 'title', type: 'string', hasDefault: false }]] },
  {
    id: 'rename-safely',
    label: 'Rename in three deploys',
    chain: [
      BASE,
      [BASE[0], { ...BASE[1], hasDefault: true }, { name: 'title', type: 'string', hasDefault: true }],
      [BASE[0], { name: 'title', type: 'string', hasDefault: true }],
    ],
  },
];
export const changeById = (id: ChangeId) => CHANGES.find((c) => c.id === id)!;

/** Which schema each service runs in one state. */
export type Versions = Record<ServiceId, number>;

export interface Message {
  from: (typeof PRODUCERS)[number];
  to: (typeof CONSUMERS)[number];
  failed: boolean;
  /** Why it failed (the decoder's own message). */
  error?: string;
}

export interface State {
  /** 0 is the start; each later state follows one upgrade. */
  index: number;
  versions: Versions;
  /** The service upgraded to reach this state (none at the start). */
  upgraded: ServiceId | null;
  /** Which hop of the chain this upgrade belongs to (the schema everyone is moving to). */
  hop: number;
  messages: Message[];
  failures: number;
}

const initial = (): Versions => ({ P1: 0, P2: 0, P3: 0, C1: 0, C2: 0, C3: 0 });

/** The record a producer sends: its own id and name, with whatever fields its schema has. */
const recordFor = (schema: ASchema, producer: number): ARecord =>
  Object.fromEntries(schema.map((f) => [f.name, f.name === 'id' ? BigInt(producer + 1) : f.type === 'string' ? `p${producer + 1}-${f.name}` : 0n]));

/** Really encode one message and decode it: the failure, if any, is the decoder's. */
export function send(chain: readonly ASchema[], versions: Versions, p: number, c: number): Message {
  const writer = chain[versions[PRODUCERS[p]]];
  const reader = chain[versions[CONSUMERS[c]]];
  const wire = encodeRecord(writer, recordFor(writer, p));
  const read = decodeWithWriter(writer, wire.bytes);
  const out = read.ok ? resolve(reader, writer, read.value) : read;
  return { from: PRODUCERS[p], to: CONSUMERS[c], failed: !out.ok, error: out.ok ? undefined : out.error };
}

function stateOf(chain: readonly ASchema[], versions: Versions, index: number, upgraded: ServiceId | null, hop: number): State {
  const messages = PRODUCERS.flatMap((_, p) => CONSUMERS.map((__, c) => send(chain, versions, p, c)));
  return { index, versions, upgraded, hop, messages, failures: messages.filter((m) => m.failed).length };
}

/** Every state of the rollout, in order: the start, then one per upgrade, hop after hop. */
export function rollout(change: ChangeId, order: OrderId): State[] {
  const chain = changeById(change).chain;
  const sequence = ORDERS.find((o) => o.id === order)!.sequence;
  const states = [stateOf(chain, initial(), 0, null, 1)];
  let versions = initial();
  for (let hop = 1; hop < chain.length; hop++) {
    for (const id of sequence) {
      versions = { ...versions, [id]: hop };
      states.push(stateOf(chain, versions, states.length, id, hop));
    }
  }
  return states;
}

export const totalFailures = (states: readonly State[]) => states.reduce((n, s) => n + s.failures, 0);
export const totalMessages = (states: readonly State[]) => states.reduce((n, s) => n + s.messages.length, 0);

/** What a reader on `reader` meets in a state: the pairs of (consumer schema, producer schema) that occur. */
export const pairsMet = (states: readonly State[]): { reader: number; writer: number }[] =>
  states.flatMap((s) => PRODUCERS.flatMap((p) => CONSUMERS.map((c) => ({ reader: s.versions[c], writer: s.versions[p] }))));

/** True when this hop-by-hop chain decodes in the learner's direction: new readers of old data (backward) or old readers of new data (forward). */
export function directionHolds(change: ChangeId, direction: 'backward' | 'forward'): boolean {
  const chain = changeById(change).chain;
  return chain.slice(1).every((next, i) => {
    const prev = chain[i];
    return direction === 'backward' ? roundTrip(next, prev).ok : roundTrip(prev, next).ok;
  });
}

/** Which deploy order a change needs, from the directions it satisfies. */
export function neededOrder(change: ChangeId): 'any' | 'consumers-first' | 'producers-first' | 'two-step' {
  const backward = directionHolds(change, 'backward');
  const forward = directionHolds(change, 'forward');
  return backward && forward ? 'any' : backward ? 'consumers-first' : forward ? 'producers-first' : 'two-step';
}
