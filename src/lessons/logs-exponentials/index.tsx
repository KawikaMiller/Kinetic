import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Exponentials grow by doubling; logarithms count the doublings. log₂ n is how many times you halve n to reach 1, which is tiny even for huge n.',
    what: '2^k means doubling k times: 2^10 is 1,024 and 2^40 is over a trillion. The logarithm runs it backwards: log₂ n asks "2 to what power gives n?", which is the number of halvings from n down to 1. Because of that, log₂ of a million is only about 20 and of a billion about 30. The same count tells you how many bits it takes to give n things different codes: log₂ n, rounded up.',
    analogy: 'Folding a sheet of paper in half over and over: after 10 folds it\'s 1,024 layers thick. Unfolding is the log: how many folds made those layers.',
    useCases: [
      'Binary search and balanced trees take about log₂ n steps, so a billion items is about 30 steps',
      'Sizing IDs and fields: 50 states need 6 bits, 2³² IPv4 addresses ran out, 2¹⁶ port numbers',
      'Units: KiB, MiB, GiB are 2¹⁰, 2²⁰, 2³⁰, roughly a thousand, million and billion',
      'Reading log-scale charts of latency, traffic or growth, where equal steps mean ×10 or ×2',
    ],
    why: 'Powers of two set the limits you hit in real systems (255, 65,535, 4 billion), and log n explains why some algorithms stay fast at any scale. Being able to say "that\'s about 2³⁰, so 30 steps" in your head is a daily shortcut in design reviews and interviews.',
    watch: 'Doubling: the grid shows 2^k squares in yellow, with the half added by the latest doubling brighter than what you already had (beyond 2¹⁰ each square stands for a bigger block, and the note says how big). The chart plots 2^k in yellow with the current point and a dashed yellow line; the blue dashed lines are real-world landmarks like 2³² IPv4 addresses. Switch the axis between linear and log. Halving: the violet chips are each halving step, the current one yellow; the violet bars show what\'s left on a linear scale and on a log scale. Bits needed: the bit strip is the largest code, N − 1, in binary, yellow for 1 and dim for 0.',
  },
  tryThis: [
    'In Doubling, drag "Doublings k" to 10, 20 and 30: about a thousand, a million, a billion.',
    'Set k to 32, then switch "Chart axis" to Log: 2^k becomes a straight line and the landmarks space out evenly.',
    'Press "Halve 2^k back to 1": it takes exactly k halvings.',
    'In Halving, pick 1,000,000,000: a billion halves down to 1 in only 30 steps.',
    'In Bits needed, click 1023, 1024 and 1025: the bit count only changes when you pass a power of two.',
  ],
  keyIdeas: [
    'Every doubling multiplies by 2; ten doublings ≈ ×1,000 (2¹⁰ ≈ 10³).',
    'log₂ n = the number of halvings from n down to 1, and it stays small: about 30 for a billion.',
    'N distinct things need log₂ N bits, rounded up; one more thing past a power of two costs one more bit.',
    'On a log axis, exponential growth is a straight line.',
  ],
  quiz: [
    {
      q: 'Roughly what is log₂ of one billion?',
      options: ['About 30', 'About 9', 'About 1,000', 'About 300'],
      answer: 0,
      why: '2³⁰ ≈ 1.07 billion, so a billion halves down to 1 in about 30 steps. 9 is log₁₀ of a billion: the base matters. log n grows far, far slower than n.',
    },
    {
      q: 'How many bits do you need to give 50 US states different codes?',
      options: ['5', '6', '50', '7'],
      answer: 1,
      why: '2⁵ = 32 is too few and 2⁶ = 64 is enough, so 50 things need 6 bits (log₂ 50 ≈ 5.6, rounded up).',
    },
    {
      q: 'About how big is 2⁴⁰?',
      options: ['A thousand', 'A million', 'A trillion', 'Forty thousand'],
      answer: 2,
      why: "Every 10 doublings is about ×1,000: 2¹⁰ ≈ 10³, so 2⁴⁰ ≈ 10¹². It's exactly 1,099,511,627,776.",
    },
    {
      q: 'You go from 1,024 items to 1,025. How many more bits do their IDs need?',
      options: ['No more bits', 'One more bit', 'Ten more bits', 'A whole extra byte'],
      answer: 1,
      why: '2¹⁰ = 1,024, so 10 bits give exactly 1,024 IDs (0 to 1,023). The 1,025th ID needs an 11th bit. Storage may round that up to a whole byte, but the number of bits needed is one more.',
    },
  ],
};

export default lesson;
