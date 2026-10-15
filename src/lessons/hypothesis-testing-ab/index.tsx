import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A p-value says how surprising the data would be if nothing differed, so it is a tool for avoiding fooling yourself: it breaks if you check repeatedly or slice the data until something shows.',
    what: 'In an A/B experiment each arm gets a share of visitors and some convert. A two-proportion z-test asks how often a gap this large would appear between two identical arms; that probability is the p-value. Run correctly at a fixed sample size, an experiment with no real effect is "significant" about 5% of the time, and an experiment with a real effect is significant with a probability called its power, which needs a large enough n. Peeking and slicing add extra chances for noise to cross the line.',
    analogy: 'Flipping two coins 100 times each and getting a few more heads from one is unremarkable. Flip a hundred coin pairs and announce the pair that differs most, and you have found luck, not a better coin. An experiment you check on every day, or slice twenty ways, is the second kind.',
    useCases: [
      'Deciding whether a conversion lift in a feature experiment is more than noise',
      'Sizing an experiment before it starts, from the smallest lift worth detecting',
      'Reviewing results that stopped early or highlight one segment',
      'Reading a dashboard p-value or interval without treating it as the chance B is better',
    ],
    why: 'Product decisions, rollouts and flag experiments rest on these numbers. The common failure is not the arithmetic but the procedure: stopping when it looks good, or hunting for a segment where it won. Knowing how often each procedure produces a false winner lets you trust a result for the right reasons, and plan the sample size instead of guessing it.',
    watch: 'Variant A is sky blue and variant B is amber. In Run the experiment, the violet area under the curve is the p-value (both tails), the yellow line is this run\'s z, dashed grey lines mark α = 0.05, and the violet bar is the 95% interval for B − A. The verdict is green for a real win, red for a false positive or a win in the wrong direction and orange for a miss; the simulation knows the truth, a real experiment never does. In the p-value histogram the first violet bin holds p below 0.05. In Peeking the yellow line is the p-value after each look, the dashed line is the threshold and the first crossing is red on an A/A test and green when the lift is real. In Slice until significant, red rows are slices that cross the line by chance.',
  },
  tryThis: [
    'In Run the experiment (a real +2 point lift, 1,000 visitors per arm), press Run again ten times: only a few runs are significant. Drag visitors to 10,000 and almost every run is.',
    'In Run it 1,000 times (no true lift): about 5% of the experiments have p below 0.05 anyway. Set the true lift to +1 point and the share rises: that is the power.',
    'In Run it 1,000 times, the power calculator says 10% → 11% takes about 14,749 visitors per arm; set the smallest lift to +0.5 points and it takes about 57,800.',
    'In Peeking (A/A, 20 looks, stop at the first p < 0.05): about a quarter of experiments declare a false winner against 5% for one look. Switch Bonferroni on and it falls below 5% (about 2% here: Bonferroni over-corrects when the looks share data).',
    'In Slice until significant (no difference anywhere): about two in three simulated experiments have at least one significant slice. Switch the correction on and it drops to about 5%.',
  ],
  keyIdeas: [
    'A p-value is the chance of data at least this extreme if there were no difference; it is not the chance that B is better.',
    'At a fixed horizon an A/A test is significant about 5% of the time; power is the significant share when a real lift exists, and it grows with n and with the lift, since n scales like 1/δ².',
    'Checking repeatedly and stopping at the first p < 0.05 inflates the false-positive rate far above 5%; testing each look at α ÷ looks (Bonferroni) pulls it back below 5%, more than it needs to, because the looks share data.',
    'Test enough slices and one will look significant: 20 fair tests give a 64% chance of at least one false positive, 1 − 0.95^20.',
  ],
  quiz: [
    {
      q: 'An A/B test reports p = 0.03 for B against A. What does that p-value say?',
      options: [
        'Data this extreme would appear about 3% of the time with no true difference',
        'There is a 97% chance that B really is better than A, given this data',
        'B improves the conversion rate by 3% compared with A, on average',
        'There is a 3% chance that this experiment\'s conclusion is simply wrong',
      ],
      answer: 0,
      why: 'A p-value is a probability about the data if there were no difference. It is not the chance that B is better (that is a different, Bayesian question), not the size of the lift, and not the chance the conclusion is wrong.',
    },
    {
      q: 'A team checks an A/B test daily for 20 days and ships the first time p < 0.05, though there is no true effect. How often does that rule ship a winner?',
      options: [
        'Much more than 5%: roughly one experiment in four',
        'Exactly 5%, since each daily test uses α = 0.05',
        'Less than 5%, since more data piles up each day',
        'About 5%, as long as each day is tested on its own',
      ],
      answer: 0,
      why: 'Each look is another chance for noise to cross 0.05, and the looks share data, so with 20 looks the chance is far above 5%; this lesson\'s simulation puts it near one in four. One look at the end keeps it near 5%, and α split over the looks keeps it at or below 5%.',
    },
    {
      q: 'Baseline conversion is 10% and you want to detect a rise to 11% with 80% power at α = 0.05. About how many visitors per arm?',
      options: ['About 14,750', 'About 1,475', 'About 7,375', 'About 147,500'],
      answer: 0,
      why: 'n = (1.960 + 0.842)² × (0.10 × 0.90 + 0.11 × 0.89) ÷ 0.01² ≈ 14,750 per arm. Because n scales like 1/δ², a ten times smaller lift would need about a hundred times as many.',
    },
    {
      q: 'You test 20 independent segments, each at α = 0.05, in an experiment where nothing differs. What is the chance at least one segment looks significant?',
      options: ['About 64%', 'Exactly 5%', 'About 20%', 'Close to 0%'],
      answer: 0,
      why: 'Each segment has a 95% chance of staying quiet, so 20 quiet results in a row have probability 0.95^20 = 0.36, and at least one fires with probability 1 − 0.36 = 0.64.',
    },
  ],
};

export default lesson;
