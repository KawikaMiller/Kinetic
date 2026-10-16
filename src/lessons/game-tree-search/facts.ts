import { DEFAULT_LEAVES, OPENING, SPEC } from './presets';
import { knuthMooreMinimum, leafCount, nodeCount, orderingFor, search, type Ordering } from './tree';
import { EMPTY_BOARD, moveScores, play, searchBoard, WIN } from './ttt';
import { pathName } from './view';

const run = (ordering: Ordering, prune = true) => search(SPEC, DEFAULT_LEAVES, { prune, order: orderingFor(SPEC, DEFAULT_LEAVES, ordering, 7) });
const plain = search(SPEC, DEFAULT_LEAVES, { prune: false });
const given = run('given');
const best = run('best');
const worst = run('worst');
const afterCentre = play(EMPTY_BOARD, 4, 'X');
const replyPlain = searchBoard(afterCentre, 'O', { prune: false });
const replyFast = searchBoard(afterCentre, 'O', { prune: true });
const openingPlain = searchBoard(EMPTY_BOARD, 'X', { prune: false });
const cornersBoard = 'X...O...X';
const cornersPerfect = moveScores(cornersBoard, 'O');
const valueOf = (cell: number) => cornersPerfect.find((s) => s.cell === cell)!.value;
const shallow = searchBoard(cornersBoard, 'O', { prune: true, depth: 1 }).move!;
const deep = searchBoard(cornersBoard, 'O', { prune: true, depth: 3 }).move!;
const outcome = (v: number) => (v >= WIN ? 'a win' : v <= -WIN ? 'a loss' : 'a draw');

/** Every number the try-this lines, key ideas and quiz quote, computed from the models the scenes use. */
export const FACTS = {
  nodes: nodeCount(SPEC),
  leaves: leafCount(SPEC),
  rootValue: plain.value,
  bestMove: pathName(plain.bestChild, SPEC.b),
  givenLeaves: given.leaves,
  givenNodes: given.nodes,
  bestLeaves: best.leaves,
  worstLeaves: worst.leaves,
  minimum: knuthMooreMinimum(SPEC),
  sameValue: given.value === plain.value && best.value === plain.value && worst.value === plain.value,
  centreMove: replyFast.move!,
  centrePlain: replyPlain.nodes.toLocaleString('en-US'),
  centreFast: replyFast.nodes.toLocaleString('en-US'),
  centrePlies: 8,
  fullTree: openingPlain.nodes.toLocaleString('en-US'),
  shallowMove: shallow,
  shallowOutcome: outcome(valueOf(shallow)),
  deepMove: deep,
  deepOutcome: outcome(valueOf(deep)),
  growth: (BigInt(OPENING.growth.branching) ** BigInt(OPENING.growth.depth)).toLocaleString('en-US'),
  branching: OPENING.growth.branching,
  plies: OPENING.growth.depth,
};
