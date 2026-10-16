import type { ReactNode } from 'react';
import { plural, sig } from '../../core/format';
import {
  BASE_PAGE_MS, QUEUE_BOUND, SERVICES, SERVICE_NAME, TIERS, WIDGETS, WIDGET_NAME, firstMinute, journey, pageMs, staleAgeMin, stateWord, widgetStates,
  type BrownoutPoint, type CacheConfig, type Checkout, type HealthMap, type MinuteServed, type Options, type Policies, type QueueRun,
} from './model';

/** "a", "a and b", "a, b and c". */
export const listWords = (items: readonly string[]): string => (items.length < 3 ? items.join(' and ') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

export const money = (x: number): string => `$${x.toFixed(2)}`;
export const msText = (ms: number): string => (ms >= 1000 ? `${sig(ms / 1000)} s` : `${sig(ms)} ms`);

/** What the page does under the current failures, computed from the same functions that fill the stats. */
export function widgetCaption(health: HealthMap, policies: Policies, options: Options, outageMin: number): ReactNode {
  const failed = SERVICES.filter((s) => health[s] !== 'up');
  if (failed.length === 0) {
    return <>All eight services are up, so every widget shows live data and the page takes {BASE_PAGE_MS} ms. Fail a service in the graph, or press a preset, and watch what each widget does.</>;
  }
  const states = widgetStates(health, policies, options);
  const changed = WIDGETS.filter((w) => states[w] !== 'live');
  const steps = journey(health, policies, options);
  const blocked = steps.find((s) => !s.ok);
  const what = (w: (typeof WIDGETS)[number]) => `${WIDGET_NAME[w]} is ${stateWord(states[w])}${states[w] === 'stale' ? ` (${staleAgeMin(outageMin)} min old)` : ''}`;
  return (
    <>
      {listWords(failed.map((s) => `${SERVICE_NAME[s]} is ${health[s]}`))}. {changed.length === 0 ? 'No widget changes' : `${listWords(changed.map(what))}`}. The page takes {msText(pageMs(health, policies, options))}.{' '}
      {blocked ? (
        <>
          <span className="hl bad wrap">core journey blocked at {blocked.label}</span> because {blocked.reason}.
        </>
      ) : (
        <span className="hl ok wrap">core journey still works</span>
      )}
    </>
  );
}

/** What a load and a threshold do to the page and to the queue, from the model's point and run. */
export function brownoutCaption(lambda: number, threshold: number, degrade: boolean, point: BrownoutPoint, run: QueueRun, seed: number): ReactNode {
  const off = TIERS.filter((_, i) => !point.on[i]);
  const offText = off.length === 0 ? (degrade ? 'No tier is off yet' : 'Degradation is off, so every tier stays on') : `${listWords(off.map((t) => `${t.id} ${t.name}`))} ${off.length === 1 ? 'is' : 'are'} off`;
  const saturated = point.rho >= 1;
  return (
    <>
      At {lambda}/s, with the brownout line at {sig(threshold)} of the full page&apos;s capacity: {offText}, so a worker serves {sig(point.mu)}/s and runs at {sig(point.rho * 100)}%.{' '}
      {saturated ? (
        <>
          That is above 100%, so{' '}
          <span className="hl bad wrap">
            the queue grows without bound{run.brokeAtS === null ? '' : `: seed ${seed} passed ${QUEUE_BOUND} requests after ${sig(run.brokeAtS)} s`}
          </span>
          .
        </>
      ) : (
        <>
          Mean time in the system is <span className="hl ok wrap">{msText(point.responseS * 1000)}</span> and the longest queue was {run.maxQueued}.
        </>
      )}
    </>
  );
}

/** The captions of the stale-on-error timeline: its milestones are the minutes the model produced. */
export function staleMilestones(c: CacheConfig, rows: readonly MinuteServed[]): { t: number; say: ReactNode }[] {
  const out: { t: number; say: ReactNode }[] = [];
  const stale = firstMinute(rows, 'stale');
  const error = firstMinute(rows, 'error');
  if (c.outageLength > 0) {
    out.push({ t: c.outageStart, say: <>The origin goes down for {plural(c.outageLength, 'minute')}. A cached copy younger than the {c.ttl}-minute TTL is still served fresh without asking the origin.</> });
  }
  if (stale !== null) {
    const row = rows[stale];
    out.push({ t: stale, say: <>Minute {stale}: the copy is {row.age} minutes old, past its TTL, and the origin is down. The user sees it <span className="hl wrap">stale, updated {row.age} min ago</span> instead of an error.</> });
  }
  if (error !== null) {
    out.push({ t: error, say: <>Minute {error}: the copy is past the {c.staleIfError}-minute stale-if-error window, so there is nothing safe left to serve and the user gets <span className="hl bad">an error</span>.</> });
  }
  const back = c.outageStart + c.outageLength;
  if (c.outageLength > 0 && back <= rows[rows.length - 1].t) {
    out.push({ t: back, say: <>The origin is back at minute {back}: the next request refetches, and the copy is fresh again.</> });
  }
  return out;
}

export function staleIntro(c: CacheConfig): ReactNode {
  return <>A copy cached at minute 0 is fresh for {c.ttl} {c.ttl === 1 ? 'minute' : 'minutes'}. After that, if the origin errors, it may still be served for {c.staleIfError} more. Press play to run the outage from minute {c.outageStart}.</>;
}

export function staleSummary(c: CacheConfig, rows: readonly MinuteServed[], rule: 'fail-closed' | 'stale-price', ch: Checkout): ReactNode {
  const staleMinutes = rows.filter((r) => r.served === 'stale').length;
  const errorMinutes = rows.filter((r) => r.served === 'error').length;
  return (
    <>
      Over the run the user saw {plural(staleMinutes, 'stale minute')} and {plural(errorMinutes, 'error minute')} during a {c.outageLength}-minute outage. Checkout{' '}
      {rule === 'fail-closed'
        ? ch.outcome === 'refused'
          ? 'refused rather than charge a price it could not confirm: degrade what is shown, never what moves money.'
          : `charged the live ${money(ch.livePrice)}.`
        : ch.outcome === 'charged-stale'
          ? `charged the cached ${money(ch.cachedPrice)} while the live price was ${money(ch.livePrice)}${ch.cachedPrice === ch.livePrice ? ', which happens to match' : ''}.`
          : `charged ${money(ch.charged ?? 0)}.`}
    </>
  );
}
