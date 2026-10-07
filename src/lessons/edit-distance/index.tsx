import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Edit distance is the fewest inserts, deletes and substitutions that turn one string into another, found by filling a table where each cell takes the cheapest of three neighbours.',
    what: 'Cell D[i][j] holds the cheapest way to turn the first i letters of A into the first j letters of B. It comes from the cell to its left plus an insert, the cell above plus a delete, or the diagonal plus a substitution (free when the letters match). Tracing the winning choices back from the bottom-right corner gives the edit script itself, and running the same table over lines with substitutions ruled out is a diff.',
    analogy: 'Correcting a misspelled word with the fewest keystrokes: every fix is either typing a letter, deleting one or overwriting one, and you want the shortest list of fixes.',
    useCases: [
      'Spelling suggestions and "did you mean?" search, ranking words by distance',
      '`git diff` and code review tools, which find a shortest insert/delete script over lines',
      'DNA and protein alignment, with weighted costs instead of 1s',
      'Fuzzy matching of names and addresses when deduplicating records',
    ],
    why: 'It is the classic two-string dynamic program, and the same table shape solves alignment, diff and longest common subsequence. Knowing it explains why diffs look the way they do and why "how different are these strings?" is not just counting mismatches. It builds on `dynamic-programming`.',
    watch: 'Words scene: the row and column labels are the letters, with ε for the empty prefix. The yellow cell is being computed, the blue-tinted cells are its three candidates, and the yellow arrow shows which one won. Violet cells and arrows are the traceback path. Filled cells have a light grey tint and empty ones only an outline. In the candidates panel the winner has a yellow edge. In the replay, green letters matched, yellow ones were substituted, blue ones inserted, and a red struck-through letter is being deleted; grey letters are still to come. Line diff: green + lines were added, red − lines removed, and grey lines kept.',
  },
  tryThis: [
    'Pick flaw → lawn: Hamming distance says 4, the table says 2.',
    'Play kitten → sitting to the end and watch the replay: sitten, sittin, sitting.',
    'Switch Substitute costs to 2 on kitten → sitting: the distance becomes 5, made only of deletes and inserts.',
    'Clear Word A and press Apply: the distance from an empty word is the other word\'s length.',
    'In Line diff, change a line in Version 2 and press Diff these: the changed line shows as − then +.',
  ],
  keyIdeas: [
    'D[i][j] = the cheapest of left + insert, above + delete, diagonal + 0 or a substitution: O(mn) time.',
    'Tracing the winning choices back from the corner recovers an optimal edit script, not just its length.',
    'Hamming distance only counts mismatched positions; edit distance can shift letters with inserts and deletes.',
    'Diff tools solve the insert/delete-only version over lines, which keeps a longest common subsequence.',
  ],
  quiz: [
    {
      q: '“flaw” and “lawn” differ at all 4 positions. What is their edit distance?',
      options: ['2', '4', '1', '3'],
      answer: 0,
      why: 'Delete the f and flaw becomes law; insert an n at the end and it is lawn: 2 edits. Counting differing positions (Hamming distance) gives 4 because it cannot shift letters, and one deletion lines everything up.',
    },
    {
      q: 'In the table, what does D[i][j] hold?',
      options: [
        "The cheapest edits turning A's first i letters into B's first j",
        'The number of letters A and B share in their first i and j',
        'The cost of changing letter i of A into letter j of B alone',
        'How many positions differ once both words are cut to length i',
      ],
      answer: 0,
      why: 'Every cell answers the same question for two prefixes, built from three smaller answers: left, above and diagonal. Comparing letter i with letter j on its own is only the diagonal\'s + 0 or + 1.',
    },
    {
      q: 'Why can the table be filled row by row, left to right?',
      options: [
        'Each cell needs only its left, upper and upper-left neighbours',
        'Rows are independent, so they can be filled in any order at all',
        'Each row compares one letter of A against the whole of word A',
        'The last row is copied from the first row once it is complete',
      ],
      answer: 0,
      why: 'D[i][j] depends on D[i][j − 1], D[i − 1][j] and D[i − 1][j − 1], which all come earlier in that order. The rows are not independent: each one is built from the row above it.',
    },
    {
      q: 'With substitution costing 2 instead of 1, what does the distance measure?',
      options: [
        'Deletes plus inserts: m + n − 2 × the longest common subsequence',
        'The same as before, doubled, because every edit now costs twice',
        'Only substitutions, since inserts and deletes become too cheap',
        'The number of positions where the two words differ, doubled',
      ],
      answer: 0,
      why: 'A substitution now costs as much as deleting the old letter and inserting the new one, so the cheapest script never needs one: it keeps a longest common subsequence and deletes and inserts the rest, which is the line diff scene. Inserts and deletes still cost 1, so nothing is simply doubled.',
    },
  ],
};

export default lesson;
