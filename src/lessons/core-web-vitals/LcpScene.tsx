import { useMemo, useState, type ReactNode } from 'react';
import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { barLabelPx } from '../../core/gantt';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { ms } from '../../core/format';
import { clamp01 } from '../../core/math';
import { usePlayer } from '../../core/usePlayer';
import { buildLcpFrames, candidatesAt } from './lcpFrames';
import { VitalsMeter } from './VitalsMeter';
import { LCP_TIMES, heroFetch, pageElements, type ElementId, type LcpOptions } from './model';

const STEP_MS = 1100;
const WATERFALL_MIN_W = 420;
const TAP_AT = 2000;
/** Where each element sits in the mock page, in the 360 x 640 viewport. */
const BOXES: Record<ElementId, { y: number; h: number }> = { heading: { y: 20, h: 50 }, hero: { y: 80, h: 330 }, text: { y: 430, h: 170 } };
const DEFAULTS: LcpOptions = { preload: false, lazy: true, small: false, inputAt: null };
const END_PAD = 400;
const TICK = 500;

function bar(b: Omit<GanttBar, 'progress' | 'tone'> & { tone: NonNullable<GanttBar['tone']> }, now: number): GanttBar {
  if (now <= b.start) return { ...b, tone: undefined, progress: 0 };
  return { ...b, progress: clamp01((now - b.start) / (b.end - b.start)) };
}

function barsAt(o: LcpOptions, now: number, currentId: ElementId | undefined): GanttBar[] {
  const fetch = heroFetch(o);
  const bars: GanttBar[] = [bar({ id: 'html', lane: 'html', start: 0, end: LCP_TIMES.html, tone: 'info', label: 'HTML' }, now)];
  if (fetch.start > LCP_TIMES.html) {
    bars.push(bar({ id: 'wait', lane: 'hero', start: LCP_TIMES.html, end: fetch.start, tone: 'dim', kind: 'blocked', label: o.lazy ? 'lazy script' : 'waiting for CSS' }, now));
  }
  bars.push(bar({ id: 'get', lane: 'hero', start: fetch.start, end: fetch.done, tone: 'info', label: 'hero.jpg' }, now));
  for (const el of pageElements(o)) {
    const ignored = o.inputAt !== null && el.at > o.inputAt;
    bars.push(bar({ id: el.id, lane: 'paint', start: el.at - LCP_TIMES.paint, end: el.at, tone: ignored ? 'dim' : 'muted', ring: currentId === el.id ? 'hi' : undefined, label: el.label }, now));
  }
  return bars;
}

function domainEndOf(o: LcpOptions): number {
  const last = Math.max(...pageElements(o).map((e) => e.at), heroFetch(o).done, o.inputAt ?? 0);
  return Math.ceil((last + END_PAD) / TICK) * TICK;
}

/** The mock page: each element is drawn once it has been painted; the current LCP candidate is outlined. */
function MockPage({ o, now }: { o: LcpOptions; now: number }) {
  const els = pageElements(o);
  const current = candidatesAt(o, now).at(-1)?.id;
  return (
    <svg className="cwv-page" viewBox="0 0 360 640" role="img" aria-label="A mock phone page: heading, hero image and text block, drawn as they are painted">
      <rect className="cwv-page-frame" x="0" y="0" width="360" height="640" rx="14" />
      {els.map((el) => {
        const box = BOXES[el.id];
        const painted = now >= el.at;
        const ignored = o.inputAt !== null && el.at > o.inputAt;
        return (
          <g key={el.id} className={`cwv-el ${painted ? 'is-painted' : ''} ${ignored ? 'is-ignored' : ''} ${current === el.id ? 'is-candidate' : ''}`}>
            <rect x="0" y={box.y} width="360" height={box.h} rx="8" />
            <text x="180" y={box.y + box.h / 2 + 8}>{painted ? el.label : '…'}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function LcpScene({ picker }: { picker: ReactNode }) {
  const [o, setO] = useState<LcpOptions>(DEFAULTS);
  const frames = useMemo(() => buildLcpFrames(o), [o]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const now = player.frame.t;
  const current = candidatesAt(o, now).at(-1) ?? null;
  const domain: [number, number] = [0, domainEndOf(o)];
  const set = (patch: Partial<LcpOptions>) => setO({ ...o, ...patch });

  return (
    <StageFrame
      player={player}
      height={560}
      stats={
        <Stats>
          <Stat label="Time" value={ms(now)} />
          <Stat label="Current candidate" value={current ? current.label : 'none yet'} color={current ? 'var(--hi)' : undefined} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Toggle label="Hero image loading" value={o.lazy} onChange={(lazy) => set({ lazy })} off="set in CSS" on="lazy-loaded by a script" />
          <Toggle label="Preload hero" value={o.preload} onChange={(preload) => set({ preload })} off="no hint" on="preload" />
          <Toggle label="Hero file" value={o.small} onChange={(small) => set({ small })} off="1200 KB" on="300 KB" />
          <Segmented label="First tap" value={o.inputAt ?? 0} onChange={(v) => set({ inputAt: v === 0 ? null : v })} options={[{ value: 0, label: 'none' }, { value: TAP_AT, label: `at ${ms(TAP_AT)}` }]} />
        </>,
      ]}
    >
      <div className="stage-pad cwv">
        <VitalsMeter metric="lcp" value={current ? current.at : null} />
        <div className="cwv-lcp-body">
          <MockPage o={o} now={now} />
          <div className="cwv-lcp-side">
            <SectionTitle weight="regular" hint="a scripted page load: slow phone connection">Timeline</SectionTitle>
            <WideRegion minWidth={WATERFALL_MIN_W} label="Timeline: scroll sideways to see all of it">
              <GanttLanes
                lanes={[{ id: 'html', label: 'HTML' }, { id: 'hero', label: 'Hero image' }, { id: 'paint', label: 'Paint' }]}
                bars={barsAt(o, now, current?.id)}
                domain={domain}
                now={now}
                markers={o.inputAt === null ? [] : [{ at: o.inputAt, label: 'first tap', tone: 'violet' }]}
                unit=" ms"
                axis
                size="md"
                labelWidth={84}
                labelMinPx={barLabelPx('not found yet')}
                ariaLabel="Page load timeline: HTML, hero image download and paints"
              />
            </WideRegion>
            <Hint block>
              A scripted page load (a real one cannot run inside this page): every number here comes from fixed timings, the rule is the real one. The LCP is the paint time of the last
              candidate: an element that was larger than every one painted before it, and was painted before the first tap, key press or scroll. Lazy-loading is modelled as a script that sets
              the image&apos;s source at {ms(LCP_TIMES.script)}, and the CSS option as a hero set in the stylesheet, found at {ms(LCP_TIMES.cssParsed)}. A plain &lt;img&gt; in the HTML is found by the
              preload scanner as the HTML arrives, which is what the preload hint gives the other two.
            </Hint>
          </div>
        </div>
      </div>
    </StageFrame>
  );
}
