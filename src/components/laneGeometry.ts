import type { Cursor, LaneLimits } from '../core/laneEditor';

/** Room for the lane labels on the left, the slot numbers on top, and the default size of one slot and one lane (SVG units). */
export const LANE_LABEL_W = 52;
export const LANE_AXIS_H = 22;
export const LANE_SLOT_W = 28;
export const LANE_H = 44;

export interface LaneGeometry {
  limits: LaneLimits;
  slotW: number;
  laneH: number;
  width: number;
  height: number;
  /** Left edge of a slot, centre of a slot. */
  slotLeft: (slot: number) => number;
  slotCentre: (slot: number) => number;
  /** Top edge of a lane, centre of a lane. */
  laneTop: (lane: number) => number;
  laneCentre: (lane: number) => number;
  /** The cell under a point in SVG units, or null outside the grid. */
  cellAt: (x: number, y: number) => Cursor | null;
}

export function laneGeometry(limits: LaneLimits, o: { slotW?: number; laneH?: number } = {}): LaneGeometry {
  const { slotW = LANE_SLOT_W, laneH = LANE_H } = o;
  const slotLeft = (slot: number) => LANE_LABEL_W + slot * slotW;
  const laneTop = (lane: number) => LANE_AXIS_H + lane * laneH;
  return {
    limits,
    slotW,
    laneH,
    width: slotLeft(limits.slots),
    height: laneTop(limits.lanes),
    slotLeft,
    slotCentre: (slot) => slotLeft(slot) + slotW / 2,
    laneTop,
    laneCentre: (lane) => laneTop(lane) + laneH / 2,
    cellAt: (x, y) => {
      const slot = Math.floor((x - LANE_LABEL_W) / slotW);
      const lane = Math.floor((y - LANE_AXIS_H) / laneH);
      return slot < 0 || slot >= limits.slots || lane < 0 || lane >= limits.lanes ? null : { lane, slot };
    },
  };
}
