import type { LessonModule } from '../../core/types';
import { plural } from '../../core/format';
import { FACTS as F } from './facts';
import { MC_SEEDS } from './presets';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A skip list is a sorted linked list with extra express lanes: each key gets a tower whose height comes from coin flips, so a search skips most of the list and costs about log n steps in expectation, without any rebalancing.',
    what: `A plain sorted linked list needs a walk past every smaller key. A skip list adds higher lanes that link only some of the keys: each new key flips a coin, grows its tower one level for every heads, and is linked into every lane it reaches. A search starts at the head on the top lane, moves right while the next key is smaller than the target and drops a lane when it would overshoot. On the opening list of ${F.keys} keys, finding ${F.target} takes ${F.hitSteps} steps against ${F.hitLinear} for the plain list. The balance is statistical, not enforced: unlucky coins give a slow list, and rigged coins turn it back into a linked list.`,
    analogy: 'A railway with express, semi-fast and local trains: you ride the express as far as you can without passing your stop, then switch to a slower line, and a few stops later you are there.',
    useCases: [
      'Ordered in-memory maps and sets where many threads insert at once, since an insert touches only a few pointers',
      'Sorted sets in databases and caches, where range queries walk level 0 in order',
      'Write buffers for sorted storage engines, which need cheap inserts and ordered scans',
      'A simple alternative to a balanced tree when rotations are hard to write or hard to lock',
    ],
    why: 'It shows a randomised structure whose speed comes from probability rather than a rule: you will meet the same idea in hashing, treaps and sampling, and you will meet skip lists inside real storage and caching systems.',
    watch: 'Each key is a column of boxes, one per level it reaches, and an arrow joins a box to the next box on its level; the head is on the left and nil on the right. The yellow dot is the search token. Blue arrows are pointers the search followed and a violet tick is a level it dropped. A found key turns green, and for a key that is absent the last key below it is dashed grey. In the plain list below, the keys walked past are red. Heads are amber chips and tails are pink chips, plain categories that mean nothing about good or bad. In the plot, blue is the measured mean, red is the unluckiest list and the grey dashed line is the formula.',
  },
  tryThis: [
    `In Search with express lanes, press play on the default (search for ${F.target}): the skip list takes ${F.hitSteps} steps (${F.hitMoves} moves and ${F.hitDrops} drops) while the plain list below walks ${F.hitLinear}. Then type ${F.absent} and press Search: it is not there, and the search stops at ${F.missPred} after ${F.missSteps} steps.`,
    `In Insert with coin flips, press play on the default (insert ${F.insertKey}): the coins come up ${F.coinsText}, so the tower is ${F.insertHeight} levels tall and ${F.insertWrites} pointers are written.`,
    `In Insert with coin flips, choose Rigged: all tails, type ${F.riggedKey} and press Insert: the tower is ${F.riggedHeight} level tall with ${F.riggedWrites} pointer writes, and a list rigged this way is just a linked list.`,
    `In Is it really log n? (the defaults: p = 1/2, n = ${F.mcN.toLocaleString('en-US')}): the measured mean is ${F.mcMean.toFixed(1)} steps against the formula's ${F.mcFormula.toFixed(1)}, the unluckiest list took ${F.mcWorst.toFixed(1)}, and the pointers per key are ${F.mcPointers.toFixed(2)}.`,
    `In Why use one?, press Insert with the default key ${F.whyKey}: it takes ${F.whyWrites} pointer writes for a tower of ${plural(F.whyHeight, 'level')} and touches ${F.whyTouched} of the ${F.whyNodes} nodes already there.`,
  ],
  keyIdeas: [
    'A skip list is a sorted linked list with lanes above it: search moves right while the next key is smaller and drops a lane when it would overshoot, so many keys are skipped.',
    `Tower heights come from coin flips, so balance is statistical: at p = 1/2 the pointers per key average about 2 and a search over ${F.mcN.toLocaleString('en-US')} keys took ${F.mcMean.toFixed(1)} steps here, against ${F.allTailsMean.toFixed(0)} when the coins were rigged to tails.`,
    'An insert changes the pointers of the new tower and of its predecessors on the search path, one per level, and leaves the other towers alone; there is no rotation or rebuild.',
    'The speed is fast in expectation and with high probability, not certain: the unluckiest of the seeded lists is only somewhat slower, and a list rigged to all tails is a plain linked list.',
  ],
  quiz: [
    {
      q: `A skip list of ${F.mcN.toLocaleString('en-US')} keys is built with a coin that always lands tails. What does a search cost?`,
      options: [
        `About ${F.allTailsMean.toFixed(0)} steps on average: the list is a plain linked list`,
        `About ${F.mcFormula.toFixed(0)} steps, since the formula depends only on n`,
        `About ${Math.log2(F.mcN)} steps, since tails keep the list at its very shortest length`,
        'About 1 step, since every key sits at the top level',
      ],
      answer: 0,
      why: `Tails stop each tower at height 1, so there are no express lanes and a search walks level 0: about ${F.allTailsMean.toFixed(0)} steps on average here. The cost near ${F.mcFormula.toFixed(0)} is an expectation over fair coins, not a promise that holds whatever the flips were.`,
    },
    {
      q: 'A new key gets a tower of height 3. Which pointers change when it is linked in?',
      options: [
        "The new tower's three pointers and one predecessor pointer per level",
        'Every level-0 pointer after it, since the list has to shift along',
        'Every tower taller than 3, to keep the lanes in balance afterwards',
        'None yet: the key is appended at the end and linked in later on',
      ],
      answer: 0,
      why: `A tower of height 3 is linked into three levels: the new tower points on to what followed, and the predecessor found by the search points to it, which is ${F.insertWrites} writes for height ${F.insertHeight} in the lesson (the insert of ${F.insertKey}). No other tower is rewritten, so nothing shifts and nothing is rebalanced.`,
    },
    {
      q: 'At p = 1/4 a tower grows with probability 1/4 per flip. How many pointers does a key hold on average?',
      options: [
        `About ${F.mcPointersQuarter.toFixed(2)}, which is 1/(1 − p) at the p of 1/4`,
        'About 2, the same as it is at p = 1/2, whatever p is',
        'About 4, because one pointer is kept per quarter of keys',
        'About 0.25, one pointer for each key in every four',
      ],
      answer: 0,
      why: `The expected height is 1 + p + p² + ..., which is 1/(1 − p): 4/3 at p = 1/4, measured as ${F.mcPointersQuarter.toFixed(2)} over ${F.mcN.toLocaleString('en-US')} keys. A smaller p means fewer keys on each higher lane: less memory, but longer runs along each lane.`,
    },
    {
      q: 'Which statement about a skip list and a balanced tree such as an AVL tree is right?',
      options: [
        'Its balance is by chance: logarithmic in expectation, but one list can be unlucky',
        'It rotates nodes like an AVL tree does, only using pointers to do it',
        'It always costs log n, whatever sequence of coin flips it was given',
        'It is a balanced tree drawn sideways, with the same worst case as one',
      ],
      answer: 0,
      why: `A skip list does not rotate or check balance. Its tower heights are random, so its search cost is an expectation: the worst of ${MC_SEEDS} lists here took ${F.mcWorst.toFixed(1)} steps against a mean of ${F.mcMean.toFixed(1)}. An AVL tree gives a worst case that is bounded for any input.`,
    },
  ],
};

export default lesson;
