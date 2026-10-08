import type { GraphEdgeMark, GraphNodeMark } from '../../components/GraphView';
import type { BarSegment } from '../../components/Bar';
import { CHUNK_TONE, removedKb, shakeEvents, type BuildFrame } from './buildFrames';
import { moduleKb, type Build, type Import } from './model';

/** How a module is drawn at one moment of the story. */
export type NodeState = 'idle' | 'visiting' | 'bundled' | 'dropped' | 'sideEffect' | 'initial' | 'lazy' | 'shared';

/** The state of module `id` in frame `f`. */
export function nodeState(f: BuildFrame, b: Build, id: string): NodeState {
  if (f.phase === 'walk') return f.current === id ? 'visiting' : f.visited.includes(id) ? 'bundled' : 'idle';
  const applied = shakeEvents(b).slice(0, f.shakeStep);
  if (applied.some((e) => e.id === id && e.kind === 'drop')) return 'dropped';
  if (f.splitStep === 2) {
    const chunk = b.chunks.find((c) => c.modules.includes(id));
    if (chunk) return chunk.kind === 'lazy' ? 'lazy' : chunk.kind === 'shared' ? 'shared' : 'initial';
  }
  return applied.some((e) => e.id === id && e.kind === 'sideEffect') ? 'sideEffect' : 'bundled';
}

const MARKS: Partial<Record<NodeState, GraphNodeMark>> = {
  visiting: { tone: 'hi', fill: 'solid' },
  bundled: { tone: 'info', fill: 'tint' },
  initial: { tone: 'info', fill: 'tint' },
  sideEffect: { tone: 'orange', fill: 'tint' },
  lazy: { tone: 'violet', fill: 'tint' },
  shared: { tone: 'sky', fill: 'tint' },
};
export const markOf = (s: NodeState): GraphNodeMark | null => MARKS[s] ?? null;

const EDGE_WIDTH = 2.5;

/** The dynamic import edge once it is drawn, and edges into a dropped module. */
export function edgeMarkOf(e: Import, f: BuildFrame, states: Record<string, NodeState>): GraphEdgeMark | null {
  if (e.dynamic && f.splitStep >= 1) return { tone: 'violet', dashed: true, width: EDGE_WIDTH };
  if (states[e.to] === 'dropped') return { tone: 'dim', dashed: true, width: EDGE_WIDTH };
  return null;
}

/** The bytes bar for one frame: what is in the bundle, what was removed, and (when split) which chunk holds it. */
export function bytesSegments(f: BuildFrame, b: Build): { segments: BarSegment[]; shown: number } {
  if (f.phase === 'walk') {
    const shown = f.visited.reduce((s, id) => s + moduleKb(b.graph.modules[id]), 0);
    return { segments: [{ value: shown, tone: 'info' }], shown };
  }
  const gone = removedKb(shakeEvents(b), f.shakeStep);
  const removed: BarSegment = { value: gone, tone: 'dim' };
  if (f.splitStep === 2) {
    return { segments: [...b.chunks.map((c) => ({ value: c.kb, tone: CHUNK_TONE[c.kind] })), removed], shown: b.shakenKb };
  }
  return { segments: [{ value: b.fullKb - gone, tone: 'info' }, removed], shown: b.fullKb - gone };
}
