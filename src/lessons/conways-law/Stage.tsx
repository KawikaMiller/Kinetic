import { useState } from 'react';
import { useScenePicker } from '../../components/ScenePicker';
import type { ClassifyState } from '../../core/classify';
import { BoardScene } from './BoardScene';
import { MoveScene } from './MoveScene';
import { NumbersScene } from './NumbersScene';
import { OPENING, type SceneId } from './opening';
import { ReferenceScene } from './ReferenceScene';
import './styles.css';

const SCENES: { value: SceneId; label: string }[] = [
  { value: 'board', label: 'Draw the team lines' },
  { value: 'numbers', label: 'What the numbers say' },
  { value: 'reference', label: 'One reference' },
  { value: 'move', label: 'The inverse manoeuvre' },
];

/** The board and the cap belong to the learner, not to a scene: every scene reads the layout they drew. */
export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({ label: 'Scene', options: SCENES, initial: OPENING.scene });
  const [board, setBoard] = useState<ClassifyState>(OPENING.board);
  const [cap, setCap] = useState(OPENING.cap);
  const props = { picker, board, onBoard: setBoard, cap, onCap: setCap };
  if (scene === 'numbers') return <NumbersScene key="numbers" {...props} />;
  if (scene === 'reference') return <ReferenceScene key="reference" {...props} />;
  if (scene === 'move') return <MoveScene key="move" {...props} />;
  return <BoardScene key="board" {...props} />;
}
