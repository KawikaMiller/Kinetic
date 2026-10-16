import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A convolutional layer slides one small learned kernel across an image, so each output cell sees only a patch, the same few numbers are reused everywhere, and stacking layers widens what each cell sees.',
    what: 'A 3 x 3 kernel is placed over a patch of pixels, each pixel is multiplied by the kernel entry above it, and the nine products are added into one output cell; sliding the window gives a feature map. Output side is floor((n + 2p − k) / s) + 1. In deep-learning libraries this "convolution" does not flip the kernel (strictly it is cross-correlation). Because one kernel is reused at each position, a layer learns few numbers and a pattern gives the same response wherever it is, and pooling thins the map. Stacking layers widens the patch each output cell depends on, its receptive field.',
    analogy: 'A stamp-sized magnifier moved across a photograph: it looks at one small patch at a time, with the same lens everywhere, and writes down how strongly each patch matches what the lens is built to notice.',
    useCases: [
      'Image classifiers and detectors, from small digit readers to large vision models',
      'Edge, blur and sharpen filters in image editing, which are fixed kernels',
      '1-D convolutions over audio and time series, and over text in some models',
      'Reading a model summary: kernel size, stride, padding and pooling set the shapes and the parameter count',
    ],
    why: 'Convolutions explain why vision models need far fewer parameters than a dense network on pixels, and the shape rules (output size, receptive field) are what you check when a layer stack fails with a size mismatch or misses large objects. The honest limits (pooling hides only some shifts, a toy kernel is not a shape detector) keep you from over-reading what a model has learned.',
    watch: 'The picture is grey by brightness. The window being multiplied is outlined yellow, the kernel is the violet block of numbers, and the feature map is tinted green where the response is positive and red where it is negative: a sign, not a verdict. Zero responses and the padding ring are grey. In the stacking scene the receptive field of the picked cell is violet and the pixel you change and the outputs that moved are yellow. Learned kernels use the same green and red signs, and the curves are blue.',
  },
  tryThis: [
    'In Slide a kernel (vertical bar, vertical-edge kernel) press play: the first row of the feature map ends as 0, 4, 0, −4, 0, 0 and the output is 6 x 6. Set Padding to 1: 8 x 8. Set it back to 0 and Stride to 2: 3 x 3.',
    'In Slide a kernel, set Kernel to "Flipped": every sign in the Sobel feature map swaps, because the kernel is not symmetric. Pick the box blur: flipping changes nothing.',
    'In Pooling and shifting (bar in column 3, shift +1) the pooled map is unchanged although the picture moved. Set Bar column to 4: now the pooled map changes in 6 of 9 cells.',
    'In Learn a kernel press Train (or Step 10 twelve times): held-out accuracy reaches about 92%. Press "Train 8 seeds": 6 of 8 reach 90%, and the kernels differ from seed to seed.',
    'In Stacking, three 3 x 3 convolutions show a 7 x 7 receptive field. Remove two layers, then add pool 2 x 2 and conv 3 x 3: conv, pool, conv gives 8 x 8. Switch to "Change one input pixel" and click one: the moved outputs match the prediction.',
  ],
  keyIdeas: [
    'One small kernel is reused at each position, so a conv layer learns 10 numbers where a dense layer making the same 6 x 6 map from 64 pixels needs 2,340.',
    'Each output cell sees a patch of the input, not the whole image; stacking layers widens that receptive field, and three 3 x 3 convolutions reach 7 x 7.',
    'A feature map shifts with the picture, and pooling can hide a small shift, but a maximum that crosses a pooling boundary changes the pooled output.',
    'In this toy the kernel a network finds is one of several that work: seeds give different kernels, and some seeds find none.',
  ],
  quiz: [
    {
      q: 'What does one output cell of a 3 x 3 convolution layer depend on?',
      options: [
        'The 3 x 3 patch of input under the window at that position',
        'The whole input image, mixed through the shared kernel weights',
        'The one input pixel at the same row and column as the cell',
        'The output cell just before it in the same row of the map',
      ],
      answer: 0,
      why: 'Each output is the sum of nine products from the patch under the window. Other pixels do not enter it; a deeper layer reaches farther because its inputs are themselves patch sums.',
    },
    {
      q: 'A pattern moves one pixel in the input of a conv layer followed by 2 x 2 max pooling. What happens to the pooled output?',
      options: [
        'It may stay the same or change, depending on whether the maximum crosses a pooling boundary',
        'It stays exactly the same, because pooling makes the network translation-invariant',
        'It shifts by one cell too, because pooling keeps the layout of the feature map',
        'It changes in every cell, because the kernel is applied at a new position',
      ],
      answer: 0,
      why: 'The feature map shifts with the pattern (equivariance). Pooling keeps the maximum of each block, so a shift inside a block can vanish while one that moves the maximum into the next block changes the output, as the scene shows.',
    },
    {
      q: 'What receptive field does conv 3 x 3, then pool 2 x 2, then conv 3 x 3 give?',
      options: ['8 x 8', '7 x 7', '9 x 9', '6 x 6'],
      answer: 0,
      why: 'Apply r_out = r_in + (k − 1) · jump: 1 becomes 3 after the conv (jump 1), 4 after the pool (jump 2), and 4 + 2 · 2 = 8 after the last conv.',
    },
    {
      q: 'An 8 x 8 image goes through one valid 3 x 3 convolution (one kernel) to a 6 x 6 map. How many numbers does the layer learn, against a dense layer that makes the same 6 x 6 map?',
      options: [
        '10, against 2,340 for the dense layer',
        '9, against 2,304 for the dense layer',
        '36, against 2,340 for the dense layer',
        '10, against 64 for the dense layer',
      ],
      answer: 0,
      why: 'The conv layer has 3 x 3 weights plus one bias, 10 numbers, whatever the image size. The dense layer needs 64 x 36 weights plus 36 biases, 2,340, because it learns a separate weight for each input and output pair.',
    },
  ],
};

export default lesson;
