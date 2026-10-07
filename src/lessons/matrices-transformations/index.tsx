import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A 2×2 matrix is a function that moves every point of the plane: its two columns are where (1, 0) and (0, 1) land, and everything else follows along.',
    what: 'Multiplying a point by a matrix gives x′ = a·x + b·y and y′ = c·x + d·y. That map keeps straight lines straight and the origin fixed, so it is completely decided by where the two basis arrows î and ĵ go, which are the matrix\'s columns. The determinant ad − bc is how much areas grow; a negative one means the plane got flipped, and zero means it collapsed onto a line and can\'t be undone. Doing one transform after another multiplies the matrices, and the order matters. Adding a third coordinate (a 3×3 "homogeneous" matrix) lets translation become a matrix too, which is exactly what CSS\'s matrix(a, b, c, d, e, f) is.',
    analogy: 'Think of drawing on a rubber sheet with a grid printed on it. Grab the sheet and stretch, shear or turn it: every square of the grid changes the same way, so knowing where one square went tells you where everything went.',
    useCases: [
      'CSS and SVG transforms: rotate(), scale() and skew() all become one matrix(a, b, c, d, e, f)',
      'Games and graphics: every sprite and model is placed by multiplying transform matrices',
      'Maps and image processing: affine warps that align a photo or a scanned page',
      'ML: every layer of a neural network starts with a matrix times a vector',
    ],
    why: 'You meet transforms the moment you animate a UI, position anything in a canvas or game, or read model code. Knowing that order matters, that columns are where the axes land and that det = 0 loses information explains bugs like "the element rotates around the wrong point" or "scale then rotate looks different".',
    watch: 'Transform: î is a blue arrow and ĵ a violet one, and the matrix\'s first and second columns wear the same colours. The original F is a dashed dark-grey outline, the transformed F is yellow, and the warped grid is dark-grey lines. The transformed unit square is tinted green when det > 0 and orange when det < 0 (a flip, not an error); when det = 0 it collapses to a grey line. "none" for the inverse shows in red. Compose: the same marks on two plots side by side. Homogeneous 3×3: the dashed dark-grey F, the moved yellow F, and the translation t as a pink arrow; the 3×3\'s third column is pink. The CSS box is a yellow square with an "F" on dark-grey axes; "matches the 3×3" is green, a mismatch would be red.',
  },
  tryThis: [
    'Pick "Rotate 30°": the columns become (0.866, 0.5) and (−0.5, 0.866), and det stays 1, so areas are unchanged.',
    'Pick "Reflect": det turns −1, the square goes orange and the F is mirrored.',
    'Pick "Singular": the plane collapses onto a line, det = 0 and the inverse reads "none".',
    'In Compose, keep A = Rotate 30° and B = Stretch x ×2 and press play: the two F\'s end up in different places. Then try B = Scale ×2.',
    'In Homogeneous 3×3, slide tx and ty and compare the plot with the real CSS box underneath: the box turns the other way because CSS\'s y axis points down.',
  ],
  keyIdeas: [
    'A matrix\'s columns are where î and ĵ land; every other point follows from those two.',
    'det = how much areas scale. Negative means flipped; zero means collapsed and impossible to undo.',
    'Order matters: A then B is B·A, which is usually not A·B.',
    'A 2×2 can\'t move the origin; a homogeneous 3×3 adds translation, like CSS matrix(a, b, c, d, e, f).',
  ],
  quiz: [
    {
      q: 'You rotate a shape by 30° and then stretch it ×2 along x. A teammate stretches first and then rotates. Do you get the same picture?',
      options: [
        'No: in general A·B ≠ B·A, so the order changes the result',
        'Yes: matrix multiplication is commutative, like numbers',
        'Yes: both are linear maps, so the order cancels out',
        'Only if the shape is centred on the origin first',
      ],
      answer: 0,
      why: 'Stretch-after-rotate doubles the already rotated x coordinates, so î lands at (1.73, 0.5); rotate-after-stretch turns the stretched arrow, landing at (1.73, 1). Matrix products don\'t commute in general. Centring helps with translation, not with this.',
    },
    {
      q: 'Where does ĵ = (0, 1) land under the matrix [[2, 1], [0, 3]] (rows written top to bottom)?',
      options: ['(1, 3): the second column', '(2, 0): the first column', '(0, 3): the bottom row', '(2, 1): the top row, left to right'],
      answer: 0,
      why: 'M·(0, 1) picks out the second column: (b, d) = (1, 3). The first column (2, 0) is where î goes. Reading rows instead of columns is the usual slip.',
    },
    {
      q: 'A matrix has determinant −2. What does it do to a shape like the F?',
      options: [
        'Doubles its area and mirrors it',
        'Halves its area, keeps its orientation',
        'Squashes it onto a line',
        'Doubles its area, keeps its orientation',
      ],
      answer: 0,
      why: '|det| = 2 is the area factor, and the minus sign means orientation flipped, so the F reads backwards. A line would need det = 0; keeping orientation would need det > 0.',
    },
    {
      q: 'Why can\'t any 2×2 matrix translate a shape by (2, 1)?',
      options: [
        'M·(0, 0) is always (0, 0), so the origin never moves',
        'A 2×2 matrix can only rotate, never stretch or shift',
        'Shifting would always make its determinant zero',
        'Translation needs a matrix of complex numbers',
      ],
      answer: 0,
      why: 'Every 2×2 sends the origin to itself, and a translation moves it. Adding a third coordinate fixed at 1 turns translation into a 3×3 matrix. 2×2 matrices can stretch and shear, not just rotate.',
    },
    {
      q: 'A transform has det = 0. Can another matrix undo it?',
      options: [
        'No: different points landed on the same spot',
        'Yes: use the matrix with the entries negated',
        'Yes: its transpose always undoes it exactly',
        'Only when the points are all on the x axis',
      ],
      answer: 0,
      why: 'det = 0 squashes the plane onto a line (or a point), so many points share an image and nothing can tell them apart again: there is no inverse. Negating or transposing a matrix is not the same as inverting it.',
    },
  ],
};

export default lesson;
