import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { WideRegion } from '../../components/WideRegion';
import { barLabelPx } from '../../core/gantt';
import { clamp01 } from '../../core/math';
import type { Tone } from '../../core/tone';
import { Phone } from './Phone';
import { STRATEGY_LABEL, screenAt, timeline, valleyMs, type Bar, type Inputs, type StrategyId, type Timeline } from './model';

const TIMELINE_MIN_W = 480;
const LANES = [
  { id: 'server', label: 'Server' },
  { id: 'network', label: 'Network' },
  { id: 'browser', label: 'Browser' },
  { id: 'screen', label: 'Screen' },
];
const LANE_TONE: Record<Bar['lane'], Tone> = { server: 'violet', network: 'info', browser: 'hi' };
/** Wide enough for the longest label a bar carries here. */
const LABEL_MIN_PX = barLabelPx('hydrate');
const BUILT_EARLIER_PX = 90;

/** A bar drawn up to `now`: not started is just its dashed plan. */
function timed(bar: Omit<GanttBar, 'progress' | 'tone'> & { tone: Tone }, now: number): GanttBar {
  if (now <= bar.start) return { ...bar, tone: undefined, progress: 0 };
  return { ...bar, progress: clamp01((now - bar.start) / (bar.end - bar.start)) };
}

/** The screen lane: blank, shell, visible but dead, interactive. */
function screenBars(tl: Timeline, end: number, now: number): GanttBar[] {
  const out: GanttBar[] = [{ id: 'blank', lane: 'screen', start: 0, end: tl.firstPaintAt, tone: 'dim', label: 'blank' }];
  if (tl.contentAt > tl.firstPaintAt) out.push({ id: 'shell', lane: 'screen', start: tl.firstPaintAt, end: tl.contentAt, tone: 'muted', label: 'shell' });
  if (valleyMs(tl) > 0) out.push({ id: 'valley', lane: 'screen', start: tl.contentAt, end: tl.interactiveAt, tone: 'orange', kind: 'wait', label: 'visible, not interactive' });
  out.push({ id: 'live', lane: 'screen', start: tl.interactiveAt, end, tone: 'ok', label: 'interactive' });
  return out.map((b) => timed({ ...b, tone: b.tone! }, now));
}

function barsOf(tl: Timeline, id: StrategyId, end: number, now: number): GanttBar[] {
  const work = tl.bars.map((b, i) => timed({ id: `${b.lane}-${i}`, lane: b.lane, start: b.start, end: b.end, tone: LANE_TONE[b.lane], label: b.label }, now));
  // A static page's server work happened at build time, before this request: it has no bar on this clock.
  const built: GanttBar[] = id === 'ssg' ? [{ id: 'built', lane: 'server', start: 0, end: 0, tone: 'dim', kind: 'blocked', minPx: BUILT_EARLIER_PX, label: 'built earlier' }] : [];
  return [...built, ...work, ...screenBars(tl, end, now)];
}

/** One strategy: its phone and its timeline. */
export function StrategyPanel({ id, inputs, end, now }: { id: StrategyId; inputs: Inputs; end: number; now: number }) {
  const tl = timeline(id, inputs);
  const state = screenAt(tl, now);
  return (
    <section className="rs-panel" aria-label={STRATEGY_LABEL[id]}>
      <h3 className="rs-panel-title">{STRATEGY_LABEL[id]}</h3>
      <div className="rs-panel-body">
        <Phone state={state} label={STRATEGY_LABEL[id]} />
        <div className="rs-panel-chart">
          <WideRegion minWidth={TIMELINE_MIN_W} label={`${STRATEGY_LABEL[id]} timeline: scroll sideways to see all of it`}>
            <GanttLanes
              lanes={LANES}
              bars={barsOf(tl, id, end, now)}
              domain={[0, end]}
              now={now}
              markers={[
                { at: tl.firstPaintAt, label: 'first paint', tone: 'ok' },
                { at: tl.interactiveAt, label: 'interactive', tone: 'ok' },
              ]}
              unit=" ms"
              axis
              size="md"
              labelWidth={72}
              labelMinPx={LABEL_MIN_PX}
              ariaLabel={`${STRATEGY_LABEL[id]}: first paint at ${Math.round(tl.firstPaintAt)} ms, interactive at ${Math.round(tl.interactiveAt)} ms`}
            />
          </WideRegion>
        </div>
      </div>
    </section>
  );
}
