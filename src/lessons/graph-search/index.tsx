import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "BFS, DFS, Dijkstra and A* are strategies for exploring a graph. What differs is which place they explore next, and that decides whether they find the shortest or cheapest path.",
    what: "A grid is a graph where each cell connects to its neighbours. BFS explores in rings of equal distance using a queue, so it finds the path with the fewest steps. DFS dives deep using a stack and finds a path, not necessarily a good one. Dijkstra uses a priority queue ordered by total cost, so it handles weights. A* adds a guess of the remaining distance so it heads for the goal sooner.",
    analogy: "BFS is ripples spreading from a stone dropped in a pond. DFS is exploring a maze by always taking the next turn until you hit a dead end, then backing up.",
    useCases: [
      "Maps and route planning (Dijkstra, A*)",
      "Pathfinding for characters in games",
      "Social networks: degrees of separation, friend suggestions (BFS)",
      "Dependency resolution, web crawlers, network routing",
    ],
    why: "Many problems are secretly graph problems: package dependencies, service call graphs, permissions, workflows. Choosing the right one of these four is a core mid-level skill and a very common interview topic.",
    watch: "Blue cells are the frontier (queued to explore next), violet cells are visited (fading with age), yellow is the cell being explored now, and green is the final path. Mud costs 5 to cross. The side panel shows the live queue, stack or priority queue, and how all four algorithms did on the same board.",
  },
  tryThis: [
    'Run BFS, then DFS on the Maze preset. Compare the ripple with the snake.',
    'Load "Mud field": BFS wades straight through, Dijkstra walks around.',
    'Switch to A* and watch the visited count in the scoreboard drop.',
    'Paint a wall across the whole board and see how "no path" gets proven.',
  ],
  keyIdeas: [
    'BFS uses a queue → explores by distance → shortest path when every step costs the same.',
    'DFS uses a stack → dives deep → finds a path, not the shortest one.',
    'Dijkstra uses a priority queue ordered by cost → cheapest path with weights ≥ 0.',
    'A* adds a heuristic (distance-to-goal guess) → same answer, far fewer cells explored.',
  ],
  quiz: [
    {
      q: 'Which data structure turns a graph search into BFS?',
      options: ['Stack', 'Queue', 'Priority queue', 'Hash set'],
      answer: 1,
      why: 'First in, first out means cells are expanded in order of how many steps away they are.',
    },
    {
      q: 'Edges have different weights (like mud). Which finds the cheapest path?',
      options: ['BFS', 'DFS', 'Dijkstra', 'Any of them'],
      answer: 2,
      why: 'BFS counts steps, not cost. Dijkstra always expands the cheapest-so-far node, so weights are respected.',
    },
    {
      q: 'Why does A* usually visit fewer cells than Dijkstra?',
      options: [
        'It skips walls faster',
        'Its heuristic prioritises cells that look closer to the goal',
        'It uses a stack instead of a heap',
        'It gives up on long paths',
      ],
      answer: 1,
      why: 'Priority = cost so far + estimated cost left, so promising directions get explored first while staying optimal.',
    },
  ],
};

export default lesson;
