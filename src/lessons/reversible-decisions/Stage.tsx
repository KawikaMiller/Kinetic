import { useState } from 'react';
import { useScenePicker } from '../../components/ScenePicker';
import type { ClassifyState } from '../../core/classify';
import { CurveScene } from './CurveScene';
import { DoorsScene } from './DoorsScene';
import { OPENING, type CurveState, type SceneId } from './opening';
import { PlaceScene } from './PlaceScene';
import { StoryScene } from './StoryScene';
import './styles.css';

const SCENES: { value: SceneId; label: string }[] = [
  { value: 'place', label: 'Place ten decisions' },
  { value: 'curve', label: 'The rigour curve' },
  { value: 'doors', label: 'Doors that close' },
  { value: 'story', label: 'The queue service' },
];

/** The board and the rigour controls belong to the learner and survive a scene switch; the other scenes start fresh each time. */
export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({ label: 'Scene', options: SCENES, initial: OPENING.scene });
  const [board, setBoard] = useState<ClassifyState>(OPENING.board);
  const [curve, setCurve] = useState<CurveState>(OPENING.curve);
  if (scene === 'curve') return <CurveScene key="curve" picker={picker} state={curve} onState={setCurve} />;
  if (scene === 'doors') return <DoorsScene key="doors" picker={picker} />;
  if (scene === 'story') return <StoryScene key="story" picker={picker} />;
  return <PlaceScene key="place" picker={picker} board={board} onBoard={setBoard} />;
}
