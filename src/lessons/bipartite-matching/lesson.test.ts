import { describe, expect, it } from 'vitest';
import lesson from './index';
import {
  DEFAULT_COSTS, PRESETS, assignmentCost, emptyMatching, findAugmenting, flip, greedy, greedyAssignment, hungarian, maximumMatching, matchingSize, presetById, type Bipartite, type Matching,
} from './model';
import { costCaption, flowCaption, flowPathText, hallCaption, matchCaption } from './text';

const greedyGraph = presetById('greedy').graph;
const none = presetById('none').graph;

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: Greedy matches 3 of 4 and strands W2, Find path shows W2-J1-W1-J2-W4-J4, flipping reaches 4', () => {
    const m = greedy(greedyGraph);
    expect(matchCaption(greedyGraph, m, null)).toContain('3 of 4 workers matched, but a larger matching exists (4)');
    const s = findAugmenting(greedyGraph, m, 1);
    const caption = matchCaption(greedyGraph, m, s);
    expect(caption).toContain('Search from W2: W2-J1-W1-J2-W4-J4');
    expect(caption).toContain('5 in all');
    expect(caption).toContain('takes the matching from 3 to 4');
    const grown = flip(m, s.path!);
    expect(matchCaption(greedyGraph, grown, null)).toContain('Every worker has a job: 4 pairs');
    expect(lesson.tryThis[0]).toContain('matches 3 of 4 (W1-J1, W3-J3, W4-J2) and strands W2');
    expect(lesson.tryThis[0]).toContain('W2-J1-W1-J2-W4-J4');
    expect(lesson.tryThis[0]).toContain('reaches 4');
  });

  it('try-this 2: on No perfect matching, after augmenting from every free worker a search finds no path and names the stuck set', () => {
    const m = maximumMatching(none);
    expect(matchingSize(m)).toBe(2);
    const free = m.indexOf(-1);
    const s = findAugmenting(none, m, free);
    expect(s.path).toBeNull();
    expect(matchCaption(none, m, s)).toContain('reached {W1, W2, W3} and the jobs {J1, J2}');
    expect(matchCaption(none, m, null)).toContain('no free worker has an augmenting path');
    expect(lesson.tryThis[1]).toContain('reaches W1, W2, W3 and J1, J2 and finds no augmenting path');
  });

  it('try-this 3: the Hall scene names {W1, W2, W3} and {J1, J2}, and the cover has 2 nodes, the largest matching\'s size', () => {
    const c = hallCaption(none, true);
    expect(c).toContain('{W1, W2, W3} likes only {J1, J2}: 3 workers cannot fit 2 jobs');
    expect(c).toContain('The largest matching has 2');
    expect(c).toMatch(/A vertex cover of 2 nodes/);
    expect(hallCaption(none, false)).not.toContain('vertex cover');
    expect(lesson.tryThis[2]).toContain('2 nodes, the size of the largest matching, 2');
  });

  it('try-this 4: As a flow, the pushed path reads s → W2 → J1 ⇠ W1 → J2 ⇠ W4 → J4 → t and raises the flow from 3 to 4', () => {
    const m = greedy(greedyGraph);
    const s = findAugmenting(greedyGraph, m, 1);
    expect(flowPathText(s.path!)).toBe('s → W2 → J1 ⇠ W1 → J2 ⇠ W4 → J4 → t');
    expect(flowCaption(m, s)).toContain('raises the flow from 3 to 4');
    expect(flowCaption(flip(m, s.path!), null)).toContain('Flow 4:');
    expect(lesson.tryThis[3]).toContain('from 3 to 4');
  });

  it('try-this 5: Costs reads greedy 14, optimal 13 with W1-J2, W2-J1, W3-J3, W4-J4', () => {
    const g = greedyAssignment(DEFAULT_COSTS);
    const b = hungarian(DEFAULT_COSTS);
    expect(assignmentCost(DEFAULT_COSTS, g)).toBe(14);
    expect(assignmentCost(DEFAULT_COSTS, b)).toBe(13);
    expect(costCaption(DEFAULT_COSTS, g, b)).toBe('Greedy per row costs 14 (W1-J2, W2-J3, W3-J1, W4-J4); the optimal assignment costs 13 (W1-J2, W2-J1, W3-J3, W4-J4), 1 less.');
    expect(lesson.tryThis[4]).toContain('costs 14 and the optimal assignment costs 13 (W1-J2, W2-J1, W3-J3, W4-J4)');
  });
});

describe('every caption reads cleanly and is computed from the state', () => {
  const states = (g: Bipartite): Matching[] => [emptyMatching(g), greedy(g), maximumMatching(g)];

  it('walks every preset through empty, greedy and maximum matchings, with and without a search, for each worker: no NaN, sizes quoted correctly', () => {
    for (const p of PRESETS) {
      for (const m of states(p.graph)) {
        const size = matchingSize(m);
        const base = matchCaption(p.graph, m, null);
        expect(base).not.toMatch(/NaN|undefined|null/);
        expect(base).toContain(String(size));
        for (let w = 0; w < p.graph.workers; w++) {
          if (m[w] >= 0) continue;
          const c = matchCaption(p.graph, m, findAugmenting(p.graph, m, w));
          expect(c).not.toMatch(/NaN|undefined|null/);
          expect(c).toContain(`W${w + 1}`);
        }
        expect(hallCaption(p.graph, true)).not.toMatch(/NaN|undefined|null/);
        expect(flowCaption(m, null)).toContain(`Flow ${size}`);
      }
    }
  });

  it('the Hall caption says no set is short of jobs exactly when a largest matching covers every worker', () => {
    for (const p of PRESETS) {
      const covers = matchingSize(maximumMatching(p.graph)) === p.graph.workers;
      expect(hallCaption(p.graph, false).includes('no set of workers is short of jobs')).toBe(covers);
    }
  });
});
