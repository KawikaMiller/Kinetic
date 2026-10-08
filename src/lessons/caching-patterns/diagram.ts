import type { SequenceActor, SequenceMessage } from '../../components/SequenceDiagram';
import type { Tone } from '../../core/tone';
import { BEAT_TONE, type Beat, type Lane } from './model';

/** An arrow's colour: a stale value read or stored is orange whatever the arrow is. */
export function beatTone(b: Beat): Tone {
  if ((b.kind === 'hit' || b.kind === 'fill') && b.served?.stale) return 'orange';
  return BEAT_TONE[b.kind];
}

const ACTOR_LABEL: Record<Lane, string> = { A: 'Client A', B: 'Client B', cache: 'Cache', db: 'Database', replica: 'Replica' };

export const actorsFor = (lanes: readonly Lane[], labels: Partial<Record<Lane, string>> = {}): SequenceActor[] =>
  lanes.map((id) => ({ id, label: labels[id] ?? ACTOR_LABEL[id] }));

export const messagesOf = (beats: readonly Beat[]): SequenceMessage[] =>
  beats.map((b) => ({ id: b.id, from: b.from, to: b.to, label: b.label, note: b.note, tone: beatTone(b) }));
