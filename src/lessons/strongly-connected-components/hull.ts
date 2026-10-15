import type { Pt } from '../../components/GraphView';

/** Convex hull by Andrew's monotone chain, in order round the outline; one or two points come back as they are. */
export function convexHull(points: readonly Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const unique = pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x || p.y !== pts[i - 1].y);
  if (unique.length < 3) return unique;
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const build = (list: Pt[]) => {
    const chain: Pt[] = [];
    for (const p of list) {
      while (chain.length >= 2 && cross(chain[chain.length - 2], chain[chain.length - 1], p) <= 0) chain.pop();
      chain.push(p);
    }
    chain.pop();
    return chain;
  };
  return [...build(unique), ...build([...unique].reverse())];
}

/**
 * An SVG polygon's points for a padded hull. The padding is drawn as a thick round-joined stroke of the same
 * colour (stroke width 2 x pad), so the outline stays inside the viewBox as long as the nodes plus pad do.
 */
export const hullPoints = (points: readonly Pt[]): string => convexHull(points).map((p) => `${p.x},${p.y}`).join(' ');
