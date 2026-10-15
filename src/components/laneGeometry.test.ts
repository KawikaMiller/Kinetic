import { describe, expect, it } from 'vitest';
import { laneGeometry, LANE_AXIS_H, LANE_LABEL_W } from './laneGeometry';

const geo = laneGeometry({ lanes: 3, slots: 10 }, { slotW: 20, laneH: 40 });

describe('laneGeometry', () => {
  it('sizes the grid from its slots and lanes, past the label column and the axis row', () => {
    expect(geo.width).toBe(LANE_LABEL_W + 10 * 20);
    expect(geo.height).toBe(LANE_AXIS_H + 3 * 40);
    expect(geo.slotCentre(0)).toBe(LANE_LABEL_W + 10);
    expect(geo.laneCentre(2)).toBe(LANE_AXIS_H + 2 * 40 + 20);
  });

  it('finds the cell under a point, and agrees with the centres it draws at', () => {
    for (let lane = 0; lane < 3; lane++) {
      for (let slot = 0; slot < 10; slot++) {
        expect(geo.cellAt(geo.slotCentre(slot), geo.laneCentre(lane))).toEqual({ lane, slot });
      }
    }
  });

  it('is null over the labels, the axis and outside the grid', () => {
    expect(geo.cellAt(LANE_LABEL_W - 1, LANE_AXIS_H + 5)).toBeNull();
    expect(geo.cellAt(LANE_LABEL_W + 5, LANE_AXIS_H - 1)).toBeNull();
    expect(geo.cellAt(geo.width, LANE_AXIS_H + 5)).toBeNull();
    expect(geo.cellAt(LANE_LABEL_W + 5, geo.height)).toBeNull();
  });
});
