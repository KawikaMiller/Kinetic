import type { CSSProperties } from 'react';
import { barGeometry, domainFraction, ganttTicks, type Domain } from '../core/gantt';
import type { Tone } from '../core/tone';

export interface GanttLane {
  id: string;
  label: string;
}

export interface GanttBar {
  id: string;
  lane: string;
  start: number;
  end: number;
  /** Fill colour. No tone draws nothing but the plan ghost (a job not started yet). */
  tone?: Tone;
  /** Text inside the bar (best with size="md"). Also its tooltip and accessible name. */
  label?: string;
  /** work = solid (default), wait = hatched (ready but not running), blocked = dashed outline. */
  kind?: 'work' | 'wait' | 'blocked';
  /** 0..1: draw only this share of the bar, over a dashed ghost of the whole planned bar. */
  progress?: number;
  /** An outline in this tone (the critical path, the job being asked about). */
  ring?: Tone;
}

export interface GanttMarker {
  at: number;
  label: string;
  tone: Tone;
}

/**
 * Horizontal swim lanes on a shared time axis: one row per lane, bars from start to end,
 * an optional `now` cursor and labelled markers (first paint, a deadline). Positions are
 * percentages, so it stretches to its container; on a phone a lesson wraps it in
 * `WideRegion` when bars get too thin to read. Extracted from ci-pipelines' wall-clock
 * chart, which renders through it pixel-identically. Motion is CSS transitions only, so
 * prefers-reduced-motion (global.css) stills it.
 */
export function GanttLanes({
  lanes, bars, domain, now, markers = [], unit = '', axis = false, size = 'sm', labelWidth, onBarClick, ariaLabel, className = '',
}: {
  lanes: readonly GanttLane[];
  bars: readonly GanttBar[];
  /** The time span the track width covers. */
  domain: Domain;
  /** Where the cursor sits (omit for none). */
  now?: number;
  markers?: readonly GanttMarker[];
  /** Appended to axis tick labels: "ms", "s". */
  unit?: string;
  /** Draw a tick axis under the lanes. */
  axis?: boolean;
  /** sm: 12px tracks (dense); md: 20px tracks with room for bar labels. */
  size?: 'sm' | 'md';
  /** Lane label column width in px (default 92). */
  labelWidth?: number;
  onBarClick?: (id: string) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const style = labelWidth === undefined ? undefined : ({ '--gantt-label-w': `${labelWidth}px` } as CSSProperties);
  const at = (t: number) => `calc(var(--gantt-label-w) + (100% - var(--gantt-label-w)) * ${domainFraction(t, domain)})`;

  return (
    <div className={`gantt size-${size} ${className}`} style={style} role="group" aria-label={ariaLabel}>
      {markers.length > 0 && (
        <div className="gantt-row gantt-marker-row" aria-hidden="true">
          <span />
          <div className="gantt-marker-labels">
            {markers.map((m, i) => (
              <span key={i} className={`gantt-marker-label tone-${m.tone}`} style={{ left: `${domainFraction(m.at, domain) * 100}%` }}>
                {m.label}
              </span>
            ))}
          </div>
        </div>
      )}
      {lanes.map((lane) => (
        <div key={lane.id} className="gantt-row">
          <span className="gantt-row-label">{lane.label}</span>
          <div className="gantt-track">
            {bars
              .filter((b) => b.lane === lane.id)
              .map((b) => (
                <Bar key={b.id} bar={b} domain={domain} onClick={onBarClick} />
              ))}
          </div>
        </div>
      ))}
      {axis && (
        <div className="gantt-row gantt-axis" aria-hidden="true">
          <span />
          <div className="gantt-axis-track">
            {ganttTicks(domain).map((t) => (
              <span key={t.value} className="gantt-tick" style={{ left: `${t.at}%` }}>
                {t.value}
                {unit}
              </span>
            ))}
          </div>
        </div>
      )}
      {markers.map((m, i) => (
        <div key={i} className={`gantt-marker tone-${m.tone}`} style={{ left: at(m.at) }} />
      ))}
      {now !== undefined && <div className="gantt-now" style={{ left: at(now) }} />}
    </div>
  );
}

function Bar({ bar: b, domain, onClick }: { bar: GanttBar; domain: Domain; onClick?: (id: string) => void }) {
  const g = barGeometry(b.start, b.end, domain, b.progress ?? 1);
  const classes = ['gantt-bar', b.tone && `tone-${b.tone}`, `is-${b.kind ?? 'work'}`, b.ring && 'is-ring'].filter(Boolean).join(' ');
  const style = {
    left: `${g.left}%`,
    width: `${g.shown}%`,
    ...(b.ring ? { '--gantt-ring': `var(--${b.ring})` } : {}),
  } as CSSProperties;
  const content = b.label && <span className="gantt-bar-label">{b.label}</span>;
  return (
    <>
      {b.progress !== undefined && <span className="gantt-plan" style={{ left: `${g.left}%`, width: `${g.full}%` }} />}
      {onClick ? (
        <button type="button" className={classes} style={style} title={b.label} aria-label={b.label ?? b.id} onClick={() => onClick(b.id)}>
          {content}
        </button>
      ) : (
        <span className={classes} style={style} title={b.label}>
          {content}
        </span>
      )}
    </>
  );
}
