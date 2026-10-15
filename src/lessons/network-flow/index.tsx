import type { LessonModule } from '../../core/types';
import { UNLUCKY_K, adversarialRun, cutCapacity, edmondsKarp, presetById, reachableSet, unluckyNetwork } from './model';
import { Stage } from './Stage';

const TEXTBOOK = presetById('textbook').net;
const TEXTBOOK_RUN = edmondsKarp(TEXTBOOK);
const TEXTBOOK_SIDE = reachableSet(TEXTBOOK, TEXTBOOK_RUN.flow);
const SIDE_NAMES = TEXTBOOK.names.filter((_, v) => TEXTBOOK_SIDE.has(v)).join(' ');
const FLOW = TEXTBOOK_RUN.value;
const PUSHES = TEXTBOOK_RUN.steps.length;
const HAND_SIDE = new Set(['s', 'v1', 'v2', 'v4'].map((n) => TEXTBOOK.names.indexOf(n)));
const HAND_CUT = cutCapacity(TEXTBOOK, HAND_SIDE);
const ADVERSARIAL = adversarialRun(UNLUCKY_K).steps.length;
const SHORTEST = edmondsKarp(unluckyNetwork(UNLUCKY_K)).steps.length;
const fmt = (n: number) => n.toLocaleString('en-US');

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'The most flow you can push from a source to a sink equals the smallest total capacity of the pipes that cut them apart, and you find it by pushing along paths that may also take flow back.',
    what: `A flow network has pipes with capacities. An augmenting path is a route from s to t with spare room, found in the residual network: forward arrows for spare capacity, backward arrows for flow that could be undone. Push the bottleneck along it and repeat until no path is left. A cut splits the nodes into an S side holding s and a T side holding t, and its capacity adds up only the pipes going from S to T. The flow can never exceed any cut, and when no path is left the nodes s can still reach form a cut that is exactly full: max flow equals min cut. Carelessly chosen paths can take very many pushes; always taking a shortest path bounds the count by the network's size.`,
    analogy: 'A water network with a source tank and a drain: you open valves along routes until nothing more fits, and the pipes that are full all the way across the map are the bottleneck that limited you.',
    useCases: [
      'Finding the bottleneck of a pipeline, a road network or a data centre link layout',
      'Assigning workers to jobs, which becomes a flow with capacity 1 on every pipe',
      'Image segmentation, where a minimum cut separates foreground from background',
      'Project selection, where profits and prerequisites reduce to a minimum cut (named, not shown)',
    ],
    why: 'Many assignment and capacity questions are flow problems in disguise, and the min-cut half tells you which pipe to widen. Knowing how a residual network lets a bad early choice be repaired also explains why simple greedy routing gets stuck short of the maximum.',
    watch: 'Each edge reads flow over capacity. The path you are building is yellow; an edge carrying flow is blue and gets thicker as it fills; a full (saturated) edge is red. In Residual view every arrow shows its spare room, and a violet dashed arrow is a backward one: flow you could take back. In Drag the cut a soft green wash marks the S side and a grey one the T side, and the edges that cross from S to T are red; edges coming back are listed but do not count. The unlucky order shows the path just pushed in yellow, and its counts in red (adversarial) and green (shortest first).',
  },
  tryThis: [
    `In Augment on the Textbook network, press Shortest path then Push, and repeat: after ${PUSHES} pushes the flow is ${FLOW} and Path left? reads no.`,
    `In Augment, load The unlucky one. Click s, a, b, t and Push 1, then click s, b, a, t: the step b⇠a is a backward arrow that takes the cross pipe's unit back, and Push 1 raises the flow to 2.`,
    `Open The unlucky order and press play at capacity ${fmt(UNLUCKY_K)}: the adversarial order needs ${fmt(ADVERSARIAL)} augmentations. Switch to Shortest path first: it needs ${SHORTEST}.`,
    `Open Drag the cut and click v1, v2 and v4 onto the S side: the cut capacity reads ${HAND_CUT} (12 + 7 + 4), and the 9 on v3→v2 goes the other way, so it is listed but not counted.`,
    `In Drag the cut press Finish the flow, then Show the minimum cut: the shaded S side is {${SIDE_NAMES}}, the same four nodes, and the cut equals the flow ${FLOW}.`,
  ],
  keyIdeas: [
    `Max flow equals min cut: the largest flow equals the smallest total capacity of edges going from the S side to the T side (${FLOW} on the Textbook network).`,
    'An augmenting path in the residual network may use a backward arrow, which takes flow back off an edge: that is how an early bad choice is repaired.',
    'A cut counts the edges that go from the S side to the T side; an edge coming back from T to S adds nothing to its capacity.',
    `A careless path order can need many pushes (${fmt(ADVERSARIAL)} on the unlucky network); shortest-path-first needed ${SHORTEST}, and its count is bounded by the network's size rather than its capacities.`,
  ],
  quiz: [
    {
      q: 'Greedy path choices have left a flow 1 below the maximum, with no s-to-t path using only unfilled edges. What repairs it?',
      options: [
        'A path that goes backward along an edge that already carries flow',
        'Throwing the flow away and making the same greedy choices again',
        'Raising the capacity of the edges on the first path it used',
        'Nothing: with no forward path left the flow is a maximum',
      ],
      answer: 0,
      why: 'In the residual network each edge with flow also has a backward arrow, and a path may use it to take flow back off that edge and send it elsewhere. Pushing flow along a path is not final. Repeating the greedy choices gets the same flow, and capacities are given, not changed.',
    },
    {
      q: 'A cut has the nodes s and v1 on the S side and the rest on the T side. Which edges add up to the cut\'s capacity?',
      options: [
        'Only the edges that go from the S side to the T side',
        'Every edge with one end on each side, in either direction',
        'The flow on the edges that cross the cut',
        'The edges that come back from the T side into the S side',
      ],
      answer: 0,
      why: 'Capacity is room to send things across from S to T. An edge going from T back into S carries nothing toward the sink, so it adds nothing, and counting both directions is the usual slip. The flow on crossing edges is the amount sent, not the capacity.',
    },
    {
      q: `A flow has value ${FLOW} and some cut has capacity ${FLOW}. What follows?`,
      options: [
        'The flow is a maximum flow and that cut is a minimum cut',
        'The flow can still grow, because the cut is not yet full',
        'The cut is mistaken, since a cut must exceed the flow',
        'The flow has used every single edge to its capacity',
      ],
      answer: 0,
      why: 'No flow can exceed any cut, so a flow that reaches a cut\'s capacity cannot grow, and no other cut can be smaller than that flow. The cut equalling the flow is allowed, and is exactly the max-flow min-cut case. Edges off the cut need not be full.',
    },
    {
      q: `On the unlucky network a careless order needs ${fmt(ADVERSARIAL)} pushes and shortest-path-first needs ${SHORTEST}. Why?`,
      options: [
        `Shortest paths skip the cross pipe, so each push carries ${fmt(UNLUCKY_K)}`,
        'Shortest-path-first picks the largest bottleneck at each step',
        'Shortest-path-first never takes flow back along a backward arrow',
        'The careless order is pushing along paths that are not allowed',
      ],
      answer: 0,
      why: `The two-edge routes s→a→t and s→b→t avoid the 1-unit cross pipe, so each is limited by a fat pipe of ${fmt(UNLUCKY_K)}. The careless order keeps using the cross pipe, where each push adds 1. Shortest-path-first looks at length, not at bottleneck size, and the careless paths are legal.`,
    },
  ],
};

export default lesson;
