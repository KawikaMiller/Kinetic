import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A LoRA adapter trains two thin matrices beside a frozen one, so fine-tuning touches a small share of the parameters, and quantisation shrinks stored weights by snapping them to a coarser integer grid, which one outlier weight can ruin for the weights that share its scale.',
    what: 'Fine-tuning adapts a trained model. LoRA freezes the weight matrices it adapts and learns an update written as the product of two thin matrices B and A, so a rank-r adapter on a d_out by d_in matrix has r (d_in + d_out) parameters instead of d_out d_in. The best possible rank-r update is the truncated SVD, and the adapter itself is found by gradient descent, which approaches that floor and does not go below it. Quantisation stores weights as small integers times a scale. With one scale for a whole tensor, a single large weight sets the scale and the ordinary weights round to zero; a scale per group confines the damage. Everything here runs on small seeded toy matrices: no real model is loaded.',
    analogy: 'LoRA is a sticky note clipped to a printed page: the page stays untouched and the note carries the correction. Quantisation is a ruler whose marks are spaced to fit the longest plank in the box; if one plank is twenty times longer, the short ones measure zero, unless each shelf gets its own ruler.',
    useCases: [
      'Estimating the memory to fine-tune a model with adapters rather than by training its weights directly',
      'Choosing an adapter rank by how much of the update\'s energy it keeps',
      'Choosing between per-tensor and per-group quantisation when a layer has outliers',
      'Reading a claim that a smaller number format is just as good by asking error of what, on which inputs',
    ],
    why: 'Memory decides who can fine-tune and serve a model. The formulas here (r (d_in + d_out) against d_out d_in, parameters x bits / 8, a floor set by the singular values) let you check a claim about adapter size or memory instead of trusting it, and the outlier scene shows how a smaller number format can fail without any weight looking wrong.',
    watch: 'The frozen matrix is grey and the adapter is yellow. Cheap memory and a small adapter are green; full fine-tuning and an adapter bigger than its matrix are red. In the rank scene kept singular values are yellow and dropped ones grey, the optimum floor is a dashed green line and the trained curve is blue. In the quantisation grids the outlier is violet, a weight that moved a lot is red and one that stayed close is green.',
  },
  tryThis: [
    'In A small adapter (4,096 x 4,096, rank 8) the adapter has 65,536 parameters against 16,777,216, which is 0.39%, exactly 1/256. Raise the rank past 2,048 and the page says the adapter is bigger than the matrix.',
    'In The best rank-r update (rank 2, seed 3) the optimum leaves 3.752% of the energy and the trained adapter ends at the same 3.752%. Raise the rank to 3: the floor falls to 0.921%. The trained curve approaches the dashed floor and does not cross it.',
    'In Snap to a coarser grid (8 bits, per-tensor, outlier on, seed 1) the relative output error of the toy layer is 6.4%. Choose 4 bits: 92.2%, and 61 of the 63 ordinary weights round to zero.',
    'Still at 4 bits choose per-group of 4: the error falls to 5.3% and 5 ordinary weights are zero, because the outlier\'s group alone pays for the outlier.',
  ],
  keyIdeas: [
    'A rank-r adapter on a d_out by d_in matrix has r (d_in + d_out) parameters against d_out d_in: 0.39% at 4,096 x 4,096 and rank 8, though past rank 2,048 it is bigger than the matrix.',
    'The best rank-r update is the truncated SVD, with an error equal to the energy of the dropped singular values; LoRA trains by gradient, which in this toy approaches that floor and does not go below it.',
    'Quantisation stores weights as integers times a scale, at parameters x bits / 8 bytes: 7 billion parameters take 14 GB at 16 bits and 3.5 GB at 4 bits, before scales.',
    'An outlier sets the scale of the weights that share it: in this toy at seed 1, 4-bit per-tensor rounds 61 of 63 ordinary weights to zero, while groups of 4 confine the damage to the outlier\'s group.',
  ],
  quiz: [
    {
      q: 'What is a LoRA adapter?',
      options: [
        'Two small matrices whose product is added to a frozen weight matrix, and only they are trained',
        'A smaller copy of the whole model that is trained from scratch on the new data',
        'A compressed version of the weights that is decoded again when the model is served',
        'A second model whose output is combined with the first model\'s output by a vote',
      ],
      answer: 0,
      why: 'The original matrix stays frozen; the adapter B A (d_out x r times r x d_in) is added to it. It is not a copy of the model and not a compression of it.',
    },
    {
      q: 'At 4,096 x 4,096 with rank 8, about what share of the matrix\'s parameters does the adapter have?',
      options: [
        'About 0.39%, which is 1/256',
        'About 3.9%, which is about 1/26',
        'About 8%, which is 1/12',
        'About 50%, which is 1/2',
      ],
      answer: 0,
      why: 'The adapter has r (d_in + d_out) = 8 x 8,192 = 65,536 parameters and the matrix has 4,096 x 4,096 = 16,777,216; 65,536 x 256 is 16,777,216.',
    },
    {
      q: 'One weight in a matrix is 20 times larger than the rest. What does 4-bit per-tensor quantisation do to the others?',
      options: [
        'The large weight sets the scale, so the ordinary weights round to zero or close to it',
        'Nothing changes for them, since each weight is rounded on its own regardless of the rest',
        'It makes them larger, since the grid is stretched to fit the biggest weight in the matrix',
        'It makes them more precise, because four bits are plenty of room for small values',
      ],
      answer: 0,
      why: 'In the toy at seed 1 the scale is the outlier\'s size divided by 7, so 61 of the 63 ordinary weights round to zero and the layer\'s output error is 92.2%. At 8 bits the same matrix has 6.4%.',
    },
    {
      q: 'Why does per-group quantisation help in that case?',
      options: [
        'The outlier sets the scale of its own group, so the other groups keep a fine grid',
        'It uses more bits for each weight in the matrix, so rounding matters a good deal less',
        'It removes the outlier before the weights are stored, so the scale shrinks for the rest',
        'It rounds the large weights and leaves the small ones in full precision as they were',
      ],
      answer: 0,
      why: 'Each group has its own scale: the outlier\'s group still rounds coarsely, the others do not. In the toy at seed 1 the 4-bit error falls from 92.2% to 5.3% with groups of 4.',
    },
  ],
};

export default lesson;
