import type { ReactNode } from 'react';
import { emptyClassify, type ClassifyState } from '../../core/classify';
import { DECISIONS, DEFAULT_TAU, DEFAULT_W, decisionOf, type DecisionId } from './model';

export type SceneId = 'place' | 'curve' | 'doors' | 'story';

/** Scene 2's controls: the decision picked and the four numbers and the hours of rigour the learner sets. */
export interface CurveState {
  decision: DecisionId;
  undo: number;
  p0: number;
  tau: number;
  w: number;
  hours: number;
}

/** Scene 2 on a decision: its own cost to undo and chance of being wrong, the learner's tau, w and hours kept. */
export const curveFor = (decision: DecisionId, keep: Pick<CurveState, 'tau' | 'w' | 'hours'>): CurveState => {
  const d = decisionOf(decision);
  return { decision, undo: d.undo, p0: d.p0, tau: keep.tau, w: keep.w, hours: keep.hours };
};

/** What every scene opens on. The board and scene 2's controls live in the Stage: scene 1 sets nothing in scene 2, and a return to a scene finds it as it was left. */
export const OPENING = {
  scene: 'place' as SceneId,
  board: emptyClassify(DECISIONS) as ClassifyState,
  curve: curveFor('database', { tau: DEFAULT_TAU, w: DEFAULT_W, hours: 0 }),
};

/** What the Stage hands each scene. */
export interface SceneProps {
  picker: ReactNode;
}
