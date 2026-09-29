import { motion } from 'motion/react';
import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Controls, Legend, Segmented, Stat, Stats } from '../../components/ui';
import type { Frame } from '../../core/types';
import { usePlayer } from '../../core/usePlayer';
import {
  alertFor, BACKGROUND, backgroundBurn, badMinutes, budgetMinutes, fmtMinutes, incidentBadMinutes, INCIDENTS, policyFor,
  SLOS, WINDOW_DAYS, type Policy, type Slo,
} from './model';
import './styles.css';

interface SloFrame extends Frame {
  t: number;
}

const STEP = 0.5; // days per frame
const fmtBurn = (b: number) => `${b < 10 ? +b.toFixed(1) : Math.round(b).toLocaleString()}×`;

function buildFrames(slo: Slo): SloFrame[] {
  const budget = budgetMinutes(slo);
  const frames: SloFrame[] = [];
  const bgBurn = backgroundBurn(slo);
  let crossedHalf = false;
  let crossedZero = false;

  for (let t = 0; t <= WINDOW_DAYS + 1e-9; t += STEP) {
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
      while (at < t && badMinutes(at) < budget) at += 1 / 1440; // find the minute it ran out
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
    } else if (t > 0 && frames[frames.length - 1]?.say !== undefined && !INCIDENTS.some((i) => i.start <= t && t < i.start + i.durMin / 1440)) {
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

// Chart geometry
const W = 600;
const H = 270;
const X0 = 50;
const X1 = W - 14;
const Y_TOP = 18;
const Y_BOT = H - 26;
const MIN_PCT = -100;
const x = (day: number) => X0 + (day / WINDOW_DAYS) * (X1 - X0);
const y = (pct: number) => Y_TOP + ((100 - Math.max(MIN_PCT, pct)) / (100 - MIN_PCT)) * (Y_BOT - Y_TOP);

const POLICY: Record<Policy, { label: string; text: string; cls: string }> = {
  ship: { label: 'Ship freely', text: 'Budget left: release features at normal speed.', cls: 'ok' },
  care: { label: 'Ship with care', text: 'Under 50% left: smaller rollouts, extra review.', cls: 'hi' },
  freeze: { label: 'Feature freeze', text: 'Budget spent: only reliability fixes until it recovers.', cls: 'bad' },
};

export function Stage() {
  const [slo, setSlo] = useState<Slo>(99.9);
  const frames = useMemo(() => buildFrames(slo), [slo]);
  const player = usePlayer(frames, { interval: 380 });
  const t = player.frame.t;
  const budget = budgetMinutes(slo);
  const used = badMinutes(t);
  const remainingPct = (1 - used / budget) * 100;
  const policy = POLICY[policyFor(remainingPct)];

  const path = useMemo(() => {
    const pts: string[] = [];
    for (let d = 0; d <= t + 1e-9; d += 0.02) pts.push(`${x(d).toFixed(1)},${y((1 - badMinutes(d) / budget) * 100).toFixed(1)}`);
    pts.push(`${x(t).toFixed(1)},${y(remainingPct).toFixed(1)}`);
    return `M ${pts.join(' L ')}`;
  }, [t, budget, remainingPct]);

  const alerts = INCIDENTS.map((inc) => ({ inc, a: alertFor(inc, slo) }));
  const fired = alerts.filter(({ inc }) => inc.start <= t);
  const pages = fired.filter(({ a }) => a.kind === 'page').length;
  const tickets = fired.filter(({ a }) => a.kind === 'ticket').length + (backgroundBurn(slo) >= 1 && t > 3 ? 1 : 0);

  return (
    <StageFrame
      player={player}
      height={440}
      stats={
        <Stats>
          <Stat label="SLO" value={`${slo}%`} sub="30-day window" />
          <Stat label="Error budget" value={fmtMinutes(budget)} color="var(--info)" />
          <Stat label="Spent" value={fmtMinutes(used)} color="var(--hi)" sub={`day ${t.toFixed(1)}`} />
          <Stat label="Remaining" value={`${Math.round(remainingPct).toLocaleString()}%`} color={remainingPct <= 0 ? 'var(--bad)' : remainingPct <= 50 ? 'var(--hi)' : 'var(--ok)'} />
          <Stat label="Alerts" value={`${pages} 🔔 · ${tickets} 🎫`} sub="pages · tickets" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'budget remaining', shape: 'line' },
            { color: 'var(--faint)', label: 'steady 1× burn', shape: 'line' },
            { color: 'var(--bad)', label: 'page (fast burn)', shape: 'dot' },
            { color: 'var(--hi)', label: 'ticket (slow burn)', shape: 'dot' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented
            label="SLO target (30 days)"
            value={String(slo)}
            onChange={(v) => setSlo(Number(v) as Slo)}
            options={SLOS.map((s) => ({ value: String(s), label: `${s}%` }))}
          />
        </Controls>
      }
    >
      <div className="slo">
        <div className="slo-chart-wrap">
          <svg className="slo-chart" viewBox={`0 0 ${W} ${H + 92}`}>
            {/* policy bands */}
            <rect x={X0} y={y(100)} width={X1 - X0} height={y(50) - y(100)} className="slo-band ok" />
            <rect x={X0} y={y(50)} width={X1 - X0} height={y(0) - y(50)} className="slo-band hi" />
            <rect x={X0} y={y(0)} width={X1 - X0} height={y(MIN_PCT) - y(0)} className="slo-band bad" />
            {[100, 50, 0, -50, -100].map((p) => (
              <g key={p}>
                <line x1={X0} x2={X1} y1={y(p)} y2={y(p)} className={`slo-grid ${p === 0 ? 'zero' : ''}`} />
                <text x={X0 - 8} y={y(p) + 4} textAnchor="end" className="slo-axis">
                  {p}%
                </text>
              </g>
            ))}
            {[0, 5, 10, 15, 20, 25, 30].map((d) => (
              <text key={d} x={x(d)} y={Y_BOT + 16} textAnchor="middle" className="slo-axis">
                day {d}
              </text>
            ))}
            <line x1={x(0)} y1={y(100)} x2={x(30)} y2={y(0)} className="slo-ideal" />
            <text x={x(30)} y={y(0) - 8} textAnchor="end" className="slo-ideal-label">
              1× burn: budget lasts exactly 30 days
            </text>
            <path d={path} className="slo-line" />
            <motion.circle
              r={5}
              className="slo-dot"
              initial={false}
              animate={{ cx: x(t), cy: y(remainingPct) }}
              transition={{ duration: 0.3 }}
            />

            {/* incident strip */}
            <g transform={`translate(0, ${H + 12})`}>
              <line x1={X0} x2={X1} y1={42} y2={42} className="slo-grid" />
              {alerts.map(({ inc, a }, idx) => {
                const on = inc.start <= t;
                const w = Math.max(5, x(inc.start + inc.durMin / 1440) - x(inc.start));
                return (
                  <g key={inc.id} className={`slo-inc ${on ? 'on' : ''}`}>
                    <rect x={x(inc.start)} y={35} width={w} height={14} rx={3} fill={inc.color} />
                    {on && a.kind && (
                      <text x={x(inc.start) + w / 2} y={68} textAnchor="middle" className={`slo-alert ${a.kind}`}>
                        {a.kind === 'page' ? '🔔 page' : '🎫 ticket'}
                      </text>
                    )}
                    <text x={x(inc.start) + w / 2} y={idx % 2 ? 28 : 13} textAnchor="middle" className="slo-inc-label">
                      {inc.name}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        <aside className="slo-side">
          <div className={`slo-policy ${policy.cls}`}>
            <span>Release policy</span>
            <motion.b key={policy.label} initial={{ scale: 1.15, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              {policy.label}
            </motion.b>
            <p>{policy.text}</p>
          </div>
          <table className="slo-nines">
            <thead>
              <tr>
                <th>SLO</th>
                <th>budget / 30 days</th>
              </tr>
            </thead>
            <tbody>
              {SLOS.map((s) => (
                <tr key={s} className={s === slo ? 'on' : ''} onClick={() => setSlo(s)}>
                  <td>{s}%</td>
                  <td>
                    <span className="slo-bar" style={{ width: `${Math.max(2, (budgetMinutes(s) / budgetMinutes(99)) * 100)}%` }} />
                    {fmtMinutes(budgetMinutes(s))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="slo-sli">
            <b>SLI</b> = good requests ÷ total requests. The SLO is the target for it; the budget is everything above the target.
          </p>
        </aside>
      </div>
    </StageFrame>
  );
}
