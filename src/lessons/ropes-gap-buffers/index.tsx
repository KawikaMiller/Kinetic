import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A plain array makes every insert shift the text after it; a gap buffer keeps a hole at the cursor so typing is cheap but a far jump is not; a rope keeps the text in a tree of short pieces so an edit builds a few new nodes and shares the rest.',
    what: `The array lesson's cost was that inserting near the front moves everything after it, n - i characters for an insert at position i. An editor that inserts at the cursor all day can do better. A gap buffer splits the text around a block of empty cells at the cursor: typing writes into the gap, moving the cursor carries characters across it, and when the gap is full the buffer doubles and copies. A rope stores the text as a balanced tree whose leaves hold short pieces, with each internal node holding the weight, the length of its left subtree, so index i walks down by going left when i is below the weight and otherwise subtracting it and going right. Concatenation makes one new root, a split builds new nodes only along the cut, and an insert is a split followed by joining three pieces. Positions count Unicode code points; a grapheme made of several code points is not handled here.`,
    analogy: 'A page of text on a table: an array is one long strip you have to slide along to make room; a gap buffer leaves a blank stretch where you are writing and drags it when you move; a rope is a stack of index cards on a shelf, where adding a card, or splitting a card in two, does not disturb the cards you are not touching.',
    useCases: [
      'Text editors and code editors, which insert at the cursor and keep undo history',
      'Terminal and line-editing libraries that buffer what you type',
      'Document and spreadsheet tools that splice large blocks into long text',
      'Understanding why some systems use persistent, shared structures for versions and undo',
    ],
    why: 'It is the plain answer to "my array insert is O(n)": picking a structure by the workload, a long run of local edits or far jumps or big pastes, instead of by habit, and knowing what each choice costs.',
    watch: 'The cursor is blue (--info). Characters an edit moves are red (--bad) with the count, the gap is hatched grey (--dim), and characters just written are yellow (--hi). In the rope, new nodes from the last edit are yellow, nodes shared unchanged are violet (--violet), and the path of an index lookup is blue; internal nodes show their weight as a number. In the workload scene the structure with the fewest touches is green (--ok) and the one with the most is red (--bad), for that workload only, so the colours change from one workload to the next.',
  },
  tryThis: [
    `In The plain array, on the defaults (${F.arrayLength} characters, cursor at ${F.arrayCursor}) press Insert at cursor: ${F.arrayMoves} characters move, which is n - i. Press Type at the start, then Insert at cursor: ${F.arrayMovesStart}. Press Type at the end, then Insert at cursor: ${F.arrayMovesEnd}.`,
    `In The gap buffer, on the defaults (${F.gapLength} characters, cursor at the end) press Type at cursor: ${F.gapTypeWrites} write and ${F.gapTypeMoves} moves. Press Jump to start: ${F.gapHome} characters cross the gap. Press Type at cursor: 1 write again. The table below: typical editing costs the gap buffer ${F.typical.gap.toLocaleString('en-US')} touches against ${F.typical.array.toLocaleString('en-US')} for the array, and search and replace across the file ${F.replace.gap.toLocaleString('en-US')} against ${F.replace.array.toLocaleString('en-US')}.`,
    `In The rope, on the defaults (${F.ropeLength} characters in ${F.ropeLeaves} leaves, ${F.ropeDepth} levels deep): set Index i to ${F.lookupIndex} and press Look up index i, which reads ${F.lookupNodes} nodes and finds ${JSON.stringify(F.lookupChar)}. Set Index i back to 10 and press Insert at i with the text XY: ${F.insertCreated} new nodes and ${F.insertShared} nodes shared with the rope before.`,
    `In Pick a workload, on the defaults (type at the cursor, 1,000 characters): array ${F.typeArray} touches, gap buffer ${F.typeGap}, rope ${F.typeRope}. Pick Jump around and insert: array ${F.jumpArray}, gap buffer ${F.jumpGap}, rope ${F.jumpRope}. Set the size to 1,000,000 and pick Undo the last 10 edits: array ${F.undoArray}, rope ${F.undoRope}.`,
  ],
  keyIdeas: [
    `An array insert at position i shifts the n - i characters after it: ${F.arrayMoves} for the default 43-character text at 10, ${F.arrayMovesStart} at the start and ${F.arrayMovesEnd} at the end.`,
    `A gap buffer makes typing at the cursor one write, but a far jump carries the gap across the text: alternating between the ends of a 1,000-character text costs it ${F.jumpGap} touches against ${F.jumpArray} for the array.`,
    `A rope keeps a weight on each internal node, so lookups and edits follow one path: the default insert builds ${F.insertCreated} new nodes and shares ${F.insertShared}, and pasting 500 characters at the start of a million costs ${F.pasteRope} touches against ${F.pasteArray} for the array.`,
    `The rope is not free: appending to a 1,000-character text costs it ${F.appendRope} touches against ${F.appendArray} for the array in this lesson's simplified depth rule (${F.appendRebuilds} rebuilds), and touches are not wall time.`,
  ],
  quiz: [
    {
      q: 'A rope is not just a linked list of strings. What lets it find character i in a number of steps that grows slowly with the length?',
      options: [
        'Each internal node stores the length of its left subtree, so every level sends the walk left or right',
        'Each leaf holds a single character, so the walk can jump straight to the leaf',
        'The rope keeps an array of pointers to its leaves, indexed by position',
        'The rope remembers the last index looked up and starts the next walk from there',
      ],
      answer: 0,
      why: `A linked list of pieces has to be walked from the head, adding up lengths. The weight on each internal node says how many characters lie to the left, so index i goes left if i is below it and otherwise subtracts it and goes right: on the default ${F.ropeLength}-character rope, looking up index 20 reads ${F.lookupNodes} nodes, one per level.`,
    },
    {
      q: 'The cursor alternates between the very start and the very end of a 1,000-character text, one character inserted each time. Which of the array and the gap buffer costs more?',
      options: [
        'The gap buffer: every jump carries the gap across the whole text',
        'The array: every insert shifts the whole text after the cursor, however far',
        'They cost the same, since both copy about half the text per edit',
        'The gap buffer, but only the first time, because the gap then stays put',
      ],
      answer: 0,
      why: `At the start the array shifts the whole text and at the end it shifts nothing, about half the text per edit on average; the gap buffer moves the gap across the full text on each jump. On the lesson's 50 inserts that is ${F.jumpGap} touches for the gap buffer against ${F.jumpArray} for the array, with the rope at ${F.jumpRope}.`,
    },
    {
      q: `The ${F.arrayLength}-character text has the cursor at position ${F.arrayCursor} and one character is inserted in a plain array. How many characters move?`,
      options: ['10', '33', '43', '1'],
      answer: 1,
      why: `The ${F.arrayLength - F.arrayCursor} characters from position ${F.arrayCursor} onward each shift one place right, which is n - i. At the start the same insert would move ${F.arrayMovesStart}, and at the end ${F.arrayMovesEnd}.`,
    },
    {
      q: 'Why is undoing the last 10 edits nearly free for a rope?',
      options: [
        'Nodes are never changed, so the old root still describes the old text and undo puts it back',
        'The rope stores a second copy of the text and swaps that copy in when the edit is undone',
        'Undo only has to move the cursor back, because the edits are kept as marks on the text',
        'A rope deletes in constant time, so each undone insert is a single step for the tree',
      ],
      answer: 0,
      why: `An edit builds new nodes and leaves the old ones alone, so the root before the edit is still a complete, valid rope. On a million characters the ten edits and their undos cost the rope ${F.undoRope} touches against ${F.undoArray} for the array, which has to apply each inverse edit.`,
    },
  ],
};

export default lesson;
