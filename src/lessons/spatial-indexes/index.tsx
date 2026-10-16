import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A sorted list answers "near this point" badly because points have two coordinates and no single order; k-d trees and quadtrees cut the plane into regions and skip whole regions, and a geohash turns a place into a string whose prefix names a cell.',
    what: `A B-tree on one column finds a range in a few page reads, but "the nearest point" or "everything in this rectangle" has no single sort order: an index on x alone still has to read every point in a vertical strip. A k-d tree splits the plane at the median, on x and then y in turn, so a search can walk toward the query and then skip a whole subtree when the splitting line is farther away than the best answer found so far. A quadtree splits a cell into four equal quadrants once it holds more than a set number of points, so it is deep where the data is dense and shallow elsewhere. A geohash writes a place as a string by halving longitude and latitude in turn, five bits per character, so a shared prefix means a shared cell and a prefix scan is a range query on a plain B-tree. Two nearby points can still sit on opposite sides of a cell edge and share no prefix, so a "near me" query must search the neighbouring cells too. In many dimensions the trees stop pruning.`,
    analogy: 'A city map cut into districts: to find the nearest cafe you search your own district first, and you skip a far district entirely once its border is farther away than the cafe you already found.',
    useCases: [
      'Maps and "near me" search: ride matching, store finders, delivery zones',
      'Games and simulations: collision checks and visibility among thousands of objects',
      'Databases and search engines that index places, for example with prefix scans on a geohash column',
      'Image and point-cloud tools that look up the closest colour or the closest sample',
    ],
    why: 'It is the step after the B-tree: once a question is about position rather than order, you need to know which structure prunes, what its edge cases are (cell boundaries, coincident points) and where pruning stops working.',
    watch: 'The query point is yellow (--hi) and the rectangle outline is yellow and dashed. Points the search distance-checked are blue (--info), the k results and range hits are green (--ok), and points never touched are grey (--dim); skipped regions are shaded grey. Splitting lines and cell edges are violet (--violet). In the first scene a point the x-index had to read for nothing is red (--bad). In the geohash scene longitude bits are sky blue and latitude bits are amber, neighbour cells are blue, a point the search returned but that was not near is blue, and a near point the search missed is red with a ring.',
  },
  tryThis: [
    `In The problem, on the defaults (a rectangle over ${F.n} points): an index on x alone has to read ${F.rangeCandidates} candidates in the vertical strip, ${F.rangeHits} are inside the rectangle and ${F.rangeWasted} checks are wasted. Switch Query to Nearest point: the strip holds ${F.nnCandidates} points and one is the answer.`,
    `In k-d tree, on the defaults (${F.kdN} points, nearest, k = 1) press Show the whole search: it visits ${F.kdVisited} of ${F.kdN} nodes, skips ${F.kdSkipped} subtrees and the nearest point is ${F.kdNearest} away. Switch Query to Rectangle and press Show the whole search again: ${F.kdRangeVisited} nodes visited, ${F.kdRangeHits} hits.`,
    `In Quadtree, on the defaults (spread-out points, bucket capacity ${F.quadCapacity}): ${F.quadUniformCells} cells, ${F.quadUniformDepth} levels deep. Press Clustered: ${F.quadClusteredCells} cells and ${F.quadClusteredDepth} levels. Press Coincident points: the depth stops at the cap of ${F.maxDepth}.`,
    `In Geohash, on the defaults, 57.64911, 10.40744 at 5 characters is ${F.vectorCode}, a cell ${F.vectorWidth} wide and ${F.vectorHeight} tall at the equator. Press Equator and meridian: the two points a few metres apart get ${F.boundaryA} and ${F.boundaryB}, sharing ${F.boundaryShared} characters, and ${F.boundaryMissed} near points are missed. Switch Search to Plus 8 neighbours: ${F.boundaryFoundWith} are found and ${F.boundaryMissedWith} are missed.`,
    `In Which one, and where it stops, on the defaults: a nearest-${F.compareK} search distance-checks ${F.kdChecks} points with the k-d tree and ${F.quadChecks} with the quadtree, against ${F.n} for a scan. Drag Dimensions to 16: the share of nodes a k-d nearest search visits goes from ${F.lowDim} to ${F.highDim}.`,
  ],
  keyIdeas: [
    `An index sorted on x alone cannot answer a rectangle: on the defaults it reads ${F.rangeCandidates} points in the strip to find ${F.rangeHits}, because x says nothing about y.`,
    `A k-d tree skips the far side of a splitting line once the query is at least as far from the line as the k-th best answer; on the default ${F.kdN} points that is ${F.kdSkipped} skipped subtrees and ${F.kdVisited} of ${F.kdN} nodes visited.`,
    `A shared geohash prefix means a shared cell, but the converse fails at cell edges: ${F.boundaryA} and ${F.boundaryB} are a few metres apart and share ${F.boundaryShared} characters, so a near-me query searches the neighbouring cells as well.`,
    `In this lesson's measured runs the k-d tree's pruning fades with dimension: ${F.lowDim} of the nodes are visited at 2 dimensions and ${F.highDim} at 16, which is where approximate neighbour search takes over.`,
  ],
  quiz: [
    {
      q: 'A list sorted on x finds the points whose x is inside a rectangle\'s x-range. Why does that not answer a rectangle query well?',
      options: [
        'Points in that x-range can be far outside the rectangle in y, so many checks are wasted',
        'The sorted list cannot be searched for a number, so every point is scanned from the start',
        'The list returns points outside the x-range as well, so the answer comes back much too big',
        'A sorted list stops working as soon as two points happen to share the same x value',
      ],
      answer: 0,
      why: `A one-dimensional order says nothing about y. On the lesson's defaults the strip holds ${F.rangeCandidates} candidates and just ${F.rangeHits} lie inside the rectangle, so ${F.rangeWasted} checks are wasted. The list is searched by binary search and returns exactly the x-range; the cost is in what that range contains.`,
    },
    {
      q: 'A k-d nearest search is back at a splitting line after finishing the near side. When can it skip the far side?',
      options: [
        'When the query is at least as far from the line as the k-th best distance found so far',
        'When the far side holds fewer points than the near side did, so there is less to check',
        'When the near side has already produced at least one point to compare against',
        'When the query lies exactly on the line, so both sides are equally near and equally cheap',
      ],
      answer: 0,
      why: `Any point across the line is at least as far from the query as the line itself, so if the line is no nearer than the k-th best, nothing over there can improve the answer. With the default query that rule skips ${F.kdSkipped} subtrees and visits ${F.kdVisited} of ${F.kdN} nodes. A query exactly on the line is the case where the far side cannot be skipped.`,
    },
    {
      q: `Two points are a few metres apart, one just north-east of the equator and prime meridian and one just south-west. Their 6-character geohashes are ${F.boundaryA} and ${F.boundaryB}. What does a near-me search have to do?`,
      options: [
        'Search the neighbouring cells too, since near points can share no prefix',
        'Use a longer code, because more characters make the two prefixes agree',
        'Nothing extra: points this close share a prefix, so one cell scan finds them',
        'Sort the codes alphabetically and take the code that comes next',
      ],
      answer: 0,
      why: `The cells are split at 0 degrees, so the two codes differ from the first character: they share ${F.boundaryShared} characters. In the lesson a single-cell search misses ${F.boundaryMissed} near points here, and adding the eight neighbours finds ${F.boundaryFoundWith} with ${F.boundaryMissedWith} missed. A longer code just makes the cells smaller, and in sorted order ${F.boundaryA} and ${F.boundaryB} are far apart.`,
    },
    {
      q: 'Eight points sit at exactly the same place in a quadtree with bucket capacity 2. Why does the quadtree stop splitting?',
      options: [
        `A named depth cap (${F.maxDepth} here) ends the splitting and the pile stays in one bucket`,
        'The cells keep splitting until each holds fewer than two points, and the eight separate',
        'Four equal quadrants cannot hold a point twice, so the extra points are dropped',
        'It does not stop, which is why a quadtree cannot hold duplicate points',
      ],
      answer: 0,
      why: `Splitting a cell cannot separate points at the same place, so without a limit it would recurse forever. In the lesson the coincident preset reaches depth ${F.quadCoincidentDepth}, the cap, in ${F.quadCoincidentLeaves} leaves, and the bucket at the bottom holds all eight points.`,
    },
  ],
};

export default lesson;
