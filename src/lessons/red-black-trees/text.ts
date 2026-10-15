import { plural } from '../../core/format';
import type { Color, FixCase, RuleId, RuleReport } from './model';

export const colorWord = (c: Color): string => (c === 'R' ? 'red' : 'black');

export const RULE_TEXT: Record<RuleId, string> = {
  1: 'every node is red or black',
  2: 'the root is black',
  3: 'a red node has no red child',
  4: 'every path from a node down to a nil leaf has the same number of black nodes (nil leaves count as black)',
};

/** The short name of each case, as the captions and try-this entries say it. */
export const CASE_NAME: Record<FixCase, string> = {
  'uncle-red': 'uncle red',
  triangle: 'uncle black, triangle',
  line: 'uncle black, line',
  'sibling-red': 'sibling red',
  'sibling-black-black': 'sibling black with two black children',
  'near-nephew-red': 'near nephew red',
  'far-nephew-red': 'far nephew red',
};

export const caseList = (cases: readonly FixCase[]): string => cases.map((c) => CASE_NAME[c]).join(', then ');

/** What each fix-up case does, in words. Insert cases are named by the uncle's colour, delete cases by the sibling's. */
export const CASE_TEXT: Record<FixCase, string> = {
  'uncle-red': 'uncle red: recolour the parent and the uncle black and the grandparent red, then look at the grandparent',
  triangle: 'uncle black, triangle: rotate the parent so the new node and its parent form a line',
  line: 'uncle black, line: recolour the parent black and the grandparent red, then rotate the grandparent',
  'sibling-red': 'sibling red: recolour the sibling black and the parent red, then rotate the parent so the sibling is black',
  'sibling-black-black': 'sibling black with two black children: recolour the sibling red and push the shortage up to the parent',
  'near-nephew-red': 'sibling black, near nephew red: rotate the sibling so the red child sits on the far side',
  'far-nephew-red': 'sibling black, far nephew red: give the sibling the parent colour, blacken parent and far nephew, rotate the parent',
};

/** The verdict over the four rules: all hold, or the first that fails, named. */
export function rulesCaption(rules: readonly RuleReport[]): string {
  const bad = rules.filter((r) => !r.ok);
  if (bad.length === 0) return 'All four rules hold: every node is red or black, the root is black, no red node has a red child, and every path down has the same number of black nodes.';
  const first = bad[0];
  const more = bad.length > 1 ? ` (${plural(bad.length - 1, 'other rule')} ${bad.length === 2 ? 'is' : 'are'} broken too)` : '';
  return `Rule ${first.rule} is broken: ${first.detail}${more}. Only insert and delete have fix-ups that repair a tree, so there is no repair button: press a node again to flip it back.`;
}

/** Scene 4's counts of the three kinds of multiway node. */
export function groupsCaption(f: { twos: number; threes: number; fours: number; leafDepth: number | null; keys: number }): string {
  const parts = [`${plural(f.twos, '2-node')}`, `${plural(f.threes, '3-node')}`, `${plural(f.fours, '4-node')}`].join(', ');
  const depth = f.leafDepth === null ? '' : ` Every leaf node sits ${f.leafDepth === 0 ? 'at the top' : `${plural(f.leafDepth, 'level')} down`}: that is rule 4 seen from the 2-3-4 side.`;
  return `${plural(f.keys, 'key')} regroup into ${parts}: each black node with its red children is one multiway node.${depth}`;
}

/** Scene 5: what the measured numbers say, picking the comparison words from the numbers themselves. */
export function compareCaption(f: {
  order: string;
  rbHeight: number;
  avlHeight: number;
  rbDeleteMax: number;
  avlDeleteMax: number;
  rbInsertMean: number;
  avlInsertMean: number;
}): string {
  const taller = f.rbHeight === f.avlHeight ? 'the same height as' : f.rbHeight > f.avlHeight ? 'taller than' : 'shorter than';
  const insert = f.rbInsertMean === f.avlInsertMean ? 'the same' : f.rbInsertMean < f.avlInsertMean ? 'fewer' : 'more';
  const del = f.rbDeleteMax === f.avlDeleteMax ? 'the same' : f.rbDeleteMax < f.avlDeleteMax ? 'fewer' : 'more';
  return `${f.order} order, 1,023 keys in and out: the red-black tree ends ${f.rbHeight} levels tall, ${taller} the AVL tree's ${f.avlHeight}. Per insert it makes ${insert} rotations on average (${f.rbInsertMean.toFixed(2)} against ${f.avlInsertMean.toFixed(2)}); its worst delete needed ${plural(f.rbDeleteMax, 'rotation')} against ${f.avlDeleteMax} for AVL, which is ${del} in the worst case.`;
}
