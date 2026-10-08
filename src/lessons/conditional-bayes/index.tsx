import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'P(sick | positive) is not P(positive | sick). With a 1% base rate, a 99%-accurate test is right only half the time when it says "positive", because the healthy 99% produce just as many false alarms.',
    what: 'Conditional probability P(A | B) is the chance of A once you know B happened: you shrink the world to B and ask what share of it is A. Bayes\' theorem turns one conditional around: P(A | B) = P(B | A)·P(A) / P(B). For a test, P(positive | sick) is its sensitivity, but what you want after a positive is P(sick | positive), and that depends heavily on the base rate P(sick).',
    analogy: 'Ten real fires and ten burnt-toast alarms both set off the same smoke detector. The detector is good at noticing fires, but when it beeps, it\'s still a coin flip whether you need the extinguisher.',
    useCases: [
      'Alerting: a rule that catches 99% of incidents with a 1% false-alarm rate pages falsely most of the time when incidents are rare',
      'Fraud and abuse checks: a check that catches 90% of fraud and clears 98% of good orders, on 0.2% fraud, flags mostly legitimate customers',
      'Spam filtering: spam is common, so the same kind of filter is usually right when it flags',
      'Reading test and screening results, and choosing a confirmatory second test',
    ],
    why: 'Engineers build detectors constantly: alerts, anomaly checks, fraud rules, flaky-test classifiers. If you judge them by "accuracy" and ignore the base rate, you ship a pager that cries wolf or a fraud rule that blocks good customers. Bayes tells you what a positive is actually worth.',
    watch: 'The crowd grid is 1,000 people: violet dots have the condition and sky-blue dots don\'t (categories, not good or bad); a solid dot tested positive and an outlined dot (just its coloured edge) tested negative. "Only positives" turns the negatives into plain grey squares. Under it, the confusion matrix of rounded counts colours true positives and true negatives green, false positives red and false negatives orange. The posterior readout, the exact precision under the matrix and the result in the Bayes panel are yellow; in the panel, violet terms are the people who have it and test positive, and the sky-blue term is the false alarms. The probability tree has a grey root, violet boxes for "has it" and sky-blue boxes for "doesn\'t", and the shaded boxes are the positive-test branches.',
  },
  tryThis: [
    'Load "Medical test" (1%, 99%, 99%): 20 people test positive and only 10 are sick, so a positive is a coin flip.',
    'Switch Show to "Only positives" and count the violet dots among what\'s left.',
    'Pick "Rarer condition" (0.1%): the posterior drops to about 9%.',
    'Back on "Medical test", press "Update again" for a second positive: 50% becomes 99%.',
    'Drag Specificity from 99% to 99.9% and watch the false-alarm dots disappear.',
  ],
  keyIdeas: [
    'P(A | B) ≠ P(B | A). A test\'s accuracy is P(positive | sick); you want P(sick | positive).',
    'Bayes: P(A | B) = P(B | A)·P(A) / P(B). The prior P(A), the base rate, matters as much as the test.',
    'When the condition is rare, false positives from the big healthy group swamp the true ones.',
    'A second independent positive uses the first posterior as its prior: 50% becomes 99%.',
  ],
  quiz: [
    {
      q: '1% of people have a disease. A test catches 99% of cases and clears 99% of healthy people. You test positive. How likely is it that you have it?',
      options: ['About 50%', 'About 99%', 'About 1%', 'About 90%'],
      answer: 0,
      why: 'Per 1,000 people: 10 are sick and about 10 of them test positive; 990 are healthy and about 10 of them test positive too. So 10 of the 20 positives are sick: 50%. 99% is the test\'s sensitivity, P(positive | sick), which is the question turned around.',
    },
    {
      q: 'An alert fires on 99% of real incidents and on 1% of healthy checks. Incidents happen in 1 of every 1,000 checks. What share of pages are real?',
      options: ['About 9%', 'About 99%', 'About 50%', 'About 1%'],
      answer: 0,
      why: '0.99 × 0.001 = 0.00099 real pages per check against 0.01 × 0.999 ≈ 0.00999 false ones, so 0.00099 / 0.01098 ≈ 9%. The 99% is how often a real incident pages, not how often a page is real.',
    },
    {
      q: 'After one positive from the 1% / 99% / 99% test, the chance is 50%. A second, independent test with the same rates is also positive. Now what?',
      options: ['About 99%', 'About 75%', 'Still 50%', 'About 99.99%'],
      answer: 0,
      why: 'The 50% posterior becomes the new prior: 0.99 × 0.5 / (0.99 × 0.5 + 0.01 × 0.5) = 99%. That only holds if the second test\'s errors are independent of the first, given whether you really have it (conditional independence); repeating the same flawed test doesn\'t count.',
    },
    {
      q: 'For the 1% / 99% / 99% test, which change raises P(sick | positive) the most?',
      options: ['Raise specificity to 99.9%', 'Raise sensitivity to 99.9%', 'Test twice as many people', 'Flag more people as positive'],
      answer: 0,
      why: 'False positives come from the 99% who are healthy, so cutting the false-positive rate tenfold takes the posterior from 50% to about 91%. Better sensitivity adds almost no true positives (50% to about 50.2%), testing more people changes no rates, and flagging more people adds false alarms.',
    },
  ],
};

export default lesson;
