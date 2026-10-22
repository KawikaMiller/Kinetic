import { decimal, integer } from '../../core/format';
import type { LessonModule } from '../../core/types';
import { rgbText } from './paint';
import {
  BIAS_CHOICES, CLEAN_BIAS, DEFAULT_PIXEL, IMAGE, MANY, PIXELS, PRESETS, compareBvh, differsFromClean, initialTrace, manySpheres, pixelTrail, render, sceneOf, settingsOf,
} from './scene';
import { Stage } from './Stage';

const S0 = initialTrace();
const trail = pixelTrail(S0, DEFAULT_PIXEL.x, DEFAULT_PIXEL.y);
const [hitBall, hitFloor] = trail.hits;

const testsOf = (s: typeof S0) => render(sceneOf(s), settingsOf(s)).stats.objectTests;
const shadowsOff = testsOf({ ...S0, shadows: false });
const flat = testsOf(PRESETS.find((p) => p.id === 'flat')?.apply(S0) ?? S0);
const withShadows = testsOf(S0);

const acne = differsFromClean({ ...S0, biasIndex: 0 }).filter(Boolean).length;
const acneClean = differsFromClean(S0).filter(Boolean).length;
const cleanIndex = BIAS_CHOICES.indexOf(CLEAN_BIAS);

const cmp = compareBvh(manySpheres());

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A ray tracer shoots a ray from the eye through each pixel, finds the nearest thing it hits, and asks one more ray whether the light can see that point; a mirror is just another ray, and a hierarchy of boxes keeps the number of tests down.',
    what: 'For every pixel the tracer builds a ray from the eye and finds the nearest intersection with the scene. At the hit it shades with an ambient term, a diffuse term from the angle between the surface normal and the light (Lambert) and a highlight (Phong), unless a shadow ray from the point to the light is blocked. For a mirror the same routine is called again on the reflected ray, up to a bounce limit. Secondary rays start a small bias off the surface so they do not hit the surface they left, and a bounding volume hierarchy lets a ray skip most objects by testing boxes first. Everything here is a small software tracer on a 96 by 72 picture.',
    analogy: 'Looking backwards along a path of light. You ask each pixel "what do you see?", follow the line of sight until it lands on something, then turn and ask "can the lamp see you from here?". For a mirror you simply keep asking the same question along the bounced line.',
    useCases: [
      'Reading why a renderer or a game engine has shadow bias and "ray depth" settings',
      'Understanding what a bounding volume hierarchy buys in a path tracer, a physics engine or a collision query',
      'Explaining hardware ray tracing: the work is intersection tests, and hierarchy traversal is what the hardware speeds up',
      'Debugging black speckles on a lit surface, or shadows that float away from the objects casting them',
    ],
    why: 'Rendering questions are mostly about rays: where they start, what they hit, how many tests that costs. Moving a light, a sphere and a bias slider and watching the picture and the counts change gives you the vocabulary for shadow acne, reflection depth and acceleration structures.',
    watch: 'One pixel: the picture is a ray-traced scene; a yellow ring marks the pixel being traced. The top view shows the camera ray in blue, the shadow ray in violet (dashed when something blocks it), the mirror ray in yellow, a green dot where the point is lit and a dark dot where it is in shadow, a ringed first hit in yellow, an amber dot for the light and grey circles for the spheres. Shading and mirrors: the same picture and top view with the light and spheres draggable. Shadow acne: red rings mark pixels that differ from the clean render. Acceleration: the left image is the 64-sphere scene and the right one is a heat map where brighter blue means more ray-object tests at that pixel. The chips say what is simulated, a toy or from memory.',
  },
  tryThis: [
    `In "One pixel" the traced pixel (${DEFAULT_PIXEL.x}, ${DEFAULT_PIXEL.y}) lies on the mirror ball: the camera ray hits it at t = ${decimal(hitBall.t, 3)}, the shadow ray is ${hitBall.shadowed ? 'blocked' : 'clear'} and the mirror ray goes on to hit the ${hitFloor.object} at t = ${decimal(hitFloor.t, 3)}, so the pixel is ${rgbText(trail.colour)}. Click another pixel on the red sphere and read its row.`,
    `In "Shading and mirrors" (shadows on, bounce depth ${S0.bounces}) the render makes ${integer(withShadows)} ray-object tests. Switch shadows off: ${integer(shadowsOff)}, because no shadow rays are shot. Press "no reflections (depth 0)": ${integer(flat)} with shadows on, because no mirror rays are shot.`,
    `In "Shadow acne" the bias starts at 0: ${acne} pixels differ from the clean render and are ringed in red. Move the bias slider to ${BIAS_CHOICES[cleanIndex]}: ${acneClean} pixels differ.`,
    `In "Acceleration" (${MANY.count} spheres) the render without the hierarchy makes ${integer(cmp.without.stats.objectTests)} ray-object tests. Turn the hierarchy on: ${integer(cmp.withBvh.stats.objectTests)} object tests and ${integer(cmp.withBvh.stats.boxTests)} box tests, and the two images are ${cmp.identical ? 'identical' : 'different'}.`,
  ],
  keyIdeas: [
    'Rays start at the eye, one per pixel, because rays sent from the light would rarely reach the eye; following light backwards finds what each pixel sees.',
    'A mirror is not a special case: a reflected ray is another ray traced by the same routine, with its direction mirrored about the normal and a bounce limit to stop it.',
    'Secondary rays start a small bias off the surface: at bias 0 a shadow ray can hit the surface it left and lit pixels speckle dark, and a large bias detaches shadows from their objects.',
    'A bounding volume hierarchy changes how many objects a ray is tested against, not the picture: in this model the two images are identical and far fewer tests are counted.',
  ],
  quiz: [
    {
      q: 'Where does a ray tracer start the rays it uses to colour the picture, and why?',
      options: [
        'At the light, because light is what travels through a scene towards the eye',
        'At the eye, one per pixel, because rays from the light would nearly all miss it',
        'At the brightest object, because it is the source of the colours in the picture',
        'At the centre of the scene, because every pixel then needs only one shared ray',
      ],
      answer: 1,
      why: `A sliver of the light leaving a lamp reaches the eye, so a tracer works backwards: one camera ray per pixel finds what that pixel sees. Here that is ${integer(PIXELS)} camera rays for a ${IMAGE.w} by ${IMAGE.h} picture.`,
    },
    {
      q: 'How does a ray tracer draw a mirror?',
      options: [
        'It paints a copy of the scene, flipped, inside the mirror object ahead of time',
        'It uses a separate mirror shader that reads back the picture drawn so far in the render',
        'It traces a reflected ray with the same routine and mixes in what that ray sees',
        'It makes the mirror emit light, with the colour of whatever stands in front',
      ],
      answer: 2,
      why: `A reflected ray is just another ray: the same routine runs on a direction mirrored about the normal, up to a bounce limit. The pixel (${DEFAULT_PIXEL.x}, ${DEFAULT_PIXEL.y}) shows it: its mirror ray hits the ${hitFloor.object}.`,
    },
    {
      q: 'With the bias at 0, why do lit surfaces come out speckled with dark pixels?',
      options: [
        'The light is too close to the surface, so rounding makes its glare flicker',
        'The picture has too few pixels, so some of them land in the gaps between rays',
        'The shadow ray starts on its own surface and can hit it again, so the point looks shadowed',
        'The mirror ray is shot twice at some pixels, so the colours are added together',
      ],
      answer: 2,
      why: `At bias 0 the ray's start point sits exactly on the surface, so rounding lets it intersect that surface a hair away and the point looks blocked. In the lesson ${acne} pixels are ringed, and ${acneClean} at bias ${BIAS_CHOICES[cleanIndex]}.`,
    },
    {
      q: 'What does a bounding volume hierarchy change in the render?',
      options: [
        'The picture, because boxes round off the shapes of the spheres a little',
        'The number of objects each ray is tested against, while the picture stays the same',
        'The number of rays, because one ray through a box can stand in for a whole group of rays',
        'The lighting, because shadows are cast by the boxes instead of the objects',
      ],
      answer: 1,
      why: `The hierarchy just skips objects a ray cannot reach, so the image is identical: ${integer(cmp.withBvh.stats.objectTests)} object tests plus ${integer(cmp.withBvh.stats.boxTests)} box tests against ${integer(cmp.without.stats.objectTests)} without it.`,
    },
    {
      q: 'The bounce depth is set to 0 and the mirror ball is fully reflective. What does the ball look like?',
      options: [
        'A perfect mirror, because reflectivity alone decides how it is shaded',
        'Black, since a mirror with no bounces has no colour of its own to show in the picture',
        'Shaded like an ordinary surface: no mirror ray is shot, so nothing is reflected in it',
        'Transparent, because a ray that does not bounce simply passes straight through the ball',
      ],
      answer: 2,
      why: `The bounce limit is what lets mirror rays be shot. With depth 0 the ball gets just its own ambient, diffuse and highlight terms, and the test count drops from ${integer(withShadows)} to ${integer(flat)} for this scene.`,
    },
  ],
};

export default lesson;
