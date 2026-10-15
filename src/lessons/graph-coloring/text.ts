import { chromatic, greedyColour, identityOrder, maxDegree, peel, smallestLast, twoColour, type Graph } from './model';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A cycle read from its lowest-numbered node, towards that node's lower-numbered neighbour, so the same cycle always reads the same. */
function readCycle(cycle: readonly number[]): number[] {
  const at = cycle.indexOf(Math.min(...cycle));
  const ring = [...cycle.slice(at), ...cycle.slice(0, at)];
  return ring[1] > ring[ring.length - 1] ? [ring[0], ...ring.slice(1).reverse()] : ring;
}

export interface Bound {
  yours: number;
  smallestLast: number;
  degreeBound: number;
  degeneracyBound: number;
  optimum: number;
  degeneracy: number;
  peelOrder: number[];
  peelDegrees: number[];
}

/** Every number the bound scene draws, from the graph alone: its greedy row is always the order as given (the scene has no order control). */
export function bound(g: Graph): Bound {
  const p = peel(g);
  return {
    yours: greedyColour(g, identityOrder(g.names.length)).used,
    smallestLast: greedyColour(g, smallestLast(g)).used,
    degreeBound: maxDegree(g) + 1,
    degeneracyBound: p.degeneracy + 1,
    optimum: chromatic(g).number,
    degeneracy: p.degeneracy,
    peelOrder: p.removal,
    peelDegrees: p.degreeAtRemoval,
  };
}

/** The bound scene's numbers from the editor state on screen. The order is deliberately not an input: the scene shows no order, so none may reach it. */
export const boundOf = (ed: { graph: Graph; order: readonly number[] }): Bound => bound(ed.graph);

export function boundCaption(b: Bound): string {
  const tight = b.optimum === b.degreeBound ? ` This graph needs exactly ${b.degreeBound}: the bound is tight here.` : '';
  return `Greedy in the order as given used ${plural(b.yours, 'colour')}, never above the maximum degree + 1 = ${b.degreeBound}. Smallest-last used ${b.smallestLast}, never above the degeneracy + 1 = ${b.degeneracyBound}. The exact minimum is ${b.optimum}.${tight}`;
}

export interface Timetable {
  slots: number;
  conflicts: number;
  greedy: number;
  optimum: number;
  complete: boolean;
}

/** The hand-built timetable (slot per course, 0 = unplaced) against greedy as given and the exact minimum. */
export function timetable(g: Graph, slotOf: readonly number[]): Timetable {
  const conflicts = g.edges.filter(([a, b]) => slotOf[a] > 0 && slotOf[a] === slotOf[b]).length;
  return {
    slots: new Set(slotOf.filter((s) => s > 0)).size,
    conflicts,
    greedy: greedyColour(g, identityOrder(g.names.length)).used,
    optimum: chromatic(g).number,
    complete: slotOf.every((s) => s > 0),
  };
}

export function timetableCaption(t: Timetable): string {
  const base = `Greedy (courses in the order listed) uses ${plural(t.greedy, 'slot')}; the exact minimum is ${t.optimum}.`;
  if (!t.complete) return `${plural(t.slots, 'slot')} in use so far, ${plural(t.conflicts, 'clash', 'clashes')}. Place every course: press a cell to put a course in that slot. ${base}`;
  if (t.conflicts > 0) return `${plural(t.slots, 'slot')}, but ${plural(t.conflicts, 'clash', 'clashes')}: two courses that share a student sit in one slot. ${base}`;
  return `A clash-free timetable in ${plural(t.slots, 'slot')}. ${base} ${t.slots === t.optimum ? 'Yours matches the minimum.' : t.slots > t.optimum ? `Yours uses ${t.slots - t.optimum} more than the minimum.` : ''}`;
}

/** The "why it is hard" scene: the easy two-colour test, and what the exact search says. */
export function hardCaption(g: Graph): string {
  const t = twoColour(g);
  const c = chromatic(g).number;
  if (t.ok) return `The breadth-first test finds a two-colouring, so this graph needs ${plural(c, 'colour')}. Checking whether two colours are enough is easy: it is a single sweep.`;
  return `The breadth-first test hits a clash: ${readCycle(t.oddCycle!).map((v) => g.names[v]).join('–')} is an odd cycle, which cannot be two-coloured. The exact minimum here is ${c}; deciding whether 3 colours suffice has no known fast method in general.`;
}
