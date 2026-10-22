import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';
import {
  alertFor, alertReason, backgroundBurn, badMinutes, budgetMinutes, exhaustionDay, fmtBurn, fmtMinutes, incidentBadMinutes, INCIDENTS,
  MIN_PER_DAY, WINDOW_DAYS, type Incident, type Slo,
} from './model';

export interface SloFrame extends Frame {
  t: number;
}

/** Days per frame. */
const STEP = 0.5;
/** Float slack so the loop still reaches day 30 exactly. */
const EPSILON = 1e-9;

const endDay = (inc: Incident) => inc.start + inc.durMin / MIN_PER_DAY;
const isOngoing = (inc: Incident, t: number) => inc.start <= t && t < endDay(inc);

/** The caption of a day where an incident started: its cost and why it did or did not alert. */
function incidentNote(inc: Incident, slo: Slo, budget: number): ReactNode {
  const a = alertFor(inc, slo);
  const bad = incidentBadMinutes(inc);
  return (
    <span key={inc.id}>
      <b>{inc.name}</b>: {+(inc.err * 100).toFixed(2)}% failing for {fmtMinutes(inc.durMin)} → burns{' '}
      <span className="hl bad">{fmtMinutes(bad)}</span> ({((bad / budget) * 100).toFixed(0)}% of budget).{' '}
      {a.kind === 'page' ? <span className="hl bad">🔔 Page</span> : a.kind === 'ticket' ? <span className="hl">🎫 Ticket</span> : <span className="hl ok">No alert</span>}
      : {alertReason(a)}.
    </span>
  );
}

/**
 * One frame per half day of the 30-day window, narrating incidents, alerts and budget milestones.
 * A frame without `say` keeps the previous caption, so a caption about an incident is replaced once every
 * incident it describes has ended; no caption quotes a number that moves while the replay runs.
 */
export function buildFrames(slo: Slo): SloFrame[] {
  const budget = budgetMinutes(slo);
  const frames: SloFrame[] = [];
  const bgBurn = backgroundBurn(slo);
  let crossedHalf = false;
  let crossedZero = false;
  /** The incidents the caption on screen is about. */
  let describes: Incident[] = [];

  for (let t = 0; t <= WINDOW_DAYS + EPSILON; t += STEP) {
    const f: SloFrame = { t };
    const prev = t - STEP;
    const started = INCIDENTS.filter((i) => i.start > prev && i.start <= t);
    const remaining = 1 - badMinutes(t) / budget;
    const notes: ReactNode[] = started.map((inc) => incidentNote(inc, slo, budget));

    if (t === 0) {
      f.say = (
        <>
          SLO <b>{slo}%</b> over {WINDOW_DAYS} days allows <span className="hl">{fmtMinutes(budget)}</span> of failure: your{' '}
          <b>error budget</b>. The normal 0.01% background error rate burns it at{' '}
          <span className={`hl ${bgBurn >= 1 ? 'bad' : ''}`}>{fmtBurn(bgBurn)}</span>.
        </>
      );
      f.hold = 2;
    }
    if (!crossedHalf && remaining <= 0.5) {
      crossedHalf = true;
      if (remaining > 0) notes.push(<span key="half"> Half the budget is gone: <b>ship with care</b>.</span>);
    }
    if (!crossedZero && remaining <= 0) {
      crossedZero = true;
      const day = exhaustionDay(slo);
      notes.push(
        <span key="zero">
          {' '}
          <span className="hl bad">Budget exhausted</span> on day {day === null ? WINDOW_DAYS : Math.floor(day)}. Policy: <b>freeze</b> features, fix reliability.
        </span>,
      );
    }

    if (notes.length) {
      f.say = <>{notes}</>;
      f.hold = 2.5;
      describes = started;
    } else if (describes.length && !INCIDENTS.some((inc) => isOngoing(inc, t))) {
      // The incidents the caption is about have ended and none is running: replace it so it doesn't linger for days.
      f.say = (
        <>
          Quiet stretch: no incident is running, so only the background error rate is burning budget ({fmtBurn(bgBurn)}). The
          Remaining stat shows what is left.
        </>
      );
      describes = [];
    }
    frames.push(f);
  }

  const last = frames[frames.length - 1];
  const used = badMinutes(WINDOW_DAYS);
  last.say = (
    <>
      Month over: spent <b>{fmtMinutes(used)}</b> of a {fmtMinutes(budget)} budget (
      <span className={`hl ${used > budget ? 'bad' : 'ok'}`}>{((used / budget) * 100).toFixed(0)}%</span>). Same incidents, different
      SLO, different month. Try another target.
    </>
  );
  last.hold = 3;
  return frames;
}
