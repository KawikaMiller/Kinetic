/**
 * The class diagram's answer table and the "spot it at work" scenarios. Every problem is
 * its yes/no (decision) version, because P and NP are classes of decision problems.
 */

/** The most specific region of the picture, which assumes P ≠ NP. */
export type Region = 'P' | 'NP' | 'NPC' | 'NPH';

export const REGION_NAMES: Record<Region, string> = {
  P: 'P',
  NP: 'NP, not complete',
  NPC: 'NP-complete',
  NPH: 'NP-hard, not in NP',
};

export interface ProblemChip {
  id: string;
  label: string;
  /** The yes/no question the chip stands for. */
  question: string;
  region: Region;
  /** Why it belongs there. */
  why: string;
}

export const CHIPS: readonly ProblemChip[] = [
  {
    id: 'sorting',
    label: 'Sorting',
    question: 'Is this list in order? (and sorting it is O(n log n))',
    region: 'P',
    why: 'Solvable in polynomial time, so it is in P (and therefore in NP too, since P ⊆ NP).',
  },
  {
    id: 'path',
    label: 'Shortest path',
    question: 'Is there a path from s to t of total weight ≤ k? (non-negative weights)',
    region: 'P',
    why: "Dijkstra's algorithm answers it in polynomial time, so it is in P.",
  },
  {
    id: 'subset',
    label: 'Subset sum',
    question: 'Does some subset of these numbers add up to the target?',
    region: 'NPC',
    why: 'A proposed subset is checked in one pass (in NP), and every NP problem reduces to it (NP-hard): NP-complete.',
  },
  {
    id: 'sat',
    label: 'SAT',
    question: 'Can these Boolean variables be set to make the formula true?',
    region: 'NPC',
    why: 'An assignment is checked by evaluating the formula (in NP); the Cook–Levin theorem shows every NP problem reduces to it.',
  },
  {
    id: 'colour',
    label: '3-colouring',
    question: 'Can the graph be coloured with 3 colours, no edge joining two of the same?',
    region: 'NPC',
    why: 'A colouring is checked edge by edge (in NP), and SAT reduces to it: NP-complete.',
  },
  {
    id: 'tsp',
    label: 'Travelling salesman (decision)',
    question: 'Is there a tour of every city with total length ≤ k?',
    region: 'NPC',
    why: 'A proposed tour is checked by adding it up (in NP), and Hamiltonian cycle reduces to it: NP-complete.',
  },
  {
    id: 'halting',
    label: 'Halting problem',
    question: 'Does this program halt on this input?',
    region: 'NPH',
    why: 'Every NP problem reduces to it, so it is NP-hard, but it is undecidable, so no polynomial-time checker exists: not in NP.',
  },
];

/** Feedback for a placement, true or not. */
export function placementFeedback(chip: ProblemChip, region: Region): { correct: boolean; text: string } {
  if (region === chip.region) return { correct: true, text: chip.why };
  if (chip.region === 'P' && region === 'NP') return { correct: false, text: `${chip.label} is in NP, but it is also in P, the smaller region inside it: put it there.` };
  if (chip.region === 'NPC' && region === 'NPH') return { correct: false, text: `${chip.label} is NP-hard, but it is also in NP (an answer is quick to check), so it belongs in the overlap: NP-complete.` };
  if (chip.region === 'NPC' && region === 'NP') return { correct: false, text: `${chip.label} is in NP, and it is also NP-hard (every NP problem reduces to it), so it belongs in the dashed overlap: NP-complete.` };
  if (chip.region === 'NPH') return { correct: false, text: 'The halting problem is undecidable, so it is not in NP (or P) at all; it sits in NP-hard, outside NP.' };
  if (region === 'P') return { correct: false, text: `No polynomial-time algorithm is known for ${chip.label}; putting it in P would settle P vs NP.` };
  return { correct: false, text: `${chip.label} doesn't belong in ${REGION_NAMES[region]}.` };
}

/* ---------- spot it at work ---------- */

export interface Scenario {
  id: string;
  title: string;
  story: string;
  /** The known problem it maps to (one of MAPPINGS). */
  maps: string;
  /** What people actually do about it. */
  advice: string;
}

export const MAPPINGS = ['Graph colouring', 'Bin packing', '0/1 knapsack', 'Shortest path', 'Sorting'] as const;

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'exams',
    title: 'Scheduling with constraints',
    story: 'Put 300 exams into as few time slots as possible, so that no student has two exams in the same slot.',
    maps: 'Graph colouring',
    advice: 'Exams are vertices, a shared student is an edge, slots are colours. It is NP-hard in general and hard even to approximate well, so timetablers use greedy heuristics (such as DSatur), local search or a constraint solver, and accept a good answer over a proven-best one.',
  },
  {
    id: 'truck',
    title: 'Packing trucks',
    story: 'Load parcels of different sizes into as few identical trucks as possible.',
    maps: 'Bin packing',
    advice: 'NP-hard. Simple heuristics come close: first-fit decreasing (sort big to small, put each in the first truck it fits) never needs more than about 11/9 of the best number of trucks, plus a small constant.',
  },
  {
    id: 'features',
    title: 'Features under a budget',
    story: 'Pick which features to build this quarter: each has a cost and a value, and the total cost must stay within the budget.',
    maps: '0/1 knapsack',
    advice: 'NP-hard, but a dynamic program solves it exactly when the budget is a small whole number (pseudo-polynomial, like the subset-sum table), and approximation schemes get within any percentage you ask for in polynomial time.',
  },
];
