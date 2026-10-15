import type { LessonModule } from '../../core/types';
import { kosaraju, presetById } from './model';
import { Stage } from './Stage';

const TANGLE = presetById('tangle').graph;
const TANGLE_RUN = kosaraju(TANGLE);
const nameList = (vs: readonly number[]) => vs.map((v) => TANGLE.names[v]).join(', ');
const FINISH = nameList(TANGLE_RUN.finishOrder);
const COMPONENTS = TANGLE_RUN.components.map((c) => `{${[...c].sort((a, b) => a - b).map((v) => TANGLE.names[v]).join(' ')}}`).join(', ');
const COMPONENT_COUNT = TANGLE_RUN.components.length;
const REVERSED_FINISH = nameList(kosaraju(TANGLE, TANGLE.names.map((_, i) => i).reverse()).finishOrder);

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A strongly connected component is a set of nodes that can all reach one another; Kosaraju finds them with two depth-first passes, and collapsing each one leaves a graph with no cycle.',
    what: `A directed graph splits into strongly connected components: groups where any node can reach any other. A single cycle is the smallest case, and one component can hold many overlapping cycles. Kosaraju's algorithm runs a depth-first search and pushes each node on a stack when it finishes, flips every edge, then takes nodes from the top of the stack and searches the flipped graph: each search tree is one component. Collapse each component to one node and what is left has no cycle, so it can be put in dependency order.`,
    analogy: 'A city of one-way streets: a neighbourhood is a set of places you can drive between in either direction by some route; the neighbourhoods themselves are only connected one way, from the ones upstream to the ones downstream.',
    useCases: [
      'Finding groups of packages or build targets that depend on each other in a loop',
      'Spotting tasks that wait on each other in a deadlock (in a wait-for graph with one instance of each resource)',
      'Collapsing a cyclic graph into a DAG so it can be ordered or scheduled',
      'Solving 2-SAT, which reduces to components of an implication graph (named, not shown)',
    ],
    why: 'Many algorithms on a directed graph that need "no cycles" can be run on the collapsed graph instead. Knowing the components also tells you what is trapped together: which modules have to change as a unit, and which tasks are actually deadlocked.',
    watch: 'The graph is directed: arrowheads show direction. In pass 1 the node the search is on is yellow, a finished node gets a green tint, and the strip beside the graph is the finish-order stack, blue, with each node and its finish time. When the edges flip they turn violet and dashed. In pass 2 each component gets one colour (amber, pink, sky or orange) on its nodes and on a soft hull behind them; the colours repeat after four, so read the hulls and the list too. In Try to break it the edge you just added is orange. In Condensation each box is one component, and the blue tint and number show its place in the dependency order.',
  },
  tryThis: [
    `In Two passes press play on the Dependency tangle: pass 1 ends with the finish stack ${FINISH} (top on the right), then pass 2 finds ${COMPONENT_COUNT} components ${COMPONENTS}.`,
    `Open Condensation and press Topological order: the ${COMPONENT_COUNT} components line up in dependency order, and no edge of the collapsed graph points back.`,
    `Open Try to break it and press reversed: the finish order changes from ${FINISH} to ${REVERSED_FINISH} and Same components as as-given stays yes.`,
    'In Try to break it, drag an edge from d to a: the components fuse and the count drops from 4 to 3. Undo it, then drag e to d instead: nothing changes.',
  ],
  keyIdeas: [
    'A strongly connected component is a set of nodes where any node can reach any other; one component can hold many overlapping cycles.',
    'Kosaraju: a depth-first search gives the finish order, the edges are flipped, and a second search in that order grows one component per tree.',
    'The components belong to the graph, not to the search: a different start order changes the finish order and leaves the components alone.',
    'Collapsing each component to one node leaves a graph with no cycle, so it can be put in dependency order.',
  ],
  quiz: [
    {
      q: 'Two loops share a node: a→b→a and b→c→b. How many strongly connected components does the graph have?',
      options: [
        '1: a, b and c can all reach each other',
        '2: one component for each of the two loops',
        '3: each node is its own component',
        '0: overlapping loops cancel out',
      ],
      answer: 0,
      why: 'a reaches c through b, and c reaches a through b, so the three nodes reach one another and form one component. Counting loops would give 2, but components are sets of nodes and a node can sit on several cycles. Three singletons would be the answer for a graph with no cycle.',
    },
    {
      q: 'Why does pass 2 of Kosaraju search the reversed graph?',
      options: [
        'From the stack top, a search there cannot leave its own component',
        'To repeat pass 1 with the edges flipped and check the answer',
        'To remove the cycles before the second search begins',
        'To visit the nodes a second time in the same order',
      ],
      answer: 0,
      why: 'Flipping edges keeps the nodes of a component reaching one another but turns paths out of a component into paths in. The stack top lies in a component that no unassigned node points into, so the reversed search stays inside it and collects exactly that component. Pass 2 is not a repeat of pass 1.',
    },
    {
      q: 'You change the order in which pass 1 tries its start nodes. What changes?',
      options: [
        'The components stay the same and the finish order can change',
        'The components can change and the finish order stays the same',
        'Both change, because pass 2 depends on what pass 1 did',
        'Neither changes, since the edges fix the finish order',
      ],
      answer: 0,
      why: 'Which nodes reach one another is a fact about the graph, so the components cannot depend on the search. The finish order does depend on where the search starts, and pass 2 still collects the same sets whatever valid finish order it gets.',
    },
    {
      q: 'After collapsing each component to one node, a cycle shows up among three of the new nodes. What does that tell you?',
      options: [
        'It cannot happen: those three would have been one component',
        'The graph has a deadlock among the three components',
        'The three components must be built together in a loop',
        'It is normal: collapsed graphs often keep some cycles',
      ],
      answer: 0,
      why: 'A cycle through three components would let each reach the other two, so their nodes would reach one another and belong to one component. If a collapsed graph seems to have a cycle, the components were computed wrongly.',
    },
  ],
};

export default lesson;
