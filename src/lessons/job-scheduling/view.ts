/**
 * Drawings and log rows for the queue and cron scenes, read from a finished run. Pure, so a test can pin a
 * bar's tone or a log row's text against the model's own records. Gantt times are seconds (queue) or hours (cron).
 */
import type { GanttBar, GanttLane } from '../../components/GanttLanes';
import type { LogRow } from '../../components/logRows';
import { DAY_HOURS, DAY_MS, HOUR_MS, MIN_MS, MISS_AFTER_MS, REPLICA_IDS, type RunRow, type SchedRun } from './sched';
import { FX, QUEUE, W1, W2, retryTimes, type QueueRun, type Run } from './queue';

const sec = (ms: number) => ms / 1000;
const pad = (n: number) => String(n).padStart(2, '0');

/** "02:58" for a simulated time: one cron minute is one simulated second, so 178,000 ms is 02:58. */
export const clockLabel = (ms: number) => `${pad(Math.floor(ms / HOUR_MS))}:${pad(Math.floor((ms % HOUR_MS) / MIN_MS))}`;

/* ---------- the queue scene ---------- */

export const QUEUE_LANES: GanttLane[] = [
  { id: W1, label: 'worker 1' },
  { id: W2, label: 'worker 2' },
  { id: QUEUE, label: 'queue' },
];

export const RUN_TONE: Record<Run['outcome'], GanttBar['tone']> = { running: 'hi', ok: 'ok', dup: 'bad', noop: 'dim', failed: 'orange', killed: 'dim' };
const RUN_WORD: Record<Run['outcome'], string> = { running: 'running', ok: 'done', dup: 'ran again, effect applied twice', noop: 'ran again, no-op', failed: 'failed', killed: 'worker died' };

export const runLabel = (r: Run) => `job ${r.job}, attempt ${r.attempt}: ${RUN_WORD[r.outcome]}`;

export function queueBars(run: QueueRun): GanttBar[] {
  const bars: GanttBar[] = run.runs.map((r, i) => ({
    id: `run-${i}`,
    lane: r.worker,
    start: sec(r.start),
    end: sec(r.end ?? run.end),
    tone: RUN_TONE[r.outcome],
    kind: r.outcome === 'killed' ? 'blocked' : 'work',
    label: `J${r.job}`,
    minPx: 8,
  }));
  run.events.forEach((e, i) => {
    if (e.kind === 'visible') bars.push({ id: `ev-${i}`, lane: QUEUE, start: sec(e.at), end: sec(e.at), tone: 'info', label: `J${e.job} visible again` });
    if (e.kind === 'retry') bars.push({ id: `ev-${i}`, lane: QUEUE, start: sec(e.at), end: sec(e.at), tone: 'orange', label: `retry J${e.job}` });
    if (e.kind === 'dlq') bars.push({ id: `ev-${i}`, lane: QUEUE, start: sec(e.at), end: sec(e.at), tone: 'violet', label: `J${e.job} to DLQ` });
  });
  return bars;
}

export const queueDomainS = (run: QueueRun) => Math.max(8, Math.ceil(sec(run.end) + 1));

export function queueLog(run: QueueRun, nowMs: number): LogRow[] {
  const rows: (LogRow & { t: number })[] = [];
  run.events.forEach((e, i) => {
    const text =
      e.kind === 'dispatch' ? `handed job ${e.job} out (attempt ${e.attempt}) and hid it` :
      e.kind === 'done' ? `job ${e.job} acknowledged: done` :
      e.kind === 'visible' ? `no ack for job ${e.job} in time: it is visible again` :
      e.kind === 'retry' ? `job ${e.job} failed: retry in ${sec(e.delayMs ?? 0).toFixed(2)} s` :
      `job ${e.job} used its ${e.attempt} attempts: dead-letter queue`;
    rows.push({ t: e.at, id: `${run.setup.seed}:q${i}`, at: `${sec(e.at).toFixed(2)} s`, source: 'queue', sourceTone: 'info', tone: e.kind === 'dlq' ? 'violet' : e.kind === 'retry' ? 'orange' : undefined, text });
  });
  for (const f of run.effects) {
    rows.push({
      t: f.at,
      id: `${run.setup.seed}:e${f.id}`,
      at: `${sec(f.at).toFixed(2)} s`,
      source: FX,
      sourceTone: 'violet',
      tone: f.applied && f.repeat ? 'bad' : undefined,
      text: f.applied ? `job ${f.job} took effect${f.repeat ? ' AGAIN: applied twice' : ''}` : `job ${f.job} ignored: its idempotency key was seen`,
    });
  }
  return rows.filter((r) => r.t <= nowMs).sort((a, b) => a.t - b.t).map(({ t: _t, ...row }) => row);
}

/* ---------- the cron scene ---------- */

export const SCHED_LANES: GanttLane[] = [...REPLICA_IDS.map((id) => ({ id, label: `replica ${id}` })), { id: 'job', label: 'the job' }];

const hours = (ms: number) => ms / HOUR_MS;

function rowTone(r: RunRow): GanttBar['tone'] {
  if (r.duplicate) return 'bad';
  if (r.reason === 'unique key') return 'violet';
  return 'ok';
}
export const rowWord = (r: RunRow) => (r.duplicate ? 'ran it AGAIN' : r.reason === 'unique key' ? 'turned away by the unique key' : r.reason === 'stale token' ? 'rejected: stale token' : 'ran it');

export function schedBars(run: SchedRun): GanttBar[] {
  const bars: GanttBar[] = [];
  run.grants.forEach((g, i) => bars.push({ id: `lead-${i}`, lane: g.to, start: hours(g.at), end: hours(g.until ?? DAY_MS), tone: 'info', label: `leader, token ${g.token}`, minPx: 6 }));
  if (run.pause) bars.push({ id: 'pause', lane: 'r1', start: hours(run.pause.from), end: hours(run.pause.to), tone: 'orange', kind: 'wait', label: 'paused' });
  if (run.crashedAt !== null) bars.push({ id: 'crash', lane: 'r1', start: hours(run.crashedAt), end: DAY_HOURS, tone: 'dim', kind: 'blocked', label: 'killed' });
  for (const r of run.rows) {
    const tone = rowTone(r);
    bars.push({ id: `row-${r.id}`, lane: r.by, start: hours(r.at), end: hours(r.at), tone, label: r.duplicate || r.reason !== 'applied' ? `${clockLabel(r.fire * HOUR_MS)} ${rowWord(r)}` : undefined });
    if (r.applied) bars.push({ id: `fx-${r.id}`, lane: 'job', start: hours(r.at), end: hours(r.at), tone: r.duplicate ? 'bad' : 'ok' });
  }
  for (const k of run.missed) bars.push({ id: `miss-${k}`, lane: 'job', start: hours(k * HOUR_MS), end: hours(k * HOUR_MS + MISS_AFTER_MS), tone: 'bad', kind: 'wait', label: `${clockLabel(k * HOUR_MS)} missed`, minPx: 8 });
  return bars;
}

export function schedLog(run: SchedRun, nowMs: number): LogRow[] {
  return run.rows
    .filter((r) => r.at <= nowMs)
    .map((r) => ({
      id: `${run.setup.seed}:${r.id}`,
      at: clockLabel(r.at),
      source: r.by,
      sourceTone: 'info' as const,
      tone: r.duplicate ? ('bad' as const) : r.reason === 'unique key' ? ('violet' as const) : undefined,
      text: `${clockLabel(r.fire * HOUR_MS)} fire: ${rowWord(r)}${r.token > 0 ? ` (token ${r.token})` : ''}`,
    }));
}

/** The retry panel: thirty jobs fail together and retry three times each. */
export const STORM_JOBS = 30;
export const STORM_RETRIES = 3;
export const STORM_BIN_MS = 250;

/** Every retry time of the storm, and the most that land in one quarter second. */
export function stormPeak(o: { baseMs: number; capMs: number; jitter: boolean; seed: number }): { times: number[]; peak: number } {
  const times = retryTimes({ jobs: STORM_JOBS, retries: STORM_RETRIES, ...o });
  const counts = new Map<number, number>();
  for (const t of times) counts.set(Math.floor(t / STORM_BIN_MS), (counts.get(Math.floor(t / STORM_BIN_MS)) ?? 0) + 1);
  return { times, peak: Math.max(...counts.values()) };
}
