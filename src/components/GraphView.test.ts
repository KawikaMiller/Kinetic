import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { layeredLayout, layeredPositions } from '../core/graphLayout';
import { GraphView } from './GraphView';

const BOX = { w: 64, h: 34 } as const;
const SPACING = { direction: 'right', layerGap: 150, nodeGap: 46, padMain: 50, padCross: 30 } as const;
const NODES = ['X', 'A', 'B', 'C'].map((id) => ({ id, label: id, shape: 'box' as const }));
const SUPPORT = [{ from: 'X', to: 'A' }, { from: 'X', to: 'B' }, { from: 'X', to: 'C' }];
/** A and C share a layer with B between them: the edge a same-layer conflict has to bend round. */
const CONFLICT = { from: 'A', to: 'C' };

const render = (edgeStyle: 'straight' | 'curve') =>
  renderToStaticMarkup(createElement(GraphView, {
    nodes: NODES, edges: [...SUPPORT, CONFLICT], layoutEdges: SUPPORT, layout: 'layered', spacing: SPACING, box: BOX, edgeStyle,
    edgeMark: (e: object) => (e === CONFLICT ? { tone: 'bad' as const, dashed: true } : null),
    ariaLabel: 'test graph',
  }));

/** Points along the marked conflict edge's path (a line, or a cubic sampled 40 times). */
function conflictPoints(markup: string): { x: number; y: number }[] {
  const tag = /<(line|path)[^>]*is-dashed[^>]*>/.exec(markup)?.[0] ?? '';
  const num = (name: string) => Number(new RegExp(`${name}="(-?[\\d.]+)"`).exec(tag)?.[1]);
  if (tag.startsWith('<line')) return [{ x: num('x1'), y: num('y1') }, { x: num('x2'), y: num('y2') }];
  const [x0, y0, x1, y1, x2, y2, x3, y3] = (/ d="([^"]+)"/.exec(tag)?.[1].match(/-?[\d.]+/g) ?? []).map(Number);
  return Array.from({ length: 41 }, (_, i) => {
    const t = i / 40;
    const u = 1 - t;
    const k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
    return { x: k[0] * x0 + k[1] * x1 + k[2] * x2 + k[3] * x3, y: k[0] * y0 + k[1] * y1 + k[2] * y2 + k[3] * y3 };
  });
}

describe('GraphView edges inside one layer', () => {
  const placed = layeredPositions(layeredLayout(NODES.map((n) => n.id), SUPPORT), SPACING).at;
  const between = placed.get('B')!;

  it.each(['straight', 'curve'] as const)('%s style: a same-layer edge clears the node between its ends', (style) => {
    const points = conflictPoints(render(style));
    expect(points.length).toBeGreaterThan(1);
    const crossing = points.filter((p) => Math.abs(p.x - between.x) < BOX.w / 2 && Math.abs(p.y - between.y) < BOX.h / 2);
    expect(crossing).toEqual([]);
  });
});
