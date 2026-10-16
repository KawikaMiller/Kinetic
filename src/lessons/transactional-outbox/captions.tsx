import type { ReactNode } from 'react';
import { timeFrames, type TimedFrame } from '../../core/frames';
import { OUTCOME_WORD, outcomeOf, unpublishedOrders, type Design, type Fault, type OutboxRun, type Outcome, type RelayMode } from './outbox';

export const ms = (t: number) => `${Math.round(t)} ms`;

export const DESIGN_WORD: Record<Design, string> = {
  dbfirst: 'insert the order, then publish the event',
  pubfirst: 'publish the event, then insert the order',
  outbox: 'write the order and an outbox row in one transaction, and let a relay publish',
};

export const FAULT_WORD: Record<Fault, string> = {
  none: 'No crash is injected.',
  before: 'The service crashes before the first step.',
  between: 'The service crashes between the two steps.',
  after: 'The service crashes after the second step, before it answers the client.',
  'publish-fails': 'The publish is lost on its way to the broker.',
  'after-commit': 'The service crashes right after the commit.',
  'relay-mid': 'The relay crashes after it published and before it marked the row sent.',
};

/** The moments of a run worth a caption, from the records the model keeps. */
export function outboxMilestones(run: OutboxRun): { t: number; say: ReactNode }[] {
  const out: { t: number; say: ReactNode }[] = [];
  for (const o of run.orders) {
    const row = run.outbox.find((r) => r.order === o.order);
    out.push({
      t: o.at,
      say: row ? (
        <>At {ms(o.at)} the database commits order {o.order} <span className="hl violet">together with outbox row {row.id}</span>: one local transaction, both rows or neither.</>
      ) : (
        <>At {ms(o.at)} the database commits order {o.order}.</>
      ),
    });
  }
  const seen = new Map<number, number>();
  for (const p of run.published) {
    const n = (seen.get(p.order) ?? 0) + 1;
    seen.set(p.order, n);
    const committed = run.orders.some((o) => o.order === p.order && o.at <= p.at);
    out.push({
      t: p.at,
      say:
        n > 1 ? (
          <>At {ms(p.at)} the broker receives <span className="hl orange">OrderPlaced for order {p.order} a second time</span>: duplicates are an expected cost of at-least-once publishing.</>
        ) : committed ? (
          <>At {ms(p.at)} the broker receives OrderPlaced for order {p.order}.</>
        ) : (
          <>At {ms(p.at)} the broker receives OrderPlaced for order {p.order}, which is <span className="hl bad">not in the database yet</span>.</>
        ),
    });
  }
  for (const h of run.handled) {
    const committed = run.orders.some((o) => o.order === h.order && o.at <= h.at);
    out.push({
      t: h.at,
      say: !committed ? (
        <>At {ms(h.at)} the consumer handles the event for order {h.order}, and <span className="hl bad">no such order exists</span>: a ghost.</>
      ) : h.applied ? (
        <>At {ms(h.at)} the consumer applies the effect of order {h.order}.</>
      ) : (
        <>At {ms(h.at)} the consumer sees order {h.order}&apos;s event again, finds it in its inbox and <span className="hl dim">skips</span> it.</>
      ),
    });
  }
  for (const r of run.cluster.trace) {
    if (r.kind === 'crash') out.push({ t: r.t, say: <>At {ms(r.t)} the {r.node} <span className="hl bad">crashes</span>; whatever it was holding in memory is gone.</> });
    if (r.kind === 'restart') out.push({ t: r.t, say: <>At {ms(r.t)} the {r.node} restarts.</> });
  }
  for (const r of run.outbox) {
    if (r.sentAt !== null) out.push({ t: r.sentAt, say: <>At {ms(r.sentAt)} the relay marks outbox row {r.id} <span className="hl ok">sent</span>.</> });
  }
  return out;
}

export function outboxFrames(run: OutboxRun, intro: ReactNode, summary: ReactNode): TimedFrame[] {
  const milestones = outboxMilestones(run);
  const end = Math.max(300, ...milestones.map((m) => m.t)) + 250;
  return timeFrames({ end, steps: 20, milestones, intro, summary, hold: 2.2 });
}

/** The end of scene 1 or 2: what became of order 1, from the database and the broker. */
export function outcomeSummary(run: OutboxRun, order = 1): ReactNode {
  const outcome = outcomeOf(run, order);
  const tone: Record<Outcome, string> = { consistent: 'ok', nothing: 'ok', 'lost event': 'bad', ghost: 'bad', duplicate: 'orange' };
  const effects = run.effects[order] ?? 0;
  return (
    <>
      At the end: <span className={`hl ${tone[outcome]} wrap`}>{OUTCOME_WORD[outcome]}</span>.{' '}
      {effects > 0 ? `The consumer applied its effect ${effects} ${effects === 1 ? 'time' : 'times'}.` : 'The consumer applied no effect.'}
    </>
  );
}

export function bugIntro(design: Design, fault: Fault): ReactNode {
  return (
    <>
      Placing an order has to change two systems that cannot commit together: {DESIGN_WORD[design]}. {FAULT_WORD[fault]} Press play.
    </>
  );
}

export function outboxIntro(fault: Fault, dedupe: boolean): ReactNode {
  return (
    <>
      The order and an outbox row are written in one transaction, and a relay publishes unsent rows. {FAULT_WORD[fault]} {dedupe ? 'The consumer keeps an inbox of event ids.' : 'The consumer keeps no inbox.'} Press play.
    </>
  );
}

const RELAY_WORD: Record<RelayMode, string> = {
  flag: 'looks for rows not yet marked sent',
  cursor: 'reads rows with an id above the last one it saw',
  rescan: 'reads from a little below the last id it saw, so it re-scans',
  log: 'reads the commit log in commit order',
};

export function pollIntro(relay: RelayMode): ReactNode {
  return (
    <>
      Two transactions got outbox ids 41 and 42 and are still open. The relay {RELAY_WORD[relay]}. Press play to see which of them it publishes.
    </>
  );
}

export function pollSummary(run: OutboxRun): ReactNode {
  const lost = unpublishedOrders(run);
  const rows = run.outbox.filter((r) => lost.includes(r.order));
  return lost.length === 0 ? (
    <>
      At the end <span className="hl ok">both events were published</span>, in the order {run.published.map((p) => p.id).join(' then ')}.
    </>
  ) : (
    <>
      At the end outbox row {rows.map((r) => r.id).join(', ')} is committed and <span className="hl bad">its event was never published</span>: the relay had already moved past it.
    </>
  );
}
