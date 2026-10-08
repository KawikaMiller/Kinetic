import type { GanttBar } from '../../components/GanttLanes';
import type { Tone } from '../../core/tone';
import type { Attempt, ChainRun, HopRun, Outcome, RetryRun } from './model';

/** A refused hop did no work; this thin stand-in bar is where the eye finds its "deadline exceeded". */
export const REFUSED_BAR = 0.03;

const RING: Partial<Record<Outcome, Tone>> = { timeout: 'bad', error: 'bad', deadline: 'orange' };
export const OUTCOME_LABEL: Record<Outcome, string> = { ok: 'ok', timeout: 'timeout', error: 'error', deadline: 'deadline', idle: 'not called' };

/**
 * One hop's bars at time `now`: the work somebody still wanted (info), then the work after
 * nobody was waiting (bad), cut off at `now`. A hop that has finished gets its outcome as a
 * ring and a label; B's wait in its queue is its own hatched bar.
 */
export function hopBars(h: HopRun, now: number): GanttBar[] {
  const bars: GanttBar[] = [];
  if (!h.reached) return bars;
  if (h.start > h.arrive && now > h.arrive) {
    bars.push({ id: `${h.id}-queue`, lane: h.id, start: h.arrive, end: Math.min(h.start, now), tone: 'violet', kind: 'wait', label: 'queue' });
  }
  if (now <= h.start) return bars;
  const finished = now >= h.finish;
  const ring = finished ? RING[h.outcome] : undefined;
  const label = finished ? OUTCOME_LABEL[h.outcome] : undefined;
  if (h.refused) {
    bars.push({ id: `${h.id}-refused`, lane: h.id, start: h.start, end: h.start + REFUSED_BAR, tone: 'orange', ring });
    return bars;
  }
  const end = Math.min(h.finish, now);
  const split = Math.min(Math.max(h.start, h.usefulUntil), end);
  const wantedBar: GanttBar = { id: `${h.id}-work`, lane: h.id, start: h.start, end: split, tone: 'info' };
  const orphanBar: GanttBar = { id: `${h.id}-orphan`, lane: h.id, start: split, end, tone: 'bad' };
  const hasWanted = split > h.start;
  const hasOrphan = end > split;
  if (hasWanted) bars.push(hasOrphan ? wantedBar : { ...wantedBar, ring, label });
  if (hasOrphan) bars.push({ ...orphanBar, ring, label: hasWanted ? undefined : label });
  return bars;
}

export const chainBars = (run: ChainRun, now: number): GanttBar[] => run.hops.flatMap((h) => hopBars(h, now));

/** The attempts of a retry strategy as bars: the part before the deadline, the part after it, and a thin orange bar where a retry was refused. */
export function attemptBars(run: RetryRun, deadline: number): GanttBar[] {
  const refused: GanttBar[] = run.refused
    ? [{ id: `${run.strategy}-refused`, lane: run.strategy, start: run.finish, end: run.finish + REFUSED_BAR, tone: 'orange' }]
    : [];
  return [...run.attempts.flatMap((a: Attempt): GanttBar[] => {
    const lane = run.strategy;
    const ring: Tone | undefined = a.outcome === 'timeout' ? 'bad' : undefined;
    const label = `try ${a.n}`;
    if (a.end <= deadline) return [{ id: `${lane}-${a.n}`, lane, start: a.start, end: a.end, tone: 'info', ring, label }];
    if (a.start >= deadline) return [{ id: `${lane}-${a.n}`, lane, start: a.start, end: a.end, tone: 'bad', ring, label }];
    return [
      { id: `${lane}-${a.n}`, lane, start: a.start, end: deadline, tone: 'info', label },
      { id: `${lane}-${a.n}-late`, lane, start: deadline, end: a.end, tone: 'bad', ring },
    ];
  }), ...refused];
}
