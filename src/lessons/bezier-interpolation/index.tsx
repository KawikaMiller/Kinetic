import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A cubic Bézier curve is lerps of lerps: blend four control points by t, three times over, and the last blend is the point on the curve. CSS easing is the same curve, read with x as time.',
    what: 'De Casteljau\'s construction lerps each pair of neighbouring control points by t, then lerps those results, then once more, ending on one point. Written out, that point is a weighted average of the four control points with the Bernstein weights (1 − t)³, 3t(1 − t)², 3t²(1 − t) and t³, which are never negative and add up to 1, so the curve stays inside the control points\' convex hull. It starts at P0 heading for P1 and ends at P3 arriving from P2. CSS\'s cubic-bezier(x1, y1, x2, y2) fixes P0 = (0, 0) and P3 = (1, 1) and reads the curve as progress (y) against time (x). t is not the time: to ease, the browser first solves x(t) = the elapsed fraction for t, then reads y(t). The control points move like any other points (`matrices-transformations`), and a curve on screen is usually flattened into short lines before it is filled (`rasterization`).',
    analogy: 'String art: a bead slides along each side of the control polygon, all the same fraction t of the way. Strings between neighbouring beads carry beads of their own, and the last bead, riding the last string, traces the curve.',
    useCases: [
      'CSS transitions and animations: ease, ease-in-out and every cubic-bezier() you tune in DevTools',
      'Vector graphics: SVG path C commands, and font outlines (cubic in CFF fonts, quadratic in TrueType)',
      'Design and animation tools: the curve handles in Figma, Illustrator and keyframe editors',
      'Games and UI motion: camera paths, and lerping positions, colours and rotations between keyframes',
    ],
    why: 'Every UI animation you tune is a cubic-bezier, and every vector icon and font glyph is made of Bézier segments. Knowing that t isn\'t time explains how an easing curve is evaluated, why an overshoot curve goes past 1, and how to read DevTools\' easing editor. Lerp is the move underneath all of it, and its naive form spins a rotation the long way round.',
    watch: 'Bézier curve: the four control points P0-P3 are violet dots you can drag, joined by a dashed violet control polygon, and the curve is a thick blue line. At the current t the first lerps are three grey (dim) points joined by grey lines, the second lerps are two violet points joined by a violet line, and the point on the curve is a yellow dot. With the weights shown, the four Bernstein curves are amber (P0), pink (P1), sky blue (P2) and orange (P3), each with a dot at t on a grey vertical line, and the weighted sum below uses the same colours. Easing: P1 and P2 are violet dots you can drag, with dashed violet handles to the fixed violet P0 and P3; the easing curve is blue, with hollow grey dots at even steps of t and grey dashed lines at 0 and 1. In "x is not t" the blue curve is x against t, the grey dashed line is x = t and the grey dots are even t steps. The green ball runs on a real CSS transition and the blue ball is placed by the solver; the largest-gap stat turns green when they stay within a pixel. Lerp: on the dial the red arc and hand are the naive angle lerp, the green arc and hand the shortest arc, and grey dots mark the start and end angles. The colour strip and swatch show the colours themselves, and the number fills a blue bar.',
  },
  tryThis: [
    'Press play: the grey, violet and yellow points sweep together, and the yellow one traces the blue curve.',
    'Drag P1 far away: the curve bends towards it without reaching it, and still leaves P0 heading straight at P1.',
    'In Easing, pick "ease-in-out" and press "Run both": the two balls move as one, and the gap stat says by how much.',
    'Pick "linear" and look at "x is not t": even steps of t still land at uneven times, though the output is a straight line.',
    'In Lerp, leave 350° → 10° and slide t: the red hand swings round through 180°, the green one crosses 0°.',
  ],
  keyIdeas: [
    'A cubic Bézier is lerps of lerps of lerps; written out, it is a weighted average of four points with weights that add up to 1.',
    'The curve starts at P0 heading for P1 and ends at P3 coming from P2; P1 and P2 steer it.',
    'In CSS easing, x is time and t is only a parameter: the browser solves x(t) = time, then reads y(t).',
    'Lerp angles along the shortest arc, or 350° → 10° spins the long way round.',
  ],
  quiz: [
    {
      q: 'In cubic-bezier(0.42, 0, 0.58, 1), what is t?',
      options: [
        'A curve parameter; time is the x coordinate',
        'The elapsed fraction of the transition\'s time',
        'The progress of the property being animated',
        'The slope of the curve at the current moment',
      ],
      answer: 0,
      why: 'The browser knows the elapsed time, which is x, so it first solves x(t) = time for t and then reads the progress y(t). Taking t for the time is the classic slip: equal steps of t land at unequal times, even for cubic-bezier(0, 0, 1, 1).',
    },
    {
      q: 'What do the four Bernstein weights of a cubic Bézier add up to, for any t from 0 to 1?',
      options: [
        'Exactly 1, so the point is a weighted average',
        'Exactly t, so the point moves at constant speed',
        'Exactly 3, the degree of the curve, at every t',
        'It depends on where the control points are',
      ],
      answer: 0,
      why: '(1 − t)³ + 3t(1 − t)² + 3t²(1 − t) + t³ = ((1 − t) + t)³ = 1. Non-negative weights that add up to 1 make every point an average of the control points, which is why the curve stays inside their convex hull. The weights never depend on where the points are.',
    },
    {
      q: 'You lerp a rotation from 350° to 10° with a + (b − a)·t. Where is it halfway through?',
      options: [
        '180°: it spins the long way, through 180°',
        '0°: it crosses the short way, through 0°',
        '10°: angles snap to the nearest end value',
        '355°: a quarter of the way along the short arc',
      ],
      answer: 0,
      why: 'Plain numbers don\'t know that 350° and 10° are 20° apart: (350 + 10) / 2 = 180, so the lerp turns 340° the long way. Going through 0° is what a shortest-arc lerp does, which is usually what you want for a rotation.',
    },
    {
      q: 'Why does CSS only accept x1 and x2 between 0 and 1 in cubic-bezier()?',
      options: [
        'It keeps x(t) from going backwards, so each time has one t',
        'Larger values would make the animation overshoot its end',
        'Values outside that range can\'t be stored in a float',
        'It keeps y between 0 and 1 so properties stay in range',
      ],
      answer: 0,
      why: 'With x1 and x2 in [0, 1], x(t) never decreases, so every moment of the animation maps to exactly one point of the curve. Overshoot comes from y outside [0, 1], which CSS does allow: that\'s how "back" easings go past the end and settle.',
    },
    {
      q: 'A cubic Bézier has control points P0, P1, P2 and P3. Which of them does the curve always pass through?',
      options: [
        'P0 and P3: the curve starts and ends on them',
        'All four: it is drawn smoothly through each one',
        'P1 and P2: the end points only set the direction',
        'None of them: it only passes near the points',
      ],
      answer: 0,
      why: 'B(0) = P0 and B(1) = P3, while P1 and P2 only pull: the curve leaves P0 heading towards P1 and arrives at P3 from P2\'s direction. Passing through every point is what an interpolating spline does, not a Bézier.',
    },
  ],
};

export default lesson;
