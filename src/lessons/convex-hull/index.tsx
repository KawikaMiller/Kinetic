import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'The convex hull is the rubber band around a set of points, and it is built from one question asked over and over: do three points turn left, right, or go straight? That is the sign of a cross product.',
    what: `For three points a, b and c, the cross product (b - a) x (c - a) is positive for a left turn (counter-clockwise, with y up), negative for a right turn and zero when they lie on one line; its size is twice the triangle's area. The Graham scan picks the lowest point, sorts the others by angle around it and walks them keeping a stack, popping while the last two stack points and the new one do not turn left. Andrew's monotone chain sorts by x and builds a lower and an upper chain with the same pop rule, with no angles to sort. Jarvis's march wraps from the leftmost point, picking at each step the point that leaves every other point on its left. Points exactly on a hull edge are a policy choice: drop them or keep them. With whole-number coordinates every cross product is exact; with arbitrary doubles the rounding can make a point that is not collinear look collinear, and a hull step goes wrong.`,
    analogy: 'Stretching a rubber band around nails in a board: it snaps tight against the outermost nails, and a nail that only touches the band along a straight stretch is the case you have to decide about.',
    useCases: [
      'Collision detection and bounding shapes in games and physics engines',
      'Map and GIS tools that outline a cluster of points or a region of interest',
      'Computer vision: outlining a shape or finding its convexity defects',
      'Any geometry code that asks which side of a line a point is on, from CAD to routing',
    ],
    why: 'The orientation test is the building block of nearly all computational geometry, and its failure mode (an inexact zero) is a classic source of crashes and wrong outlines. Knowing the sign convention, the pop rule and the float trap lets you read and write this code without trial and error.',
    watch: 'In the turn test the three points are yellow (--hi) and the shaded triangle is green (--ok) for a left turn, red (--bad) for a right turn and grey (--dim) for collinear, with the words as well as the colour. In the steppers the point being tested is yellow, points on the stack and the best candidate so far are blue (--info), a popped point flashes red (--bad), the pivot or start is violet (--violet), and finished hull points and edges are green; points not on the stack are grey. In the last scene a wrong double verdict is red and the exact one is green.',
  },
  tryThis: [
    `In The turn test, on the defaults: the cross product is ${F.left}, a left turn, and the triangle's area is ${F.leftArea}. Press Right turn: ${F.right}. Press Exactly collinear: ${F.collinear}.`,
    `In Graham scan, on the seeded scatter of ${F.points} points, step to the end: ${F.grahamHull} hull points, ${F.grahamTests} orientation tests and ${F.grahamPops} pops; switch Collinear points to Keep and step to the end again: ${F.scatterKeep} points, because one point sits on an edge. Press Square with edge points and step to the end: ${F.squareDrop} hull points with collinear points dropped, ${F.squareKeep} after switching to Keep.`,
    `In Chain and march, on the defaults (the same ${F.points} points, Andrew's chain): ${F.andrewTests} orientation tests. Press Jarvis's march: ${F.jarvisTests}, for the same ${F.jarvisHull}-point hull. Below, with points on a circle at n = ${F.circleN} (every point on the hull) Jarvis spends ${F.circleJarvis} tests against Andrew's ${F.circleAndrew}; switch to a filled disc (${F.discH} hull points): ${F.discJarvis} against ${F.discAndrew}.`,
    `In When floats lie, on the defaults (mismatch #1): the lattice point sits ${F.mismatchI} and ${F.mismatchJ} steps of 2^-53 above 0.5, the double orientation is ${F.mismatchDouble} (collinear) and the exact one is positive. Press Run a hull on these: ${F.demoDouble} points with the double test, ${F.demoExact} with the exact one.`,
  ],
  keyIdeas: [
    `A left turn is a positive cross product, with y up: ${F.left} on the default triangle, and half its size, ${F.leftArea}, is the triangle's area.`,
    `Graham, Andrew and Jarvis return the same hull on whole-number points, but at different cost: on the ${F.points}-point scatter they spend ${F.grahamTests}, ${F.andrewTests} and ${F.jarvisTests} orientation tests.`,
    `Jarvis's march costs about n times h, where h is the hull size: on ${F.circleN} points on a circle it spent ${F.circleJarvis} tests against ${F.circleAndrew} for Andrew, and on a disc with ${F.discH} hull points ${F.discJarvis} against ${F.discAndrew}. These count orientation tests only: Andrew's sort by x is not counted, and counting it would narrow the disc gap.`,
    `A double cross product of exactly 0 does not prove collinear: in the lesson's search it is 0 for a point that is not on the line, so a hull vertex is popped (${F.demoDouble} points instead of ${F.demoExact}); whole numbers, or an exact test, avoid it.`,
  ],
  quiz: [
    {
      q: 'With y pointing up, what does a positive cross product (b - a) x (c - a) tell you about the path a, then b, then c?',
      options: [
        'It turns left, counter-clockwise, at b',
        'It turns right, clockwise, at b',
        'The three points are on one line',
        'The point c lies inside the segment from a to b',
      ],
      answer: 0,
      why: `Positive means counter-clockwise, which on a plane with y up is a left turn: ${F.left} on the default triangle, ${F.right} when b and c swap, and ${F.collinear} on one line. A cross product of zero is the collinear case, and the size of the value is twice the area: ${F.left} = 2 x ${F.leftArea} on the default triangle.`,
    },
    {
      q: 'A scan pops the stack top while the cross product is at most 0. What changes if it pops only while the cross product is below 0?',
      options: [
        'Points exactly on a hull edge are kept instead of dropped',
        'The scan walks the hull clockwise instead of counter-clockwise',
        'Interior points are kept, so the stack is no longer a convex chain',
        'Nothing, since a cross product of exactly 0 does not happen for whole numbers',
      ],
      answer: 0,
      why: `Zero means collinear, so the rule decides what happens to a point sitting on an edge: the lesson's square with a midpoint on each side has ${F.squareDrop} hull points with the pop at or below 0 and ${F.squareKeep} with the pop below 0. Interior points still make right turns and are popped either way, and zero happens often on whole-number grids.`,
    },
    {
      q: `You wrap ${F.circleN} points that all lie on a circle. Which of Andrew's chain and Jarvis's march spends fewer orientation tests, and why?`,
      options: [
        'Andrew: every point is on the hull, so Jarvis does about n times h tests',
        'Jarvis: it never sorts, and sorting is the costly part of a hull',
        'They tie, because both test each point against the hull once',
        'Jarvis: a circle has no collinear points, which is its slow case',
      ],
      answer: 0,
      why: `Jarvis wraps once per hull point and scans the whole point set each time, so with h = n it is the worst case: ${F.circleJarvis} tests against ${F.circleAndrew} for Andrew at n = ${F.circleN}, measured. On a filled disc with ${F.discH} hull points the gap narrows to ${F.discJarvis} against ${F.discAndrew}, but Andrew is still ahead on orientation tests; Andrew's sort by x is not counted here, and counting it would narrow that gap.`,
    },
    {
      q: 'Why is "cross product equals 0" a risky test for collinear points when the coordinates are arbitrary doubles?',
      options: [
        'Rounding can turn a tiny non-zero value into exactly 0, or flip its sign',
        'Doubles cannot store a coordinate that sits exactly on a line',
        'A double cross product is only an approximation of its sign, so geometry code avoids it',
        'The product of two doubles overflows before the subtraction happens',
      ],
      answer: 0,
      why: `The cross product subtracts coordinates and then two nearly equal products, and each step rounds: near 11.5 the doubles are 2^-49 apart, so the subtractions already lose the 2^-53 steps, and the rounded products can swallow the true difference. In the lesson a lattice point ${F.mismatchI} and ${F.mismatchJ} steps of 2^-53 above 0.5 gives ${F.mismatchDouble} in doubles but a positive exact value, and the hull then keeps ${F.demoDouble} points where ${F.demoExact} are right. With whole numbers below 2^53 the products are exact.`,
    },
  ],
};

export default lesson;
