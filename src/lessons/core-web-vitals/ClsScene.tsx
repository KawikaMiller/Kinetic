import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { barLabelPx } from '../../core/gantt';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Hint, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useSetCaption } from '../../core/caption';
import { MetricMeter } from './MetricMeter';
import {
  RECENT_INPUT_MS, SHIFTS, VIEWPORT, clsOf, distanceFraction, impactFraction, sessionWindows, shiftScore, shiftsFor, windowIndexOf, type ShiftId, type ShiftSpec,
} from './model';

const TIMELINE_MIN_W = 420;
const DOMAIN_END = 10000;
const MARK_MIN_PX = 10;
const WINDOW_MIN_PX = 14;
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const f3 = (v: number) => v.toFixed(3);
const isExcluded = (s: ShiftSpec) => s.inputBefore !== null && s.inputBefore <= RECENT_INPUT_MS;

const INTRO = (
  <>
    A scripted page with five layout shifts, each scored on its own scripted layout. Click a shift to see the element before (dashed) and after (solid), and the area the score counts.
    Then try the fixes.
  </>
);

function ShiftDrawing({ spec, fixed }: { spec: ShiftSpec; fixed: boolean }) {
  const { before, after } = spec;
  const top = Math.min(before.y, after.y);
  const bottom = Math.max(before.y + before.h, after.y + after.h);
  return (
    <svg className={`cwv-shift ${isExcluded(spec) ? 'is-excluded' : ''}`} viewBox={`0 0 ${VIEWPORT.w} ${VIEWPORT.h}`} role="img" aria-label={`The screen with the element before and after the ${spec.label} shift`}>
      <defs>
        <clipPath id="cwv-screen">
          <rect x="0" y="0" width={VIEWPORT.w} height={VIEWPORT.h} rx="14" />
        </clipPath>
      </defs>
      <rect className="cwv-page-frame" x="0" y="0" width={VIEWPORT.w} height={VIEWPORT.h} rx="14" />
      <g clipPath="url(#cwv-screen)">
        {!fixed && <rect className="cwv-impact" x="0" y={top} width={VIEWPORT.w} height={bottom - top} />}
        <rect className="cwv-before" x={before.x + 3} y={before.y} width={before.w - 6} height={before.h} rx="8" />
        {!fixed && <rect className="cwv-after" x={after.x + 3} y={after.y} width={after.w - 6} height={after.h} rx="8" />}
        <text className="cwv-shift-label" x="180" y={before.y + 40}>before</text>
        {!fixed && <text className="cwv-shift-label" x="180" y={Math.min(after.y + 40, VIEWPORT.h - 20)}>after</text>}
      </g>
    </svg>
  );
}

function shiftCaption(spec: ShiftSpec, fixed: boolean, windowIndex: number | null): ReactNode {
  if (fixed) return <><b>{spec.label}</b>: fixed with {spec.fix}. Nothing moves, so there is no shift to score.</>;
  return (
    <>
      <b>{spec.label}</b> at {seconds(spec.at)}: {spec.cause}. Impact fraction <b>{f3(impactFraction(spec.before, spec.after))}</b> (the area it covered before or after, as a share of
      the screen) × distance fraction <b>{f3(distanceFraction(spec.before, spec.after))}</b> (how far it moved, as a share of the screen&apos;s larger side) ={' '}
      <span className="hl">{f3(shiftScore(spec.before, spec.after))}</span>.{' '}
      {windowIndex === null
        ? <><span className="hl orange">excluded</span>: your tap came {spec.inputBefore} ms before it, within {RECENT_INPUT_MS} ms, so it does not count.</>
        : <>It is in session window {windowIndex}.</>}
    </>
  );
}

export function ClsScene({ picker }: { picker: ReactNode }) {
  const [fixed, setFixed] = useState<ReadonlySet<ShiftId>>(new Set());
  const [selected, setSelected] = useState<ShiftId | null>(null);
  const setCaption = useSetCaption();
  const shifts = useMemo(() => shiftsFor(fixed), [fixed]);
  const windows = useMemo(() => sessionWindows(shifts), [shifts]);
  const cls = clsOf(shifts);
  const spec = SHIFTS.find((s) => s.id === selected) ?? null;
  const bestWindow = windows.reduce((best, w, i) => (w.value > (windows[best]?.value ?? -1) ? i : best), 0);

  useEffect(() => {
    setCaption(spec ? shiftCaption(spec, fixed.has(spec.id), windowIndexOf(windows, spec.id)) : INTRO, { quiet: true });
  }, [spec, fixed, windows, setCaption]);

  const toggle = (id: ShiftId) => {
    const next = new Set(fixed);
    if (!next.delete(id)) next.add(id);
    setFixed(next);
  };

  const bars: GanttBar[] = [
    ...shifts.map((s) => ({
      id: s.id, lane: 'shifts', start: s.at, end: s.at, tone: s.recentInput ? ('dim' as const) : ('info' as const), minPx: MARK_MIN_PX,
      label: `${SHIFTS.find((x) => x.id === s.id)!.label}: ${f3(s.score)}`,
    })),
    ...windows.map((w, i) => ({
      id: `w${i}`, lane: 'windows', start: w.start, end: Math.max(w.end, w.start + 1), tone: 'violet' as const, minPx: WINDOW_MIN_PX, ring: i === bestWindow ? ('hi' as const) : undefined,
      label: `window ${i + 1}: ${f3(w.value)}`,
    })),
  ];
  const drawn = spec ?? SHIFTS[1];

  return (
    <StageFrame
      height={560}
      stats={
        <Stats>
          <Stat label="CLS: the largest window" value={f3(cls)} />
          <Stat label="Sum of all counted shifts" value={f3(windows.reduce((s, w) => s + w.value, 0))} sub="not the metric" />
        </Stats>
      }
      controls={[picker]}
    >
      <div className="stage-pad cwv">
        <MetricMeter metric="cls" value={cls} />
        <div className="cwv-cls-body">
          <ShiftDrawing spec={drawn} fixed={fixed.has(drawn.id)} />
          <div className="cwv-cls-list">
            <SectionTitle weight="regular" hint="click a shift to see it; Fix applies the remedy">Shifts</SectionTitle>
            {SHIFTS.map((s) => {
              const isFixed = fixed.has(s.id);
              const idx = windowIndexOf(windows, s.id);
              return (
                <div key={s.id} className={`cwv-shift-row ${s.id === drawn.id ? 'is-selected' : ''}`}>
                  <button type="button" className="cwv-shift-pick" onClick={() => setSelected(s.id)} aria-pressed={s.id === selected}>
                    <span className="cwv-shift-time">{seconds(s.at)}</span>
                    <span className="cwv-shift-name">{s.label}</span>
                    <span className="cwv-shift-score">
                      {isFixed ? 'fixed: 0' : `${f3(impactFraction(s.before, s.after))} × ${f3(distanceFraction(s.before, s.after))} = ${f3(shiftScore(s.before, s.after))}`}
                    </span>
                    <span className={`cwv-shift-state ${isFixed ? 'tone-ok' : idx === null ? 'tone-orange' : 'tone-violet'}`}>
                      {isFixed ? 'no shift' : idx === null ? 'excluded' : `window ${idx}`}
                    </span>
                  </button>
                  {s.id !== 'tap' && (
                    <ChipButton tone="ok" size="md" on={isFixed} onClick={() => toggle(s.id)} ariaLabel={`Fix: ${s.label}`}>
                      {isFixed ? 'Fixed' : 'Fix'}
                    </ChipButton>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <SectionTitle weight="regular" hint="session windows: shifts under 1 s apart, a window at most 5 s long">Timeline</SectionTitle>
        <WideRegion minWidth={TIMELINE_MIN_W} label="Timeline: scroll sideways to see all of it">
          <GanttLanes
            lanes={[{ id: 'shifts', label: 'Shifts' }, { id: 'windows', label: 'Windows' }]}
            bars={bars}
            domain={[0, DOMAIN_END]}
            unit=" ms"
            axis
            size="md"
            labelWidth={72}
            labelMinPx={barLabelPx('window 1: 0.000')}
            ariaLabel="Layout shifts and the session windows they fall in"
          />
        </WideRegion>
        <Hint block>
          Scripted layouts (a real page cannot shift inside this one); the scoring and the window rules are the real definitions. A shift within {RECENT_INPUT_MS} ms of your own input is
          excluded, because shifts you asked for do not count. CLS is the largest window, not the total.
        </Hint>
      </div>
    </StageFrame>
  );
}
