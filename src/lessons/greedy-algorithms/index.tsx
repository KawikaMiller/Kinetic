import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A greedy algorithm makes the choice that looks best right now and never takes it back; that is fast, and you can only trust it when you can prove the local choice is safe.',
    what: 'Greedy algorithms build an answer one irreversible step at a time, picking whatever looks best at that moment: the meeting that ends first, the biggest coin that fits. Some greedy rules are provably optimal, usually by an exchange argument: any best answer can be swapped, step by step, into the greedy one without getting worse. Many tempting rules have no such proof, and a small counterexample breaks them.',
    analogy: 'Packing a day with meetings by always saying yes to the next one that ends soonest. It sounds too simple, but it leaves the most room for the rest of the day, and you can prove nothing does better.',
    useCases: [
      'Booking rooms, CPU time slots or ad breaks without overlaps',
      'Making change at a till, which works because real coin sets are designed for it',
      'Building compression codes (`huffman-coding`) and minimum spanning trees (`minimum-spanning-trees`)',
      'Quick first answers to hard scheduling problems, where a proof is not needed',
    ],
    why: 'Greedy code is short and fast, so it is the first thing people reach for, in interviews and in production. Knowing when it is provably right, and how to find the small input that breaks it, keeps a plausible but wrong rule out of your scheduler.',
    watch: 'Meetings: each row of the timeline is one meeting and its hours. Grey bars are not looked at yet, the yellow bar is the one being looked at now, green bars are booked and dimmed bars were rejected because they overlap a booked one. The booked row collects greedy\'s picks in green; the best possible row, in violet, is a best schedule found by brute force. When the scan ends, greedy picks that the best schedule avoids get a red outline. The scan order strip above uses the same yellow, green and dimmed cells. Exchange argument: greedy\'s schedule is green, the best schedule is violet, the meeting just swapped in is yellow, and the one it replaced shows as a dashed dim outline in its own row. Coin change: blue coins are the ones greedy took, violet coins are the fewest possible, and each verdict line has a green edge when greedy matched the fewest, red when it lost or got stuck, and grey when no mix of coins works. In the table, grey cells hold the fewest coins for each amount, the yellow cell is the target and – means impossible. A refused input shows its reason in red.',
  },
  tryThis: [
    'On All-morning meeting, play Earliest start, then switch the rule to Earliest finish: 3 meetings become 7.',
    'Pick Short bridges with Shortest first and look for the red outlines once the scan ends.',
    'Press Random day a few times with Earliest finish: the booked count always equals the best possible.',
    'In Exchange argument, step through the swaps and watch the best schedule turn into greedy\'s without losing a meeting.',
    'In Coin change, try 30 with 1, 10, 25, then type your own coins and target to find an amount where greedy loses.',
  ],
  keyIdeas: [
    'Greedy never revisits a choice, which makes it fast and also makes it easy to be wrong.',
    'Earliest finish is optimal for interval scheduling: it always leaves the most room for what comes next.',
    'An exchange argument proves a greedy rule: swap any best answer into greedy\'s without making it worse.',
    'One counterexample kills a greedy rule: {1, 3, 4} makes 6 as 4 + 1 + 1, though 3 + 3 uses fewer coins.',
  ],
  quiz: [
    {
      q: 'A greedy algorithm takes the best-looking choice at every step. What does that guarantee about the final answer?',
      options: [
        'Nothing on its own: it is optimal only when a proof says so',
        'It is always optimal, because every single step was the best',
        'It is always within one step of the optimum, on any input',
        'It is optimal whenever the input has been sorted first',
      ],
      answer: 0,
      why: 'Locally best steps can add up to a worse whole: with coins {1, 3, 4}, greedy makes 6 as 4 + 1 + 1 while 3 + 3 needs one coin fewer. "Every step was the best" is the tempting reasoning, but the best first step for a part of the problem can block a better overall answer.',
    },
    {
      q: 'Which rule always books the most meetings that do not overlap?',
      options: ['Earliest finish', 'Earliest start', 'Shortest first', 'Fewest overlaps first'],
      answer: 0,
      why: 'Earliest finish frees the room as soon as possible, and the exchange argument proves no schedule can do better. Earliest start loses to one long early meeting, shortest first loses to a short meeting that straddles two others, and fewest overlaps first also has known counterexamples.',
    },
    {
      q: 'With coins {1, 3, 4}, how many coins does greedy use to make 6, and what is the fewest possible?',
      options: ['3 coins; the fewest is 2', '2 coins; the fewest is 2', '3 coins; the fewest is 3', '4 coins; the fewest is 2'],
      answer: 0,
      why: 'Greedy takes 4 (2 left), then 1 and 1: three coins. Two 3s make 6 with two coins. Greedy never considers 3 first because 4 fits and is bigger.',
    },
    {
      q: 'Why is it safe for earliest finish to book the meeting that ends first?',
      options: [
        'Any best schedule can swap its first meeting for it and stay valid',
        'The meeting that ends first is always the shortest meeting of the day',
        'It overlaps fewer of the other meetings than any other choice does',
        'It is the meeting that a brute-force search would always try first',
      ],
      answer: 0,
      why: 'It ends no later than the first meeting of any best schedule, so swapping it in can never cause a new overlap and the count stays the same. It need not be the shortest: a 3-hour meeting starting at 8 ends before a 1-hour meeting at 11.',
    },
    {
      q: 'Greedy matches the fewest coins for every amount 1-99 with {1, 5, 10, 25}. What does that tell you about {1, 10, 25}?',
      options: [
        'Nothing: greedy pays 30 with 6 coins there, but 3 tens do it',
        'It is safe as well, since all it does is drop the 5 coin',
        'It is safe for every amount that is a multiple of 5',
        'It is safe as long as the amount is above 25',
      ],
      answer: 0,
      why: 'Every coin system has to be checked on its own. Without the 5, greedy pays 30 as 25 + 1 + 1 + 1 + 1 + 1, six coins, while 10 + 10 + 10 needs three. 30 is a multiple of 5 and above 25, so the other two claims fail on the same amount.',
    },
  ],
};

export default lesson;
