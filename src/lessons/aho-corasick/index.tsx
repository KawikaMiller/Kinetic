import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Aho-Corasick searches a text for many patterns in one pass: the patterns form a trie, and each state gets a failure link to the longest shorter string that is still a pattern prefix, so the text is read once.',
    what: `The kmp lesson ends with one pattern's failure table and a text pointer that does not go back. Here the same idea covers a whole set of patterns. Build a trie of the patterns, then give each state a failure link: the state of the longest proper suffix of its string that is also a prefix of some pattern. Scanning keeps one token in the trie. On a letter with an edge the token moves along it; on a missing edge it follows failure links, to ever shorter strings, until some edge matches or it is back at the root. Whenever the token stands on a state that ends a pattern, that pattern is reported, and an output link then reports the patterns nested inside it, such as he inside she. The text is read once, and the failure follows cannot outnumber the letters read.`,
    analogy: 'A crossword solver reading a long strip of letters with a list of words in mind: when the letters stop fitting one word, she does not start over but keeps the longest tail that still begins another word on her list.',
    useCases: [
      'Scanning a stream for a fixed list of words, such as a blocklist or a set of keywords, without one pass per word',
      'Fixed-string search tools that accept several patterns at once',
      'Intrusion-detection and content-filter style matchers that compare traffic against many known strings',
      'Bioinformatics and log analysis, where one long text is checked against a dictionary of short motifs',
    ],
    why: 'It shows how to turn a per-pattern cost into a per-text cost by precomputing a small amount of structure. It builds on `tries` (the states and edges) and `kmp` (the failure link, generalised from one pattern to a set).',
    watch: 'Each box is a trie state, labelled with its number and the string it spells, and a double outline means a pattern ends there. A trie edge is an arrow carrying its letter. The yellow filled box is the token, the state the scan is in. A blue dashed link is a failure link being followed, violet dashed links are the other failure links (links to the root are not drawn), and a green dashed link is an output link. In the text strip the yellow letter is the one being read, letters already read are tinted blue and green outlined letters belong to a match. In the counting scene the green bar is Aho-Corasick and the red bar is the naive scan.',
  },
  tryThis: [
    `On the default patterns ${F.patterns} and the text ${F.text}, press Play to the end: ${F.ushersMatches}, with ${F.ushersFollows} failure follow at the r.`,
    `Press Reset, then Step until the caption names an output link from state 5 (she) to state 2 (he): he is found at 2 to 3, ending on the same e as she.`,
    `Open Failure links, by hand and click the root for states 1 (h), 3 (s), 2 (he) and 6 (hi), which are accepted. State 4 (sh) is next: click state 5 (she) as its target and it is refused as not shorter, pointing to 'h' (state 1).`,
    `Back in Stream the text, press the hishers chip and Play: ${F.hishersMatches}.`,
    `In Count the work, press the hishers chip: ${F.hishersFollows} failure follows against ${F.hishersReads} letters read.`,
  ],
  keyIdeas: [
    `The failure link of a state is the longest proper suffix of its string that is also a pattern prefix: in the default trie 'sh' links to '${F.shFail}' and 'she' links to '${F.sheFail}' (state ${F.sheFailState}).`,
    `One pass finds the matches of the whole pattern set: ${F.text} read once gives ${F.ushersCount} matches, ${F.ushersMatches}, with ${F.ushersFollows} failure follow, where one scan per pattern compares ${F.ushersNaive} characters.`,
    `Output links report nested patterns: without them ${F.text} misses ${F.witnessMissed}, and a seeded run of ${F.brokenCases} pattern sets loses a match on ${F.brokenFailing} of them.`,
    `Failure follows total no more than the letters read: a follow lowers the depth by at least 1 and a letter raises it by one level at the very best, here ${F.hishersFollows} follows for ${F.hishersReads} letters.`,
  ],
  quiz: [
    {
      q: 'Why is Aho-Corasick better than running KMP once for every pattern?',
      options: [
        'It compares fewer characters per alignment than KMP does for one pattern',
        'The text is read only once, however many patterns the automaton holds',
        'It needs no failure links at all, so it is simpler than plain KMP',
        'It reports only the longest pattern at each position, which saves work',
      ],
      answer: 1,
      why: `One token walks the trie while the text is read once: ${F.text} costs ${F.ushersReads} reads and ${F.ushersFollows} follow for the ${F.patterns.split(', ').length} patterns, where scanning once per pattern compares ${F.ushersNaive} characters.`,
    },
    {
      q: `Patterns ${F.patterns} are searched in ${F.text}. Which matches end at the same position?`,
      options: [
        'she and he, which both end at position 3 because he is a suffix of she',
        'his and hers, both ending at position 5, because they share the letter h',
        'she and hers, both ending at position 5, since hers continues she',
        'None: each position of the text reports at most one pattern',
      ],
      answer: 0,
      why: `The token stands on the state for she after the e at position 3, and the output link reports he there too: ${F.ushersMatches}. Hers ends at 5, and she ends at 3, so the other pairings do not occur.`,
    },
    {
      q: 'What does the failure link of a state point to?',
      options: [
        'The state of the shortest pattern that contains its string somewhere inside',
        'The parent of the state, whose string is one letter shorter than its own',
        'The root of the trie, unless the string is already a complete pattern',
        'The longest proper suffix of its string that is a pattern prefix',
      ],
      answer: 3,
      why: `For 'sh' the suffixes are 'h' and the empty string; 'h' is a pattern prefix and the longer of the two, so the link goes to '${F.shFail}'. The parent would be 's', which is the trie edge read backwards, and many links point deeper than the root.`,
    },
    {
      q: 'Why does the automaton keep output links as well as failure links?',
      options: [
        'They replace the failure links once the trie has been fully built up',
        'They store the text position at which each pattern was last found',
        'A pattern can end inside a longer one, and the link finds it quickly',
        'They are only needed when two of the patterns happen to be equal',
      ],
      answer: 2,
      why: `Standing on the state for she, the scan has also just finished he, which is a suffix of she. Without the output link ${F.text} misses ${F.witnessMissed}; with it, both are reported at the same letter.`,
    },
    {
      q: 'The text has n characters. How many failure-link follows can a whole scan make?',
      options: [
        'At most n per character, so about n squared in the worst possible case',
        'At most n in total, since each follow lowers the depth',
        'Exactly one per character of the text, and never more than that one',
        'About as many as the total length of all the patterns put together',
      ],
      answer: 1,
      why: `A letter raises the depth by one level at the very best and each follow lowers it by at least 1, so the follows cannot exceed the letters read: ${F.hishersFollows} follows for ${F.hishersReads} letters on hishers. A single letter can cause several follows, so one per character is not the rule.`,
    },
  ],
};

export default lesson;
