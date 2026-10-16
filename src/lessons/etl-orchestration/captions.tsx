/** etl-orchestration: every caption, built from the model on screen. No number here is typed. */
import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { hourLabel, weekDate } from './chart';
import { CALENDAR_START, DAYS, dayStatus, type Mode, type Task, type World } from './engine';
import { createdBy, logicalDate, PAUSE_FROM, PAUSE_TO, SCHEDULE_START } from './schedule';
import { rerunAfterRuleChange, type Style } from './shape';

const hl = (tone: string, text: ReactNode) => <span className={`hl ${tone}`}>{text}</span>;
const date = (d: number) => weekDate(d);

export function weekCaption(w: World, now: number): ReactNode {
  const loaded = w.loads.filter((n) => n > 0).length;
  return (
    <>
      {hourLabel(CALENDAR_START, now)} UTC: {hl('ok', `${loaded} of ${DAYS} days`)} have loaded their report. Each daily run starts at midnight after its day ends, and a task starts only after the tasks it depends on have succeeded.
    </>
  );
}

export function failureCaption(w: World, day: number, task: Task, retries: number): ReactNode {
  const t = w.runs[day].tasks;
  const blocked = (['clean', 'join', 'load_report'] as const).filter((x) => t[x].status === 'upstream_failed');
  const status = t[task].status;
  return (
    <>
      {date(day)}: {task} is {hl(status === 'failed' ? 'bad' : status === 'success' ? 'ok' : '', status.replace('_', ' '))} after {plural(t[task].spans.length, 'attempt')} ({plural(retries, 'retry', 'retries')} allowed).
      {blocked.length > 0 ? <> {hl('orange wrap', `${blocked.join(' and ')} did not run: an upstream task failed`)}.</> : null} The report holds {hl(dayStatus(w, day) === 'ok' ? 'ok' : 'bad', plural(w.output[day], 'row'))} for that date against {w.source[day]} in the source.
    </>
  );
}

export function loadCaption(mode: Mode, w: World): ReactNode {
  const dup = Array.from({ length: DAYS }, (_, d) => d).filter((d) => dayStatus(w, d) === 'duplicated');
  const stale = Array.from({ length: DAYS }, (_, d) => d).filter((d) => dayStatus(w, d) === 'stale');
  const out = w.output.reduce((a, b) => a + b, 0);
  const src = w.source.reduce((a, b) => a + b, 0);
  return (
    <>
      {mode === 'append' ? 'Append' : 'Overwrite by date'}: the report holds {hl(dup.length > 0 ? 'bad' : 'ok', `${out} rows`)} for {src} in the source.{' '}
      {dup.length > 0 ? <>{hl('bad wrap', `${plural(dup.length, 'date')} duplicated by a rerun`)}.</> : <>No date is duplicated.</>}
      {stale.length > 0 && <> {hl('violet wrap', `${plural(stale.length, 'date')} still miss late rows`)} until that day is rerun.</>}
    </>
  );
}

export function shapeCaption(style: Style, changed: boolean): ReactNode {
  const r = rerunAfterRuleChange(style);
  if (!changed) return style === 'etl' ? <>ETL: the pipeline's own workers clean and join, and only the finished report is loaded.</> : <>ELT: raw tables are loaded first and the cleaning and joining run as queries inside the warehouse.</>;
  return (
    <>
      The cleaning rule changed. {style === 'etl' ? 'ETL kept nothing between steps, so it re-runs' : 'ELT keeps the raw and intermediate tables in the warehouse, so it re-runs'} {hl(style === 'etl' ? 'bad' : 'ok', plural(r.steps.length, 'step'))} ({r.steps.join(', ')}) and reads the source {hl(r.extractRuns > 0 ? 'bad' : 'ok', plural(r.extractRuns, 'time'))}.
    </>
  );
}

export function scheduleCaption(now: number, paused: boolean, catchup: boolean): ReactNode {
  const made = createdBy(now, paused, catchup);
  const latest = made.at(-1);
  return (
    <>
      {hourLabel(SCHEDULE_START, now)} UTC: {hl('', plural(made.length, 'run'))} created so far. {latest ? <>The latest is for logical date {logicalDate(latest.day)}, created {hourLabel(SCHEDULE_START, latest.at!)}: a run covers an interval that has already closed.</> : <>No interval has closed yet.</>}
      {paused && now >= PAUSE_TO && <> The pause ({hourLabel(SCHEDULE_START, PAUSE_FROM)} to {hourLabel(SCHEDULE_START, PAUSE_TO)}) {catchup ? 'was followed by a catch-up of every missed day' : 'was followed by one run, for the latest missed day'}.</>}
    </>
  );
}
