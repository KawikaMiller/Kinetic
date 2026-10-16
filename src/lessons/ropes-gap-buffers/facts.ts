import { OPEN } from './editing';
import { SCRIPTS, scriptCost } from './scripts';
import {
  arrayCreate, arrayInsert, codePoints, depthBound, gapCreate, gapInsert, gapMoveTo, ropeBuild, ropeCreate, ropeDepth, ropeIndex, ropeInsert, ropeLeaves, ropeReachable,
} from './structures';
import { runWorkload } from './workloads';

const text = codePoints(OPEN.array.text);
const arr = arrayCreate(text);
arrayInsert(arr, OPEN.array.cursor, [OPEN.array.insert]);
const arrStart = arrayCreate(text);
arrayInsert(arrStart, 0, [OPEN.array.insert]);
const arrEnd = arrayCreate(text);
arrayInsert(arrEnd, text.length, [OPEN.array.insert]);

const gapText = codePoints(OPEN.gap.text);
const gap = gapCreate(gapText, OPEN.gap.capacity);
gapInsert(gap, gap.start, [OPEN.gap.insert]);
const afterType = { moves: gap.moves, writes: gap.writes };
gapMoveTo(gap, 0);
const home = gap.moves - afterType.moves;
gapInsert(gap, 0, [OPEN.gap.insert]);

const rope = ropeCreate();
rope.root = ropeBuild(rope, codePoints(OPEN.rope.text));
const ropeLength = codePoints(OPEN.rope.text).length;
const lookup = ropeIndex({ ...rope }, OPEN.rope.index);
const beforeIds = rope.nodes.length;
const leavesBefore = ropeLeaves(rope).length;
const depthBefore = ropeDepth(rope);
ropeInsert(rope, OPEN.rope.insertAt, codePoints(OPEN.rope.insert));
const live = ropeReachable(rope);
const created = [...live].filter((id) => id >= beforeIds).length;

const jump = runWorkload('jump', 1000);
const typeW = runWorkload('type', 1000);
const appendW = runWorkload('append', 1000);
const paste = runWorkload('paste', 1_000_000);
const undo = runWorkload('undo', 1_000_000);
const cost = Object.fromEntries(SCRIPTS.map((s) => [s.id, scriptCost(s.id)]));

const n = (v: number) => v.toLocaleString('en-US');

/** Every number the try-this lines and key ideas quote, computed from the same models the scenes use. */
export const FACTS = {
  arrayLength: text.length,
  arrayCursor: OPEN.array.cursor,
  arrayMoves: arr.moves,
  arrayMovesStart: arrStart.moves,
  arrayMovesEnd: arrEnd.moves,
  gapLength: gapText.length,
  gapCapacity: OPEN.gap.capacity,
  gapHome: home,
  gapTypeWrites: afterType.writes,
  gapTypeMoves: afterType.moves,
  ropeLength,
  ropeLeaves: leavesBefore,
  ropeDepth: depthBefore,
  lookupIndex: OPEN.rope.index,
  lookupChar: lookup.char,
  lookupNodes: lookup.path.length,
  insertCreated: created,
  insertShared: live.size - created,
  depthBound: depthBound(leavesBefore),
  typical: cost.typical,
  replace: cost.replace,
  jumpArray: n(jump.array.touches),
  jumpGap: n(jump.gap.touches),
  jumpRope: n(jump.rope.touches),
  typeArray: n(typeW.array.touches),
  typeGap: n(typeW.gap.touches),
  typeRope: n(typeW.rope.touches),
  appendArray: n(appendW.array.touches),
  appendRope: n(appendW.rope.touches),
  appendRebuilds: appendW.ropeRebuilds,
  pasteArray: n(paste.array.touches),
  pasteRope: n(paste.rope.touches),
  undoArray: n(undo.array.touches),
  undoRope: n(undo.rope.touches),
};
