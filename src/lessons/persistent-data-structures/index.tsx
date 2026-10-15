import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A persistent data structure keeps every old version intact by copying only the path from the root to the changed cell and sharing the rest, so an update costs about log n nodes instead of a full copy.',
    what: `Store an array as a tree whose leaves hold the values. To change one cell, build a new leaf and a new copy of each node above it, up to a new root, and point those copies at the old siblings. The old root still describes the old array and the new root describes the new one, and they share every node off the path: on ${F.cells} cells, an update allocates ${F.pathNodes} nodes and ${F.pathShared} of the new version's ${F.pathTotal} nodes are shared. Undo is then just a pointer to an older root, and versions can branch. The catch is that an old version stays alive only while something still reaches its nodes, and a structure that overwrites a shared node in place silently changes every version that shares it.`,
    analogy: 'Editing a shared document by tracking changes: instead of photocopying the whole book for each edit, you reprint the one page and the table of contents entries leading to it, and every older edition keeps pointing at the pages that did not change.',
    useCases: [
      'Undo and redo in editors, where each state is a cheap new version',
      'Immutable collections in functional languages and in front-end state libraries',
      'Snapshots of a database or a file system, where old versions must stay readable while new writes land',
      'Safe sharing between threads, since a version that never changes needs no lock to read',
    ],
    why: 'It explains how immutability stays affordable, why one changed cell does not mean a whole copy, and what garbage collection has to do when old versions are dropped.',
    watch: 'Each circle is a node, with a leaf showing its value and a version tag above every root. Yellow circles are the nodes the last update allocated, purple circles are shared by two or more versions with the count underneath, and blue marks the viewed version, with its own edges drawn in blue. In the in-place scene a red circle is a leaf changed behind a version, and a red cell is a value that no longer matches what that version recorded. In the last scene a faded dashed circle is garbage that no live version reaches. In the cost plot green is the tree with path copying and red is a full copy per version.',
  },
  tryThis: [
    `In Path copying, press Set on the default (cell ${F.editIndex} to ${F.editValue}): ${F.pathNodes} nodes are allocated, one per level and the leaf, and ${F.pathShared} of the ${F.pathTotal} nodes in v1 are shared with v0.`,
    `In Mutate in place, choose Mutating in place and press Set on the default: v0 now reads ${F.brokenWalked} at cell ${F.editIndex} although it recorded ${F.oldValue}, and the cell turns red.`,
    `In What it costs, at the defaults (b = 2, n = ${F.n.toLocaleString('en-US')}): an update copies ${F.nodesPerUpdate} nodes and ${F.slotsPerUpdate} slots against ${F.fullCopy.toLocaleString('en-US')} for a full copy, and after ${F.k} updates the tree stores ${F.persistentAfterK.toLocaleString('en-US')} slots against ${F.fullCopiesAfterK.toLocaleString('en-US')}. Then choose b = 32: ${F.wideNodes} nodes but ${F.wideSlots} slots per update.`,
    `In Branches, undo, garbage, press Undo twice and then Set: v${F.forkId} is made from v${F.forkParent}, so the version tree has two branches. Then press the v1 chip under Drop a version: ${F.garbageAfterDrop} node becomes garbage and memory falls by ${F.memoryDrop} slots.`,
  ],
  keyIdeas: [
    `Path copying makes an update allocate one node per level plus the leaf: ${F.pathNodes} on ${F.cells} cells, ${F.nodesPerUpdate} on ${F.n.toLocaleString('en-US')}, and the remaining nodes are shared with the old version.`,
    'A persistent structure does not copy the whole array on each change; an old version stays valid because nothing it points at is ever overwritten.',
    `Wide nodes make the tree shallow (${F.wideNodes} nodes per update at b = 32 against ${F.nodesPerUpdate} at b = 2) but copy more slots per node (${F.wideSlots} against ${F.slotsPerUpdate}), and on a tiny array the tree costs more than plain copies at first.`,
    'Versions form a tree, undo is a pointer to the parent, and an old version stays in memory while some live version still reaches its nodes.',
  ],
  quiz: [
    {
      q: `A persistent array of ${F.n.toLocaleString('en-US')} cells is stored as a binary tree and one cell is changed. How many nodes does the update allocate?`,
      options: [
        `${F.nodesPerUpdate}: the new leaf and its ${F.nodesPerUpdate - 1} ancestors`,
        `${F.fullCopy.toLocaleString('en-US')}: a full copy of the array, one per cell`,
        `${(2 * F.n - 1).toLocaleString('en-US')}: a brand new tree with every node copied`,
        '1: the new leaf, with the rest of the tree shared',
      ],
      answer: 0,
      why: `The nodes on the path from the root to the changed leaf are rebuilt, because each ancestor needs a new child pointer: ${F.nodesPerUpdate} nodes here. The ${(2 * F.n - 1).toLocaleString('en-US')} nodes of a whole tree and the ${F.fullCopy.toLocaleString('en-US')} cells of a full copy are what path copying avoids. A new leaf alone is not enough, since the parent above it has to point at it.`,
    },
    {
      q: 'An update overwrites a leaf in place, where two older versions also reach it. What happens to those versions?',
      options: [
        'Every version that reaches that leaf changes too, so old versions lose their contents',
        'Nothing happens to them: each version keeps its own copy of the value',
        'Only the newest version changes; the older ones stay as they were',
        'They are deleted at once, because the leaf they shared is overwritten',
      ],
      answer: 0,
      why: `A shared node is one object that several versions point at, so writing into it changes what each of them reads. In the lesson, v0 reads ${F.brokenWalked} at cell ${F.editIndex} after an in-place set even though it recorded ${F.oldValue}. Path copying avoids this by writing into no node an older version can see.`,
    },
    {
      q: `At n = ${F.n.toLocaleString('en-US')}, what changes when the branching factor goes from 2 to 32?`,
      options: [
        `Fewer nodes (${F.wideNodes} against ${F.nodesPerUpdate}) but more slots (${F.wideSlots} against ${F.slotsPerUpdate})`,
        'Fewer nodes and fewer slots: a shallower tree copies less',
        'The same nodes, since depth does not depend on branching',
        'More nodes and more slots: wider nodes take longer to copy',
      ],
      answer: 0,
      why: `The tree gets shallower, so the path has ${F.wideNodes} nodes instead of ${F.nodesPerUpdate}, but each copied node now carries 32 child pointers: ${F.wideSlots} slots against ${F.slotsPerUpdate}. That is the trade real libraries make: fewer allocations, more copying per node.`,
    },
    {
      q: 'Version v1 is dropped, but v2 was made from it and is still alive. Which nodes become garbage?',
      options: [
        `Only nodes no remaining version reaches: here just v1's own root, ${F.garbageAfterDrop} node`,
        'Every node v1 allocated, since v1 no longer exists as a version',
        'None until the program ends: a dropped version stays in memory',
        'Every node of v2, since v2 was built on top of the dropped v1',
      ],
      answer: 0,
      why: `A node is garbage when no live version reaches it. v2 was made from v1 and shares its other nodes, so v1's root is the one node left unreached: ${F.garbageAfterDrop} node, and memory falls by ${F.memoryDrop} slots. Dropping a version frees what it alone held, not what it shares.`,
    },
  ],
};

export default lesson;
