import { assignRooms, mergeIntervals, selectActivities, sweepOverlap } from './intervals';
import { INTERVAL_PRESETS, OPENING, SEG_OPEN, SEG_PRESETS } from './presets';
import { scaleNote } from './scale';
import { bruteCrossings, sweepCrossings } from './segments';

const merged = mergeIntervals(OPENING.merge);
const rooms = OPENING.rooms;
const endFirst = sweepOverlap(rooms, 'end-first');
const startFirst = sweepOverlap(rooms, 'start-first');
const select = selectActivities(OPENING.select);
const seg = sweepCrossings(SEG_OPEN.hs, SEG_OPEN.vs);
const brute = bruteCrossings(SEG_OPEN.hs, SEG_OPEN.vs);
const big = scaleNote();
const touching = mergeIntervals(INTERVAL_PRESETS.find((p) => p.id === 'touching')!.intervals);
const touchSet = SEG_PRESETS.find((p) => p.id === 'touching')!.set;
const touchSeg = sweepCrossings(touchSet.hs, touchSet.vs);
const span = (x: { start: number; end: number }) => `[${x.start}, ${x.end})`;

/** Every number the try-this lines and key ideas quote, computed from the same models the scenes use. */
export const FACTS = {
  mergeCount: OPENING.merge.length,
  mergedCount: merged.merged.length,
  mergedList: merged.merged.map(span).join(', '),
  roomsEndFirst: endFirst.max,
  roomsStartFirst: startFirst.max,
  roomsHeap: assignRooms(rooms).rooms,
  overEvents: startFirst.events.filter((e) => e.over).length,
  touchMergedCount: touching.merged.length,
  touchMergedList: touching.merged.map(span).join(', '),
  touchSegCrossings: touchSeg.crossings.length,
  selectCount: OPENING.select.length,
  selectChosen: select.chosen.length,
  segCrossings: seg.crossings.length,
  segSweep: seg.comparisons,
  segBrute: brute.comparisons,
  segPairs: brute.pairs,
  bigN: big.n,
  bigSweep: big.sweep,
  bigBrute: big.brute,
  bigPairs: big.pairs,
};
