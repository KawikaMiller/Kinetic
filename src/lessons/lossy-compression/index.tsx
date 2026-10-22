import { decimal, integer, pct } from '../../core/format';
import type { LessonModule } from '../../core/types';
import { analyseBlock, chooseSource, initialBlock, initialQuant, quantiseBlock, toggleCoefficient } from './blocks';
import { dB } from './captions';
import { generations, measure, syntheticImage } from './image';
import { Stage } from './Stage';

const n2 = (v: number) => decimal(v, 2);

const B0 = initialBlock();
const base = analyseBlock(B0);
const dcZeroed = analyseBlock(toggleCoefficient(B0, 0, 0));
const gradient = analyseBlock(chooseSource(B0, 'gradient'));
const checker = analyseBlock(chooseSource(B0, 'checker'));
const dc = Math.round(base.coeffs[0][0]);

const Q0 = initialQuant();
const q50 = quantiseBlock(Q0);
const q10 = quantiseBlock({ ...Q0, quality: 10 });
const q1 = quantiseBlock({ ...Q0, quality: 1 });
const q100 = quantiseBlock({ ...Q0, quality: 100 });

const image = syntheticImage();
const m50 = measure(image, 50).point;
const m100 = measure(image, 100).point;
const m5 = measure(image, 5).point;

const aligned = generations(image, 50, 10, 0);
const shifted = generations(image, 50, 10, 3);

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'JPEG-style compression turns each 8 by 8 block into frequency coefficients with a DCT, divides them by a table and rounds; the rounding throws away what the eye notices least, and quality only scales that table.',
    what: 'A grey block is shifted by 128 and transformed by the 2D DCT into 64 coefficients: a DC term for the average and 63 for patterns of rising frequency. Dividing each coefficient by an entry of a table and rounding to a whole number is the only step that loses information; most high-frequency entries round to zero and cost almost nothing. The quality setting scales the table by a published rule, so it is a knob on step sizes, not a share of the data. Because the blocks are coded independently, a low quality shows the 8 by 8 grid, and re-saving a picture whose grid has moved changes it again. This lesson is baseline grey only, with a size estimated from symbol entropy.',
    analogy: 'Rounding prices in a shop. Rounding to the nearest ten pounds is cheap to write down and loses little on a 300 pound item, but it flattens a 4 pound item to nothing. The table decides how coarsely each frequency is rounded, and the eye cares least about the finest ones.',
    useCases: [
      'Choosing a JPEG quality for photos on a website, and reading why the same setting gives different file sizes',
      'Spotting blocking and ringing artefacts and knowing they come from the 8 by 8 grid and the rounding',
      'Understanding why editing and re-saving a JPEG degrades it, and why a screenshot of text does not suit it',
      'Seeing the same idea in other codecs: transform, quantise, then entropy-code what is left',
    ],
    why: 'Almost every image, video and audio format rests on transform, quantise and code. Seeing a block as coefficients, zeroing some, and watching size and error trade off gives you the picture behind quality sliders and artefacts.',
    watch: 'A block: the first grid is the 8 by 8 block in grey levels (light grey wash, stronger for brighter pixels). The coefficient grid has the DC cell in amber, other coefficients in yellow (stronger when larger) and a coefficient you zeroed in dark grey. The reconstruction is green where a pixel is exactly right and red where it moved, stronger when further off. The last image is the 64 basis patterns. Quantise: the zig-zag scan is a blue line over the levels; zero levels are dark grey. Whole image: violet hairlines are the block grid, the difference image is red where the reconstruction is off, and the yellow dot marks the current quality on the size against PSNR curve. Generation loss: the blue line counts pixels each save changed, and turns red when the grid is shifted between saves. The chips say what is real, illustrative, simulated or from memory.',
  },
  tryThis: [
    `In "A block" (the textbook block) ${base.holding90} of 64 coefficients hold 90% of the energy, and the DC coefficient is ${dc}. Click the DC coefficient to zero it: ${pct(dcZeroed.keptEnergy)} of the energy is kept and the PSNR drops to ${dB(dcZeroed.psnr)}. Pick the smooth gradient: ${gradient.holding90} coefficients hold 90%; pick the checker: ${checker.holding90}.`,
    `In "Quantise" (the textbook block at quality ${Q0.quality}) ${q50.nonZero} of 64 levels are non-zero. Move the quality to 10: ${q10.nonZero}. To 1: ${q1.nonZero}, and the block collapses toward a flat patch. To 100: every table entry is 1 and ${q100.nonZero} levels are non-zero.`,
    `In "Whole image" (quality 50) the estimated size is ${integer(Math.round(m50.bytes))} bytes against ${integer(4096)} raw, and the PSNR is ${dB(m50.psnr)}. Move the quality to 5: ${integer(Math.round(m5.bytes))} bytes and ${dB(m5.psnr)}; switch the block grid on to see the 8 by 8 blocks.`,
    `In "Generation loss" (quality 50, ten re-saves, grid aligned) save 1 changes ${integer(aligned.changed[0])} pixels and save 10 changes ${integer(aligned.changed[9])}. Set the shift to 3 pixels: save 10 changes ${integer(shifted.changed[9])}.`,
  ],
  keyIdeas: [
    'Lossy compression does not delete pixels: it moves each 8 by 8 block into frequency coefficients, rounds them with a table and keeps what survives, and each pixel is rebuilt from those.',
    `Quality is not a share of the data: it scales a table of step sizes, and the size follows from the symbols left after rounding, so in the lesson quality 50 costs ${pct(m50.bytes / m100.bytes)} of quality 100.`,
    'The transform keeps energy, so a block whose energy sits in a few low-frequency coefficients, such as a smooth gradient, survives coarse rounding, and a checker spread over high frequencies does not.',
    'Re-saving is not free: in this model the loss mostly settles while the 8 by 8 grid stays aligned and keeps growing when an edit moves the grid between saves.',
  ],
  quiz: [
    {
      q: 'A JPEG is saved at quality 50. Is the file half the size of the one saved at quality 100?',
      options: [
        'Yes, because quality 50 keeps half of the coefficients',
        'Yes, because quality is a percentage of the original data',
        'No, quality scales the step sizes, and the size depends on what survives rounding',
        'No, because quality 50 throws away every second block of the picture and keeps the rest',
      ],
      answer: 2,
      why: `Quality scales a table of step sizes by a rule; it does not say how much data is kept. For the lesson image the estimate at quality 50 is ${pct(m50.bytes / m100.bytes)} of the estimate at quality 100.`,
    },
    {
      q: 'What does lossy compression do to the pixels of a block?',
      options: [
        'It deletes the pixels the eye is least likely to notice',
        'It rounds the block\'s frequency coefficients, and every pixel is rebuilt from them',
        'It averages neighbouring pixels in pairs until the block is small enough to store',
        'It stores a few chosen pixels and guesses the rest from them',
      ],
      answer: 1,
      why: `Nothing is deleted pixel by pixel. The DCT is exact, and the loss comes from dividing the coefficients by the table and rounding: in the lesson ${q50.nonZero} of 64 levels survive at quality 50 and the 64 pixels are rebuilt from them.`,
    },
    {
      q: 'Why does a smooth gradient block survive coarse rounding better than a checker block?',
      options: [
        'Its energy sits in a few low-frequency coefficients, which the table rounds finely',
        'A gradient has fewer pixels than a checker, so there is less to lose in the block overall',
        'The table rounds high frequencies finely and low frequencies coarsely',
        'A checker contains values the DCT cannot represent exactly',
      ],
      answer: 0,
      why: `The transform keeps energy, and a gradient puts it in few coefficients: ${gradient.holding90} hold 90% of it, against ${checker.holding90} for the checker. Coarse rounding then removes little from the gradient.`,
    },
    {
      q: 'A picture is saved ten times at the same quality. When does it keep getting worse?',
      options: [
        'When the 8 by 8 grid stays where it was, because each save repeats the rounding',
        'When an edit moves the grid between saves, so blocks are cut at new places',
        'When the quality is below 50, because it rounds the same values again',
        'When the picture is large, because more blocks means more rounding steps',
      ],
      answer: 1,
      why: `With the grid aligned, save 10 changes ${integer(aligned.changed[9])} pixels against ${integer(aligned.changed[0])} for save 1; shifted by 3 pixels it still changes ${integer(shifted.changed[9])}, because each save rounds new blocks.`,
    },
    {
      q: 'Which step of the pipeline loses information?',
      options: [
        'The DCT, because it turns pixels into numbers of a different kind',
        'The subtraction of 128, because it moves values below zero',
        'The inverse DCT, because it rebuilds the pixels from fewer numbers',
        'The division by the table and rounding, because it cannot be undone',
      ],
      answer: 3,
      why: `Without rounding the DCT and its inverse return the block exactly: in the lesson zeroing nothing gives ${n2(base.mse)} error. Dividing by the table and rounding to whole numbers is where different coefficients end up the same level.`,
    },
  ],
};

export default lesson;
