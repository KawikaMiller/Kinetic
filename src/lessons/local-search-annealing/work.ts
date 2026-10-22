import type { TwoOptMove } from '../../core/tsp';
import type { Annealed, TourMap } from './tour';

/** Which method a learner is running on the 2-opt scene. Each keeps its own work, so switching never mixes their numbers. */
export type Method = 'plain' | 'annealed';

export interface Work {
  /** Identifies the map this work belongs to; another map starts the work again. */
  key: string;
  tour: number[];
  moves: TwoOptMove[];
  annealed: Annealed | null;
}

export type Works = Record<Method, Work>;

export const freshWork = (key: string, map: TourMap): Work => ({ key, tour: [...map.start], moves: [], annealed: null });
export const freshWorks = (key: string, map: TourMap): Works => ({ plain: freshWork(key, map), annealed: freshWork(key, map) });

/** The work of one method on the current map; work left over from another map is replaced by a fresh start. */
export function workOf(works: Works, method: Method, key: string, map: TourMap): Work {
  return works[method].key === key ? works[method] : freshWork(key, map);
}

export interface WorkStat {
  label: string;
  value: number;
  sub: string;
}

/** The count tile for a method: its label and its value always describe the same work. */
export function workStat(method: Method, work: Work): WorkStat {
  if (method === 'plain') return { label: '2-opt moves', value: work.moves.length, sub: 'each one shortens the tour' };
  if (!work.annealed) return { label: 'Reversals accepted', value: 0, sub: 'press Run annealed 2-opt' };
  return { label: 'Reversals accepted', value: work.annealed.accepted, sub: `${work.annealed.uphill} made the tour longer` };
}
