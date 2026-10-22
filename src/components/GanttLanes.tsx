import { useLayoutEffect, useRef, type CSSProperties, type RefObject } from 'react';
import { plural } from '../core/format';
import {
  barGeometry, barInDomain, calendarTicks, domainFraction, ganttTicks, INSTANT_GAP_PX, INSTANT_SIZE_PX, instantX, isInstant, placeInstantLabels, spreadLabels,
  type CalendarAxis, type Domain, type InstantLabelPlace,
} from '../core/gantt';
import type { Tone } from '../core/tone';
import { useMeasure } from '../core/useMeasure';

export interface GanttLane {
  id: string;
  label: string;
}

export interface GanttBar {
  id: string;
  lane: string;
  /** `start === end` is an instant (a deploy, a page, a syscall): with a `tone` it draws a diamond with its `label` beside it. */
  start: number;
  end: number;
  /** Fill colour. No tone draws nothing but the plan ghost (a job not started yet). */
  tone?: Tone;
  /** Text inside the bar (best with size="md"). Also its tooltip and accessible name. */
  label?: string;
  /**
   * work = solid (default): running. wait = hatched: ready and able to run, but waiting its turn
   * (a ready queue). blocked = dashed outline: can't run until something else happens (I/O, a
   * lock, a timer). A thread waiting for a disk read is `blocked`, not `wait`.
   */
  kind?: 'work' | 'wait' | 'blocked';
  /** 0..1: draw only this share of the bar, over a dashed ghost of the whole planned bar. */
  progress?: number;
  /** An outline in this tone (the critical path, the job being asked about). */
  ring?: Tone;
  /**
   * Bars with the same motionId are one thing in different places: when one appears (a new
   * bar, or a bar moved to another lane) it glides in from where that id was last drawn,
   * e.g. a meeting sliding down into the "booked" lane.
   */
  motionId?: string;
  /**
   * Draw it at least this many px wide, from its start, so a very short span (a 20 µs deopt
   * on a millisecond axis) stays visible; its tooltip and name still say how long it really was.
   */
  minPx?: number;
}

/** How long a bar with a motionId takes to glide to its new place. */
const GLIDE_MS = 450;

/** A calendar tick label ("Mon 12 Oct") needs about this much track, px, so a narrow track gets fewer ticks. */
const CALENDAR_TICK_PX = 84;
const MIN_CALENDAR_TICKS = 2;
const MAX_CALENDAR_TICKS = 6;

/** Space kept between neighbouring marker labels, px. */
const MARKER_LABEL_GAP = 4;

export interface GanttMarker {
  at: number;
  label: string;
  tone: Tone;
}

/**
 * Horizontal swim lanes on a shared time axis: one row per lane, bars from start to end,
 * an optional `now` cursor and labelled markers (first paint, a deadline; labels of markers
 * close together are nudged apart, core/gantt spreadLabels). Positions are
 * percentages, so it stretches to its container; on a phone a lesson wraps it in
 * `WideRegion` when bars get too thin to read. Extracted from ci-pipelines' wall-clock
 * chart, which renders through it pixel-identically. Motion is CSS transitions, plus the
 * motionId glide; prefers-reduced-motion (global.css) stills the transitions and the glide is
 * skipped too.
 */
export function GanttLanes({
  lanes, bars, domain, now, markers = [], unit = '', axis = false, hideEmptyLanes = false, size = 'sm', labelWidth, labelMinPx, onBarClick, ariaLabel, className = '',
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
  /**
   * Draw a tick axis under the lanes. `{ calendar: { start, unit } }` makes it a calendar: the domain is then
   * hours since `start` (an ISO instant with a zone) and the ticks are "Mon 09:00" (hour) or "Mon 12 Oct" (day, week)
   * on every boundary, in UTC, which the axis says on screen.
   */
  axis?: boolean | { calendar: CalendarAxis };
  /** Leave out lanes with no bar inside the domain, and say which on a line under the chart. */
  hideEmptyLanes?: boolean;
  /** sm: 12px tracks (dense); md: 20px tracks with room for bar labels. */
  size?: 'sm' | 'md';
  /** Lane label column width in px (default 92). */
  labelWidth?: number;
  /** Bars narrower than this (in px, as drawn) drop their label instead of showing a clipped one; it stays the tooltip and name. */
  labelMinPx?: number;
  onBarClick?: (id: string) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const style = labelWidth === undefined ? undefined : ({ '--gantt-label-w': `${labelWidth}px` } as CSSProperties);
  const at = (t: number) => `calc(var(--gantt-label-w) + (100% - var(--gantt-label-w)) * ${domainFraction(t, domain)})`;
  const root = useRef<HTMLDivElement>(null);
  // Real widths: the track (for labelMinPx) and each marker label (to keep close markers' labels apart).
  const measured = useMeasure(root, (el) => ({
    track: el.querySelector<HTMLElement>('.gantt-track, .gantt-marker-labels')?.clientWidth ?? 0,
    labels: [...el.querySelectorAll<HTMLElement>('.gantt-marker-label')].map((l) => l.offsetWidth),
    instantLabels: [...el.querySelectorAll<HTMLElement>('.gantt-instant-label')].map((l) => l.offsetWidth),
  }));
  const trackPx = measured?.track ?? 0;
  const shift = measured && measured.labels.length === markers.length
    ? spreadLabels(markers.map((m, i) => ({ x: domainFraction(m.at, domain) * trackPx, w: measured.labels[i] })), MARKER_LABEL_GAP)
    : markers.map(() => 0);
  const shownLanes = hideEmptyLanes ? lanes.filter((l) => bars.some((b) => b.lane === l.id && barInDomain(b.start, b.end, domain))) : lanes;
  const hiddenLanes = lanes.filter((l) => !shownLanes.includes(l));
  const instantPlaces = placeInstants(shownLanes, bars, domain, trackPx, measured?.instantLabels);
  useGlide(root);
  const showLabel = (b: GanttBar) => labelMinPx === undefined || !trackPx || (barGeometry(b.start, b.end, domain, b.progress ?? 1).shown / 100) * trackPx >= labelMinPx;
  const calendar = typeof axis === 'object' ? axis.calendar : undefined;
  const calendarTickCount = trackPx ? Math.max(MIN_CALENDAR_TICKS, Math.min(MAX_CALENDAR_TICKS, Math.floor(trackPx / CALENDAR_TICK_PX))) : MAX_CALENDAR_TICKS;
  const ticks = axis ? (calendar ? calendarTicks(domain, calendar, calendarTickCount) :ganttTicks(domain).map((t) => ({ ...t, label: `${t.value}${unit}` }))) : [];

  const chart = (
    <div ref={root} className={`gantt size-${size} ${markers.length ? 'has-markers' : ''} ${axis ? 'has-axis' : ''} ${className}`} style={style} role="group" aria-label={ariaLabel}>
      {markers.length > 0 && (
        <div className="gantt-row gantt-marker-row" aria-hidden="true">
          <span />
          <div className="gantt-marker-labels">
            {markers.map((m, i) => (
              <span
                key={i}
                className={`gantt-marker-label tone-${m.tone}`}
                style={{ left: `${domainFraction(m.at, domain) * 100}%`, ...(shift[i] && ({ '--dx': `${shift[i]}px` } as CSSProperties)) }}
              >
                {m.label}
              </span>
            ))}
          </div>
        </div>
      )}
      {shownLanes.map((lane) => (
        <div key={lane.id} className="gantt-row">
          <span className="gantt-row-label">{lane.label}</span>
          <div className="gantt-track">
            {bars
              .filter((b) => b.lane === lane.id)
              .map((b) => (
                <Bar key={b.id} bar={b} domain={domain} onClick={onBarClick} showLabel={showLabel(b)} place={instantPlaces.get(b.id)} />
              ))}
          </div>
        </div>
      ))}
      {axis && (
        <div className="gantt-row gantt-axis" aria-hidden="true">
          {calendar ? <span className="gantt-axis-zone">UTC</span> : <span />}
          <div className="gantt-axis-track">
            {ticks.map((t) => (
              <span key={t.value} className="gantt-tick" style={{ left: `${t.at}%` }}>
                {t.label}
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
  if (hiddenLanes.length === 0) return chart;
  return (
    <div className="gantt-wrap">
      {chart}
      <p className="gantt-hidden-note">
        {plural(hiddenLanes.length, 'lane')} with nothing in this window {hiddenLanes.length === 1 ? 'is' : 'are'} hidden: {hiddenLanes.map((l) => l.label).join(', ')}
      </p>
    </div>
  );
}

/**
 * FLIP for bars with a motionId: a bar element that wasn't there last render starts at the
 * place its motionId was last drawn and glides to where it is now (Web Animations, so it
 * runs over the bar's own CSS transitions without fighting them).
 */
function useGlide(root: RefObject<HTMLDivElement | null>) {
  const last = useRef(new Map<string, { x: number; y: number }>());
  const seen = useRef(new WeakSet<Element>());
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const origin = el.getBoundingClientRect();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const now = new Map<string, { x: number; y: number }>();
    el.querySelectorAll<HTMLElement>('[data-motion-id]').forEach((bar) => {
      const id = bar.dataset.motionId!;
      const r = bar.getBoundingClientRect();
      const at = { x: r.left - origin.left, y: r.top - origin.top };
      const from = last.current.get(id);
      if (!seen.current.has(bar) && from && !reduce && (from.x !== at.x || from.y !== at.y)) {
        bar.animate([{ transform: `translate(${from.x - at.x}px, ${from.y - at.y}px)` }, { transform: 'none' }], { duration: GLIDE_MS, easing: 'ease-out' });
      }
      seen.current.add(bar);
      if (!now.has(id)) now.set(id, at);
    });
    last.current = now;
  });
}

/** A bar with a tone and no width (an instant) is drawn as a diamond with its label beside it, unless `minPx` already gives it a width. */
const drawsAsInstant = (b: GanttBar) => isInstant(b) && b.tone !== undefined && !b.minPx;

/** Label placement for the instants of every lane (each lane's labels are spread apart on their own). Empty until the widths are measured. */
function placeInstants(
  lanes: readonly GanttLane[], bars: readonly GanttBar[], domain: Domain, trackPx: number, labelWidths: readonly number[] | undefined,
): Map<string, InstantLabelPlace> {
  const places = new Map<string, InstantLabelPlace>();
  const groups = lanes.map((lane) => bars.filter((b) => b.lane === lane.id && drawsAsInstant(b) && b.label));
  if (!labelWidths || !trackPx || labelWidths.length !== groups.flat().length) return places;
  let next = 0;
  for (const group of groups) {
    const marks = group.map((b) => ({ x: instantX(domainFraction(b.start, domain), trackPx), w: labelWidths[next++] }));
    placeInstantLabels(marks, trackPx).forEach((place, i) => places.set(group[i].id, place));
  }
  return places;
}

function Instant({ bar: b, domain, onClick, place }: { bar: GanttBar; domain: Domain; onClick?: (id: string) => void; place?: InstantLabelPlace }) {
  const half = INSTANT_SIZE_PX / 2;
  const left = `clamp(${half}px, ${domainFraction(b.start, domain) * 100}%, calc(100% - ${half}px))`;
  const classes = `gantt-instant tone-${b.tone}`;
  return (
    <>
      {onClick ? (
        <button type="button" className={classes} style={{ left }} title={b.label} aria-label={b.label ?? b.id} onClick={() => onClick(b.id)} />
      ) : (
        <span className={classes} style={{ left }} title={b.label} />
      )}
      {b.label && (
        <span
          className={`gantt-instant-label ${place?.side === 'left' ? 'is-left' : ''}`}
          style={{ left, '--dx': `${place?.dx ?? 0}px`, '--gap': `${INSTANT_GAP_PX}px` } as CSSProperties}
        >
          {b.label}
        </span>
      )}
    </>
  );
}

function Bar({ bar: b, domain, onClick, showLabel, place }: { bar: GanttBar; domain: Domain; onClick?: (id: string) => void; showLabel: boolean; place?: InstantLabelPlace }) {
  if (drawsAsInstant(b)) return <Instant bar={b} domain={domain} onClick={onClick} place={place} />;
  if (b.start < domain[0] && b.end <= domain[0]) return null; // wholly before the domain: nothing to draw, and nothing may spill into the label column
  const g = barGeometry(b.start, b.end, domain, b.progress ?? 1);
  const classes = ['gantt-bar', b.tone && `tone-${b.tone}`, `is-${b.kind ?? 'work'}`, b.ring && 'is-ring'].filter(Boolean).join(' ');
  const style = {
    left: `${g.left}%`,
    width: `${g.shown}%`,
    ...(b.minPx ? { minWidth: b.minPx } : {}),
    ...(b.ring ? { '--gantt-ring': `var(--${b.ring})` } : {}),
  } as CSSProperties;
  const content = showLabel && b.label && <span className="gantt-bar-label">{b.label}</span>;
  return (
    <>
      {b.progress !== undefined && <span className="gantt-plan" style={{ left: `${g.left}%`, width: `${g.full}%` }} />}
      {onClick ? (
        <button type="button" className={classes} style={style} title={b.label} aria-label={b.label ?? b.id} data-motion-id={b.motionId} onClick={() => onClick(b.id)}>
          {content}
        </button>
      ) : (
        <span className={classes} style={style} title={b.label} data-motion-id={b.motionId}>
          {content}
        </span>
      )}
    </>
  );
}
