import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import type { ErrorKind, Scenario, Settings, SimEvent } from './model';
import type { Snapshot } from './sim';

export const errorWords: Record<ErrorKind, string> = { validation: 'validation error', timeout: 'timeout' };

/** What the chosen policy does with a failed message, in a sentence. */
export function policyLine(s: Settings): ReactNode {
  switch (s.policy) {
    case 'forever':
      return <>Policy: <b>retry forever</b>{s.backoff ? ', with growing waits' : ''}, so it stays at the head and everything behind it waits.</>;
    case 'max-attempts':
      return <>Policy: <b>max {plural(s.maxAttempts, 'attempt')}</b>{s.backoff ? ' with backoff' : ''}, then the dead-letter queue
        {s.classify ? '; a validation error is parked straight away, without retries' : ''}.</>;
    case 'drop':
      return <>Policy: <b>drop on error</b>, so it is thrown away and the lane moves on.</>;
  }
}

/** The tail of the intro caption for a scene and policy. */
export function introCaption(scene: 'poison' | 'transient' | 'redrive', s: Settings, scenario: Scenario): ReactNode {
  if (scene === 'transient') {
    const [from, to] = scenario.outage!;
    return <>A healthy stream, then the database the consumer depends on goes down for {to - from} s, starting at {from} s. No message is bad.{' '}
      {policyLine(s)} Press Reset to watch it again.</>;
  }
  if (scene === 'redrive') {
    return <>A batch of 12 went through max 3 attempts. Messages 3, 5 and 8 are bad and parked in the DLQ. Fix the bug if you like, then <b>redrive</b> them.</>;
  }
  return <>One message in the partition (<span className="hl bad">#4</span>) is malformed and always makes the handler throw. {policyLine(s)}</>;
}

export interface NarrationContext {
  settings: Settings;
  scenario: Scenario;
  dlqDepth: number;
  /** Messages dropped without a trace so far. */
  lost: number;
  /** The dependency is down right now. */
  down: boolean;
}

/** Depths at which a growing DLQ is worth saying something about. */
export const DLQ_MILESTONES: readonly number[] = [1, 10, 50, 100];

/**
 * A caption for one event, or null when it is not worth one. `told` remembers what was already said in
 * this run, so a failure that repeats every tick is narrated once.
 */
export function eventCaption(e: SimEvent, ctx: NarrationContext, told: Set<string>): ReactNode | null {
  const once = (key: string) => {
    if (told.has(key)) return false;
    told.add(key);
    return true;
  };
  switch (e.kind) {
    case 'failed':
      if (e.attempt !== 1) return null;
      if (e.error === 'validation') {
        if (!once(`fail-${e.id}`)) return null;
        return <>Message <b>#{e.id}</b> fails with a <span className="hl bad">validation error</span>: the message itself is malformed, so retrying the same code can never fix it. {policyLine(ctx.settings)}</>;
      }
      if (!once('first-timeout')) return null;
      return <>Messages start failing with a <span className="hl orange">timeout</span>: the dependency is down, and it is not their fault. {policyLine(ctx.settings)}</>;
    case 'parked': {
      if (!DLQ_MILESTONES.includes(ctx.dlqDepth) || !once(`parked-${ctx.dlqDepth}`)) return null;
      const why = e.error === 'validation'
        ? 'a validation error'
        : 'a timeout while the dependency was down, nothing wrong with the message itself';
      return ctx.dlqDepth === 1
        ? <>Message <b>#{e.id}</b> is <span className="hl violet">parked in the DLQ</span> after {plural(e.attempts, 'attempt')}: {why}. Its error and attempt count are recorded, and the lane moves on. Parked, not lost.</>
        : <>The DLQ now holds <span className="hl violet">{ctx.dlqDepth}</span> messages. The latest, <b>#{e.id}</b>, was parked after {plural(e.attempts, 'attempt')} because of {why}.</>;
    }
    case 'dropped':
      if (!once('dropped')) return null;
      return <>Message <b>#{e.id}</b> is <span className="hl bad">dropped</span>: the lane moves on, but nothing records that it ever existed. That is data you will never see again.</>;
    case 'outage-start':
      return <>The dependency <span className="hl bad">goes down</span>: from now every attempt on every message fails until it comes back.</>;
    case 'outage-end':
      if (ctx.lost > 0) return <>The dependency is <span className="hl ok">back</span>, but {plural(ctx.lost, 'good message')} {ctx.lost === 1 ? 'was' : 'were'} dropped while it was down, with no record.</>;
      if (ctx.dlqDepth > 0) return <>The dependency is <span className="hl ok">back</span>, but {plural(ctx.dlqDepth, 'good message')} {ctx.dlqDepth === 1 ? 'was' : 'were'} already parked in the DLQ while it was down.</>;
      return <>The dependency is <span className="hl ok">back</span>, and nothing was parked or lost. Anything waiting can succeed now.</>;
    case 'paused':
      return <>Consumption is <span className="hl info">paused</span> while the dependency is down: no attempt is made, so no attempt is wasted and no message is parked.</>;
    case 'resumed':
      return ctx.down
        ? <>Pausing is off, so consumption <span className="hl orange">resumes</span> while the dependency is still down, and attempts start failing again.</>
        : <>The dependency is back, so consumption <span className="hl ok">resumes</span> and the backlog drains.</>;
    case 'redriven':
      return <>Redrive: {plural(e.ids.length, 'parked message')} {e.ids.length === 1 ? 'goes' : 'go'} back onto the main queue as new deliveries, behind anything already waiting, so order is not kept.{' '}
        {ctx.settings.dedupe ? 'The consumer dedupes by message id, so work it already did is skipped.' : 'The consumer does not dedupe, so work it already did for these messages will run again.'}
        {ctx.settings.bugFixed ? '' : ' The bug is not fixed, so they will fail again.'}</>;
  }
}

/** A slower insight, from the snapshot, for the situation the learner is looking at. */
export function insightCaption(snap: Snapshot, s: Settings): ReactNode | null {
  const blocked = snap.lane[0]?.poison;
  if (blocked && s.policy === 'forever' && snap.stats.lag >= 30) {
    return <>The lag has passed 30 and keeps climbing, and the oldest waiting message is getting older with it (the stats beside the lane show the live numbers). One bad message at the head holds every good message behind it: head-of-line blocking.</>;
  }
  if (snap.stats.dlq > 0 && snap.stats.dropped === 0 && snap.down === false && snap.stats.lag < 3) {
    return <>The queue is quiet, but the DLQ holds <b>{snap.stats.dlq}</b>. Nothing was lost, and nothing is fixed: someone has to look, or it is a slower way to lose data.</>;
  }
  return null;
}
