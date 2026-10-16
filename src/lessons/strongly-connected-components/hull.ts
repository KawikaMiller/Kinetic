import type { Pt } from '../../components/GraphView';
import { convexHull as sharedHull } from '../../core/geometry';

/**
 * The convex hull (core/geometry, Andrew's monotone chain) in order round the outline. The shared `cross` runs here in
 * screen coordinates (y down), so the polygon winds clockwise on screen; the drawn shape is the same either way.
 */
export const convexHull = <T extends Pt>(points: readonly T[]): T[] => sharedHull(points);

/**
 * An SVG polygon's points for a padded hull. The padding is drawn as a thick round-joined stroke of the same
 * colour (stroke width 2 x pad), so the outline stays inside the viewBox as long as the nodes plus pad do.
 */
export const hullPoints = (points: readonly Pt[]): string => convexHull(points).map((p) => `${p.x},${p.y}`).join(' ');
