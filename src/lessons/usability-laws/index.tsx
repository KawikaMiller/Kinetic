import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Fitts\'s law says pointing time grows with log₂(distance / width + 1), so big, close targets are fast; Hick\'s law says choosing among n equally likely options grows with log₂(n + 1). Both are fitted lines with person- and device-specific constants, not universal numbers.',
    what: 'Fitts\'s law, in the Shannon form used in HCI, predicts movement time MT = a + b · ID, where the index of difficulty ID = log₂(D/W + 1) for a target of width W at distance D. Doubling the distance or halving the width adds about one bit. The constants a and b come from fitting a line to measured trials (least squares, as in `linear-logistic-regression`), and they differ by person, device and task. The Hick-Hyman law gives choice time a + b · log₂(n + 1) for n equally likely, unfamiliar options; practice, search and unequal popularity break it. The logs are the same base-2 logs as in `logs-exponentials`.',
    analogy: 'Parking: a wide empty space right in front of you takes a second; a tight spot across the car park takes careful steering. And a menu with 30 dishes takes longer to order from than one with 3, unless you already know what you want.',
    useCases: [
      'Sizing and placing buttons: primary actions big and close to where the pointer or thumb already is',
      'Screen edges and corners: macOS\'s menu bar and the Windows Start button are fast because the edge stops the pointer',
      'Touch targets: WCAG 2.2\'s 24 × 24 CSS px minimum and the 44-48 point platform guidelines',
      'Menu design: fewer, grouped or searchable options instead of one long unordered list',
    ],
    why: 'Every interface decision about size, spacing and menu length trades against these laws, and design reviews quote them. Knowing what they actually predict (and where they stop holding: touch, keyboards, practised users) lets you argue with numbers you measured instead of slogans. See `accessibility` and `responsive-design` for the target-size rules.',
    watch: 'Fitts game: the blue dot is where each trial starts, the current target is a yellow strip (faint until you have clicked the dot), and the arena flashes red on a mis-click. In the plot your valid trials are blue dots, the synthetic participant is dark grey, and the green line is the least-squares fit (yours once you have 3 valid trials, the synthetic one before). The design panel\'s bars are predicted times: blue for the two ordinary layouts, green for the edge-pinned one. Hick game: the item to click is named in yellow above the menu; the plot uses the same blue, grey and green.',
  },
  tryThis: [
    'Press Start and play all 24 trials: watch the green line and its R² settle as your blue dots fill in.',
    'Deliberately miss a few targets: the mis-click counter goes up, and the fit ignores those trials.',
    'Compare the design panel before and after your own fit: the three predictions now use your a and b.',
    'In Hick: choosing, play a few rounds Shuffled, press Start over, switch Menu order to Alphabetical, and compare the fits.',
    'Try the Fitts game with Tab and Enter instead of the mouse, and read what the caption says about it.',
  ],
  keyIdeas: [
    'Fitts: MT = a + b · log₂(D/W + 1). Bigger and closer targets are faster, and a screen edge acts like an endless target for a mouse.',
    'Hick: choice time grows with log₂(n + 1), for equally likely, unfamiliar options only.',
    'a and b are fitted from measurements and vary by person and device: the laws give the shape, not the numbers.',
    'On touch screens there is no edge to stop a finger, so minimum target sizes (24 px in WCAG 2.2, 44-48 on platforms) matter more.',
  ],
  quiz: [
    {
      q: 'A Save button is already clearly visible. Can making it bigger still help?',
      options: [
        'Yes: a wider target lowers the index of difficulty, so it is faster to hit',
        'No: once people can see a button, its size no longer changes anything',
        'Only on touch screens, since mouse pointers are perfectly precise anyway',
        'Only if the bigger button is also given a brighter and bolder colour',
      ],
      answer: 0,
      why: 'Fitts\'s law is about acquiring the target, not seeing it: ID = log₂(D/W + 1), so a larger W lowers the time to hit it even when it\'s already in plain view. Mouse pointing isn\'t perfectly precise; the fitted b shows exactly how much each extra bit costs.',
    },
    {
      q: 'Your settings page grows from 4 options to 15 in one flat list. What does Hick\'s law predict?',
      options: [
        'Slower choices: time grows with log₂(n + 1), so more options cost time',
        'No change: people only ever read the option they are looking for anyway',
        'Faster choices, since more options make it likelier the right one is shown',
        'Exactly 15 ÷ 4 times slower, because choice time is proportional to n',
      ],
      answer: 0,
      why: 'Each extra option adds information to process, roughly log₂(n + 1) bits, so going from 4 to 15 adds about 1.7 bits. The cost is logarithmic, not proportional, for equally likely options; for an unordered list people scan, it can grow even faster. Grouping or search beats both.',
    },
    {
      q: 'Why are targets at the very edge of a desktop screen fast to hit with a mouse?',
      options: [
        'The edge stops the pointer, so the target is effectively infinitely wide',
        'Edge targets are always drawn bigger than the targets in the middle',
        'The pointer moves faster near an edge, because the screen speeds it up',
        'People look at screen edges first, so they find those targets sooner',
      ],
      answer: 0,
      why: 'You can overshoot as hard as you like and the pointer stays on the target, so its width along the movement is unbounded and the ID heads to 0. That doesn\'t hold on touch screens, where nothing stops your finger at the edge.',
    },
    {
      q: 'Your fitted line is MT = 180 + 140 · ID ms. What do a = 180 and b = 140 mean?',
      options: [
        'Constants for you on this device: another person or device fits others',
        'Universal constants that hold for every person and every pointing device',
        'The fastest and slowest single trials that you recorded in the game',
        'Fixed values from Fitts\'s 1954 paper that every fit should reproduce',
      ],
      answer: 0,
      why: 'a and b are fitted from your trials: a is the time you\'d need even at ID 0 (reacting, clicking), and b is the cost per bit of difficulty. They change with the person, the device and the task, which is why studies report them per condition and why the synthetic participant\'s values are only illustrative.',
    },
  ],
};

export default lesson;
