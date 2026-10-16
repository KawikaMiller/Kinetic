import { Points, Polygon } from '../../components/Plot2D';
import type { Rect } from './data';
import type { QueryState } from './query';

const corners = (r: Rect): [number, number][] => [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]];

/** The draggable query on a plot, in `--hi`: put it last so it sits above the data. */
export function QueryLayer({ query }: { query: QueryState }) {
  if (query.mode === 'nn') {
    return <Points data={[{ x: query.q[0], y: query.q[1], tone: 'hi', r: 7 }]} onDrag={(_, p) => query.setQ(p)} pointLabel={() => 'Query point'} />;
  }
  return (
    <>
      <Polygon points={corners(query.rect)} tone="hi" dashed />
      <Points
        data={[{ x: query.a[0], y: query.a[1], tone: 'hi', r: 6 }, { x: query.b[0], y: query.b[1], tone: 'hi', r: 6 }]}
        onDrag={(i, p) => (i === 0 ? query.setA(p) : query.setB(p))}
        pointLabel={(i) => `Rectangle corner ${i === 0 ? 'A' : 'B'}`}
      />
    </>
  );
}
