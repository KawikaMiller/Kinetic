import { decimal, pct, sig } from '../../core/format';
import { ndcDepthAt, windowDepth } from '../../core/raster3d';
import type { LessonModule } from '../../core/types';
import {
  CAMERA_PRESETS, DEFAULT_APEX_Z, cameraView, clipScene, depthScene, initialCamera, initialClip, initialDepth, initialPoint, pipeline, translationEffect, type CameraState,
} from './model';
import { Stage } from './Stage';

const P0 = initialPoint();
const steps0 = pipeline(P0);
const screen0 = steps0.find((s) => s.id === 'screen')?.value ?? [0, 0, 0, 1];
const world0 = steps0.find((s) => s.id === 'world')?.value ?? [0, 0, 0, 1];
const effect0 = translationEffect(P0);

const inside = cameraView(CAMERA_PRESETS.find((p) => p.id === 'inside')?.apply(initialCamera()) as CameraState);
const ortho = cameraView(CAMERA_PRESETS.find((p) => p.id === 'ortho')?.apply(initialCamera()) as CameraState);

const clipOn = clipScene(initialClip());
const clipOff = clipScene({ clipping: false, apexZ: DEFAULT_APEX_Z });
const apexOff = clipOff.rows[2];

const depth0 = depthScene(initialDepth());
const depthNear = depthScene({ ...initialDepth(), nearIndex: 4 });
const depthFar = depthScene({ ...initialDepth(), farIndex: 0 });

/** The hand-worked quiz vector: fov 90, aspect 1, near 1, far 100, a point 10 ahead. */
const QUIZ_NEAR = 1;
const QUIZ_FAR = 100;
const QUIZ_AHEAD = 10;
const quizZ = ndcDepthAt(QUIZ_AHEAD, QUIZ_NEAR, QUIZ_FAR);
const quizUsed = windowDepth(quizZ);
const quizTravelled = (QUIZ_AHEAD - QUIZ_NEAR) / (QUIZ_FAR - QUIZ_NEAR);

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A 3D point reaches a pixel through a chain of 4 by 4 matrices, then one divide by w that is not a matrix at all; skipping the clip step or squeezing the near and far planes breaks the picture.',
    what: 'A model matrix puts the object in the world, the view matrix (lookAt) moves the world so the camera sits at the origin looking down -z, and the projection matrix squeezes the viewing frustum into a cube and stores the distance in w. Dividing x, y and z by w gives normalised device coordinates, and the viewport turns them into pixels. The divide is what makes far things small, and the way depth is squeezed means the near plane matters far more than the far plane for precision. This lesson uses a right-handed system, the camera looks down -z, and OpenGL-style clip space.',
    analogy: 'A film set seen through a camera: you move the set into place (model), then decide where the camera stands and points (view), then choose a lens (projection). The lens throws everything onto a flat plate and the divide is the shrinking with distance. Anything behind the lens has to be thrown away first, because maths that works for things in front gives nonsense behind.',
    useCases: [
      'Reading and writing the vertex shader of any 3D engine, where model, view and projection are three uniforms',
      'Debugging a model that vanishes, flips or stretches when the camera gets close to it',
      'Fixing z-fighting flicker on distant roads, decals or shadows by moving the near plane',
      'Making a 2D UI overlay or an orthographic map view next to a perspective scene',
    ],
    why: 'Almost every 3D bug is one of a handful: the wrong space, a missing divide, a missing clip, or too little depth precision. Knowing the chain lets you put a vertex in each space, find which stage broke the picture and fix it with a number instead of trial and error.',
    watch: 'One vertex: a grey wireframe cube with a yellow ring on the corner you picked; each stage is a card showing the matrix, the input vector and the output vector, and a card that is faded has no value (a direction has no screen position). Camera and frustum: the blue trapezoid is the frustum seen from above, an amber dot is the eye and a pink dot the target (both draggable), grey dots are cube corners inside the frustum and dark grey dots are outside it; in the picture, grey edges are inside and dark grey edges have a corner outside. Clipping: a grey polygon is the clipped triangle, green dots are vertices clipping created, a red polygon is the broken result with clipping off; the side view shows kept edges grey, the clipped-away part dark grey and dashed, and the near plane and frustum in blue. Depth precision: sky blue pixels show the nearer surface winning, orange pixels z-fight, dark grey pixels are outside the near and far planes; the dot on the curve is green when your gap is resolved and red when it is not. The chips say what is simulated, illustrative or from memory.',
  },
  tryThis: [
    `In "One vertex" (corner ${P0.vertex}, scale ${P0.scale}×, turn ${P0.turnDeg}°, move ${P0.moveX}, ${P0.moveZ}) the corner lands at world (${world0.slice(0, 3).map((v) => decimal(v, 2)).join(', ')}) and pixel (${decimal(screen0[0], 2)}, ${decimal(screen0[1], 2)}). Switch "Read it as" to a direction: the translation moves the point by ${decimal(effect0.point, 2)} and the direction by ${decimal(effect0.direction, 2)}, and the cards after camera space fade.`,
    `In "Camera and frustum" press "camera inside the cube": ${inside.behind} of 8 corners are behind the camera and ${inside.outside} are outside the frustum, so edges to the corners behind it are not drawn. Then press "orthographic": ${ortho.outside} corners are outside and the field-of-view slider is gone, because an orthographic box has none.`,
    `In "Clipping" the apex is at z = ${DEFAULT_APEX_Z}, behind the camera: clipping on adds ${clipOn.rows.filter((r) => r.created).length} vertices on the near plane. Switch clipping off: the apex has w = ${decimal(apexOff.clip[3], 2)} and the divide flips it to the wrong side of the base.`,
    `In "Depth precision" (near ${depth0.near}, far ${depth0.far}, distance ${depth0.distance}, gap ${depth0.gap}) one depth step is ${sig(depth0.resolution)} units, so ${pct(depth0.tiedShare)} of the pixels z-fight. Set the near plane to ${depthNear.near}: z-fighting drops to ${pct(depthNear.tiedShare)}. Reset, then set far to ${depthFar.far}: the surfaces lie beyond it and nothing is drawn.`,
  ],
  keyIdeas: [
    'The projection matrix does not give screen coordinates by itself: it leaves the distance in w, and the divide by w, a separate non-linear step, is what makes far things small.',
    'A point has w = 1 and a direction has w = 0, which is why coordinates carry a fourth component: a translation moves the point and leaves the direction alone.',
    'Clipping happens in clip space, before the divide. A corner behind the camera has a negative w, so without clipping it divides to a mirrored, stretched triangle.',
    'Depth is stored non-linearly, so the near plane sets how finely distant depth is kept; once far is well beyond the surfaces, raising it changes almost nothing, and pushing the near plane out is the cheap fix for z-fighting.',
  ],
  quiz: [
    {
      q: 'After the projection matrix has multiplied a corner, are its x and y already screen coordinates?',
      options: [
        'No: they still have to be divided by w, a separate step that shrinks distant points',
        'Yes: the matrix already contains the perspective, so only a rescale to pixels is left',
        'No: the model matrix is applied after projection and has to come before the viewport',
        'Yes, once the viewport has added the offset of the window centre to each coordinate',
      ],
      answer: 0,
      why: 'The projection matrix is linear, and shrinking with distance is not. It puts the distance in w, and dividing x, y and z by w afterwards is what makes far things small.',
    },
    {
      q: `With near ${QUIZ_NEAR} and far ${QUIZ_FAR}, a point ${QUIZ_AHEAD} units ahead has NDC z of ${decimal(quizZ, 4)}. What does that say about depth?`,
      options: [
        `Depth is spread evenly, so ${QUIZ_AHEAD} of ${QUIZ_FAR} units uses a tenth of the range`,
        `Depth is bunched near the camera: ${pct(quizTravelled)} of the distance already uses ${pct(quizUsed)} of the range`,
        'The point is outside the frustum, because a z above zero lies behind the camera plane',
        'The far plane is clipping the point, since its NDC z is close to the limit of +1',
      ],
      answer: 1,
      why: `Window depth is (z + 1) / 2 = ${decimal(quizUsed, 4)} here, while the point has travelled just ${decimal(quizTravelled, 4)} of the way from near to far. In this model the depth buffer spends a large share of its resolution close to the camera.`,
    },
    {
      q: 'Two walls a centimetre apart flicker at a distance. Which change is the most likely to fix it?',
      options: [
        'Move the far plane out to a larger distance so depth has more room to spread out',
        'Draw the two walls in the opposite order so the nearer wall is drawn last',
        'Widen the field of view, which gives the depth buffer more pixels to compare',
        'Move the near plane further out, which gives distant depth more of the buffer',
      ],
      answer: 3,
      why: 'One depth step grows with distance squared and shrinks as the near plane moves out, so a larger near value gives distant surfaces finer steps. A larger far value does almost nothing, and the draw order cannot break a true tie.',
    },
    {
      q: 'Why do 3D points and directions carry a fourth coordinate w?',
      options: [
        'It stores the distance in front of the camera, so the projection can be skipped',
        'It lets a 4 by 4 matrix translate a point (w = 1) while leaving a direction (w = 0) alone',
        'It records the colour of the vertex, so the shader has it next to the position',
        'It keeps the matrix square, and its value has no effect on the result of a multiply',
      ],
      answer: 1,
      why: 'A translation sits in the fourth column of the matrix, and it is multiplied by w. A point with w = 1 is moved; a direction such as a surface normal with w = 0 is not.',
    },
    {
      q: 'What goes wrong if a triangle with one corner behind the camera skips clipping?',
      options: [
        'The renderer draws nothing for that triangle, because a hidden corner removes it',
        'The corner is drawn at the far plane, so the triangle looks too small',
        'The negative w mirrors that corner, so the triangle is drawn stretched and flipped',
        'The depth buffer overflows, so the triangle shows through the surfaces in front',
      ],
      answer: 2,
      why: `Behind the camera w is negative, and dividing by it flips the sign of x and y. In the lesson the apex at z = ${DEFAULT_APEX_Z} has w = ${decimal(apexOff.clip[3], 2)} and lands on the wrong side of the base.`,
    },
  ],
};

export default lesson;
