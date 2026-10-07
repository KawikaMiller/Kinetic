import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A decision tree learns a game of twenty questions: at each step it greedily picks the yes/no question that best separates the classes. One deep tree memorises noise; many randomised trees voting (a random forest) or many tiny trees fixing each other\'s mistakes (boosting) generalise much better.',
    what: 'To grow a tree, try every threshold on every feature ("x ≤ 0.42?"), score each by how mixed the two sides would be (Gini impurity or entropy, weighted by size), keep the best, and repeat on each side until the leaves are pure or a limit stops you. Each leaf predicts its majority class, so the tree cuts the plane into rectangles. A random forest grows many deep trees, each on a bootstrap sample (n draws with replacement) and a random feature per split, and lets them vote: their errors partly cancel. AdaBoost fits one-question trees (stumps) in sequence, re-weighting the points the last one got wrong so the next one focuses on them, and combines them with votes weighted by α = ½ ln((1 − ε)/ε).',
    analogy: 'One expert who has memorised every past case is confident and brittle. A committee of experts who each saw a different slice of the cases is steadier (a forest). A relay of beginners where each one studies the cases the last got wrong adds up to an expert (boosting).',
    useCases: [
      'Tabular data (fraud scoring, churn, credit risk), where gradient-boosted trees are often the strongest baseline',
      'Models that must be explained: a shallow tree is a readable flowchart of rules',
      'Feature importance: how much each feature\'s splits lowered impurity across a forest',
      'Quick, robust baselines: random forests need little tuning and no feature scaling',
    ],
    why: 'Tree ensembles win a large share of real-world tabular problems, and they are what you will meet in fraud, ranking and risk systems. Knowing why one tree overfits, why bagging steadies it and what boosting re-weights lets you choose depth, tree count and learning settings on purpose instead of by superstition.',
    watch: 'Every scene: blue and violet are the two classes, as dots and as region tints behind them; solid dots are training points and hollow dots validation points; a red ring marks a point the current model gets wrong; a hollow grey dot is the add-point cursor. Tree: the latest split line on the plot and its node in the tree are yellow, earlier split lines grey; each tree node is a box tinted by the class it predicts, showing its question, its blue · violet counts and its impurity, with a thicker border on the node whose candidates are listed; the best candidate row is tinted yellow. Forest: the region tint is stronger where the vote is more unanimous; each member tree is a small thumbnail of its rectangles in a dark-grey frame; the forest\'s reseeding number turns green when it is steadier than one tree\'s. Boosting: this round\'s stump is a yellow line, dot size is each training point\'s weight, and in the error plot training error is amber (with dots) and exponential loss pink, with a yellow line at the current round. Confusion matrix: true positives and true negatives green, false positives red, false negatives orange.',
  },
  tryThis: [
    'On the Tree scene, press Split a few times and click a node: the top row of its candidate table is the split the tree chose, the lowest weighted impurity of all.',
    'Load "One noisy point" and press Grow all: the tree carves a one-point sliver for the violet point. Drag Max depth down to 2 and watch validation accuracy go up.',
    'In Forest, slide Trees from 1 to 25: the vote map smooths out and "plane changed by reseeding" drops overall (not at every single step).',
    'In Boosting, step through the rounds: the points the last stump missed swell, and the amber training error can tick up while the pink loss only falls.',
    'Click the plot to add a few violet points inside the blue region, then compare the tree, the forest and boosting.',
  ],
  keyIdeas: [
    'A tree is greedy: each split is the best single question for the points at that node, never revisited.',
    'Deeper trees never fit training data worse, and often fit new data worse; depth and min-samples limits are the brakes.',
    'Bagging plus random features makes trees disagree in different places, so their vote is far steadier than any one tree.',
    'Boosting adds small trees one at a time, each focused on what the ensemble still gets wrong; feature importance and gradient-boosting libraries build on the same trees.',
  ],
  quiz: [
    {
      q: 'Your tree with no depth limit scores 100% on training data. What does that tell you about new data?',
      options: [
        'Not much: it may have carved slivers around noise',
        'It will also be close to 100% on new data',
        'It is the most accurate tree this data allows',
        'It cannot overfit new data, since every leaf is pure',
      ],
      answer: 0,
      why: 'An unlimited tree keeps splitting until every leaf is pure, so it reaches 100% on training data even when that means fencing off a single mislabelled point. Pure leaves are exactly how it overfits; validation accuracy is what tells you whether a shallower tree generalises better.',
    },
    {
      q: 'At a node with 40 points, how does the tree pick its question?',
      options: [
        'It tries every threshold on every feature and keeps the lowest weighted impurity',
        'It splits the feature with the widest range of values exactly at its midpoint',
        'It picks whichever question will make the final tree the most accurate one overall',
        'It alternates between features, splitting each one at the median of the node',
      ],
      answer: 0,
      why: 'CART-style trees are greedy: they score every candidate threshold (the midpoints between sorted values) by weighted Gini or entropy and take the best one for this node only. They don\'t look ahead to the final tree, which is the tempting wrong answer, because searching every whole tree is far too expensive.',
    },
    {
      q: 'Why does a random forest of 25 trees give steadier predictions than one tree?',
      options: [
        'Its trees see different bootstrap samples, so their errors partly cancel in the vote',
        'Each of its trees is kept shallower than one tree would be, so none of them can overfit',
        'It trains on 25 times more data than a single tree is allowed to see in one go',
        'The vote ignores any training points that the trees disagree about while learning',
      ],
      answer: 0,
      why: 'Each tree is still deep and jumpy, but bootstrap samples and random features make them jump in different places, so averaging their votes cancels much of that variance. The forest sees the same training set, just resampled; it doesn\'t get more data.',
    },
    {
      q: 'After an AdaBoost round, what happens to the training points that round\'s stump misclassified?',
      options: [
        'Their weights rise, so together they carry half the weight for the next stump',
        'They are removed from the training set, so the next stump can safely ignore them',
        'They are relabelled to the class that the stump predicted for each of them',
        'Their weights drop, so the next stump will treat them as likely noise',
      ],
      answer: 0,
      why: 'AdaBoost multiplies a missed point\'s weight by e^α and a correct one\'s by e^−α, then renormalises; the missed points end up holding exactly half of the total, so the next stump has to take them seriously. Down-weighting likely noise is what some robust variants do, not AdaBoost.',
    },
  ],
};

export default lesson;
