/**
 * vector-search, scene 3: the frames of one HNSW search, one per step of its trace, with a caption built from the step itself.
 */
import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';
import type { HnswResult, TraceStep } from './hnsw';

export interface SearchFrame extends Frame {
  /** The step this frame shows (null on the opening frame). */
  step: TraceStep | null;
  layer: number;
  current: number | null;
  /** Nodes whose distance has been computed up to and including this step. */
  visited: number[];
}

const sentence = (s: TraceStep): ReactNode => {
  switch (s.kind) {
    case 'enter': return <>Start at the entry point on layer {s.layer}: distance {s.d.toFixed(2)}.</>;
    case 'hop': return <>On layer {s.layer}, a neighbour is closer ({s.d.toFixed(2)}): hop to it.</>;
    case 'drop': return <>No neighbour on layer {s.layer} is closer than {s.d.toFixed(2)}: drop to layer {s.layer - 1}.</>;
    case 'visit': return <>On layer 0, check a node ({s.d.toFixed(2)}) and keep it if it is among the closest found.</>;
    case 'done': return <>The candidate list stops improving: the nearest found is at {s.d.toFixed(2)}.</>;
  }
};

/** An opening frame and one per trace step, each with the nodes visited so far. */
export function searchFrames(r: HnswResult, top: number): SearchFrame[] {
  const frames: SearchFrame[] = [{ step: null, layer: top, current: null, visited: [], say: <>The graph has {top + 1} layers: few nodes on top, all of them on layer 0. A search starts at the top and walks down, stepping through the trace of this query.</> }];
  const seen = new Set<number>();
  let current: number | null = null;
  r.trace.forEach((s) => {
    if (s.kind === 'enter' || s.kind === 'hop') current = s.node;
    seen.add(s.node);
    frames.push({ step: s, layer: s.layer, current, visited: [...seen], say: <>{sentence(s)} {s.computations} {s.computations === 1 ? 'computation' : 'computations'} so far.</> });
  });
  return frames;
}
