import { useScenePicker } from '../../components/ScenePicker';
import { BoardScene } from './BoardScene';
import { FeedbackScene } from './FeedbackScene';
import { MatrixScene } from './MatrixScene';
import { OPENING, type SceneId } from './opening';
import './styles.css';

const SCENES: { value: SceneId; label: string }[] = [
  { value: 'board', label: 'The board' },
  { value: 'feedback', label: 'A feedback conversation' },
  { value: 'matrix', label: 'What to delegate' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({ label: 'Scene', options: SCENES, initial: OPENING.scene });
  if (scene === 'feedback') return <FeedbackScene key="feedback" picker={picker} />;
  if (scene === 'matrix') return <MatrixScene key="matrix" picker={picker} />;
  return <BoardScene key="board" picker={picker} />;
}
