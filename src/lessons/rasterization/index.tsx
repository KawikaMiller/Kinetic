import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'To draw a triangle, a rasterizer tests each pixel centre against the triangle\'s three edges, and the pixels whose centres pass light up.',
    what: 'An edge function is a cross product: for the edge a → b and a point p it is (b.x − a.x)(p.y − a.y) − (b.y − a.y)(p.x − a.x), positive on the triangle\'s side. A pixel is covered when its centre (x + 0.5, y + 0.5) passes all three edges (w0, w1, w2), and only pixels inside the triangle\'s bounding box are tested. A centre exactly on an edge (w = 0) needs a tie-break: the top-left rule means two triangles that share an edge never both draw a pixel, and never both skip one along the shared edge between its ends. Divided by the triangle\'s area, the same three numbers are barycentric weights, which blend per-corner values such as depth or colour across the triangle. The corners got to these screen positions by the transforms in `matrices-transformations`.',
    analogy: 'A stencil laid over graph paper: you look at the dot in the middle of each square and colour the square only if that dot shows through the cut-out. Antialiasing is putting 4 or 16 dots in each square and colouring it by how many show.',
    useCases: [
      'GPUs: every 3D frame and every composited UI layer is triangles turned into pixels this way',
      'Browsers and canvas: shapes, SVG paths and text are filled by the same kind of coverage tests',
      'Font rendering: glyph outlines become pixels, with antialiasing so small text stays legible',
      'Hit testing: "did the click land inside this shape?" is the same edge-function test',
    ],
    why: 'Every pixel on a screen came out of a rasterizer. Knowing that it tests centres explains thin lines that vanish or flicker, shapes that shimmer as they move, seams in a hand-written renderer, and why depth bugs (z-fighting, things drawn in the wrong order) look the way they do.',
    watch: 'Coverage: a 24 × 16 grid of pixels. The triangle is a thin white outline with white corner dots (A, B, C) you can drag, and its bounding box is a dashed grey rectangle; pixels outside it are dark grey (dim) and never tested. The pixel being tested has a yellow ring. Covered pixels are blue; with 2×2 or 4×4 samples a partly covered pixel is a lighter blue wash in proportion to its share of samples, and the current pixel\'s sample points are yellow dots when inside and grey rings when outside. In the edge-tests panel, w0, w1 and w2 are green when that edge passes and grey when it fails. The real-canvas strip is your browser\'s own blue fill. Shared edge: triangle A is blue and triangle B sky blue, each with its outline; pixels drawn twice are red and pixels missed on the shared edge are outlined in orange. In the stats, a count is green at 0, red (drawn twice, wrong pixels) or orange (missed) above it. Depth: a violet and an amber triangle with their outlines; a red ring marks a pixel showing the farther triangle, and a yellow ring the probed pixel.',
  },
  tryThis: [
    'Press play and watch the yellow ring sweep the dashed bounding box row by row: the dim pixels outside it are never tested.',
    'Pick "Sliver": the box efficiency drops, because most of the box is tested for nothing.',
    'Pick "Tiny": it lies across four pixels but covers none of their centres, so nothing lights. Then try 4×4 samples and see which pixels get a shade.',
    'In Shared edge, switch between w ≥ 0, w > 0 and the top-left rule, and watch the red and orange pixels on the shared edge.',
    'In Depth, with the z-buffer off, swap the draw order: some pixels are wrong either way. Turn the z-buffer on.',
  ],
  keyIdeas: [
    'A pixel is covered when its centre passes all three edge functions; partial overlap only counts with antialiasing, at extra cost.',
    'Only the bounding box is tested, so long thin triangles waste most of their tests.',
    'The top-left rule gives each centre on a shared edge to exactly one triangle: no double-drawn seams and no cracks.',
    'A z-buffer decides visibility per pixel, so the draw order stops mattering for opaque triangles (exact ties aside).',
  ],
  quiz: [
    {
      q: 'With antialiasing off, a triangle\'s edge crosses a pixel but misses that pixel\'s centre. Is the pixel drawn?',
      options: [
        'No: only its centre counts, so it stays dark',
        'Yes: any overlap with the pixel square lights it',
        'Yes, but at half brightness to soften the edge',
        'Only if the edge is a top edge or a left edge',
      ],
      answer: 0,
      why: 'Without antialiasing a rasterizer asks one question per pixel: is (x + 0.5, y + 0.5) inside? Partial overlap only counts when you pay for more samples. The top-left rule is tempting, but it only decides centres that sit exactly on an edge.',
    },
    {
      q: 'Two triangles share an edge that runs exactly through some pixel centres. Each uses w ≥ 0. What happens to those pixels?',
      options: [
        'They\'re drawn twice, once by each triangle',
        'They\'re skipped, leaving a crack in the mesh',
        'Each goes to whichever triangle is drawn first',
        'They\'re blended to a 50/50 mix of the two',
      ],
      answer: 0,
      why: 'w = 0 passes w ≥ 0 for both triangles, so both draw the pixel: overdraw, which shows as a seam once there\'s transparency. The crack is what w > 0 gives you. The top-left rule hands each such centre to exactly one triangle.',
    },
    {
      q: 'Why does the rasterizer only test the pixels inside a triangle\'s bounding box?',
      options: [
        'Nothing outside it can be inside the triangle',
        'The GPU\'s memory only holds the box\'s pixels',
        'It makes antialiased edges look much smoother',
        'Pixels outside it are drawn by a second pass',
      ],
      answer: 0,
      why: 'Every point of a triangle lies between its smallest and largest x and y, so no pixel centre outside that box can be inside. Testing those pixels would only waste work. It has nothing to do with smoothness; the box\'s efficiency shows how much is still wasted for slivers.',
    },
    {
      q: 'Two triangles cross in depth: each is nearer over part of their overlap. What draws them correctly?',
      options: [
        'A z-buffer: keep the nearest depth per pixel',
        'Sorting them so the farther one is drawn first',
        'Drawing the larger triangle before the smaller',
        'Antialiasing the overlap with 4×4 samples',
      ],
      answer: 0,
      why: 'Sorting whole triangles (the painter\'s algorithm) can\'t help when neither is in front everywhere: whichever is drawn second wins the whole overlap. A z-buffer compares depth per pixel, so the order stops mattering, except for exact ties (z-fighting).',
    },
    {
      q: 'With 4×4 antialiasing, 6 of a pixel\'s 16 sample points are inside the triangle. What happens to the pixel?',
      options: [
        'It gets 6/16 = 37.5% of the triangle\'s colour',
        'It\'s fully lit, because some samples are inside',
        'It stays dark, because most samples are outside',
        'It\'s lit only if its exact centre is covered',
      ],
      answer: 0,
      why: 'Coverage is the share of samples inside, 6/16 = 37.5%, blended over the background. That took 16 tests instead of 1, which is why antialiasing costs extra. The 4×4 samples sit at 1/8, 3/8, 5/8 and 7/8 of the pixel, so none of them is the centre.',
    },
  ],
};

export default lesson;
