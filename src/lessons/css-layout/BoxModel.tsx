import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { ControlGroup, Legend, Segmented, Slider, Toggle } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { boxCss, collapseCss, collapsedMargin, lineFor, type BoxSettings } from './model';
import { px, rectIn, useMeasure, type Rect } from './useMeasure';
import { Workbench } from './Workbench';

const START: BoxSettings = { width: 200, padding: 16, border: 6, margin: 20, boxSizing: 'content-box' };
const START_COLLAPSE = { bottom: 20, top: 30 };

interface BoxMeasure {
  box: Rect;
  margin: number;
  border: number;
  padding: number;
  content: { w: number; h: number };
}

interface CollapseMeasure {
  first: Rect;
  second: Rect;
  gap: number;
}

function measureBox(el: HTMLElement): BoxMeasure | null {
  const box = el.querySelector('.cl-box');
  if (!box) return null;
  const cs = getComputedStyle(box);
  const r = rectIn(box, el);
  const border = px(cs, 'borderLeftWidth');
  const padding = px(cs, 'paddingLeft');
  return {
    box: r,
    margin: px(cs, 'marginLeft'),
    border,
    padding,
    content: { w: r.w - 2 * (border + padding), h: r.h - 2 * (border + padding) },
  };
}

function measureCollapse(el: HTMLElement): CollapseMeasure | null {
  const [a, b] = el.querySelectorAll('.cl-para');
  if (!a || !b) return null;
  const first = rectIn(a, el);
  const second = rectIn(b, el);
  return { first, second, gap: Math.round((second.y - (first.y + first.h)) * 10) / 10 };
}

/** A ring drawn exactly over a measured rectangle, expanded by `by` px. */
function Ring({ r, by = 0, className, label }: { r: Rect; by?: number; className: string; label?: ReactNode }) {
  const style: CSSProperties = { left: r.x - by, top: r.y - by, width: r.w + 2 * by, height: r.h + 2 * by };
  return (
    <div className={`cl-ring ${className}`} style={style}>
      {label && <span className="cl-ring-label">{label}</span>}
    </div>
  );
}

export function BoxModel({ picker }: { picker: ReactNode }) {
  const [mode, setMode] = useState<'box' | 'collapse'>('box');
  const [s, setS] = useState(START);
  const [col, setCol] = useState(START_COLLAPSE);
  const [width, setWidth] = useState(560);
  const [changed, setChanged] = useState<string | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const setCaption = useSetCaption();
  const m = useMeasure(canvas, (el) => (mode === 'box' ? measureBox(el) : null));
  const c = useMeasure(canvas, (el) => (mode === 'collapse' ? measureCollapse(el) : null));

  useIntroCaption(
    <>Every element is a box: <span className="hl info">content</span>, wrapped in <span className="hl ok">padding</span>, a{' '}
      <span className="hl">border</span> and <span className="hl orange">margin</span>. Drag the sliders and watch the real box change.</>,
  );

  const set = <K extends keyof BoxSettings>(key: K, label: string) => (v: BoxSettings[K]) => {
    setS((prev) => ({ ...prev, [key]: v }));
    setChanged(label);
  };

  const setSizing = (on: boolean) => {
    set('boxSizing', 'box-sizing')(on ? 'border-box' : 'content-box');
    setCaption(
      on ? (
        <><code>border-box</code>: <code>width</code> now includes padding and border, so the content shrinks to fit and the total stays {s.width}px.</>
      ) : (
        <><code>content-box</code> (the default): <code>width</code> is the content only. Padding and border are added on top.</>
      ),
    );
  };

  const css = mode === 'box' ? boxCss(s) : collapseCss(col.bottom, col.top);
  const rule = collapsedMargin(col.bottom, col.top);

  const facts =
    mode === 'box' && m
      ? [
          { label: 'Content', value: `${m.content.w} × ${m.content.h} px`, tone: 'info' },
          { label: 'Padding (each side)', value: `${m.padding} px`, tone: 'ok' },
          { label: 'Border (each side)', value: `${m.border} px`, tone: 'hi' },
          { label: 'Margin (each side)', value: `${m.margin} px`, tone: 'orange' },
          { label: 'Box width (border edge)', value: `${m.box.w} px` },
          { label: 'Space it takes up', value: `${m.box.w + 2 * m.margin} px` },
        ]
      : c
        ? [
            { label: '.first margin-bottom', value: `${col.bottom} px`, tone: 'orange' },
            { label: '.second margin-top', value: `${col.top} px`, tone: 'orange' },
            { label: 'Measured gap', value: `${c.gap} px`, tone: 'hi' },
            { label: 'Collapse rule says', value: `${rule} px` },
          ]
        : [];

  return (
    <StageFrame
      height={520}
      legend={
        <Legend
          items={[
            { color: 'var(--orange)', label: 'margin' },
            { color: 'var(--hi)', label: 'border' },
            { color: 'var(--ok)', label: 'padding' },
            { color: 'var(--info)', label: 'content' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented
            label="Preset"
            value={mode}
            onChange={(v) => {
              setMode(v);
              setChanged(null);
              if (v === 'collapse') {
                setCaption(<>Two paragraphs, <code>margin-bottom: {col.bottom}px</code> on top of <code>margin-top: {col.top}px</code>. Is the gap {col.bottom + col.top}px?</>);
              }
            }}
            options={[
              { value: 'box', label: 'One box' },
              { value: 'collapse', label: 'Margin collapse' },
            ]}
          />
          {mode === 'box' && <Toggle label="box-sizing" value={s.boxSizing === 'border-box'} onChange={setSizing} off="content-box" on="border-box" />}
        </>,
        mode === 'box' ? (
          <ControlGroup key="box" label="The box">
            <Slider label="width" value={s.width} min={80} max={320} step={10} onChange={set('width', 'width')} format={(v) => `${v}px`} />
            <Slider label="padding" value={s.padding} min={0} max={40} onChange={set('padding', 'padding')} format={(v) => `${v}px`} />
            <Slider label="border" value={s.border} min={0} max={20} onChange={set('border', 'border')} format={(v) => `${v}px`} />
            <Slider label="margin" value={s.margin} min={0} max={40} onChange={set('margin', 'margin')} format={(v) => `${v}px`} />
          </ControlGroup>
        ) : (
          <ControlGroup key="margins" label="The two margins">
            <Slider label=".first margin-bottom" value={col.bottom} min={-20} max={50} onChange={(v) => { setCol((p) => ({ ...p, bottom: v })); setChanged('margin-bottom'); }} format={(v) => `${v}px`} />
            <Slider label=".second margin-top" value={col.top} min={-20} max={50} onChange={(v) => { setCol((p) => ({ ...p, top: v })); setChanged('margin-top'); }} format={(v) => `${v}px`} />
          </ControlGroup>
        ),
      ]}
    >
      <Workbench
        width={width}
        onWidth={setWidth}
        min={240}
        max={900}
        height={260}
        css={css}
        activeLine={lineFor(css, changed)}
        facts={facts}
      >
        <div ref={canvas} className="cl-canvas">
          {mode === 'box' ? (
            <>
              <div
                className="cl-box"
                style={{ width: s.width, padding: s.padding, borderWidth: s.border, margin: s.margin, boxSizing: s.boxSizing }}
              >
                <div className="cl-content">content</div>
              </div>
              {m && (
                <>
                  <Ring r={m.box} by={m.margin} className="cl-ring-margin" label={`margin ${m.margin}`} />
                  <Ring r={m.box} className="cl-ring-border" />
                  <span className="cl-tag tone-hi" style={{ left: m.box.x + m.box.w + 6, top: m.box.y }}>border {m.border}</span>
                  <span className="cl-tag tone-ok" style={{ left: m.box.x + m.box.w + 6, top: m.box.y + 20 }}>padding {m.padding}</span>
                  <span className="cl-tag tone-info" style={{ left: m.box.x + m.box.w + 6, top: m.box.y + 40 }}>
                    content {m.content.w}×{m.content.h}
                  </span>
                </>
              )}
            </>
          ) : (
            <>
              <p className="cl-para" style={{ marginBottom: col.bottom }}>.first</p>
              <p className="cl-para" style={{ marginTop: col.top }}>.second</p>
              {c && (
                <>
                  <div className="cl-band tone-orange" style={{ top: c.first.y + c.first.h, height: Math.max(0, col.bottom), left: c.first.x, width: c.first.w / 2 }} />
                  <div className="cl-band tone-orange" style={{ top: c.second.y - Math.max(0, col.top), height: Math.max(0, col.top), left: c.second.x + c.second.w / 2, width: c.second.w / 2 }} />
                  <span className="cl-tag tone-hi" style={{ left: c.first.x + c.first.w + 6, top: c.first.y + c.first.h + Math.max(0, c.gap) / 2 - 9 }}>
                    gap {c.gap}px
                  </span>
                </>
              )}
            </>
          )}
        </div>
      </Workbench>
    </StageFrame>
  );
}
