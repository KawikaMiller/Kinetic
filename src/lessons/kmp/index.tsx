import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'KMP finds a pattern in a text without moving the text pointer back: a table built from the pattern alone says how far to fall back after a mismatch, so no character of the text is matched twice.',
    what: `The rolling-hash lesson leaves "KMP and failure functions" for here. The naive scan lines the pattern up at each position, compares left to right and, on a mismatch, slides by one and starts over, so it matches the same text characters again and again. KMP first builds a failure table, lps, where lps[i] is the length of the longest proper prefix of the pattern that is also a suffix of its first i + 1 characters; it is built by matching the pattern against itself and depends on the pattern alone. The matcher then keeps a text pointer that does not move back and a pattern pointer j: on a match both advance, on a mismatch j drops to lps[j - 1] and the text stays put. After a full match it continues from lps[m - 1], so overlapping matches are found. The work is bounded by 2n character comparisons, because every comparison either advances the text pointer or falls back, and falling back cannot happen more often than advancing.`,
    analogy: 'Reading a book for a phrase: when you notice the sentence went wrong three words in, you do not go back and reread those three words from the start; you note that the last two of them could already be the beginning of the phrase and carry on from there.',
    useCases: [
      'Searching a long log or document for a fixed string with a guaranteed linear bound',
      'Streaming input where the text cannot be re-read, because the text pointer never goes back',
      'The failure function reappears in other string tools, such as multi-pattern matchers and prefix-function problems',
      'Understanding why a built-in substring search can behave very differently on repetitive input',
    ],
    why: 'It is the standard example of precomputing from the pattern to avoid repeated work: seeing why the naive scan costs 80 comparisons and KMP 36 on the same input, and why 2n holds, is the skill behind many prefix-function interview problems.',
    watch: 'The text pointer i is blue (--info) and the pattern pointer j is violet (--violet). The comparison in progress is yellow (--hi), matched characters are green (--ok) and a mismatch is red (--bad). In the naive scene a character that matches a second time is tinted red as rework; in the matcher, the characters a naive restart would have matched again but KMP skips are tinted green, and a violet marker shows the fall-back from j to lps[j - 1]. In the table scene a clicked entry shows its prefix in green and its suffix in violet.',
  },
  tryThis: [
    `In The naive slide, on the defaults (${F.naivePattern} in ${F.naiveText} a's) press play to the end: ${F.naiveComparisons} comparisons, and ${F.naiveRematches} of them match a character that had already matched in an earlier alignment (tinted red).`,
    `In The failure table, step to the end on the default: lps for abcabd is ${F.lpsDefault}. Press aaaab for ${F.lpsAaaab}, then abababac for ${F.lpsAbababac}. Click the lps entry at index 6 (the 7th cell): the prefix "ababa" equals the suffix "ababa" of "abababa".`,
    `In The match, on the defaults (${F.matchPattern} in an 18-character text) press play to the end: found at ${F.matchFound} in ${F.matchComparisons} comparisons with ${F.matchFallbacks} fall-backs, where the naive scan needs ${F.matchNaiveComparisons}. Press aa in aaaa: the matches are ${F.overlapFound}.`,
    `In Count the work, on the defaults: the naive scan makes ${F.naiveComparisons} comparisons and KMP ${F.kmpComparisons}, within the bound 2n = ${F.kmpBound}; the text advanced ${F.kmpAdvances} times and fell back ${F.kmpFallbacks} times.`,
  ],
  keyIdeas: [
    `The failure table depends on the pattern alone: abcabd gives ${F.lpsDefault} whatever text it is later run against.`,
    `KMP's text pointer does not move back: on ${F.naivePattern} in ${F.naiveText} a's the naive scan makes ${F.naiveComparisons} comparisons and KMP makes ${F.kmpComparisons}, inside the bound of ${F.kmpBound}.`,
    `After a full match KMP continues from lps[m - 1], so overlapping matches are found: aa in aaaa is found at ${F.overlapFound}.`,
    `The 2n bound comes from two counters: the text pointer advances no more than n times, and each fall-back needs an earlier advance, so ${F.kmpAdvances} advances and ${F.kmpFallbacks} fall-backs give ${F.kmpComparisons} comparisons here.`,
  ],
  quiz: [
    {
      q: `On ${F.naivePattern} in ${F.naiveText} a's the naive scan makes ${F.naiveComparisons} comparisons and KMP makes ${F.kmpComparisons}. What is the real reason KMP does less work?`,
      options: [
        'The text pointer does not move back, so a character that matched is not matched again',
        'It compares fewer characters at each position where the pattern is lined up',
        'It skips every second character of the text, since a match needs two in a row',
        'It hashes each window of the text and rules out most positions without comparing',
      ],
      answer: 0,
      why: `KMP does not line the pattern up afresh: after a mismatch the text pointer stays and j drops through the table. On this input that is ${F.kmpAdvances} text advances and ${F.kmpFallbacks} fall-backs, ${F.kmpComparisons} comparisons, where the naive scan matches ${F.naiveRematches} characters a second time.`,
    },
    {
      q: 'What does the failure table lps depend on?',
      options: [
        'The pattern alone, so one table serves any text run against it',
        'The text alone, since it records where the pattern last matched',
        'Both, so it is rebuilt each time the text pointer moves forward',
        'The size of the alphabet, with one entry for each possible character',
      ],
      answer: 0,
      why: `The table is built by matching the pattern against itself, with no text in sight: ${F.matchPattern} gives ${F.lpsDefault} before any text is read, and the match scene reads it unchanged for both occurrences it finds.`,
    },
    {
      q: 'KMP has just found aa at position 0 of aaaa. What does it do next so that the matches at 1 and 2 are not missed?',
      options: [
        'Continue with j = lps[m - 1], so the matched suffix starts the next match',
        'Reset j to 0, which finds the rest by starting over at the next character',
        'Move the text pointer back by m - 1 characters and compare those again',
        'Stop, since a text character that matched once cannot be part of a second match',
      ],
      answer: 0,
      why: `Here lps[1] = 1, so after the match at 0 the pattern pointer is already on the second a and the next comparison finds the match at 1 without reading anything twice, then 2: the lesson reports ${F.overlapFound}. Resetting j to 0 would give 0 and 2, and moving the text pointer back would give up the guarantee of a pointer that does not retreat.`,
    },
    {
      q: 'Why is the number of comparisons KMP makes at most 2n for a text of n characters?',
      options: [
        'Each comparison advances the text pointer or falls back, and a fall-back needs an earlier advance',
        'The failure table has at most n entries, so at most n steps can read it and each costs one comparison',
        'The pattern is at most as long as the text, so it can be lined up at n positions and no more',
        'Each text character is compared exactly twice, once to match it and once to find the mismatch',
      ],
      answer: 0,
      why: `The text pointer advances no more than n times, and j falls no further than it has risen, so fall-backs cannot outnumber advances. On the default input that is ${F.kmpAdvances} advances plus ${F.kmpFallbacks} fall-backs, ${F.kmpComparisons} comparisons against a bound of ${F.kmpBound}. A text character can be compared several times, as the ${F.kmpFallbacks} fall-backs show.`,
    },
  ],
};

export default lesson;
