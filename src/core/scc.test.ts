import { describe, expect, it } from 'vitest';
import { mulberry32 } from './random';
import { adjacency, canonicalPartition, condense, reverseEdges, stronglyConnectedComponents, type Arc } from './scc';

const randomGraph = (rnd: () => number): { n: number; edges: Arc[] } => {
  const n = 1 + Math.floor(rnd() * 9);
  const edges: Arc[] = [];
  const density = rnd() * 0.5;
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (rnd() < density) edges.push([a, b]);
  return { n, edges };
};

/** Independent oracle: u and v are in one component exactly when each reaches the other (Floyd-Warshall closure). */
function closureClasses(n: number, edges: readonly Arc[]): number[][] {
  const reach = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j));
  for (const [a, b] of edges) reach[a][b] = true;
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (reach[i][k] && reach[k][j]) reach[i][j] = true;
  const classes: number[][] = [];
  const done = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i++) {
    if (done[i]) continue;
    const c = Array.from({ length: n }, (_, j) => j).filter((j) => reach[i][j] && reach[j][i]);
    for (const j of c) done[j] = true;
    classes.push(c);
  }
  return classes;
}

describe('stronglyConnectedComponents', () => {
  it('finds the textbook components: 0-1-2 form a loop, 3-4 another, 5 stands alone', () => {
    const edges: Arc[] = [[0, 1], [1, 2], [2, 0], [2, 3], [3, 4], [4, 3], [4, 5]];
    const { components, comp } = stronglyConnectedComponents(6, edges);
    expect(canonicalPartition(components)).toBe('[[0,1,2],[3,4],[5]]');
    expect(comp[0]).toBe(comp[2]);
    expect(comp[3]).toBe(comp[4]);
    expect(new Set(comp).size).toBe(3);
  });

  it('matches the transitive-closure oracle on 2,000 seeded graphs, and comp indexes components', () => {
    const rnd = mulberry32(31);
    for (let t = 0; t < 2000; t++) {
      const { n, edges } = randomGraph(rnd);
      const { components, comp } = stronglyConnectedComponents(n, edges);
      expect(canonicalPartition(components)).toBe(canonicalPartition(closureClasses(n, edges)));
      components.forEach((c, i) => c.forEach((v) => expect(comp[v]).toBe(i)));
    }
  });

  it('closes components sinks first: every edge between components goes to an earlier one', () => {
    const rnd = mulberry32(37);
    for (let t = 0; t < 500; t++) {
      const { n, edges } = randomGraph(rnd);
      const { comp } = stronglyConnectedComponents(n, edges);
      for (const [a, b] of edges) if (comp[a] !== comp[b]) expect(comp[b]).toBeLessThan(comp[a]);
    }
  });

  it('treats a self-loop and an isolated node as components of their own, and an empty graph as none', () => {
    expect(stronglyConnectedComponents(3, [[1, 1]]).components).toEqual([[0], [1], [2]]);
    expect(stronglyConnectedComponents(0, []).components).toEqual([]);
  });
});

describe('condense', () => {
  it('keeps unique edges between components and a valid topological order, on 500 seeded graphs', () => {
    const rnd = mulberry32(41);
    for (let t = 0; t < 500; t++) {
      const { n, edges } = randomGraph(rnd);
      const { comp, components } = stronglyConnectedComponents(n, edges);
      const c = condense(edges, comp, components.length);
      expect(c.order).not.toBeNull();
      const place = new Map(c.order!.map((x, i) => [x, i]));
      for (const [a, b] of c.edges) expect(place.get(a)!).toBeLessThan(place.get(b)!);
      expect(new Set(c.edges.map(([a, b]) => `${a}>${b}`)).size).toBe(c.edges.length);
      const crossing = new Set(edges.filter(([a, b]) => comp[a] !== comp[b]).map(([a, b]) => `${comp[a]}>${comp[b]}`));
      expect(c.edges.length).toBe(crossing.size);
    }
  });

  it('shows the closed classes a Markov chain needs: components with no edge out of them', () => {
    // 0 and 1 leak into the closed class {2, 3}; 4 is absorbing.
    const edges: Arc[] = [[0, 1], [1, 0], [1, 2], [2, 3], [3, 2], [0, 4], [4, 4]];
    const { comp, components } = stronglyConnectedComponents(5, edges);
    const c = condense(edges, comp, components.length);
    const closed = components.filter((_, i) => !c.edges.some(([a]) => a === i));
    expect(canonicalPartition(closed)).toBe('[[2,3],[4]]');
  });
});

describe('adjacency and reverseEdges', () => {
  it('lists out-neighbours ascending and without repeats, and reverses every edge', () => {
    expect(adjacency(3, [[0, 2], [0, 1], [0, 2], [2, 0]])).toEqual([[1, 2], [], [0]]);
    expect(reverseEdges([[0, 1], [2, 0]])).toEqual([[1, 0], [0, 2]]);
  });
});
