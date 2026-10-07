import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Linear regression fits the straight line with the smallest mean squared error; logistic regression bends a line through a sigmoid to output a probability, and a threshold turns that into a class.',
    what: 'Least squares picks the line y = b + m·x that makes the average squared vertical miss (the residuals) as small as possible. It has a closed-form answer, and gradient descent walking downhill on the same error lands on the same line. Logistic regression computes p = σ(b + w·x), a probability between 0 and 1, and is trained by gradient steps on log loss, which punishes confident wrong answers hard. When the classes can be split perfectly, the weights grow forever chasing a perfect step; an L2 penalty keeps them finite.',
    analogy: 'Least squares is a rubber band attached to every point: points far from the line pull harder, by the square of the distance, which is why one outlier can drag the whole line.',
    useCases: [
      'Forecasting and trend lines: sales vs ad spend, latency vs load',
      'A/B analysis and baselines: the first model you fit before anything fancier',
      'Click-through, churn and fraud scores: logistic regression outputs a probability per user or event',
      'Spam filters and credit scoring, where a threshold turns the probability into a decision',
    ],
    why: 'These are the models every ML stack starts with and the ones you\'ll be asked to explain. Knowing that squared error makes outliers loud, that a classifier\'s output is a probability whose threshold is a business decision, and why regularisation exists, saves real mistakes in reports and production models.',
    watch: 'Linear: data points are blue dots; the point you last added or moved turns yellow. The least-squares line is yellow, each residual is an orange vertical segment, and its square is an orange tinted square beside it. With Compare on, the fit without the biggest residual is a dashed grey line; while gradient descent runs, its current line is dashed yellow. Logistic: class 0 points are blue and class 1 violet. With one feature, the fitted probability curve is yellow, the threshold is a dashed grey line, and a yellow dashed line marks the cut on x. With two features, the map is tinted blue where class 0 is likelier and violet where class 1 is, and the yellow line is the boundary at the threshold. The hollow yellow ring is the probability probe. "still growing" shows in red and "settled" in green.',
  },
  tryThis: [
    'Drag one point far from the others: the line swings toward it, and its orange square is huge.',
    'Press the "Outlier" preset with Compare on: the dashed line shows where the fit would be without that one point.',
    'Press "Fit by gradient descent": the dashed line walks from y = 0 onto the least-squares line.',
    'In Logistic, slide the threshold: the probabilities stay put, only the cut and the "right class" count move.',
    'Pick "Perfectly separable" and let it train: ‖w‖ keeps growing. Turn on the L2 penalty and it settles.',
  ],
  keyIdeas: [
    'Least squares minimises the mean squared residual, so one far-off point pulls hard.',
    'Gradient descent on the same error reaches the same line as the closed-form answer.',
    'Logistic regression outputs a probability; the threshold you choose makes it a class.',
    'On perfectly separable data the weights grow without bound; L2 regularisation stops that.',
  ],
  quiz: [
    {
      q: 'A logistic regression model scores an email 0.62. What has the model actually said?',
      options: [
        'Its estimate that the email is class 1 is 62%',
        'The email is spam, since 0.62 is above zero',
        'The email is 62% of the way from ham to spam',
        'The email is spam with 62% of its features',
      ],
      answer: 0,
      why: 'Logistic regression predicts a probability, σ(b + w·x). Whether 0.62 means "spam" depends on the threshold you pick: at 0.5 it does, at 0.8 it doesn\'t. The model never outputs the class itself.',
    },
    {
      q: 'You add one point far below an otherwise tidy trend. Why does the least-squares line move so much?',
      options: [
        'Its residual is squared, so it counts far more',
        'Least squares always passes through the last point',
        'Every point gets an equal vote on the slope',
        'Outliers change the x axis that the fit uses',
      ],
      answer: 0,
      why: 'A residual of 5 costs 25, as much as 25 points that are each 1 off. Points don\'t get equal pull: far ones dominate. The fit doesn\'t pass through any particular point.',
    },
    {
      q: 'Gradient descent on MSE, started from a flat line, runs until the gradient is tiny. Where does it end up?',
      options: [
        'On the least-squares line from the closed form',
        'Somewhere random, depending on the start',
        'On the flat line, since that is where it began',
        'On the line through the two extreme points',
      ],
      answer: 0,
      why: 'MSE for a straight line is a convex bowl with one bottom, so walking downhill from anywhere reaches the same line the normal equations give, to within the stopping tolerance.',
    },
    {
      q: 'Training logistic regression on perfectly separable data, the loss keeps falling but the weights keep growing. Why?',
      options: [
        'A steeper sigmoid always fits slightly better',
        'The learning rate is too large for the data',
        'Log loss has a bug for separable classes',
        'The weights grow until they reach 1 and stop',
      ],
      answer: 0,
      why: 'If one cut separates the classes, scaling the weights up pushes every probability closer to 0 or 1 and lowers the loss further, forever. There\'s no finite best; L2 regularisation adds a cost for big weights so a finite one wins.',
    },
  ],
};

export default lesson;
