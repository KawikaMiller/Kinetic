import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A trie stores words as paths of letters from a shared root, so reaching the node for a prefix takes as many steps as the prefix has letters, however many words there are; listing its completions then only walks that subtree.',
    what: 'Each node stands for a prefix, and each edge adds one letter. Words that share a beginning share those nodes, and a mark on a node says a word ends there. To autocomplete, walk the prefix\'s letters down from the root, then read out every marked node below by a depth-first walk in letter order. A radix tree compresses chains of single-child nodes into one edge.',
    analogy: 'A dictionary\'s thumb tabs taken all the way down: open at C, then the CA pages, then CAT, and everything left in your hand starts with "cat".',
    useCases: [
      'Autocomplete and search-as-you-type over a fixed vocabulary',
      'IP routing tables, which find the longest matching prefix of an address with a binary trie',
      'Spell checkers and word games, which walk a dictionary trie letter by letter',
      'Routers in web frameworks that match URL paths in a radix tree',
    ],
    why: 'Prefix queries are everywhere, and a trie turns "scan every string" into "follow the letters". It is also a good lesson in trade-offs: the speed comes from structure, and that structure costs memory. It builds on `trees-bst`, `hash-table` (a child map per node is often a small hash table) and `tree-traversals` for the depth-first read-out.',
    watch: 'Each circle is a node, labelled with the letter on the edge into it; the root is ·. In the compressed view, pills carry a run of letters. A green ring marks the end of a word. The yellow node is the letter being handled now, and violet nodes and edges are the matched path. A solid blue node was just created; blue-tinted nodes and edges are the subtree holding the completions, also listed as blue chips, while faded nodes did not match. A red node is being pruned.',
  },
  tryThis: [
    'Type c, then ca, into Prefix: the path lights up and the completions shrink to case and catch.',
    'Type cast into Word and press Insert: only one node is new, because c, ca and cas already exist for case.',
    'Type do into Word and press Delete: its ring goes, but no node is pruned, because double still passes through it.',
    'Pick US states, M and N and switch View to Compressed: the node count drops and the tail of massachusetts becomes one edge.',
    'Type x into Prefix: the trie gives up after one child lookup, while a scan still calls startsWith on every word.',
  ],
  keyIdeas: [
    'A trie stores each word as a path of letters from the root, with a mark on the node where the word ends.',
    'Finding a prefix takes at most its length in steps; listing its completions is a depth-first walk of one subtree.',
    'Node count = distinct prefixes + 1, and a radix tree merges single-child chains to cut that further.',
    'Tries trade memory for speed: every node\'s child links can cost more than the shared letters save.',
  ],
  quiz: [
    {
      q: 'Where is the word “do” kept in a trie that also holds “double”?',
      options: [
        'On the path d → o, with an end mark on the o node',
        'In its own leaf node that holds the whole string “do”',
        'Nowhere: “do” is hidden inside “double” and lost',
        'In the root, which keeps a list of every short word',
      ],
      answer: 0,
      why: 'A trie keeps letters on paths, not words in nodes: “do” and “double” share the d and o nodes, and the end mark on o says a word stops there. Without that mark “do” would only be a prefix, so the mark is what stores it, not a separate leaf.',
    },
    {
      q: 'Does a trie always use less memory than a plain list of the same words?',
      options: [
        'No: each node has child links, which can outweigh shared letters',
        'Yes: shared prefixes are stored once, so it can only save space',
        'Yes: a trie only stores the first letter of each word it holds',
        'No: a trie stores every word twice, once for each edge direction',
      ],
      answer: 0,
      why: 'Sharing prefixes saves letters, but every node carries child pointers (or a child array) and an end flag. With one 26-slot array per node, the Keywords trie holds far more slots than its list has letters. Tries buy fast prefix queries, not guaranteed savings; radix trees and compact layouts trim the overhead.',
    },
    {
      q: 'A trie holds a million words. How many steps to reach the node for a 3-letter prefix?',
      options: ['At most 3', 'About 20', 'A million', 'About 3,000'],
      answer: 0,
      why: 'Each letter follows one edge, however many words are stored, so reaching the prefix costs at most its length; listing the completions then costs time in proportion to that subtree. About 20 is a binary search of a sorted list (log₂ of a million), which also works but grows with the list.',
    },
    {
      q: 'You delete “catch” from a trie that also holds “case”. Which nodes go?',
      options: [
        'The nodes for cat, catc and catch; “ca” still leads to case',
        'Every node on the path c-a-t-c-h, since the word is gone',
        'Only the end mark: a trie never removes nodes once made',
        'The whole subtree under “c”, with every word inside it',
      ],
      answer: 0,
      why: 'Delete clears the end mark, then prunes from the bottom while a node has no children and no mark. cat, catc and catch lead nowhere afterwards, but ca still has the s branch to case, so pruning stops there. Keeping dead nodes would still give right answers, but it wastes memory, so tries do remove them.',
    },
  ],
};

export default lesson;
