import { decimal } from '../../core/format';
import type { LessonModule } from '../../core/types';
import { blend, initialBlend, probePixel } from './blend';
import { overdraw } from './overdraw';
import { rgbText } from '../../components/canvasImage';
import { meshOf } from './mesh';
import { IMAGE, matrices, shadeImage } from './render';
import { SHADER_PRESETS, compileChannels } from './shader';
import { bentPixels } from './slant';
import { STAGES, analyse, initialPipeline } from './stages';
import { Stage } from './Stage';

const P0 = initialPipeline();
const A0 = analyse(P0);
const stageNumber = (id: string) => STAGES.findIndex((s) => s.id === id) + 1;

const shadedBy = (id: string) => {
  const preset = SHADER_PRESETS.find((p) => p.id === id);
  const compiled = compileChannels(preset?.fields ?? ['0', '0', '0']);
  if (!compiled.ok) throw new RangeError(`preset ${id} compiles`);
  return shadeImage(meshOf('cube'), matrices(30), compiled.shader, [0, 0, 0], IMAGE.w, IMAGE.h);
};
const broken = shadedBy('broken');
const lambertRuns = shadedBy('lambert').shaded;

const bent = bentPixels();

const backEarly = overdraw({ order: 'back-to-front', earlyZ: true });
const backLate = overdraw({ order: 'back-to-front', earlyZ: false });
const frontEarly = overdraw({ order: 'front-to-back', earlyZ: true });

const B0 = initialBlend();
const overlapSlot = probePixel('both');
const overlapAB = blend(B0).pixels[overlapSlot];
const overlapBA = blend({ ...B0, order: 'b-then-a' }).pixels[overlapSlot];

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A GPU turns vertices into pixels in fixed stages with two programmable ones, the vertex shader and the fragment shader; the cost depends on how many fragments are shaded, and that depends on draw order and the early depth test.',
    what: 'Vertices go through a vertex shader that puts them in clip space, are assembled into triangles and clipped, and then rasterisation turns each triangle into fragments: candidates for pixels, each with attributes interpolated across the triangle. A fragment shader computes each one\'s colour, the depth test keeps the nearest, and blending combines translucent colours with what is already there. Interpolation has to divide by w to be right under perspective, and blending is not commutative, so order matters for translucent surfaces. Everything here is a tiny software pipeline; real GPUs run the same stages in parallel hardware.',
    analogy: 'A print shop with an assembly line: workers at one station place each corner of a design, another station fills in the shape with dots, and a second group of workers decides the colour of every dot. A supervisor throws away any dot hidden behind a nearer one, but only if she checks before the colour workers start; checking afterwards wastes their time.',
    useCases: [
      'Writing and debugging vertex and fragment shaders in WebGL, WebGPU, Vulkan, Metal or game engines',
      'Explaining why overdraw, draw order and early depth testing change frame time without changing the picture',
      'Finding why textures swim or bend on slanted surfaces, and why translucent particles need sorting',
      'Reading a frame capture and knowing which stage a cost belongs to',
    ],
    why: 'GPU performance and many rendering bugs are pipeline questions: which stage does the work, how many fragments run it, and in what order. Seeing a triangle go through each stage, and breaking the shader, the interpolation and the order on purpose, gives you the vocabulary that frame captures and shader errors use.',
    watch: 'The stages: the stage list shows the stage running now in yellow, stages already passed with a green tick, and the data leaving the current stage in blue text; the vertex-shader and fragment-shader stages carry an amber and a pink square, plain lane colours that never mean pass or fail. On the pixel grid, blue cells are fragments from rasterisation, pink cells are shaded fragments (brighter for a larger N·L), green cells passed the depth test, a dim outlined cell failed it, grey cells are pixels drawn earlier by other triangles, solid green cells are where this triangle ends up on top, and a yellow ring is the cell you picked. A fragment shader: the image is your expressions; a red hatched pixel is NaN or infinite, and a dark cell is background. Perspective-correct: light blue and dark squares are the two checker colours. Order and early depth: four plain tones (amber, pink, light blue and grey) are the four triangles, farthest to nearest. Blending: pink is triangle A, light blue is triangle B, and a yellow ring marks the pixel the table reads. The chips say what is a toy, simulated or from memory.',
  },
  tryThis: [
    `In "The stages" (cube, triangle ${P0.triangle + 1} of 12, turn ${P0.turnDeg}°) press Next stage until step ${stageNumber('raster')}: rasterisation makes ${A0.fragments.length} fragments from that one triangle. At step ${stageNumber('depth')} the depth test passes ${A0.passed} of them. Click a cell in the grid to read that fragment's weights, u, v and N·L.`,
    `In "A fragment shader" (the Lambert preset) the shader runs ${lambertRuns} times, once per visible pixel. Press "sqrt of a negative": ${broken.badCount} pixels come out NaN and are drawn hatched, all of them left of the middle, because the red field is sqrt(x - 0.5).`,
    `In "Perspective-correct" switch to screen-linear: ${bent.differing} of the ${bent.covered} pixels of the floor change colour, and the squares bend. Switch back to perspective-correct and they straighten.`,
    `In "Order and early depth" (back to front, early test off) the fragment shader runs ${backLate.rendered.shaderInvocations} times, one per fragment. Turn the early test on: still ${backEarly.rendered.shaderInvocations}, because every later triangle is nearer. Now pick front to back: ${frontEarly.rendered.shaderInvocations} runs, ${frontEarly.wasted} thrown away, and the picture does not change.`,
    `In "Blending" (alpha ${decimal(B0.alphaA, 1)} and ${decimal(B0.alphaB, 1)}, A then B) the pixel in the overlap is ${rgbText(overlapAB)}. Press B then A: it becomes ${rgbText(overlapBA)}.`,
  ],
  keyIdeas: [
    'A fragment is a candidate for a pixel, not a pixel: rasterisation makes one per covered pixel centre of each triangle, so several fragments can compete for one pixel.',
    'For opaque triangles the draw order changes the cost and not the picture: in this model, front to back with an early depth test shades fewer fragments than back to front.',
    'Texture coordinates are interpolated as attribute / w and divided by the interpolated 1 / w; interpolating by screen distance bends a texture on a slanted surface.',
    'Alpha blending is not commutative: swapping two translucent triangles changes the colour where they overlap, so their draw order has to be chosen on purpose.',
  ],
  quiz: [
    {
      q: 'In the pipeline, what is a fragment?',
      options: [
        'A pixel in the framebuffer that has already passed the depth test and been written',
        'A candidate colour for a pixel, made by rasterisation, that may still lose',
        'A piece of a triangle that clipping cut off at the edge of the screen',
        'A group of pixels that the fragment shader colours together in one run',
      ],
      answer: 1,
      why: `Rasterisation makes one fragment for each pixel centre a triangle covers, and several can land on one pixel. In the stages scene triangle ${P0.triangle + 1} makes ${A0.fragments.length} fragments and ${A0.passed} pass the depth test.`,
    },
    {
      q: 'Four opaque triangles overlap. Which draw order makes an early depth test save the most fragment-shader work?',
      options: [
        'Back to front, so the farthest triangle is shaded first and the rest paint over it',
        'Front to back, so nearer triangles fill the depth buffer before farther ones are tested',
        'Any order gives the same cost, because the final picture does not depend on it',
        'Shuffled, because a random order spreads the depth tests evenly over the frame as a whole',
      ],
      answer: 1,
      why: `Front to back, the early test rejects the hidden fragments before they are shaded: ${frontEarly.rendered.shaderInvocations} runs against ${backEarly.rendered.shaderInvocations} back to front, for the same picture.`,
    },
    {
      q: 'Why does a checker on a receding floor bend if u is interpolated linearly across the screen?',
      options: [
        'Equal steps on screen are not equal steps along the surface, so u has to be divided by w',
        'The rasteriser skips some pixel centres on slanted triangles, so u has gaps in it',
        'The checker texture has too few squares for the number of pixels the floor covers',
        'Linear interpolation rounds u to the nearest square, which shifts the edges sideways',
      ],
      answer: 0,
      why: `Farther along the floor, one pixel spans more surface. Interpolating u / w and 1 / w and dividing keeps u exact; in the lesson the wrong mode changes ${bent.differing} of ${bent.covered} pixels.`,
    },
    {
      q: 'Two translucent triangles overlap. What happens to the overlap colour if their draw order is swapped?',
      options: [
        'It stays the same, because each triangle adds the same amount of its colour',
        'It changes, because blending applies one triangle on top of the other in sequence',
        'It turns black, because two alpha values multiply the colours to nothing',
        'It stays the same, unless one of the two triangles is fully opaque with an alpha of one',
      ],
      answer: 1,
      why: `Blending is not commutative: the two orders differ by alpha A times alpha B times the difference of the colours. In the lesson the overlap is ${rgbText(overlapAB)} one way and ${rgbText(overlapBA)} the other.`,
    },
    {
      q: 'The red field of a shader is sqrt(x - 0.5). What happens to the pixels with x below 0.5?',
      options: [
        'They show red at full strength, because the square root is clamped to 1',
        'They are drawn black, since a negative number has no square root',
        'Their result is NaN, which is not a colour, so they are drawn hatched as bad',
        'The shader stops running, and the previous image stays on the screen',
      ],
      answer: 2,
      why: `The square root of a negative number is NaN under IEEE arithmetic, and NaN cannot be clamped to a colour. The lesson draws those ${broken.badCount} pixels hatched; the pixels at or above 0.5 are fine.`,
    },
  ],
};

export default lesson;
