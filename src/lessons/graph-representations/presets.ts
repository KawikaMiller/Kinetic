import type { GEdge, GNode, Graph } from './model';

/** The editor's drawing area (SVG viewBox). */
export const VIEW_W = 640;
export const VIEW_H = 380;

const nodes = (spec: [string, number, number][]): GNode[] => spec.map(([label, x, y], id) => ({ id, label, x, y }));
const edges = (spec: [number, number, number?][]): GEdge[] => spec.map(([u, v, w = 1]) => ({ u, v, w }));

export type PresetId = 'social' | 'roads' | 'courses' | 'complete';

export interface GraphPreset {
  id: PresetId;
  label: string;
  blurb: string;
  graph: Graph;
}

const ring = (count: number, cx: number, cy: number, r: number): [string, number, number][] =>
  Array.from({ length: count }, (_, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / count;
    return ['ABCDEFGHIJ'[i], Math.round(cx + r * Math.cos(a)), Math.round(cy + r * Math.sin(a))];
  });

export const PRESETS: GraphPreset[] = [
  {
    id: 'social',
    label: 'Social network',
    blurb: 'sparse: most people know only a few others, and H knows nobody yet',
    graph: {
      directed: false,
      weighted: false,
      nodes: nodes([['A', 90, 90], ['B', 230, 60], ['C', 180, 200], ['D', 330, 170], ['E', 450, 90], ['F', 440, 260], ['G', 560, 300], ['H', 120, 320]]),
      edges: edges([[0, 1], [0, 2], [1, 2], [2, 3], [3, 4], [3, 5], [5, 6]]),
    },
  },
  {
    id: 'roads',
    label: 'Road grid',
    blurb: 'a 3 × 3 street grid with travel times as weights',
    graph: {
      directed: false,
      weighted: true,
      nodes: nodes([
        ['A', 140, 70], ['B', 320, 70], ['C', 500, 70],
        ['D', 140, 190], ['E', 320, 190], ['F', 500, 190],
        ['G', 140, 310], ['H', 320, 310], ['I', 500, 310],
      ]),
      edges: edges([
        [0, 1, 4], [1, 2, 3], [3, 4, 2], [4, 5, 5], [6, 7, 3], [7, 8, 2],
        [0, 3, 1], [3, 6, 6], [1, 4, 2], [4, 7, 4], [2, 5, 3], [5, 8, 1],
      ]),
    },
  },
  {
    id: 'courses',
    label: 'Course prerequisites',
    blurb: 'an arrow means "take this before that": a DAG, so there is always a valid order',
    graph: {
      directed: true,
      weighted: false,
      nodes: nodes([['A', 80, 190], ['B', 230, 90], ['C', 230, 290], ['D', 400, 90], ['E', 400, 290], ['F', 560, 190]]),
      edges: edges([[0, 1], [0, 2], [1, 3], [2, 3], [2, 4], [3, 5], [4, 5]]),
    },
  },
  {
    id: 'complete',
    label: 'Complete graph',
    blurb: 'every node linked to every other: dense, the case where the matrix wins',
    graph: {
      directed: false,
      weighted: false,
      nodes: nodes(ring(6, VIEW_W / 2, VIEW_H / 2, 150)),
      edges: edges(Array.from({ length: 6 }, (_, i) => Array.from({ length: 6 - i - 1 }, (_, k) => [i, i + k + 1] as [number, number])).flat()),
    },
  },
];

export const WEIGHTS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
