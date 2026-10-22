import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';
import { starFacts } from './star';
import { M7, toursOf } from './tours';
import { VC_PRESETS, coverResult, presetGraph } from './vc';

const K33 = presetGraph('k33');
/** Edges (0,3), (1,4), (2,5) of K3,3 are the first three clicks of the lesson's first try-this. */
const K33_MATCHING = [0, 4, 8];
const K33_RESULT = coverResult(K33.names.length, K33.edges, K33_MATCHING, 'both');
const M7_TOURS = toursOf(M7);
const STAR_METRIC = starFacts(2);
const STAR_FAR = starFacts(100);

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'An approximation algorithm runs in polynomial time and comes with a proved worst-case ratio against the optimum: you build a matching whose cover is no more than twice the minimum, then watch a tour guarantee fail when distances stop obeying the triangle inequality.',
    what: `Exact answers to NP-hard problems are slow, so an approximation algorithm settles for an answer provably within a factor of the best. For vertex cover, pick a maximal matching and take both endpoints of each matching edge: the cover is no more than twice the minimum. For a metric travelling-salesman tour, doubling a minimum spanning tree stays within 2 of the best tour and Christofides' method within 1.5. These are proofs, which the lesson checks against exact optima on small inputs, and the tour guarantee depends on the triangle inequality: on the lesson's star, with the tree's leaves visited in index order, the same method is ${STAR_FAR.ratio.toFixed(1)} times the optimum at M = ${STAR_FAR.m}, while another valid visiting order costs ${STAR_FAR.bestOrderLength}.`,
    analogy: 'Quoting a taxi fare with a ceiling: you may not find the cheapest route, but you can prove the route you picked costs no more than twice the cheapest one.',
    useCases: [
      'Choosing a fast method with a proved ceiling when the exact problem (cover, routing, scheduling) is NP-hard',
      'Planning delivery or inspection tours where a tour within a known factor of the best is good enough',
      'Reading a paper\'s "x-approximation" as a worst-case ratio on any input, not an average on typical ones',
      'Placing monitors so that each link is watched by one of them, a vertex cover that is no more than twice the minimum',
    ],
    why: 'Many real optimisation problems are NP-hard, and a team has to choose between an exact solver, a heuristic and an approximation. The ratio tells you the worst you can lose, and the breakdown on the star shows that a guarantee comes with assumptions you have to check.',
    watch: 'On the graph, matching edges are drawn in the info colour, vertices filled with the highlight colour are in the cover, a green ring marks the vertices of an exact optimum cover, and a red edge is left uncovered. On the map, the dashed green tour is the optimum, blue is MST doubling, violet is Christofides and a faint line is the spanning tree; the two bars show each ratio against the proved ceilings at 1.5 and 2. On the star, the blue tour is MST doubling and the dashed green one is the optimum; red text and a red ratio appear once the triangle inequality fails.',
  },
  tryThis: [
    `In Vertex cover on ${VC_PRESETS[0].label}, press the edges (0, 3), (1, 4) and (2, 5), then Done: the cover has ${K33_RESULT.cover.length} vertices, the optimum ${K33_RESULT.optimum.size}, and the ratio is exactly ${K33_RESULT.ratio?.toFixed(2)}.`,
    'Press the edge (0, 4): it is refused because vertex 0 is already matched.',
    `Open Metric tour and press Load M7: MST doubling has ratio ${M7_TOURS.ratioDoubling.toFixed(2)}, Christofides ${M7_TOURS.ratioChristofides.toFixed(2)}, and the spanning tree weighs ${M7_TOURS.mst.weight.toFixed(2)}, below the optimum ${M7_TOURS.optimum.length.toFixed(2)}.`,
    `Open Break the metric and set M to ${STAR_FAR.m}: the red banner says the guarantee no longer applies and the ratio reads ${STAR_FAR.ratio.toFixed(2)} for the index visiting order; the note beneath says another order costs ${STAR_FAR.bestOrderLength}.`,
    `Set M back to ${STAR_METRIC.m}: the banner is gone because the triangle inequality holds with equality, and the ratio reads ${STAR_METRIC.ratio.toFixed(2)}: the tour costs ${STAR_METRIC.doublingLength} against ${STAR_METRIC.optimumLength}.`,
  ],
  keyIdeas: [
    'An approximation algorithm runs in polynomial time and proves a worst-case ratio against the optimum on any input; a fast method with no such proof is a heuristic.',
    `Taking both endpoints of a maximal matching gives a vertex cover no more than twice the minimum (a theorem argued in the lesson: the matching edges are disjoint, so the optimum needs one endpoint of each); on K3,3 the cover is ${K33_RESULT.cover.length} against ${K33_RESULT.optimum.size}, so the factor 2 is reached.`,
    `For metric TSP the proof that MST doubling is within 2 and Christofides within 1.5 rests on the tree weighing no more than the optimum; on the 7-point map the ratios are ${M7_TOURS.ratioDoubling.toFixed(2)} (children in index order) and ${M7_TOURS.ratioChristofides.toFixed(2)}, and one map and one visiting order are an example, not the guarantee.`,
    `Each ingredient of a guarantee matters: with the triangle inequality broken the doubling tour that visits the leaves in index order is ${STAR_FAR.ratio.toFixed(2)} times the optimum at M = ${STAR_FAR.m} (the guarantee is a bound over the valid visiting orders of the tree, and failing means some order is that bad; another order here costs ${STAR_FAR.bestOrderLength}), and keeping one endpoint per matching edge leaves an edge uncovered, as the 3-vertex path shows.`,
  ],
  quiz: [
    {
      q: 'What makes the matching-based vertex cover an approximation algorithm, not just a heuristic?',
      options: [
        'A proved bound: its cover is no more than twice the optimum on any graph',
        'It finds the exact minimum cover, only a little slower than greedy',
        'It runs fast on the graphs the author tried, as the ratio meter on the page shows',
        'It is randomised, so the average over many runs is close to optimal',
      ],
      answer: 0,
      why: 'The algorithm is deterministic and not exact; what makes it an approximation algorithm is a proof that its cover is no more than twice the minimum on any graph. Fast runs on a few examples, or a good average, would still be a heuristic without that proof.',
    },
    {
      q: 'On the complete bipartite graph with 3 vertices per side, a maximal matching has 3 edges. What are the cover sizes?',
      options: [
        `The matching cover has ${K33.edges.length} vertices and the optimum has ${K33_RESULT.optimum.size}, a ratio of ${K33.edges.length / K33_RESULT.optimum.size}`,
        `The matching cover has ${K33_MATCHING.length} vertices, the same as the optimum cover`,
        `The matching cover has ${K33_RESULT.cover.length} vertices, and so does the optimum cover`,
        `Matching cover ${K33_RESULT.cover.length} against optimum ${K33_RESULT.optimum.size}, a ratio of exactly ${K33_RESULT.ratio}`,
      ],
      answer: 3,
      why: `Both endpoints of the ${K33_MATCHING.length} matching edges are taken, which is the whole set of ${K33_RESULT.cover.length} vertices, while one whole side of ${K33_RESULT.optimum.size} vertices already touches each edge: the ratio is exactly ${K33_RESULT.ratio}, so the bound of 2 is reached.`,
    },
    {
      q: 'You change one distance so that the triangle inequality fails. What happens to the 2x guarantee of MST doubling?',
      options: [
        'It still holds, because the spanning tree itself is unchanged by the edit you made',
        'It still holds, but the constant 2 is replaced by a constant 3 instead',
        `It no longer applies; on the lesson's star the tour is ${Math.round(STAR_FAR.ratio)} times the optimum`,
        'It becomes exact, because the tour now follows only the cheapest edges',
      ],
      answer: 2,
      why: `The proof needs shortcuts to be no longer than the detours they replace, and that is the triangle inequality. On the star at M = ${STAR_FAR.m} the tour that visits the leaves in index order costs ${STAR_FAR.doublingLength} against an optimum of ${STAR_FAR.optimumLength}, a ratio of ${STAR_FAR.ratio.toFixed(2)}; the tree is unchanged, but the shortcut argument is not. A different visiting order of the same tree costs ${STAR_FAR.bestOrderLength} here, which is why the guarantee is a bound over the valid visiting orders of the tree.`,
    },
    {
      q: `On the lesson's 7-point map the tree weighs ${M7_TOURS.mst.weight.toFixed(1)} and the best tour ${M7_TOURS.optimum.length.toFixed(1)}. Why can the spanning tree not weigh more than the best tour?`,
      options: [
        'The tree visits fewer vertices than the tour does, so it has to be the shorter one',
        'A tour minus one edge is a spanning tree, so the minimum tree weighs no more',
        'Because distances are Euclidean, each tree is shorter than each tour',
        'It is a coincidence of this map and it fails on some other maps',
      ],
      answer: 1,
      why: 'Removing one edge from the best tour leaves a spanning tree of the same vertices, so the minimum spanning tree weighs no more than that. This holds on any map, which is the first step of the proof that doubling is within 2.',
    },
    {
      q: `Christofides gave a tour of ${M7_TOURS.christofides.length.toFixed(2)} against the optimum ${M7_TOURS.optimum.length.toFixed(2)} on one map, a ratio of ${M7_TOURS.ratioChristofides.toFixed(2)}. What does that show?`,
      options: [
        `That Christofides stays within ${Math.round((M7_TOURS.ratioChristofides - 1) * 100)} percent of the optimal tour on any map`,
        'That the tour would be optimal after one more shortcut pass over it',
        'That the 1.5 bound is wrong, because 1.09 is far smaller than 1.5',
        'Nothing about other maps; the guarantee is the proved bound of 1.5',
      ],
      answer: 3,
      why: 'One ratio is one example, so it cannot show that other maps behave the same. The guarantee is the proved ceiling of 1.5, which a ratio of 1.09 sits below, so the bound is not contradicted and not tightened either.',
    },
  ],
};

export default lesson;
