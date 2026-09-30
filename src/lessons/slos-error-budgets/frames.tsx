import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';
import {
  alertFor, BACKGROUND, backgroundBurn, badMinutes, budgetMinutes, fmtMinutes, incidentBadMinutes, INCIDENTS, MIN_PER_DAY,
  WINDOW_DAYS, type Slo,
} from './model';

export interface SloFrame extends Frame {
  t: number;
}

/** Days per frame. */
const STEP = 0.5;
/** Float slack so the loop still reaches day 30 exactly. */
const EPSILON = 1e-9;

const fmtBurn = (b: number) => `${b < 10 ? +b.toFixed(1) : Math.round(b).toLocaleString()}×`;

/** One frame per half day of the 30-day window, narrating incidents, alerts and budget milestones. */
export function buildFrames(slo: Slo): SloFrame[] {
  const budget = budgetMinutes(slo);
  const frames: SloFrame[] = [];
  const bgBurn = backgroundBurn(slo);
  let crossedHalf = false;
  let crossedZero = false;

  for (let t = 0; t <= WINDOW_DAYS + EPSILON; t += STEP) {
    const f: SloFrame = { t };
    const prev = t - STEP;
    const started = INCIDENTS.filter((i) => i.start > prev && i.start <= t);
    const remaining = 1 - badMinutes(t) / budget;
    const notes: ReactNode[] = [];

    if (t === 0) {
      f.say = (
        <>
          SLO <b>{slo}%</b> over {WINDOW_DAYS} days allows <span className="hl">{fmtMinutes(budget)}</span> of failure: your{' '}
          <b>error budget</b>.{' '}
          {bgBurn >= 1 && <>Even the normal 0.01% background error rate burns it at <span className="hl bad">{bgBurn.toFixed(1)}×</span>.</>}
        </>
      );
      f.hold = 2;
    }
    for (const inc of started) {
      const a = alertFor(inc, slo);
      const bad = incidentBadMinutes(inc);
      notes.push(
        <span key={inc.id}>
          <b>{inc.name}</b>: {+(inc.err * 100).toFixed(2)}% failing for {fmtMinutes(inc.durMin)} → burns{' '}
          <span className="hl bad">{fmtMinutes(bad)}</span> ({((bad / budget) * 100).toFixed(0)}% of budget), burn rate{' '}
          {fmtBurn((inc.err + BACKGROUND) / (1 - slo / 100))}.{' '}
          {a.kind === 'page' ? <span className="hl bad">🔔 Page</span> : a.kind === 'ticket' ? <span className="hl">🎫 Ticket</span> : <span className="hl ok">no alert</span>}
        </span>,
      );
    }
    if (!crossedHalf && remaining <= 0.5) {
      crossedHalf = true;
      if (remaining > 0) notes.push(<span key="half"> Half the budget is gone: <b>ship with care</b>.</span>);
    }
    if (!crossedZero && remaining <= 0) {
      crossedZero = true;
      let at = Math.max(0, prev);
      while (at < t && badMinutes(at) < budget) at += 1 / MIN_PER_DAY; // find the minute it ran out
      notes.push(
        <span key="zero">
          {' '}
          <span className="hl bad">Budget exhausted</span> on day {Math.floor(at)}. Policy: <b>freeze</b> features, fix reliability.
        </span>,
      );
    }
    if (notes.length) {
      f.say = <>{notes}</>;
      f.hold = 2.5;
    } else if (t > 0 && frames[frames.length - 1]?.say !== undefined && !INCIDENTS.some((i) => i.start <= t && t < i.start + i.durMin / MIN_PER_DAY)) {
      // First calm frame after an event: replace its caption so it doesn't linger for days.
      f.say = (
        <>
          Quiet stretch, no incidents. Only the background error rate is burning budget ({fmtBurn(bgBurn)}).
          {remaining > 0 ? <> {Math.round(remaining * 100)}% of the budget left.</> : <> The budget is already spent.</>}
        </>
      );
    }
    frames.push(f);
  }

  const last = frames[frames.length - 1];
  const used = badMinutes(WINDOW_DAYS);
  last.say = (
    <>
      Month over: spent <b>{fmtMinutes(used)}</b> of a {fmtMinutes(budget)} budget (
      <span className={`hl ${used > budget ? 'bad' : 'ok'}`}>{((used / budget) * 100).toFixed(0)}%</span>). Same incidents, different
      SLO, completely different month. Try another target.
    </>
  );
  last.hold = 3;
  return frames;
}
