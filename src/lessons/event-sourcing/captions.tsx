/** Captions for the event-sourcing stage. Every figure is passed in from the model, never typed. */
import type { ReactNode } from 'react';
import type { AccountEvent } from './events';
import { dateOf } from './events';

export const money = (n: number) => `${n < 0 ? '−' : ''}€${Math.abs(n).toLocaleString()}`;

export const introCaption = (): ReactNode => (
  <>
    Nothing is updated in place. Every change is an <span className="hl">event</span> appended to the log, and the balance is computed by{' '}
    <b>replaying</b> them.
  </>
);

export const rejectedCaption = (amount: number, balance: number): ReactNode => (
  <>
    <span className="hl bad">Command rejected</span>: withdraw {money(amount)} with only {money(balance)}. No event is written; events record facts
    that <b>already happened</b>.
  </>
);

export const appendedCaption = (event: AccountEvent): ReactNode => (
  <>
    <span className="hl">
      {event.type} {money(event.amount)}
    </span>{' '}
    appended as event <b>#{event.seq}</b>. The write is done; read models <b>catch up a moment later</b> (eventual consistency).
  </>
);

export const newProjectionCaption = (): ReactNode => (
  <>
    A brand-new read model, built by <span className="hl violet">replaying all of history</span>. No migration, no backfill script: the log already
    has everything.
  </>
);

export function scrubCaption(events: readonly AccountEvent[], at: number, balance: number): ReactNode {
  if (at >= events.length) return <>Back to the present: {events.length} events, balance {money(balance)}.</>;
  const e = events[at - 1];
  return (
    <>
      <span className="hl">Time travel</span>: state as of event #{at}
      {e ? ` (${dateOf(e.day).label})` : ''} = balance <b>{money(balance)}</b>. Nothing stored this; it's recomputed from the log.
    </>
  );
}

export const resetCaption = (count: number): ReactNode => <>Reset to the original {count} events.</>;

