import type { ReactNode } from 'react';
import { joinList, plural } from '../../core/format';
import { findEnding, redMeters, type Scenario, type Walk } from '../../core/scenario';
import { textOf, type NodeId, type Reading } from './model';
import { METER } from './scenario';

const pair = ([a, b]: readonly [NodeId, NodeId]): string => `${a} against ${b}`;

/** Scene 1: what the canvas says about the nodes removed so far. */
export function canvasCaption(removed: ReadonlySet<NodeId>, r: Reading): ReactNode {
  const ids = [...removed].sort();
  return (
    <>
      {ids.length === 0 ? <>Nothing is removed. </> : <>Removed: {joinList(ids)}. </>}
      {plural(r.orphans.length, 'orphaned action')}{r.orphans.length ? <> ({joinList(r.orphans)}: no policy supports {r.orphans.length === 1 ? 'it' : 'them'})</> : null},{' '}
      {plural(r.uncovered.length, 'uncovered diagnosis', 'uncovered diagnoses')}{r.uncovered.length ? <> ({joinList(r.uncovered)}: no policy answers {r.uncovered.length === 1 ? 'it' : 'them'})</> : null} and{' '}
      {plural(r.conflicts.length, 'active conflict')}{r.conflicts.length ? <> ({joinList(r.conflicts.map(pair))})</> : null}.
    </>
  );
}

/** What each orphan or conflict means in words, for the list under the canvas. */
export const conflictText = (c: readonly [NodeId, NodeId]): string => `${c[0]} against ${c[1]}: ${textOf(c[0]).toLowerCase()}, against ${textOf(c[1]).toLowerCase()}`;

/** Scene 2: where the story stands. */
export function storyCaption(s: Scenario, w: Walk): ReactNode {
  const ending = findEnding(s, w.at);
  const red = redMeters(s, w.meters).map((m) => m.label.toLowerCase());
  return (
    <>
      {ending ? <>{ending.title}. </> : null}
      Autonomy {w.meters[METER.autonomy]}, migration effort {w.meters[METER.effort]}, delivery drag {w.meters[METER.drag]}.
      {red.length ? <> In the red: {joinList(red)}.</> : <> Nothing is in the red.</>}
    </>
  );
}
