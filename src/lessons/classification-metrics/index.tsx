import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A classifier\'s threshold turns scores into yes/no, and every threshold trades missed positives against false alarms. Accuracy hides that trade when positives are rare; precision, recall and the ROC and PR curves show it.',
    what: 'A model gives each example a score; a threshold decides which scores count as positive. Comparing predictions with the truth fills a confusion matrix: true and false positives, true and false negatives. Precision is TP / (TP + FP), how many flagged items were real; recall (the true-positive rate) is TP / (TP + FN), how many real positives were caught; F1 is their harmonic mean. Sweeping the threshold traces the ROC curve (TPR against the false-positive rate) and the precision-recall curve. The area under the ROC curve, AUC, is the chance a random positive outscores a random negative.',
    analogy: 'A metal detector at an airport: turn the sensitivity up and it catches every knife but also every belt buckle; turn it down and the queue moves but things slip through. Where you set the dial depends on what a miss costs compared with a false alarm.',
    useCases: [
      'Alert thresholds: how many pages you accept to avoid missing an incident',
      'Fraud and abuse detection, where positives are rare and accuracy is meaningless',
      'Spam filters and content moderation: precision protects good mail, recall catches bad mail',
      'Comparing models with AUC, then choosing an operating point from the costs',
    ],
    why: 'Most real detection problems are imbalanced, so a model that never flags anything can look 99% accurate. Engineers who ship classifiers, alert rules or anomaly detectors need to pick a threshold on purpose, from precision, recall and the cost of each mistake.',
    watch: 'Score strip: violet dots are actual positives and sky-blue dots actual negatives (classes, not good or bad); a filled dot is classified correctly and a hollow one is wrong. The yellow line is the threshold you drag (everything right of it is predicted positive), and the green dashed line marks the cheapest threshold for the costs. Confusion matrix: true positives and true negatives are green, false positives red and false negatives orange. ROC view: the blue line is the ROC curve, the yellow dot is the current threshold on it, and the grey dashed diagonal is a random classifier. Precision-recall view: the blue steps are the PR curve, the yellow dot is the current threshold, and the grey dashed line is a random classifier\'s precision (the positive rate). The threshold and AUC readouts are yellow and blue.',
  },
  tryThis: [
    'Drag the yellow threshold right: recall can only fall while precision usually rises, and the yellow dot slides down the ROC curve.',
    'Focus the threshold line and press ← and → to step one example at a time.',
    'Slide Positive rate to 1%: "always negative" scores 99% accuracy, the ROC curve stays put (the same scores, reweighted), and precision collapses.',
    'Switch Curve to Precision-recall at 1% positives to see what the ROC curve hides.',
    'Load the Medical screen preset (a miss costs 50× a false alarm) and press "Jump to the cheapest" to land on the green dashed line.',
  ],
  keyIdeas: [
    'Precision = TP / (TP + FP): of what you flagged, how much was real. Recall = TP / (TP + FN): of what was real, how much you caught.',
    'Raising the threshold can never raise recall; precision usually rises. Pick the point from the costs of each mistake.',
    'With rare positives, accuracy rewards doing nothing: "always negative" scores 1 − the positive rate.',
    'AUC is threshold-free: P(a random positive outscores a random negative). It ignores class balance, so check precision too.',
  ],
  quiz: [
    {
      q: 'Only 1% of transactions are fraud. A model that never flags anything has what accuracy, and what recall?',
      options: ['99% accuracy, recall 0', '1% accuracy, recall 0', '99% accuracy, recall 99%', '50% accuracy, recall 50%'],
      answer: 0,
      why: 'It\'s right on all 99% of legitimate transactions, so accuracy is 99%, but it catches none of the fraud: recall is 0. That\'s the accuracy paradox; precision isn\'t even defined, because nothing was flagged.',
    },
    {
      q: 'You raise a classifier\'s threshold so fewer examples are flagged. What happens to recall?',
      options: ['It falls or stays the same', 'It rises along with precision', 'It always stays the same', 'It rises while precision falls'],
      answer: 0,
      why: 'A higher threshold can only drop positives from the flagged set, so recall never goes up. Precision usually rises, but not both together: that\'s the trade-off the threshold controls.',
    },
    {
      q: 'What does an ROC AUC of 0.85 mean?',
      options: [
        'A random positive outscores a random negative 85% of the time',
        'The model is right on 85% of the examples at its best threshold',
        '85% of the examples the model flags are really positive',
        'The model catches 85% of the positives at a 50% threshold',
      ],
      answer: 0,
      why: 'AUC is the Mann-Whitney probability that a randomly chosen positive gets a higher score than a randomly chosen negative, over all thresholds at once. Accuracy, precision and recall each depend on one chosen threshold.',
    },
    {
      q: 'Positives fall from 50% to 1% of cases, with the same model. Which number changes most?',
      options: ['Precision at one threshold', "The ROC curve's shape", 'The true-positive rate', 'The false-positive rate'],
      answer: 0,
      why: 'TPR and FPR are each measured within one class, so, for the same model and the same score distribution in each class, the ROC curve doesn\'t change with the class mix. Precision mixes the classes: with 99 negatives per positive, even a small false-positive rate swamps the true positives.',
    },
  ],
};

export default lesson;
