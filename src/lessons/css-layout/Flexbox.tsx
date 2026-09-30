import { useRef, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { ControlGroup, Legend, Segmented, Slider, Toggle } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { emptySpace, flexCss, lineFor, lineGroups, type Align, type Direction, type FlexSettings, type Justify, type Span } from './model';
import { px, rectIn, useMeasure, type Rect } from './useMeasure';
import { Workbench } from './Workbench';

const ITEM_COUNT = 4;
const START: FlexSettings = {
  direction: 'row',
  justify: 'flex-start',
  align: 'stretch',
  wrap: false,
  gap: 10,
  items: Array.from({ length: ITEM_COUNT }, () => ({ basis: 90, grow: 0, shrink: 1 })),
};
/** A column needs a definite height to have free space on its main axis. */
const COLUMN_HEIGHT = 300;
const JUSTIFY: Justify[] = ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'];
const ALIGN: Align[] = ['stretch', 'flex-start', 'center', 'flex-end'];

interface FlexMeasure {
  /** The content box, relative to the canvas. */
  box: Rect;
  items: Rect[];
}

function measureFlex(el: HTMLElement): FlexMeasure | null {
  const row = el.querySelector('.cl-flex');
  if (!row) return null;
  const cs = getComputedStyle(row);
  const r = rectIn(row, el);
  const padX = px(cs, 'paddingLeft') + px(cs, 'borderLeftWidth');
  const padY = px(cs, 'paddingTop') + px(cs, 'borderTopWidth');
  return {
    box: { x: r.x + padX, y: r.y + padY, w: r.w - 2 * padX, h: r.h - 2 * padY },
    items: [...row.querySelectorAll('.cl-item')].map((it) => rectIn(it, el)),
  };
}

interface Region extends Span {
  cross: number;
  crossSize: number;
}

/** The measured empty stretches on each flex line: the free space justify-content handed out. */
function freeRegions(m: FlexMeasure, dir: Direction, gap: number): Region[] {
  const row = dir === 'row';
  const items = m.items.map((r) => ({
    start: row ? r.x : r.y,
    end: row ? r.x + r.w : r.y + r.h,
    cross: row ? r.y : r.x,
    crossSize: row ? r.h : r.w,
  }));
  const container = row ? { start: m.box.x, end: m.box.x + m.box.w } : { start: m.box.y, end: m.box.y + m.box.h };
  return lineGroups(items).flatMap((line) => {
    const cross = Math.min(...line.map((i) => i.cross));
    const crossSize = Math.max(...line.map((i) => i.cross + i.crossSize)) - cross;
    return emptySpace(container, line, gap).map((s) => ({ ...s, cross, crossSize }));
  });
}

export function Flexbox({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState(START);
  const [picked, setPicked] = useState(1);
  const [width, setWidth] = useState(600);
  const [changed, setChanged] = useState<string | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const setCaption = useSetCaption();
  const m = useMeasure(canvas, measureFlex);

  useIntroCaption(
    <>Four items with <code>flex-basis: 90px</code>. Whatever's left over is <span className="hl violet">free space</span>:
      give an item some <code>flex-grow</code> and it takes a share.</>,
  );

  const set = <K extends keyof FlexSettings>(key: K, label: string) => (v: FlexSettings[K]) => {
    setS((prev) => ({ ...prev, [key]: v }));
    setChanged(label);
  };
  const setItem = (key: 'grow' | 'shrink' | 'basis') => (v: number) => {
    setS((prev) => ({ ...prev, items: prev.items.map((it, i) => (i === picked ? { ...it, [key]: v } : it)) }));
    setChanged(`.item-${picked + 1}`);
  };

  const row = s.direction === 'row';
  const regions = m ? freeRegions(m, s.direction, s.gap) : [];
  const free = Math.round(regions.reduce((sum, r) => sum + (r.end - r.start), 0));
  const sizes = m ? m.items.map((r) => Math.round(row ? r.w : r.h)) : [];
  const css = flexCss(s);
  const item = s.items[picked];

  const describeItem = (i: number) => {
    const basis = s.items[i].basis;
    const d = sizes[i] - basis;
    return d === 0 ? `${sizes[i]}` : `${basis} → ${sizes[i]} (${d > 0 ? '+' : ''}${d})`;
  };

  return (
    <StageFrame
      height={560}
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'item (content)' },
            { color: 'var(--violet)', label: 'free space' },
            { color: 'var(--hi)', label: 'item you are editing' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="flex-direction" value={s.direction} onChange={set('direction', 'flex-direction')} options={[{ value: 'row', label: 'row' }, { value: 'column', label: 'column' }]} />
          <Toggle label="flex-wrap" value={s.wrap} onChange={set('wrap', 'flex-wrap')} off="nowrap" on="wrap" />
          <Slider label="gap" value={s.gap} min={0} max={40} onChange={set('gap', 'gap')} format={(v) => `${v}px`} />
        </>,
        <>
          <Segmented label="justify-content" value={s.justify} onChange={set('justify', 'justify-content')} options={JUSTIFY.map((j) => ({ value: j, label: j }))} />
          <Segmented label="align-items" value={s.align} onChange={set('align', 'align-items')} options={ALIGN.map((a) => ({ value: a, label: a }))} />
        </>,
        <ControlGroup key="item" label={`Item ${picked + 1}: flex: ${item.grow} ${item.shrink} ${item.basis}px`}>
          <Segmented label="Edit item" value={picked} onChange={setPicked} options={s.items.map((_, i) => ({ value: i, label: String(i + 1) }))} />
          <Slider label="flex-grow" value={item.grow} min={0} max={3} onChange={(v) => { setItem('grow')(v); if (free > 0) setCaption(<>Item {picked + 1} now asks for {v} share{v === 1 ? '' : 's'} of the free space.</>); }} />
          <Slider label="flex-shrink" value={item.shrink} min={0} max={3} onChange={setItem('shrink')} />
          <Slider label="flex-basis" value={item.basis} min={40} max={260} step={10} onChange={setItem('basis')} format={(v) => `${v}px`} />
        </ControlGroup>,
      ]}
    >
      <Workbench
        width={width}
        onWidth={setWidth}
        min={220}
        max={900}
        height={row ? 220 : COLUMN_HEIGHT + 40}
        css={css}
        activeLine={lineFor(css, changed)}
        facts={[
          { label: 'Free space (measured)', value: `${free} px`, tone: 'violet' },
          ...sizes.map((_, i) => ({ label: `Item ${i + 1} ${row ? 'width' : 'height'}`, value: describeItem(i), tone: i === picked ? 'hi' : 'info' })),
        ]}
      >
        <div ref={canvas} className="cl-canvas">
          <div
            className="cl-flex"
            style={{
              flexDirection: s.direction,
              justifyContent: s.justify,
              alignItems: s.align,
              flexWrap: s.wrap ? 'wrap' : 'nowrap',
              gap: s.gap,
              height: row ? undefined : COLUMN_HEIGHT,
            }}
          >
            {s.items.map((it, i) => (
              <button
                key={i}
                type="button"
                className={`cl-item ${i === picked ? 'is-picked' : ''}`}
                style={{ flex: `${it.grow} ${it.shrink} ${it.basis}px` }}
                onClick={() => setPicked(i)}
              >
                {i + 1}
                {sizes[i] !== undefined && <small>{sizes[i]}px</small>}
              </button>
            ))}
          </div>
          {regions.map((r, i) => (
            <div
              key={i}
              className="cl-free"
              style={row ? { left: r.start, width: r.end - r.start, top: r.cross, height: r.crossSize } : { top: r.start, height: r.end - r.start, left: r.cross, width: r.crossSize }}
            />
          ))}
        </div>
      </Workbench>
    </StageFrame>
  );
}
