import { CellGrid } from '../../components/CellGrid';
import { ELEMENTS, GRID, heatmap, type ElementId, type Session } from './model';

const CELL = { cell: 34, gap: 3 } as const;
const HEAT_BASE = 0.16;
const HEAT_RANGE = 0.7;
const DOT_R = 5;
const PATH_DOT_R = 3;
const ICON_DOT_DX = [-7, 0, 7] as const;
const LABEL_DY = 3.5;
const HEADING_ROW = 4;
const HEADING_DY = 22;

/** The element labels as drawn. The icon button has none: that is the planted problem. */
const GLYPH_LABEL: Partial<Record<ElementId, string>> = {
  title: 'Checkout', image: 'Blue mug', continue: 'Continue', coupon: 'Coupon code', apply: 'Apply', card: 'Card number', pay: 'Pay',
};

interface Props {
  /** Sessions whose clicks make the heatmap. */
  sessions: readonly Session[];
  /** The replayed session, and the index of the last of its steps that has happened. */
  current: Session | null;
  upto: number;
}

/** The checkout wireframe on a CellGrid: cells tint toward --hi where clicks landed, and the current participant's path draws on top. */
export function Prototype({ sessions, current, upto }: Props) {
  const heat = heatmap(sessions);
  const max = Math.max(1, ...heat.flat());
  const steps = current ? current.steps.slice(0, upto + 1) : [];
  return (
    <CellGrid
      rows={GRID.rows}
      cols={GRID.cols}
      size={CELL}
      className="ut-grid"
      ariaLabel="Checkout prototype with a click heatmap and the current participant's path"
      cell={(r, c) => (heat[r][c] ? { tone: 'hi', fill: 'tint', intensity: HEAT_BASE + (HEAT_RANGE * heat[r][c]) / max } : { fill: 'none' })}
      cellTitle={(r, c) => (heat[r][c] ? `${heat[r][c]} ${heat[r][c] === 1 ? 'click' : 'clicks'}` : '')}
      overlay={(g) => {
        const box = (id: ElementId) => {
          const { rows, cols } = ELEMENTS[id];
          const a = g.at(rows[0], cols[0]);
          const b = g.at(rows[1], cols[1]);
          return { x: a.x, y: a.y, w: b.x + g.cell - a.x, h: b.y + g.cell - a.y };
        };
        const heading = g.at(HEADING_ROW, 0);
        return (
          <>
            {(Object.keys(ELEMENTS) as ElementId[]).map((id) => {
              const { x, y, w, h } = box(id);
              return (
                <g key={id} className={`ut-el ut-${id}`}>
                  <rect x={x} y={y} width={w} height={h} rx={6} />
                  {id === 'icon' ? (
                    <g className="ut-icon-dots">{ICON_DOT_DX.map((dx) => <circle key={dx} cx={x + w / 2 + dx} cy={y + h / 2} r={1.8} />)}</g>
                  ) : (
                    <text x={x + w / 2} y={y + h / 2 + LABEL_DY} textAnchor="middle">{GLYPH_LABEL[id]}</text>
                  )}
                </g>
              );
            })}
            <text className="ut-heading" x={heading.x + 2} y={heading.y + HEADING_DY}>Payment</text>
            {steps.length > 1 && (
              <polyline className="ut-path" points={steps.map((s) => `${g.center(s.at.r, s.at.c).x},${g.center(s.at.r, s.at.c).y}`).join(' ')} />
            )}
            {steps.map((s, i) => {
              const p = g.center(s.at.r, s.at.c);
              const kind = s.kind === 'hesitate' ? 'is-hesitate' : s.kind === 'error' || s.kind === 'giveup' ? 'is-error' : s.kind === 'backtrack' ? 'is-backtrack' : '';
              return <circle key={i} className={`ut-dot ${kind}`} cx={p.x} cy={p.y} r={kind ? DOT_R : PATH_DOT_R} />;
            })}
          </>
        );
      }}
    />
  );
}
