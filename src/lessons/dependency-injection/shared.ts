import { minWidthForText } from '../../core/scale';

/** How one object reaches another in the drawings. */
export type EdgeKind = 'plain' | 'new' | 'injected' | 'hidden';

export interface DiEdge {
  from: string;
  to: string;
  kind: EdgeKind;
}

export const BOX = { w: 132, h: 34, rx: 8 };
/** The object-graph drawings are 560 wide with 12px labels. */
export const GRAPH_WIDTH = 560;
export const GRAPH_MIN_WIDTH = minWidthForText(GRAPH_WIDTH, 12);
