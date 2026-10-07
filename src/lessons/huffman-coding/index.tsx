import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Huffman coding gives common symbols short bit codes and rare ones long codes, and no code is the start of another, so the bits decode without separators.',
    what: "Count how often each symbol appears and make each one a leaf weighted by its count. Repeatedly take the two lightest trees off a priority queue (`heaps` builds those) and join them under a new parent whose weight is their sum, until one tree is left. Label left edges 0 and right edges 1: a symbol's code is the path from the root to its leaf (the root-to-leaf walk from `tree-traversals`). No other code that gives each symbol its own bit pattern and still decodes unambiguously makes the message shorter.",
    analogy: 'Morse code had the right instinct, E is a single dot because it is common, but needed pauses between letters. Huffman codes are built so that no pause is ever needed.',
    useCases: [
      'The last stage of DEFLATE, inside zip, gzip and PNG files',
      'JPEG and MP3, after the lossy steps, to pack the remaining values tightly',
      "HTTP/2's HPACK header compression, which ships a fixed Huffman table",
      'Interview questions on greedy algorithms and priority queues',
    ],
    why: "It's the cleanest example of a greedy algorithm that is provably optimal, and it explains why compressed files shrink most when a few symbols dominate. The limit it runs into, entropy (a sum of logs, see `logs-exponentials`), is the floor for any symbol-by-symbol code.",
    watch:
      "Circles are trees in the forest: a leaf shows its character (␣ is a space) with its count ×n in grey underneath, and an inner node shows its weight. While building, the two trees being merged are solid yellow and the new parent they get is solid blue; once the tree is finished, leaves turn a green tint and every edge gets a violet 0 (left) or 1 (right). The code column of the table is violet too, because codes are those edge bits. In Decode, the node the walk is on is solid yellow, the path from the root a yellow tint with yellow edges, and a leaf the bits just reached is solid green; that symbol's table row gets a green tint. In the encoded message, each character's code is bracketed with the character under it: unread bits are blue, the bit being read is yellow and bits already read are green. Queue chips are grey, yellow while being merged and blue for the new tree. In the meter, Huffman is green, the fixed-width code grey and 8-bit ASCII red. A refused message shows its reason in red above the tree. In the stats row the Huffman bit count is green and the others grey, and the legend dots repeat the colours above.",
  },
  tryThis: [
    'Play Build the tree on mississippi river and watch the queue: each step the two lightest trees leave and their sum goes back in.',
    'Flip Ties go to between Older tree and Newer tree: the tree and some codes change, but the Huffman bits stat stays the same.',
    'Switch to Decode and step with →: the cursor walks down from the root and jumps back up at every leaf, with no separators anywhere.',
    'Pick the aaaa preset: one distinct character gets a 1-bit code, so Huffman uses 4 bits where ASCII uses 32.',
    'Type aaaaaaabcd, then abcd, and compare the meter: skewed counts beat the fixed-width code, while four equal counts only match it.',
  ],
  keyIdeas: [
    'Repeatedly merge the two lightest trees: a greedy step that is provably optimal for symbol-by-symbol codes.',
    "Codes are root-to-leaf paths, so no code is a prefix of another and the bits need no separators.",
    'Total bits = Σ count × depth, which is also the sum of every merge weight.',
    'With two or more distinct symbols, bits per symbol land in [entropy, entropy + 1); ties change codes, never the total.',
  ],
  quiz: [
    {
      q: "Huffman's encoded bits have no separators between codes. How does a decoder know where each code ends?",
      options: [
        'No code is a prefix of another, so reaching a leaf ends it',
        'Every code has the same length, so it simply counts bits',
        'It watches for a reserved bit pattern that marks each end',
        'The encoder sends the length of each code just before it',
      ],
      answer: 0,
      why: "Codes are paths to leaves, and a leaf has no children, so no code can continue into another. The decoder walks from the root and the moment it lands on a leaf the code is over. Equal lengths would be the fixed-width code, which is exactly what Huffman improves on.",
    },
    {
      q: 'Does the most frequent symbol always get a 1-bit code?',
      options: [
        'No: in mississippi river the commonest letter, i, gets 2 bits',
        'Yes: Huffman always hands the commonest symbol a 1-bit code',
        'Yes, unless two symbols tie for the highest count in the text',
        'No: the commonest symbol always ends up with the longest code',
      ],
      answer: 0,
      why: "A 1-bit code takes half of the whole code space, which only pays off when that symbol is heavy enough. i appears 5 times in 17 characters, and the lesson computes that forcing it to 1 bit would cost more in total. The commonest symbol never gets a longer code than a rarer one, but it doesn't have to get the shortest possible.",
    },
    {
      q: 'Why does Huffman always merge the two lightest trees?',
      options: [
        'Each merge adds its weight to the total bits, so keep it small',
        'Light trees are easiest to balance, which keeps the tree short',
        'It keeps the queue in order without comparing any weights',
        'Light trees hold fewer symbols, so fewer codes need updating',
      ],
      answer: 0,
      why: "Merging two trees puts every symbol under them one level deeper, adding their combined weight to the total, so the cheapest merge is the lightest pair. It isn't about balance: Huffman trees are often lopsided, with rare symbols far down one side.",
    },
    {
      q: 'mississippi river has 17 characters and 8 distinct ones. How many bits does a fixed-width code need for it?',
      options: ['51', '46', '136', '17'],
      answer: 0,
      why: '8 distinct symbols need ⌈log₂ 8⌉ = 3 bits each, and 17 × 3 = 51. 46 is what the Huffman code manages, and 136 is 8-bit ASCII.',
    },
    {
      q: 'The two tie-break settings build different trees for the same text. How do their totals compare?',
      options: [
        'Both totals are equal, though individual codes can differ',
        'The tree built first is optimal and the other a bit worse',
        'They differ by at most one bit per distinct symbol overall',
        'Whichever tree is deeper always gives the smaller total',
      ],
      answer: 0,
      why: "Either choice is a valid Huffman merge, and every Huffman tree is optimal, so the totals must match. A symbol can move to a different depth, but the sum of count × depth stays the same.",
    },
  ],
};

export default lesson;
