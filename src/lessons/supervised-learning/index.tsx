import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A model is only as good as its error on data it never trained on: training error keeps falling as the model gets more flexible, while validation error falls and then rises again once it starts memorising noise.',
    what: 'Supervised learning fits a model to labelled examples. Hold some of them back: the training set fits the model, the validation set picks settings like the polynomial degree or the ridge penalty λ, and a test set, looked at once at the end, estimates real-world error. Too simple a model underfits both; too flexible a model overfits, matching the training points (and their noise) while missing new ones. Regularisation and more data both pull an overfit model back toward the real pattern.',
    analogy: 'A student who memorises last year\'s exam answers aces that paper and fails a new one. The practice paper you mark yourself is validation; the real exam, sat once, is the test.',
    useCases: [
      'Choosing model size, features or hyperparameters by validation score',
      'Spotting overfitting: training metrics keep improving while validation gets worse',
      'Deciding whether to collect more data or add regularisation',
      'Reporting a final test score that you never tuned against',
    ],
    why: 'Shipping a model that looked great in training and falls over in production is the classic ML failure, and peeking at the test set while tuning is how teams fool themselves about it. Knowing how the three splits work is basic hygiene for anyone who trains, evaluates or reviews a model.',
    watch: 'Left: training points are solid blue dots and validation points hollow violet ones; the fitted curve is yellow and the hidden true curve is a dashed dark-grey line. Right: training error is the blue line with solid dots and validation error the violet line with hollow dots, on a log scale; the green line marks the best degree (or best λ) by validation error, and the yellow dashed line is the current setting. Once you peek, the test error is an orange dot and an orange number. A refused fit\'s message is red, and "lowest validation error" in the caption is green.',
  },
  tryThis: [
    'Slide the degree from 0 to 12: the blue training error keeps falling, the violet validation error makes a U.',
    'Press "Overfit (degree 12, 15 points)": the curve snakes through the training points and misses the hollow ones.',
    'Press "Degree 12 + best λ", then "Degree 12, 200 points": a ridge penalty or more data pulls validation error for the same model far down.',
    'Press "Reshuffle split" a few times: the best degree can move, because validation error is itself noisy.',
    'Press "Peek at the test set (once)", and read why tuning on it would make the number lie.',
  ],
  keyIdeas: [
    'Without a penalty, training error never rises with flexibility; validation error is what tells you when to stop.',
    'Pick settings on validation data; touch the test set once, at the end.',
    'Overfitting is fitting the noise: fix it with more data or regularisation (like ridge λ).',
    'With as many coefficients as points, a model can pass through every training point.',
  ],
  quiz: [
    {
      q: 'Your degree-12 model has the lowest training error of everything you tried. Is it the best model?',
      options: [
        'Not necessarily: check validation error, which may be worse',
        'Yes: lower training error always means a better model',
        'Yes, as long as the training error is above zero',
        'Only if it also has the most coefficients of all',
      ],
      answer: 0,
      why: 'Training error falls every time you add flexibility, because the model can bend to the noise. The model that generalises is the one with the lowest validation error; "lowest training error wins" is exactly the trap.',
    },
    {
      q: 'You tune the degree and λ until the test-set error is as low as possible. What is wrong with reporting that number?',
      options: [
        'You fitted to the test set, so it is now optimistic',
        'Test error is always higher than validation error',
        'Nothing: lower test error is what you were after',
        'The test set must be bigger than the training set',
      ],
      answer: 0,
      why: 'Choosing settings by test error makes the test set part of training: the number now rewards whatever happens to suit those points. That\'s what validation data is for; the test set is looked at once. Test error isn\'t always above validation error, which is the tempting distractor.',
    },
    {
      q: 'A degree-12 polynomial overfits 20 points badly. Which change helps the most without changing the degree?',
      options: [
        'Add more training data, or a ridge penalty',
        'Report the training error instead of validation',
        'Move some validation points into the test set',
        'Reshuffle the split until validation looks good',
      ],
      answer: 0,
      why: 'More data leaves the wiggles less room to chase noise, and ridge λ penalises the large coefficients that make them. Reshuffling until the score looks good is tuning on noise, a quieter version of the same leak.',
    },
    {
      q: 'Why does a degree-9 polynomial fit 10 training points with zero training error?',
      options: [
        'It has 10 coefficients, one for each point',
        'Ten points always lie on a smooth curve',
        'Polynomials of degree 9 ignore any noise',
        'Least squares rounds the residuals to zero',
      ],
      answer: 0,
      why: 'Degree 9 means 10 coefficients, and with 10 distinct x values there\'s exactly one polynomial through all 10 points. Zero training error here says nothing about how it does on new points; usually it\'s terrible.',
    },
  ],
};

export default lesson;
