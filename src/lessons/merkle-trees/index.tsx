import type { LessonModule } from '../../core/types';
import { plural } from './captions';
import { buildFacts, proofFacts, syncFacts, toyFacts } from './facts';
import { Stage } from './Stage';
import { SYNC_OPEN, sizeText } from './view';

const build = buildFacts();
const sync = syncFacts();
const proof = proofFacts();
const toy = toyFacts();
const kib = sizeText;

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A Merkle tree hashes the data in pairs up to one root, so two copies can be compared by their roots, the differing blocks found by descending only where hashes differ, and one block proved to belong with a handful of hashes.',
    what: 'The git-internals lesson used hashes to name stored objects. Here hash trees compare and prove. Each leaf hash covers one block, each parent hash covers its two children, and the root covers everything, so changing any block changes the hashes on its path to the root and nowhere else. Two replicas compare roots: equal means done, otherwise they compare children and descend only into the ones that differ, which costs about k times log2 n hash comparisons for k differences in n blocks instead of n. An inclusion proof is the sibling hashes along one path, enough for a verifier to recompute the root. The hash must be wide: with a toy 8-bit hash two different subtrees can collide and the comparison misses a difference.',
    analogy: 'Two libraries checking their catalogues. Each shelf has a checksum sticker, each aisle a sticker over its shelves, and the building one over its aisles. The librarians compare building stickers, and only walk down the aisle and shelf whose stickers disagree.',
    useCases: [
      'Finding the key ranges two database replicas disagree on without sending both copies',
      'Proving one entry belongs in a log with a short proof and a trusted root',
      'Checking downloaded pieces of a large file against one published root',
      'Understanding why hash width, not just hashing, makes a comparison trustworthy',
    ],
    why: 'Two beliefs are wrong: that a Merkle tree stores the data, and that checking one block means downloading everything. Real SHA-256 builds every tree on screen, so you can change a leaf and watch exactly which hashes move, and flip to a toy 8-bit hash and watch a comparison miss a difference.',
    watch:
      'Each box holds the first four hex characters of a hash (display only: the full 64 characters are what is compared) and the leaves show their position. Green is a hash that matches its twin or the original, red is one that differs or a path that changed, yellow is the path a verifier recomputes, violet is a proof sibling, a dim box is a subtree skipped without descent and orange is a toy collision. Chips say what is real, simulated, a toy, illustrative or from memory.',
  },
  tryThis: [
    `In "Build one" (8 leaves, leaf 2 chosen) add a character to the leaf text: ${build.changed} of ${build.nodes} hashes turn red, the path from that leaf to the root, and the root changes. In the table under the tree, the duplicate-last rule gives [a, b, c] and [a, b, c, c] ${build.sameRootDuplicate ? 'the same root' : 'different roots'} while the RFC split gives ${build.sameRootRfc ? 'the same root' : 'different roots'}.`,
    `In "Anti-entropy" (seed ${SYNC_OPEN.seed}, ${sync.truth.length} ranges differ: ${sync.truth.join(' and ')}) press play: the descent makes ${sync.comparisons} comparisons and finds ranges ${sync.found.join(' and ')}, and anti-entropy sends ${kib(sync.sizes.smart)} against ${kib(sync.sizes.naive)} for every range. Drag "Ranges that differ" to 0: ${sync.equalComparisons} comparison, the roots.`,
    `In "Inclusion proof" (leaf 5 of 16): the proof is ${proof.hashes} hashes, ${proof.bytes} bytes against ${kib(proof.dataBytes)} of data, and it verifies. Under Tamper with, choose "A sibling hash": it is refused, since ${proof.badReason}.`,
    `In "A toy that fails" (seed ${toy.lowest}, toy 8-bit hash): the descent misses ${plural(toy.missed.length, 'range')} of the ${toy.truth.length} that differ, and ${toy.missSeeds} of 200 seeds miss something. Switch Hash to SHA-256: it finds all ${toy.truth.length}.`,
  ],
  keyIdeas: [
    'In this model changing one leaf changes exactly the hashes on its path to the root, so two trees with equal roots hold equal data, and unequal roots can be narrowed to the blocks that differ.',
    'In this model anti-entropy compares roots and then descends into the children whose hashes differ, so for k differing blocks among n it makes no more than 1 + 2 k log2 n comparisons, not n.',
    'An inclusion proof is the sibling hashes along one path, about log2 n of them, and a verifier that trusts the root alone recomputes it, so one block is checked without downloading the rest.',
    'In this lesson a toy 8-bit hash collides on some seeds and the descent skips a differing subtree, which shows that hash width, and not the idea that hashes are unique, is what makes a match mean equal.',
  ],
  quiz: [
    {
      q: 'Two replicas hold 1,024 blocks and exactly one block differs. Roughly how many hash comparisons does anti-entropy need?',
      options: [
        'About 21: the roots, then both children at each of the 10 levels on the path',
        'About 1,024: each block still has to be compared with its twin to be sure',
        'About 10: one comparison per level, because a match at one level settles the rest',
        'About 2,048: both replicas have to send every block hash to the other side',
      ],
      answer: 0,
      why: 'In this model the descent compares the roots, then the two children of each differing node: 1 + 2 times 10 levels is 21, against 1,024 blocks compared one by one.',
    },
    {
      q: 'Does a Merkle tree store the data it was built from?',
      options: [
        'No: it holds hashes, and the data stays in the leaves it was computed from',
        'Yes: each inner node keeps a compressed copy of everything below it',
        'Yes: the root contains enough of the data to rebuild every block from it',
        'No: it holds only the root, and the other hashes are recomputed when needed',
      ],
      answer: 0,
      why: 'A leaf hash summarises one block and a parent hash summarises its children; none of them can give the data back. Verifying a block needs the block itself plus its sibling hashes.',
    },
    {
      q: 'How does a verifier check one block of a million without downloading the other blocks?',
      options: [
        'It recomputes the root from the block and about 20 sibling hashes and compares it with the trusted root',
        'It downloads the hashes of all the leaves and compares them with the block it was handed',
        'It hashes the block and looks the result up in a list of every valid leaf hash it keeps',
        'It asks the prover to sign the block, which proves that the block belongs in the tree',
      ],
      answer: 0,
      why: 'The proof is the sibling hashes along the path, one per level, about log2 n of them. Changing the block, a sibling or the claimed index changes the recomputed root, which the lesson shows turning red.',
    },
    {
      q: 'With the duplicate-the-last-node rule, [a, b, c] and [a, b, c, c] have the same root. What follows?',
      options: [
        'A verifier also needs the leaf count, because a fourth copy of c would not change the root',
        'Nothing, since two lists of different lengths can never hold the same data in a real tree',
        'The tree is broken and cannot be used, since two lists must always give two different roots',
        'The RFC split must be wrong, because it gives these two lists different roots as well',
      ],
      answer: 0,
      why: 'The lesson computes both roots: they are equal under duplication and different under the RFC 6962 split, which is why a verifier has to be told the size.',
    },
    {
      q: 'Why does a toy 8-bit hash make anti-entropy unreliable?',
      options: [
        'Two different subtrees can share a hash, so the comparison says the same and skips a real difference',
        'An 8-bit hash is too slow to compute for a tree with many leaves, so the descent times out',
        'Truncating a hash makes the parent hashes depend on the order in which the children are read',
        'An 8-bit hash cannot be compared across replicas, since each replica truncates it differently',
      ],
      answer: 0,
      why: 'With 256 possible values a collision turns up on some seeds; the lesson pins the lowest one and shows the 256-bit hash finding the differences on the same edits.',
    },
  ],
};

export default lesson;
