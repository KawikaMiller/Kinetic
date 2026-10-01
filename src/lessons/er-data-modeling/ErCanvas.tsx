import { rectCenter, rectEdgeToward } from '../../components/memory/geometry';
import type { Pt } from '../../core/geometry';
import type { End, Entity, Relationship } from './model';
import { CARD, cardRect, endMarks, type Mark } from './notation';

const CANVAS_W = 840;
const MARGIN = 30;
const LOOP = 46;

/** Entity cards joined by crow's-foot relationship lines. Clicking a line selects it. */
export function ErCanvas({
  entities, rels, selected, broken, onSelect,
}: {
  entities: Entity[];
  rels: Relationship[];
  selected: string | null;
  broken: ReadonlySet<string>;
  onSelect: (id: string) => void;
}) {
  const sel = rels.find((r) => r.id === selected);
  const hot = new Set(sel ? [sel.a.entity, sel.b.entity] : []);
  const height = Math.max(...entities.map((e) => { const box = cardRect(e); return box.y + box.h; })) + MARGIN;
  return (
    <svg viewBox={`0 0 ${CANVAS_W} ${height}`} className="er-canvas" role="img" aria-label="Entity-relationship diagram">
      {rels.map((r) => (
        <RelLine key={r.id} r={r} entities={entities} state={broken.has(r.id) ? 'is-bad' : r.id === selected ? 'is-on' : ''} onSelect={onSelect} />
      ))}
      {entities.map((e) => {
        const box = cardRect(e);
        return (
          <g key={e.id} className={`er-card ${hot.has(e.id) ? 'is-hot' : ''}`}>
            <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={10} />
            <text x={box.x + 12} y={box.y + 20} className="er-card-title">{e.table}</text>
            <line x1={box.x} y1={box.y + CARD.headerH} x2={box.x + box.w} y2={box.y + CARD.headerH} className="er-card-rule" />
            {e.attrs.map((a, i) => (
              <text key={a} x={box.x + 12} y={box.y + CARD.headerH + 15 + i * CARD.rowH} className="er-card-attr">{a}</text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function RelLine({ r, entities, state, onSelect }: { r: Relationship; entities: Entity[]; state: string; onSelect: (id: string) => void }) {
  const a = entities.find((e) => e.id === r.a.entity)!;
  const b = entities.find((e) => e.id === r.b.entity)!;
  const ra = cardRect(a);
  const rb = cardRect(b);
  let path: string;
  let ends: { edge: Pt; away: Pt; end: End }[];
  let label: Pt;
  if (a.id === b.id) {
    // a self-relation loops out of the card's right side and back in
    const x = ra.x + ra.w;
    const y1 = ra.y + ra.h * 0.32;
    const y2 = ra.y + ra.h * 0.72;
    path = `M ${x} ${y1} C ${x + LOOP * 2} ${y1 - 10}, ${x + LOOP * 2} ${y2 + 10}, ${x} ${y2}`;
    ends = [{ edge: { x, y: y1 }, away: { x: 1, y: -0.12 }, end: r.a }, { edge: { x, y: y2 }, away: { x: 1, y: 0.12 }, end: r.b }];
    label = { x: x + LOOP * 1.6, y: (y1 + y2) / 2 + 4 };
  } else {
    const pa = rectEdgeToward(ra, rectCenter(rb));
    const pb = rectEdgeToward(rb, rectCenter(ra));
    path = `M ${pa.x} ${pa.y} L ${pb.x} ${pb.y}`;
    ends = [{ edge: pa, away: { x: pb.x - pa.x, y: pb.y - pa.y }, end: r.a }, { edge: pb, away: { x: pa.x - pb.x, y: pa.y - pb.y }, end: r.b }];
    label = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 - 8 };
  }
  return (
    <g className={`er-rel ${state}`} onClick={() => onSelect(r.id)}>
      <path d={path} className="er-rel-hit" />
      <path d={path} className="er-rel-line" />
      {ends.flatMap((e, i) => endMarks(e.edge, e.away, e.end).map((m, j) => <MarkView key={`${i}-${j}`} m={m} />))}
      <text x={label.x} y={label.y} textAnchor={a.id === b.id ? 'start' : 'middle'} className="er-rel-label">{r.label}</text>
    </g>
  );
}

function MarkView({ m }: { m: Mark }) {
  return m.kind === 'line'
    ? <line x1={m.from.x} y1={m.from.y} x2={m.to.x} y2={m.to.y} className="er-mark" />
    : <circle cx={m.at.x} cy={m.at.y} r={m.r} className="er-mark er-mark-circle" />;
}
