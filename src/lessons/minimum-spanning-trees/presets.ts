import type { Pt } from '../../components/GraphView';
import type { WGraph } from './model';

export type PresetId = 'offices' | 'grid' | 'equal' | 'trap';

export interface Preset {
  id: PresetId;
  label: string;
  names: readonly string[];
  at: readonly Pt[];
  graph: WGraph;
  /** What a weight means here. */
  unit: string;
}

const g = (n: number, list: [number, number, number][]): WGraph => ({ n, edges: list.map(([a, b, w]) => ({ a, b, w })) });

export const PRESETS: readonly Preset[] = [
  {
    id: 'offices',
    label: 'Cabling 6 offices',
    unit: 'metres of cable',
    names: ['A', 'B', 'C', 'D', 'E', 'F'],
    at: [{ x: 70, y: 90 }, { x: 250, y: 50 }, { x: 440, y: 100 }, { x: 110, y: 270 }, { x: 290, y: 230 }, { x: 460, y: 290 }],
    graph: g(6, [[0, 1, 7], [1, 2, 8], [0, 3, 5], [0, 4, 9], [1, 4, 6], [2, 4, 4], [2, 5, 11], [3, 4, 3], [4, 5, 10], [3, 5, 14]]),
  },
  {
    id: 'grid',
    label: 'Road grid',
    unit: 'minutes to pave',
    names: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
    at: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ x: 90 + (i % 3) * 170, y: 55 + Math.floor(i / 3) * 115 })),
    graph: g(9, [
      [0, 1, 4], [1, 2, 9], [3, 4, 2], [4, 5, 7], [6, 7, 8], [7, 8, 3],
      [0, 3, 6], [3, 6, 5], [1, 4, 10], [4, 7, 1], [2, 5, 12], [5, 8, 11],
    ]),
  },
  {
    id: 'equal',
    label: 'Equal weights',
    unit: 'units',
    names: ['A', 'B', 'C', 'D', 'E'],
    at: [{ x: 260, y: 45 }, { x: 450, y: 150 }, { x: 380, y: 300 }, { x: 140, y: 300 }, { x: 70, y: 150 }],
    graph: g(5, [[0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 4, 1], [4, 0, 1], [0, 2, 1], [0, 3, 1]]),
  },
  {
    id: 'trap',
    label: 'Trap: shortest path?',
    unit: 'km of road',
    names: ['Hub', 'A', 'B', 'C', 'D'],
    at: [{ x: 260, y: 290 }, { x: 70, y: 110 }, { x: 200, y: 50 }, { x: 330, y: 50 }, { x: 460, y: 110 }],
    graph: g(5, [[0, 1, 4], [0, 2, 5], [0, 3, 5], [0, 4, 5], [1, 2, 2], [2, 3, 2], [3, 4, 2]]),
  },
];
