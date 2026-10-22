import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A suffix array lists the start positions of a text\'s suffixes in sorted order: binary search over it finds any substring, and a column of common-prefix lengths between neighbours answers repeat questions.',
    what: `Take the suffixes of a text, the pieces from one start position to the end, and sort them like dictionary entries. The suffix array SA is just the list of their start positions in that order, n numbers for a text of n characters. A substring is a prefix of some suffix, and suffixes that share a prefix sit next to each other, so two binary searches bracket a pattern's range of occurrences. The LCP column stores how many leading letters each suffix shares with the one above it: its largest entry is the longest repeated substring, and its sum gives the number of distinct substrings. The array holds positions, not substrings: the n(n+1)/2 substrings are not written out.`,
    analogy: 'A book index cut at each letter: each entry is a start position, entries that begin alike are filed together, so a thumb search lands on the whole group of them at once.',
    useCases: [
      'Full-text search over a fixed text, answering where a pattern occurs by binary search without scanning the text',
      'Finding the longest repeated substring or counting distinct substrings from the LCP column',
      'Genome and bioinformatics indexes that need many pattern queries against one long sequence',
      'The sorting step behind the Burrows-Wheeler transform used by some compressors and aligners',
    ],
    why: 'It is the cleanest case of paying once for a sorted index and then answering many questions cheaply. It builds on `tries` (a suffix tree is a trie of suffixes), `sorting` (the build is a comparison sort whose comparator can be slow) and `binary-search` (both bounds are one).',
    watch: 'In the sort scene a red row is the first adjacent pair that is out of order, green rows mean the order is confirmed, and the blue number is the start position of the suffix in the text. In the LCP scene green letters are the prefix shared with the suffix above, and the yellow row and cell hold the maximum LCP. In the search scene the green cells are the range [lo, hi) of suffixes that start with the pattern. In the cost plot the blue line is comparator calls, the green line characters compared on a random string and the red line characters compared on a string of one repeated letter.',
  },
  tryThis: [
    `In Sort the suffixes, on the default ${F.text}, press Check order: the first pair is named, "anana sorts before banana: at position 0, 'a' comes before 'b'".`,
    `Press Sort for me: the suffix array is ${F.sa}.`,
    `Open LCP and repeats: the LCP column is ${F.lcp}, the longest repeated substring is ${F.repeat} and ${F.text} has ${F.distinct} distinct substrings.`,
    `Open Search and type ${'ana'}: the range is ${F.anaRange}, ${F.anaCount} occurrences, at text positions ${F.anaPositions}.`,
    'Type nab: the range is empty, 0 occurrences, and no text position is listed.',
  ],
  keyIdeas: [
    `The suffix array of ${F.text} is ${F.sa}: n start positions in sorted order, not the substrings themselves.`,
    `A pattern's occurrences form one contiguous range of the array: ana gives ${F.anaRange}, a width of ${F.anaCount}, found by two binary searches whose probes look at no more letters than the pattern has.`,
    `The LCP column ${F.lcp} has maximum ${F.repeatLength}, so the longest repeat is ${F.repeat}, and ${F.substringPairs} - ${F.lcpSum} = ${F.distinct} distinct substrings.`,
    `The prefix rule matters: a suffix that ends first sorts first, so with the inverted rule even the two-letter text ${F.witness} is sorted wrongly, giving [${F.witnessBroken}] instead of [${F.witnessCorrect}].`,
  ],
  quiz: [
    {
      q: `The suffix array of ${F.text} is [${F.sa}]. What do those numbers say?`,
      options: [
        'The sorted letters of banana, each one replaced by its alphabet rank',
        'Where each suffix starts, listed in sorted order of the suffixes',
        'The positions of the letter a first, then the positions of b and n',
        'The lengths of the six suffixes, sorted from the shortest to the longest',
      ],
      answer: 1,
      why: `Each entry is a start position: ${F.sa} reads the suffixes in dictionary order: ${F.sortedSuffixes}. A list of lengths would run ${F.sortedLengths}, which is a different list.`,
    },
    {
      q: 'Someone says a suffix array stores every substring of the text. What is the accurate picture?',
      options: [
        'It holds only n start positions; any substring is a prefix of some suffix, found by binary search',
        'It stores all n(n+1)/2 substrings, sorted, which is why it needs so much memory',
        'It stores one string per distinct letter and rebuilds the rest on demand later',
        'It stores only the repeated substrings, which it finds with the LCP column',
      ],
      answer: 0,
      why: `The array has ${F.n} entries for ${F.text}, while ${F.substringPairs} pairs of start and length exist; a substring is read off as a prefix of a suffix and located by binary search, so nothing needs to be written out.`,
    },
    {
      q: `Binary search for ana in the sorted suffixes of ${F.text} lands on the range ${F.anaRange}. How often does ana occur?`,
      options: [
        'Once, at the first position listed in that range, which is the earliest hit',
        'Three times, because the range covers positions 1 to 3 inclusive of both ends',
        'Never, because no single suffix of banana is exactly equal to the word ana',
        'Twice, at text positions 3 and 1; the range width is the count',
      ],
      answer: 3,
      why: `The range is half open, so its width ${F.anaHi} - ${F.anaLo} = ${F.anaCount}: the suffixes ana and anana both start with ana, at text positions ${F.anaPositions}. The two occurrences overlap, and overlapping hits count.`,
    },
    {
      q: `The LCP column of ${F.text} is ${F.lcp}. What is the longest substring that occurs at least twice?`,
      options: [
        'banana, because the whole word is also a suffix of the word itself',
        'na, because the last entry of the LCP column is 2, the final value',
        'ana, because the largest common prefix between neighbouring suffixes is 3',
        'a, because it is the first suffix to appear in the sorted suffix order',
      ],
      answer: 2,
      why: `The maximum LCP is ${F.repeatLength}, shared by the neighbours ana and anana, so ${F.repeat} is the longest repeat. The last entry, 2, just says na and nana share two letters; it is not the maximum.`,
    },
    {
      q: `How many different substrings does ${F.text} have?`,
      options: [
        '21, because a word of 6 letters has 6 times 7 over 2 substrings',
        '15: the 21 start-and-length pairs minus 6 repeats',
        '6, one substring for each of the six starting positions in the word',
        '12, one for each start position paired with each possible length',
      ],
      answer: 1,
      why: `${F.substringPairs} pairs of start and length exist, and the LCP sum ${F.lcpSum} counts the ones that repeat an earlier substring: ${F.substringPairs} - ${F.lcpSum} = ${F.distinct}. The 21 counts a and na and ana more than once.`,
    },
  ],
};

export default lesson;
