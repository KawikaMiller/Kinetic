import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { ALERTS, ROUTE_LABEL, rubricRoute, totals, type Routing } from './triage';
import { judge, neverClears, neverFires, type Metric, type Verdict } from './rules';
import { INCIDENTS, WEEK } from './week';

/** Scene 1: the rule's score over the week, with the extremes said the way they truly are. */
export function ruleCaption(metric: Metric, threshold: number, forMinutes: number, fires: readonly number[]): ReactNode {
  const series = metric === 'errors' ? WEEK.errors : WEEK.cpu;
  const v = judge(fires);
  const rule = `${metric === 'errors' ? 'error ratio' : 'CPU'} above ${threshold}%${forMinutes > 1 ? ` for ${forMinutes} minutes` : ''}`;
  if (neverClears(series, threshold)) {
    return <>Rule: {rule}. The condition is true every minute of the week, so it pages once and the page never clears: nothing after it can page, and {plural(v.missed.length, 'incident')} {v.missed.length === 1 ? 'is' : 'are'} never announced.</>;
  }
  if (neverFires(series, threshold)) {
    return <>Rule: {rule}. Nothing in the week goes above {threshold}%, so it never pages: 0 pages, and all {INCIDENTS.length} incidents are missed.</>;
  }
  return (
    <>
      Rule: {rule}. <b>{plural(v.pages, 'page')}</b> in the week: {v.useful} during a real incident, {v.falsePages} with none, and {v.missed.length} of {INCIDENTS.length} incidents never paged.
    </>
  );
}

/** Scene 2: what each alert did over the week, from its own page minutes. */
export function symptomCaption(rows: readonly { id: string; label: string; verdict: Verdict }[], ticketLead: number | null): ReactNode {
  return (
    <>
      {rows.map((r, i) => (
        <span key={r.id}>
          {i > 0 && '; '}
          {r.label}: {plural(r.verdict.pages, 'page')}, {r.verdict.useful} during an incident
        </span>
      ))}
      .{ticketLead !== null && <> The disk-full prediction raised a ticket {ticketLead} minutes before the disk filled, when nobody was hurt yet.</>}
    </>
  );
}

/** Scene 3: how the current routing scores on pages, nights and the rubric. */
export function triageCaption(routing: Routing): ReactNode {
  const t = totals(routing);
  const nights = Math.round(t.nightPages);
  const first = ALERTS.find((a) => routing[a.id] !== rubricRoute(a).route);
  return (
    <>
      {plural(t.paging, 'alert')} {t.paging === 1 ? 'pages' : 'page'}, {t.pagesPerWeek} pages a week and about {nights} of them at night. {t.mismatches === 0 ? 'Every routing matches the rubric.' : `${plural(t.mismatches, 'routing')} differ${t.mismatches === 1 ? 's' : ''} from the rubric.`}
      {first && <> For “{first.text}” the rubric says {ROUTE_LABEL[rubricRoute(first).route].toLowerCase()}: {rubricRoute(first).because}.</>}
      {t.pagesWithoutRunbook.length > 0 && <> {plural(t.pagesWithoutRunbook.length, 'paging alert')} {t.pagesWithoutRunbook.length === 1 ? 'has' : 'have'} no runbook link.</>}
    </>
  );
}
