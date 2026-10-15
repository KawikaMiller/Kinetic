import { planNodes, type PlanNode } from './model';

const INDENT = '      ';
const fixed = (x: number): string => x.toFixed(2);

/**
 * The plan printed the way PostgreSQL's EXPLAIN lays it out, as the author remembers the format
 * (the lesson chips it "shown, not run"): `cost=startup..total rows=n`, child nodes after `->`,
 * conditions underneath. With `analyze` each node also prints the rows it really returned.
 * The width column and timings of the real output are left out.
 */
export function planTextLines(root: PlanNode, analyze: boolean): string[] {
  return planNodes(root).flatMap((node, depth) => {
    const pad = INDENT.repeat(Math.max(0, depth - 1)) + (depth > 0 ? '  ' : '');
    const head = `${pad}${depth > 0 ? '->  ' : ''}${node.title}  (cost=${fixed(node.startup)}..${fixed(node.total)} rows=${Math.round(node.estRows)})${analyze ? ` (actual rows=${node.actualRows} loops=1)` : ''}`;
    const detailPad = INDENT.repeat(depth) + (depth > 0 ? '' : '  ');
    return [head, ...node.detail.map((d) => `${detailPad}${d}`)];
  });
}
