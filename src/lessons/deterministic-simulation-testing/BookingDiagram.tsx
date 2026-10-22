import { useMemo } from 'react';
import { SequenceDiagram, type SequenceMessage } from '../../components/SequenceDiagram';
import { toSequence } from '../../core/distSim';
import type { BookMsg } from './booking';
import type { BookingRun } from './model';

const ACTORS = [
  { id: 'client', label: 'clients' },
  { id: 'r1', label: 'replica r1' },
  { id: 'r2', label: 'replica r2' },
];

const label = (p: BookMsg): string => `${p.type} ${p.client}`;

/** The message ladder of one run: bookings in green when a replica granted them (red when both replicas did), replicates in blue, lost ones stopped at a cross. */
export function BookingDiagram({ run }: { run: BookingRun }) {
  const messages = useMemo<SequenceMessage[]>(() => {
    const seats = run.cluster.snapshot().nodes;
    const granted = [seats.r1?.state?.granted, seats.r2?.state?.granted].filter((c): c is string => c !== null && c !== undefined);
    const both = granted.length > 1;
    return toSequence(run.cluster.trace, { actors: ACTORS, label, events: false }).messages.map((m) => {
      if (!m.label.startsWith('book')) return { ...m, tone: 'info' as const };
      const client = m.label.slice('book '.length);
      return { ...m, tone: granted.includes(client) ? (both ? ('bad' as const) : ('ok' as const)) : ('dim' as const) };
    });
  }, [run]);
  return <SequenceDiagram actors={ACTORS} messages={messages} ariaLabel="Booking requests and replicate messages between the clients and the two replicas" />;
}
