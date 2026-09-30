import { useEffect, useRef, useState } from 'react';
import { CodePanel, type LineState } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { ResizablePane } from '../../components/ResizablePane';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Legend, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { bytes, NA } from '../../core/format';
import { useElementSize } from '../../core/hooks';
import { linearScale } from '../../core/scale';
import {
  BREAKPOINTS, CANDIDATES, DEVICES, DEVICE_MAX, DEVICE_MIN, PAGE_CSS, SIZES, blockOfLines, breakpointAt,
  UNIT_SAMPLES, isTooSmall, pickCandidate, slotWidth, type BreakpointId,
} from './model';
import { SamplePage } from './SamplePage';
import { useMeasure } from '../../core/useMeasure';
import './styles.css';

const CSS_LINES = PAGE_CSS.split('\n');
const LINE_BLOCKS = blockOfLines(PAGE_CSS);
const BP_ORDER: BreakpointId[] = ['base', 'md', 'lg'];
const RULER_W = 100; // percent
const START_DEVICE = 390;

interface PageMeasure {
  /** The breakpoint block the browser actually applied, read back from --bp. */
  bp: BreakpointId;
  height: number;
  cardColumns: number;
  fonts: Record<string, number>;
  taps: { id: string; w: number; h: number }[];
}

function measurePage(el: HTMLElement): PageMeasure {
  const probe = el.querySelector('.rd-probe');
  const bp = (probe ? getComputedStyle(probe).getPropertyValue('--bp').trim() : 'base') as BreakpointId;
  const cards = el.querySelector('.rd-cards');
  const fonts: Record<string, number> = {};
  el.querySelectorAll<HTMLElement>('[data-unit]').forEach((s) => {
    fonts[s.dataset.unit!] = Math.round(parseFloat(getComputedStyle(s).fontSize) * 10) / 10;
  });
  const taps = [...el.querySelectorAll<HTMLElement>('[data-tap]')]
    .filter((t) => t.offsetParent !== null) // skip what the layout hides (e.g. nav links on a phone)
    .map((t) => ({ id: t.dataset.tap!, w: t.offsetWidth, h: t.offsetHeight }));
  return {
    bp,
    height: el.offsetHeight,
    cardColumns: cards ? getComputedStyle(cards).gridTemplateColumns.split(' ').length : 0,
    fonts,
    taps,
  };
}

export function Stage() {
  const [device, setDevice] = useState(START_DEVICE);
  const [dpr, setDpr] = useState(2);
  const [showTaps, setShowTaps] = useState(false);
  const [fitRef, fit] = useElementSize<HTMLDivElement>();
  const pageRef = useRef<HTMLDivElement>(null);
  const setCaption = useSetCaption();
  const m = useMeasure(pageRef, measurePage);

  useIntroCaption(
    <>One page, one stylesheet. Drag the device edge (or pick a device): the layout reflows at each{' '}
      <span className="hl">breakpoint</span> instead of being a separate mobile site.</>,
  );

  // Narrate breakpoint changes the browser actually made.
  const lastBp = useRef<BreakpointId | null>(null);
  useEffect(() => {
    if (!m) return;
    const prev = lastBp.current;
    lastBp.current = m.bp;
    if (!prev || prev === m.bp) return;
    const up = BP_ORDER.indexOf(m.bp) > BP_ORDER.indexOf(prev);
    const text: Record<BreakpointId, string> = {
      base: 'Below 600px only the base rules apply: one column, and the nav collapses behind a menu button.',
      md: 'At 600px the tablet block switches on: two card columns, and the nav links come back.',
      lg: 'At 960px the desktop block adds a sidebar and a third card column.',
    };
    setCaption(<>{up ? 'Crossed up' : 'Dropped back'}: <span className="hl">{text[m.bp]}</span></>);
  }, [m, setCaption]);

  const scale = fit.width ? Math.min(1, fit.width / device) : 1;
  const small = new Set(showTaps && m ? m.taps.filter((t) => isTooSmall(t.w, t.h)).map((t) => t.id) : []);
  const tooSmall = m ? m.taps.filter((t) => isTooSmall(t.w, t.h)).length : 0;
  const active = m?.bp ?? breakpointAt(device).id;

  const stateOf = (i: number): LineState => {
    const block = LINE_BLOCKS[i];
    if (block === active) return 'now';
    return BP_ORDER.indexOf(block) < BP_ORDER.indexOf(active) ? 'past' : 'pending';
  };

  const slot = slotWidth(device);
  const chosen = pickCandidate(CANDIDATES, slot, dpr);
  const largest = CANDIDATES[CANDIDATES.length - 1];
  const x = linearScale(DEVICE_MIN, DEVICE_MAX, 0, RULER_W);

  return (
    <StageFrame
      height={640}
      stats={
        <Stats>
          <Stat label="Device width" value={`${device}px`} />
          <Stat label="Breakpoint" value={m ? m.bp : NA} color="var(--hi)" sub="read back from the browser" />
          <Stat label="Card columns" value={m ? m.cardColumns : NA} />
          <Stat label="Tap targets < 44px" value={m ? tooSmall : NA} color={tooSmall ? 'var(--bad)' : undefined} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'active breakpoint' },
            { color: 'var(--dim)', label: 'rules not in effect' },
            { color: 'var(--ok)', label: 'chosen image' },
            { color: 'var(--bad)', label: 'tap target too small' },
          ]}
        />
      }
      controls={[
        <ControlGroup key="dev" label="Device">
          {DEVICES.map((d) => (
            <ChipButton key={d.id} size="md" on={device === d.width} onClick={() => setDevice(d.width)}>
              {d.label} {d.width}
            </ChipButton>
          ))}
        </ControlGroup>,
        <>
          <Segmented label="Screen density (DPR)" value={dpr} onChange={setDpr} options={[1, 2, 3].map((n) => ({ value: n, label: `${n}×` }))} />
          <Toggle
            label="Tap targets"
            value={showTaps}
            onChange={(v) => {
              setShowTaps(v);
              if (v) setCaption(<>Anything smaller than 44 × 44px is hard to hit with a thumb: those get a <span className="hl bad">red outline</span>.</>);
            }}
            off="Hide"
            on="Check sizes"
          />
        </>,
      ]}
    >
      <div className="stage-pad rd">
        <ResizablePane min={DEVICE_MIN} max={DEVICE_MAX} value={device} onChange={setDevice} label="Device width" className="rd-pane">
          <div ref={fitRef} className="rd-fit" style={{ height: (m?.height ?? 0) * scale }}>
            <style>{PAGE_CSS}</style>
            <div ref={pageRef} className="rd-page" style={{ width: device, transform: `scale(${scale})` }}>
              <SamplePage smallTaps={small} />
            </div>
          </div>
        </ResizablePane>
        {scale < 1 && <p className="rd-note">Laid out at a true {device}px, then scaled to fit this stage.</p>}

        <div className="rd-ruler" aria-label="Breakpoint ruler">
          {BREAKPOINTS.map((b, i) => {
            const end = BREAKPOINTS[i + 1]?.min ?? DEVICE_MAX;
            const start = Math.max(b.min, DEVICE_MIN);
            return (
              <div
                key={b.id}
                className={`rd-ruler-band ${b.id === active ? 'tone-hi is-on' : ''}`}
                style={{ left: `${x.map(start)}%`, width: `${x.map(end) - x.map(start)}%` }}
              >
                {b.label}
              </div>
            );
          })}
          <div className="rd-ruler-mark" style={{ left: `${x.map(device)}%` }} />
        </div>

        <div className="rd-below">
          <CodePanel title="The stylesheet (this is what's applied)" lines={CSS_LINES} stateOf={stateOf} gutter="none" className="rd-code" />
          <div className="rd-side-panels">
            <Box className="rd-units">
              <SectionTitle hint="measured at this width">Type sizes</SectionTitle>
              <table className="data-table">
                <tbody>
                  {UNIT_SAMPLES.map((u) => (
                    <tr key={u.id}>
                      <td><code>{u.css}</code></td>
                      <td className="rd-px">{m ? `${m.fonts[u.id]}px` : NA}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
            <Box className="rd-srcset">
              <SectionTitle hint={`sizes="${SIZES}"`}>srcset: which image?</SectionTitle>
              <p className="rd-need">
                Slot {Math.round(slot)}px × {dpr} = needs <b>{Math.round(slot * dpr)}px</b> of image
              </p>
              <div className="rd-candidates">
                {CANDIDATES.map((c) => (
                  <span key={c.w} className={`chip ${c === chosen ? 'tone-ok rd-chosen' : 'tone-dim'}`}>
                    hero-{c.w}.jpg {c.w}w · {bytes(c.bytes, { base: 1000, dp: 0 })}
                  </span>
                ))}
              </div>
              <p className="rd-save">
                {chosen === largest ? 'Needs the biggest file.' : <>Saves {bytes(largest.bytes - chosen.bytes, { base: 1000, dp: 0 })} over always sending the 1600w image.</>}
              </p>
            </Box>
          </div>
        </div>
        <p className="rd-honest">
          This demo uses <b>container queries</b> to stand in for the viewport; on a real page these are <code>@media</code>{' '}
          rules, and <code>cqi</code> plays the part of <code>vw</code>. The srcset choice follows the spec's density rule, but
          browsers may pick differently when caching or on slow networks. File sizes are illustrative.
        </p>
      </div>
    </StageFrame>
  );
}
