import type { LessonModule } from '../../core/types';
import {
  DEFAULT_MISTAKES, alongAxis, applyMistakes, bestThresholdAccuracy, bodyData, classData, cloudPoints, frobenius, imageOf, largestSavingRank, pcaOf, projectOnto,
  rebuild, residualSumSquares, smallData, storageOfImage, storageOfRank, svdOf, svdVersusCovariance,
} from './model';
import { Stage } from './Stage';
import { n3 } from './text';

const NOISE = imageOf('noise');
const NOISE_SVD = svdOf(NOISE);
const NOISE_ERROR_4 = frobenius(NOISE, rebuild(NOISE_SVD, 4));
const STRIPES_ERROR_1 = frobenius(imageOf('stripes'), rebuild(svdOf(imageOf('stripes')), 1));
const CLOUD = cloudPoints();
const CLOUD_PCA = pcaOf(CLOUD);
const RESIDUAL = residualSumSquares(CLOUD, projectOnto(CLOUD, CLOUD_PCA.mean, CLOUD_PCA.axes[0]));
const BODY = bodyData();
const SKIP = applyMistakes(BODY, { ...DEFAULT_MISTAKES, centre: false });
const STANDARDISED = applyMistakes(BODY, { ...DEFAULT_MISTAKES, standardise: true });
const METRES = applyMistakes(BODY, DEFAULT_MISTAKES);
const CENTIMETRES = applyMistakes(BODY, { ...DEFAULT_MISTAKES, units: 'cm' });
const CLASSES = classData();
const CLASS_PCA = pcaOf(CLASSES.map((c) => c.point));
const CLASS_LABELS = CLASSES.map((c) => c.label);
const [PC1_ACC, PC2_ACC] = CLASS_PCA.axes.map((axis) => bestThresholdAccuracy(alongAxis(CLASSES.map((c) => c.point), CLASS_PCA.mean, axis), CLASS_LABELS));
const LINK = svdVersusCovariance(smallData(4));
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'The SVD splits a matrix into ranked terms and keeping the top few gives the best low-rank copy; PCA is the same computation on centred data, and it keeps variance, not what predicts your label.',
    what: `A matrix A can be written as a sum of terms σ₁u₁v₁ᵀ + σ₂u₂v₂ᵀ + … with the singular values σ sorted from largest to smallest. Keeping only the first k terms gives the closest rank-k matrix, and its error is exactly the root of the discarded σ squared. PCA applies this to data: centre it, and the principal axes are the directions of largest spread, with the square of each singular value divided by n − 1 equal to that axis's variance. PCA keeps the directions of most variance, which is not always the direction that matters for a question.`,
    analogy: 'A photo of a striped wall needs one pattern repeated; a photo of static needs every pixel. The singular values are how much each successive pattern adds, and keeping the first few is a thumbnail that is correct about the big structure.',
    useCases: [
      'Compressing or denoising a matrix by keeping its top singular values (named for large matrices; this lesson works on 8 × 8)',
      'Reducing many features to a few for plotting or as input to a model, with PCA',
      'Recommender systems and search, which factor a big table of scores into a few latent directions (named, later lessons)',
      'Spotting that two features carry almost the same information, because one axis holds nearly all the variance',
    ],
    why: 'Dimensionality reduction is everywhere in data work, and it fails in quiet ways: forgetting to centre, mixing units, or assuming the biggest direction is the useful one. Seeing the mechanism, and these failures computed, lets you trust or distrust a plot of "the first two components".',
    watch: 'Grey cells are the original image, green the rebuild and the kept terms, and red the error and the discarded terms. In the point cloud, the yellow arrow is the first principal axis, the violet one the second, blue dots are projected points and orange lines are the residuals. A red ring is a wrong first axis from skipping the centring. The two classes are amber and sky blue, and the dashed grey arrow is the direction of the mean.',
  },
  tryThis: [
    `In An image from its top terms press Stripes: the error is ${n3(STRIPES_ERROR_1)} from k = 1, because identical rows make a rank-1 image. Then press Noise and set k = 4: the error is still ${n3(NOISE_ERROR_4)} and the rank-4 form needs ${storageOfRank(4)} numbers against ${storageOfImage()}.`,
    `In PCA on a point cloud turn Project onto PC1 on: the squared residual reads ${n3(RESIDUAL)}, which is n × λ₂ = ${n3(CLOUD.length * CLOUD_PCA.values[1])}. Then drag Rotate to principal axes to 100% and the first axis lies along x.`,
    `In Ways to get it wrong press Skip centring: the first axis points at ${SKIP.angle1.toFixed(1)}°, toward the mean at ${SKIP.meanAngle.toFixed(1)}°, instead of the correct ${METRES.angle1.toFixed(1)}°. Press Standardise and it sits at ${STANDARDISED.angle1.toFixed(1)}°.`,
    `In Variance is not the question the best single cut sorts ${pct(PC1_ACC)} of the points on PC1 and ${pct(PC2_ACC)} on PC2, although PC1 holds ${pct(CLASS_PCA.explained ?? 0)} of the variance.`,
    `In SVD and PCA agree the first row reads σ² ÷ (n − 1) = ${n3(LINK[0].fromSvd)} on the SVD side and ${n3(LINK[0].fromCovariance)} on the covariance side; press New seed and the two columns still match.`,
  ],
  keyIdeas: [
    'The top k singular terms are the best rank-k copy of a matrix, and the error is the root of the sum of the discarded σ squared.',
    `A rank-k form stores k × (rows + columns + 1) numbers, which beats the plain image up to k = ${largestSavingRank()} for an 8 × 8 picture.`,
    'PCA centres the data and finds the directions of largest variance; the square of each singular value over n − 1 equals the covariance eigenvalue.',
    'PCA is unsupervised, so its first axis keeps variance, not what predicts a label, and it depends on centring and on the units unless the features are standardised.',
  ],
  quiz: [
    {
      q: 'Two classes are spread widely along x but differ only along y, a small spread. You project onto PC1 and then PC2. Which keeps the classes apart?',
      options: [
        `PC2: PCA keeps the direction of most spread, which is x, so PC1 mixes the classes (${pct(PC1_ACC)} against ${pct(PC2_ACC)} here)`,
        `PC1: the direction of most variance is always the most informative about the classes (${pct(PC1_ACC)} here)`,
        'Neither: a projection onto one axis cannot separate two classes whatever the data',
        'Both equally, since the two principal axes are perpendicular and carry the same information',
      ],
      answer: 0,
      why: `PCA is unsupervised: it does not see the labels, so it keeps the widest direction even when that direction says nothing about the classes. A cut on PC1 sorts ${pct(PC1_ACC)} correctly and one on PC2 sorts ${pct(PC2_ACC)}.`,
    },
    {
      q: `A rank-k form of an 8 × 8 image stores k × 17 numbers against ${storageOfImage()}. Does keeping more terms always compress?`,
      options: [
        `No: at k = 4 it needs ${storageOfRank(4)} numbers, more than ${storageOfImage()}, so compression pays only up to k = ${largestSavingRank()} here`,
        'Yes: every extra term is another approximation, and approximations always take less space',
        `No: it compresses only for k = 1, since ${storageOfRank(2)} numbers for k = 2 already exceed the original`,
        'Yes: the stored numbers are small, so they take fewer bytes than the original pixels',
      ],
      answer: 0,
      why: `Each term costs 8 + 8 + 1 numbers, so the stored size grows by 17 a term while the image stays at ${storageOfImage()}. The rank-${largestSavingRank()} form stores ${storageOfRank(largestSavingRank())}, and rank 4 stores ${storageOfRank(4)}. The count is an exercise, not how real codecs work.`,
    },
    {
      q: 'Heights are in metres and weights in kilograms, and you run PCA on the raw columns. What does the first axis follow?',
      options: [
        `Mostly the kilograms: the feature with the larger numbers dominates the variance (the axis sits at ${METRES.angle1.toFixed(0)}°)`,
        `The height, because height and weight are the same size once both are centred`,
        `The correlation line between height and weight, whatever the units are`,
        `Nothing in particular: raw columns give a random axis that changes from run to run`,
      ],
      answer: 0,
      why: `The variance of the weights is thousands of times that of the heights in metres, so PC1 points almost along weight (${METRES.angle1.toFixed(1)}°); in centimetres it moves to ${CENTIMETRES.angle1.toFixed(1)}°. Standardising each feature gives ${STANDARDISED.angle1.toFixed(1)}°, whatever the units.`,
    },
    {
      q: 'For centred data with n rows, how do the singular values of the data matrix relate to the covariance eigenvalues?',
      options: [
        'Each singular value squared, divided by n − 1, is an eigenvalue of the sample covariance',
        'Each singular value itself equals the matching eigenvalue of the covariance matrix',
        'They are unrelated: the SVD is for images and PCA is for tables of features',
        'The singular values are the square roots of the covariance eigenvalues, with no factor of n',
      ],
      answer: 0,
      why: `If X is centred, XᵀX ÷ (n − 1) is the sample covariance, and the eigenvalues of XᵀX are the squared singular values of X. In the lesson's seeded 8 × 3 data the first pair reads ${n3(LINK[0].fromSvd)} and ${n3(LINK[0].fromCovariance)}.`,
    },
  ],
};

export default lesson;
