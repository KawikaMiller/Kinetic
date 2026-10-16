import { OPENING_POINTS, SQUARE_PRESET } from './board';
import { hullFrames } from './frames';
import { andrew, countOrientations, cross, graham, jarvis } from './hull';
import { SCALING_SIZES, scaling } from './scaling';
import { TURN_PRESETS } from './turn';
import { findMismatches, hullDemo, orientDouble, orientExact, SEG_FROM, SEG_TO } from './robust';

const [left, right, collinear] = TURN_PRESETS.map((p) => cross(p.points[0], p.points[1], p.points[2]));
const grahamRun = hullFrames('graham', OPENING_POINTS, 'drop');
const circle = scaling('circle');
const disc = scaling('disc');
const lastCircle = circle[circle.length - 1];
const lastDisc = disc[disc.length - 1];
const mismatch = findMismatches()[0];
const demo = hullDemo(mismatch);

/** Every number the try-this lines and key ideas quote, computed from the same models the scenes use. */
export const FACTS = {
  left,
  right,
  collinear,
  leftArea: Math.abs(left) / 2,
  points: OPENING_POINTS.length,
  grahamHull: grahamRun.hull.length,
  grahamTests: grahamRun.orientations,
  grahamPops: grahamRun.frames.filter((f) => f.popped !== null).length,
  squareDrop: graham(SQUARE_PRESET, 'drop').length,
  squareKeep: graham(SQUARE_PRESET, 'keep').length,
  scatterKeep: graham(OPENING_POINTS, 'keep').length,
  andrewTests: countOrientations('andrew', OPENING_POINTS),
  jarvisTests: countOrientations('jarvis', OPENING_POINTS),
  andrewHull: andrew(OPENING_POINTS).length,
  jarvisHull: jarvis(OPENING_POINTS).length,
  circleN: SCALING_SIZES[SCALING_SIZES.length - 1],
  circleH: lastCircle.h,
  circleJarvis: lastCircle.jarvis,
  circleAndrew: lastCircle.andrew,
  discH: lastDisc.h,
  discJarvis: lastDisc.jarvis,
  discAndrew: lastDisc.andrew,
  mismatchI: mismatch.i,
  mismatchJ: mismatch.j,
  mismatchDouble: orientDouble(mismatch.point, SEG_FROM, SEG_TO),
  mismatchExact: orientExact(mismatch.point, SEG_FROM, SEG_TO).sign,
  demoDouble: demo.withDouble.length,
  demoExact: demo.withExact.length,
};
