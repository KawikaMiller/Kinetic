import { useRef, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { ControlGroup, Legend, Segmented, Slider } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { gridCss, gridLines, lineFor, parseTracks } from './model';
import { px, rectIn, useMeasure, type Rect } from '../../core/useMeasure';
import { Workbench } from './Workbench';

const ITEM_COUNT = 6;
const TEMPLATES = [
  { id: 'thirds', css: 'repeat(3, 1fr)', note: 'three equal columns: 1fr is "one share of the leftover space"' },
  { id: 'sidebar', css: '200px 1fr', note: 'a fixed 200px sidebar, and the rest for the main column' },
  { id: 'auto', css: 'repeat(auto-fill, minmax(120px, 1fr))', note: 'as many 120px+ columns as fit: drag the width and watch columns appear' },
] as const;
type TemplateId = (typeof TEMPLATES)[number]['id'];

interface GridMeasure {
  box: Rect;
  columns: number[];
  rows: number[];
}

function measureGrid(el: HTMLElement): GridMeasure | null {
  const grid = el.querySelector('.cl-grid');
  if (!grid) return null;
  const cs = getComputedStyle(grid);
  const r = rectIn(grid, el);
  const padX = px(cs, 'paddingLeft') + px(cs, 'borderLeftWidth');
  const padY = px(cs, 'paddingTop') + px(cs, 'borderTopWidth');
  return {
    box: { x: r.x + padX, y: r.y + padY, w: r.w - 2 * padX, h: r.h - 2 * padY },
    columns: parseTracks(cs.gridTemplateColumns),
    rows: parseTracks(cs.gridTemplateRows),
  };
}

export function Grid({ picker }: { picker: ReactNode }) {
  const [template, setTemplate] = useState<TemplateId>('thirds');
  const [gap, setGap] = useState(12);
  const [spans, setSpans] = useState<number[]>(() => Array.from({ length: ITEM_COUNT }, () => 1));
  const [picked, setPicked] = useState(0);
  const [width, setWidth] = useState(620);
  const [changed, setChanged] = useState<string | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const setCaption = useSetCaption();
  const m = useMeasure(canvas, measureGrid);
  const t = TEMPLATES.find((x) => x.id === template)!;

  useIntroCaption(
    <>Grid lays items out in rows <i>and</i> columns at once. The dashed lines are the grid lines the browser computed,
      numbered from 1.</>,
  );

  const css = gridCss({ columns: t.css, gap, spans });
  const cols = m ? gridLines(m.columns, gap) : [];
  const rows = m ? gridLines(m.rows, gap) : [];

  return (
    <StageFrame
      height={560}
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'grid item' },
            { color: 'var(--hi)', label: 'item you are editing' },
            { color: 'var(--dim)', label: 'grid lines (numbered)', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented
            label="grid-template-columns"
            value={template}
            onChange={(v) => {
              setTemplate(v);
              setChanged('grid-template-columns');
              setCaption(<><code>{TEMPLATES.find((x) => x.id === v)!.css}</code>: {TEMPLATES.find((x) => x.id === v)!.note}.</>);
            }}
            options={TEMPLATES.map((x) => ({ value: x.id, label: x.css }))}
          />
        </>,
        <ControlGroup key="g" label="Gap and spans">
          <Slider label="gap" value={gap} min={0} max={32} onChange={(v) => { setGap(v); setChanged('gap'); }} format={(v) => `${v}px`} />
          <Segmented label="Edit item" value={picked} onChange={setPicked} options={spans.map((_, i) => ({ value: i, label: String(i + 1) }))} />
          <Segmented
            label={`Item ${picked + 1} spans`}
            value={spans[picked]}
            onChange={(n) => {
              setSpans((prev) => prev.map((x, i) => (i === picked ? n : x)));
              setChanged(`.item-${picked + 1}`);
            }}
            options={[1, 2, 3].map((n) => ({ value: n, label: `${n} col${n > 1 ? 's' : ''}` }))}
          />
        </ControlGroup>,
      ]}
    >
      <Workbench
        width={width}
        onWidth={setWidth}
        min={220}
        max={900}
        height={300}
        css={css}
        activeLine={lineFor(css, changed)}
        facts={[
          { label: 'Columns the browser made', value: m ? m.columns.length : 0, tone: 'info' },
          { label: 'Column widths', value: m ? m.columns.map((c) => Math.round(c)).join(' · ') + ' px' : '' },
          { label: 'Rows', value: m ? m.rows.length : 0 },
        ]}
      >
        <div ref={canvas} className="cl-canvas">
          <div className="cl-grid" style={{ gridTemplateColumns: t.css, gap }}>
            {spans.map((n, i) => (
              <button
                key={i}
                type="button"
                className={`cl-item ${i === picked ? 'is-picked' : ''}`}
                style={{ gridColumn: n > 1 ? `span ${n}` : undefined }}
                onClick={() => setPicked(i)}
              >
                {i + 1}
              </button>
            ))}
          </div>
          {m && (
            <>
              {cols.map((x, i) => (
                <div key={`c${i}`} className="cl-gridline is-col" style={{ left: m.box.x + x, top: m.box.y, height: m.box.h }}>
                  <span>{i + 1}</span>
                </div>
              ))}
              {rows.map((y, i) => (
                <div key={`r${i}`} className="cl-gridline is-row" style={{ top: m.box.y + y, left: m.box.x, width: m.box.w }}>
                  <span>{i + 1}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </Workbench>
    </StageFrame>
  );
}
